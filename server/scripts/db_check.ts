import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
});

async function run() {
  await client.connect();

  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('moves','pay_periods','policy_versions');
  `);

  console.log("TABLES FOUND:", tables.rows);

  const triggers = await client.query(`
    SELECT tgname
    FROM pg_trigger
    WHERE tgname IN ('trg_moves_immutable','trg_pay_period_status');
  `);

  console.log("TRIGGERS FOUND:", triggers.rows);

  await client.end();
}

run().catch(console.error);
