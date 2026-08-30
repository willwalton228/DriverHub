import bcrypt from "bcryptjs";
import { APP_ENV, resolveDbUrl } from "../config/environment";

const UAT_USERS = [
  {
    key: "standard",
    email: "uat-recruiting-standard@driverhub-staging.test",
    firstName: "UAT Recruiting",
    lastName: "Standard",
    role: "recruiter",
    passwordEnv: "UAT_RECRUITING_STANDARD_PASSWORD",
  },
  {
    key: "admin",
    email: "uat-recruiting-admin@driverhub-staging.test",
    firstName: "UAT Recruiting",
    lastName: "Admin",
    role: "recruiting_admin",
    passwordEnv: "UAT_RECRUITING_ADMIN_PASSWORD",
  },
  {
    key: "unauthorized",
    email: "uat-recruiting-unauthorized@driverhub-staging.test",
    firstName: "UAT Recruiting",
    lastName: "Unauthorized",
    role: "driver",
    passwordEnv: "UAT_RECRUITING_UNAUTHORIZED_PASSWORD",
  },
] as const;

const UAT_MARKET = "UAT-GATE-0";

function validatePassword(key: string, password: string | undefined): asserts password is string {
  if (!password) {
    throw new Error(`Missing ${key} credential secret.`);
  }
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error(`${key} credential must meet the existing password complexity requirements.`);
  }
}

async function provision(): Promise<void> {
  if (APP_ENV === "production") {
    throw new Error("Gate 0 UAT provisioning is explicitly disabled in production.");
  }
  if (APP_ENV !== "staging") {
    throw new Error(`Gate 0 UAT provisioning requires APP_ENV=staging; received ${APP_ENV}.`);
  }
  if (!resolveDbUrl()) {
    throw new Error("The staging database is not configured.");
  }
  if (process.env.RECRUITING_EXTERNAL_DELIVERY_MODE !== "fail_closed") {
    throw new Error("Refusing to provision until RECRUITING_EXTERNAL_DELIVERY_MODE=fail_closed.");
  }

  const passwords = new Map<string, string>();
  for (const definition of UAT_USERS) {
    const password = process.env[definition.passwordEnv];
    validatePassword(definition.key, password);
    passwords.set(definition.key, password);
  }
  if (new Set(passwords.values()).size !== UAT_USERS.length) {
    throw new Error("Each UAT account must have a distinct credential secret.");
  }

  // Load the database only after the production guard above has passed.
  const { pool } = await import("../db");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const connectionCheck = await client.query("SELECT current_database() AS database_name");
    if (!connectionCheck.rows[0]?.database_name) {
      throw new Error("Could not confirm the connected staging database.");
    }

    const organizationResult = await client.query(`
      SELECT id
      FROM organizations
      WHERE is_active IS TRUE
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    `);
    const organizationId = organizationResult.rows[0]?.id;
    if (!organizationId) {
      throw new Error("No active staging organization exists; refusing to create orphaned UAT users.");
    }

    const emails = UAT_USERS.map((definition) => definition.email);
    const existingResult = await client.query(
      "SELECT email FROM users WHERE email = ANY($1::text[])",
      [emails],
    );
    if (existingResult.rows.length > 0) {
      throw new Error("One or more dedicated UAT identities already exists; refusing to mutate or reuse it.");
    }

    const marketResult = await client.query(`
      SELECT DISTINCT market
      FROM recruiting_requisitions
      WHERE market IS NOT NULL AND btrim(market) <> ''
    `);
    const markets = Array.from(new Set([
      UAT_MARKET,
      ...marketResult.rows.map((row) => String(row.market)),
    ]));

    const createdUsers: Array<{ key: string; id: string; email: string; role: string }> = [];
    for (const definition of UAT_USERS) {
      const passwordHash = await bcrypt.hash(passwords.get(definition.key)!, 12);
      const userResult = await client.query(
        `
          INSERT INTO users (
            email, first_name, last_name, password_hash, status, role,
            org_id, is_provisioned, is_root_super_admin, force_password_reset,
            password_set_at, role_selected_at
          )
          VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, TRUE, FALSE, FALSE, NOW(), NOW())
          RETURNING id, email, role
        `,
        [
          definition.email,
          definition.firstName,
          definition.lastName,
          passwordHash,
          definition.role,
          organizationId,
        ],
      );
      const created = userResult.rows[0];
      if (!created) {
        throw new Error(`Failed to create the ${definition.key} UAT identity.`);
      }
      createdUsers.push({ key: definition.key, id: created.id, email: created.email, role: created.role });

      if (definition.key === "standard" || definition.key === "admin") {
        const marketRole = definition.key === "standard" ? "recruiter" : "admin";
        const permissions = definition.key === "standard"
          ? ["read", "write"]
          : ["read", "write", "approve", "export", "admin"];
        for (const market of markets) {
          await client.query(
            `
              INSERT INTO user_recruiting_markets (
                user_id, market, role, permissions, can_export, can_bulk_action
              )
              VALUES ($1, $2, $3::recruiting_role, $4::text[], $5, $6)
            `,
            [
              created.id,
              market,
              marketRole,
              permissions,
              definition.key === "admin",
              definition.key === "admin",
            ],
          );
        }
      }
    }

    await client.query("COMMIT");

    console.log("Gate 0 UAT identities provisioned in the staging database.");
    console.log("Environment confirmed: staging.");
    console.log("External delivery mode confirmed: fail_closed.");
    console.log("Credentials were hashed and were not printed or persisted in source control.");
    console.log(JSON.stringify({
      users: createdUsers,
      marketScope: {
        standard: { role: "recruiter", permissions: ["read", "write"], markets: markets.length },
        admin: { role: "admin", permissions: ["read", "write", "approve", "export", "admin"], markets: markets.length },
        unauthorized: { role: "driver", recruitingMarkets: 0 },
      },
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

provision().catch((error: any) => {
  console.error(`Gate 0 UAT provisioning refused: ${error?.message || error}`);
  process.exitCode = 1;
});