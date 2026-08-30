import crypto from "crypto";
import { pool } from "../db";
import { getEffectiveMs365Config, sendEmail } from "./microsoftGraphService";

export const HOLIDAYS = [
  { code: "new_years_day", name: "New Year's Day" },
  { code: "memorial_day", name: "Memorial Day" },
  { code: "independence_day", name: "Independence Day" },
  { code: "labor_day", name: "Labor Day" },
  { code: "thanksgiving_day", name: "Thanksgiving Day" },
  { code: "christmas_day", name: "Christmas Day" },
] as const;

export type HolidayCode = typeof HOLIDAYS[number]["code"];
export type HolidayStatus = "unconfirmed" | "open" | "modified_hours" | "closed";

// Outbound Holiday Operations emails are intentionally held until the workflow
// receives explicit production approval. This gate protects both manual sends
// and the automatic 30/14/7-day reminder sweep.
export const HOLIDAY_CONFIRMATION_EMAIL_DELIVERY_ENABLED = false;

const timezoneSql = (primary: string, fallback: string) => `
  COALESCE(
    (SELECT name FROM pg_timezone_names WHERE name = NULLIF(${primary}, '') LIMIT 1),
    (SELECT name FROM pg_timezone_names WHERE name = NULLIF(${fallback}, '') LIMIT 1),
    'America/Chicago'
  )`;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const nthWeekday = (year: number, month: number, weekday: number, occurrence: number) => {
  const d = new Date(Date.UTC(year, month, 1));
  d.setUTCDate(1 + ((weekday - d.getUTCDay() + 7) % 7) + ((occurrence - 1) * 7));
  return d;
};
const lastWeekday = (year: number, month: number, weekday: number) => {
  const d = new Date(Date.UTC(year, month + 1, 0));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - weekday + 7) % 7));
  return d;
};

export function holidayDate(code: HolidayCode, year: number): string {
  switch (code) {
    case "new_years_day": return `${year}-01-01`;
    case "memorial_day": return isoDate(lastWeekday(year, 4, 1));
    case "independence_day": return `${year}-07-04`;
    case "labor_day": return isoDate(nthWeekday(year, 8, 1, 1));
    case "thanksgiving_day": return isoDate(nthWeekday(year, 10, 4, 4));
    case "christmas_day": return `${year}-12-25`;
  }
}

export function holidayDefinition(code: string) {
  return HOLIDAYS.find((holiday) => holiday.code === code);
}

export async function getApplicableHolidayAccounts() {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (c.id)
       c.id, c.customer_name, c.network,
        ${timezoneSql("wl.timezone", "c.timezone")} AS timezone
     FROM customers c
     JOIN wiw_locations wl ON wl.account_id = c.id
     WHERE LOWER(COALESCE(c.status, 'active')) = 'active'
     ORDER BY c.id, wl.updated_at DESC NULLS LAST`,
  );
  return rows;
}

export async function ensureHolidayOperations(year: number, code?: string) {
  const definitions = code ? HOLIDAYS.filter((holiday) => holiday.code === code) : HOLIDAYS;
  for (const holiday of definitions) {
    const date = holidayDate(holiday.code, year);
    await pool.query(
      `INSERT INTO holiday_operations
        (account_id, holiday_code, holiday_name, holiday_date, holiday_year, timezone)
       SELECT DISTINCT ON (c.id)
         c.id, $1, $2, $3::date, $4, ${timezoneSql("wl.timezone", "c.timezone")}
       FROM customers c
       JOIN wiw_locations wl ON wl.account_id = c.id
       WHERE LOWER(COALESCE(c.status, 'active')) = 'active'
       ORDER BY c.id, wl.updated_at DESC NULLS LAST
       ON CONFLICT (account_id, holiday_code, holiday_year) DO NOTHING`,
      [holiday.code, holiday.name, date, year],
    );
  }
}

export async function createSpecialHoliday(input: {
  name: string;
  date: string;
  year: number;
  appliesToAllAccounts: boolean;
  accountIds?: string[];
  notes?: string | null;
  createdByUserId?: string | null;
}) {
  const name = input.name?.trim();
  const date = input.date.trim();
  if (!name || name.length > 128) throw new Error("A special-date name of 128 characters or fewer is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== input.year) {
    throw new Error("Select a valid date within the selected year");
  }

  const requestedAccountIds = Array.from(new Set((input.accountIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0)));
  if (!input.appliesToAllAccounts && requestedAccountIds.length === 0) {
    throw new Error("Select at least one applicable Account, or choose all applicable Accounts");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accountResult = await client.query(
      `SELECT DISTINCT ON (c.id)
         c.id, ${timezoneSql("wl.timezone", "c.timezone")} AS timezone
       FROM customers c
       JOIN wiw_locations wl ON wl.account_id = c.id
       WHERE LOWER(COALESCE(c.status, 'active')) = 'active'
         AND ($1::boolean OR c.id = ANY($2::varchar[]))
       ORDER BY c.id, wl.updated_at DESC NULLS LAST`,
      [input.appliesToAllAccounts, requestedAccountIds],
    );
    if (!accountResult.rows.length) throw new Error("No applicable active Accounts were found for this special date");
    if (!input.appliesToAllAccounts && accountResult.rows.length !== requestedAccountIds.length) {
      throw new Error("One or more selected Accounts are not active Shift Accounts");
    }

    const holidayCode = `special_${crypto.randomUUID().replace(/-/g, "")}`;
    const specialDate = await client.query(
      `INSERT INTO holiday_operation_special_dates
        (holiday_code, holiday_name, holiday_date, holiday_year, applies_to_all_accounts, notes, created_by_user_id)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7)
       RETURNING id, holiday_code, holiday_name, holiday_date, holiday_year, applies_to_all_accounts, notes`,
      [holidayCode, name, date, input.year, input.appliesToAllAccounts, input.notes?.trim() || null, input.createdByUserId ?? null],
    );
    const special = specialDate.rows[0];

    if (!input.appliesToAllAccounts) {
      await client.query(
        `INSERT INTO holiday_operation_special_date_accounts (special_date_id, account_id)
         SELECT $1, UNNEST($2::varchar[])
         ON CONFLICT DO NOTHING`,
        [special.id, accountResult.rows.map((row) => row.id)],
      );
    }

    await client.query(
      `INSERT INTO holiday_operations
        (account_id, holiday_code, holiday_name, holiday_date, holiday_year, timezone, notes)
       SELECT item.id, $1, $2, $3::date, $4, item.timezone, $5
       FROM UNNEST($6::varchar[], $7::varchar[]) AS item(id, timezone)
       ON CONFLICT (account_id, holiday_code, holiday_year) DO NOTHING`,
      [
        holidayCode,
        name,
        date,
        input.year,
        input.notes?.trim() || null,
        accountResult.rows.map((row) => row.id),
        accountResult.rows.map((row) => row.timezone),
      ],
    );
    await client.query("COMMIT");
    return { specialDate: special, createdRecords: accountResult.rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

export async function updateHolidayStatus(input: {
  operationId: string;
  status: HolidayStatus;
  openingTime?: string | null;
  closingTime?: string | null;
  notes?: string | null;
  source: "Account Response" | "DriverHub User" | "Other Authorized Source";
  actorUserId?: string | null;
  contactId?: string | null;
  expectedCurrentStatus?: HolidayStatus;
}) {
  if (!["unconfirmed", "open", "modified_hours", "closed"].includes(input.status)) {
    throw new Error("Invalid operating status");
  }
  const needsHours = input.status === "modified_hours";
  if (needsHours && (!validTime(input.openingTime) || !validTime(input.closingTime) || input.openingTime >= input.closingTime)) {
    throw new Error("Modified Hours requires a valid opening time before closing time");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id, operating_status, opening_time::text, closing_time::text
       FROM holiday_operations WHERE id = $1 FOR UPDATE`,
      [input.operationId],
    );
    if (!existing.rows[0]) throw new Error("Holiday operation not found");
    const prior = existing.rows[0];
    const result = await client.query(
      `UPDATE holiday_operations
       SET operating_status = $2,
           opening_time = $3::time,
           closing_time = $4::time,
           notes = COALESCE($5, notes),
            confirmation_source = CASE WHEN $2 = 'unconfirmed' THEN NULL ELSE $6 END,
            confirmed_by_user_id = CASE WHEN $2 = 'unconfirmed' THEN NULL ELSE $7 END,
            confirmed_by_contact_id = CASE WHEN $2 = 'unconfirmed' THEN NULL ELSE $8 END,
           confirmed_at = CASE WHEN $2 = 'unconfirmed' THEN NULL ELSE NOW() END,
           last_modified_by_user_id = $7,
           last_modified_at = NOW(),
           reopened_at = CASE WHEN $2 = 'unconfirmed' THEN NOW() ELSE reopened_at END,
           communication_status = CASE WHEN $2 = 'unconfirmed' THEN 'not_sent' WHEN $6 = 'Account Response' THEN 'responded' ELSE communication_status END,
           updated_at = NOW()
       WHERE id = $1
         AND ($9::varchar IS NULL OR operating_status = $9)
       RETURNING *`,
      [
        input.operationId,
        input.status,
        needsHours ? input.openingTime : null,
        needsHours ? input.closingTime : null,
        input.notes ?? null,
        input.source,
        input.actorUserId ?? null,
        input.contactId ?? null,
        input.expectedCurrentStatus ?? null,
      ],
    );
    if (!result.rows[0]) {
      throw new Error("This holiday status has already been confirmed");
    }
    await client.query(
      `INSERT INTO holiday_operations_audit
        (holiday_operation_id, event_type, previous_status, new_status, opening_time, closing_time, notes, actor_user_id, responding_contact_id, confirmation_source)
       VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, $8, $9, $10)`,
      [
        input.operationId,
        input.status === "unconfirmed" ? "reopened" : "status_confirmed",
        prior.operating_status,
        input.status,
        needsHours ? input.openingTime : null,
        needsHours ? input.closingTime : null,
        input.notes ?? null,
        input.actorUserId ?? null,
        input.contactId ?? null,
        input.source,
      ],
    );
    // A status change invalidates every previously issued response link. This
    // prevents stale links from changing a reopened or already-confirmed record.
    await client.query(
      `UPDATE holiday_operations_response_tokens
       SET used_at = NOW()
       WHERE holiday_operation_id = $1 AND used_at IS NULL`,
      [input.operationId],
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listHolidayOperations(filters: {
  year: number;
  holiday?: string;
  network?: string;
  accountId?: string;
  status?: string;
  confirmationStatus?: string;
  communicationStatus?: string;
  schedulingConflict?: string;
  exception?: string;
}) {
  await ensureHolidayOperations(filters.year, filters.holiday);
  const values: unknown[] = [filters.year];
  const where = ["ho.holiday_year = $1"];
  if (filters.holiday) { values.push(filters.holiday); where.push(`ho.holiday_code = $${values.length}`); }
  if (filters.network) { values.push(filters.network); where.push(`c.network = $${values.length}`); }
  if (filters.accountId) { values.push(filters.accountId); where.push(`ho.account_id = $${values.length}`); }
  if (filters.status) { values.push(filters.status); where.push(`ho.operating_status = $${values.length}`); }
  if (filters.confirmationStatus === "confirmed") where.push("ho.operating_status <> 'unconfirmed'");
  if (filters.confirmationStatus === "unconfirmed") where.push("ho.operating_status = 'unconfirmed'");
  if (filters.communicationStatus) { values.push(filters.communicationStatus); where.push(`ho.communication_status = $${values.length}`); }
  const base = `
    SELECT ho.*, c.customer_name, c.network,
      CONCAT_WS(' ', confirmed_user.first_name, confirmed_user.last_name) AS confirmed_by_user_name,
      CONCAT_WS(' ', confirmed_contact.first_name, confirmed_contact.last_name) AS confirmed_by_contact_name,
      contact.id AS primary_contact_id,
      CONCAT_WS(' ', contact.first_name, contact.last_name) AS primary_contact_name,
      contact.email AS primary_contact_email,
      recent.sent_at AS last_communication,
      recent.delivery_status AS last_delivery_status,
      recent.sender_mailbox AS last_sender_mailbox,
      shift_summary.scheduled_drivers,
      shift_summary.scheduled_shifts,
      shift_summary.conflict_shifts,
      shift_summary.shift_details,
      CASE
        WHEN ho.operating_status = 'closed' AND shift_summary.scheduled_shifts > 0 THEN 'closed_with_shifts'
        WHEN ho.operating_status = 'modified_hours' AND shift_summary.conflict_shifts > 0 THEN 'modified_hours_conflict'
        WHEN ho.operating_status = 'unconfirmed' AND shift_summary.scheduled_shifts > 0 THEN 'unconfirmed_with_shifts'
        WHEN contact.id IS NULL THEN 'missing_recipient'
        WHEN ho.communication_status = 'failed' THEN 'communication_failed'
         WHEN ho.operating_status = 'unconfirmed'
           AND ho.communication_status = 'sent'
           AND ho.holiday_date <= CURRENT_DATE THEN 'no_response'
        ELSE NULL
      END AS exception_type
    FROM holiday_operations ho
    JOIN customers c ON c.id = ho.account_id
    LEFT JOIN users confirmed_user ON confirmed_user.id = ho.confirmed_by_user_id
    LEFT JOIN account_contacts confirmed_contact ON confirmed_contact.id = ho.confirmed_by_contact_id
    LEFT JOIN LATERAL (
      SELECT ac.id, ac.first_name, ac.last_name, ac.email
      FROM account_contacts ac
      WHERE ac.account_id = ho.account_id AND ac.status = 'active' AND NOT ac.is_archived
        AND ac.email IS NOT NULL
      ORDER BY ac.receives_schedule_emails DESC, ac.is_communication DESC, ac.is_primary DESC, ac.created_at
      LIMIT 1
    ) contact ON true
    LEFT JOIN LATERAL (
      SELECT sent_at, delivery_status, sender_mailbox FROM holiday_operations_communications
      WHERE holiday_operation_id = ho.id ORDER BY created_at DESC LIMIT 1
    ) recent ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT ws.wiw_user_id)::int AS scheduled_drivers,
             COUNT(ws.id)::int AS scheduled_shifts,
             COUNT(ws.id) FILTER (
               WHERE ho.operating_status = 'modified_hours'
                 AND (
                   (ws.start_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")})::time < ho.opening_time
                   OR (ws.end_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")})::time > ho.closing_time
                 )
              )::int AS conflict_shifts,
              COALESCE(json_agg(json_build_object(
                'driver', COALESCE(wu.name, 'Unassigned'),
                'startTime', to_char(ws.start_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")}, 'YYYY-MM-DD HH12:MI AM'),
                'endTime', to_char(ws.end_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")}, 'YYYY-MM-DD HH12:MI AM')
              ) ORDER BY ws.start_time) FILTER (WHERE ws.id IS NOT NULL AND (
                ho.operating_status IN ('closed', 'unconfirmed')
                OR (ho.operating_status = 'modified_hours' AND (
                  (ws.start_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")})::time < ho.opening_time
                  OR (ws.end_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")})::time > ho.closing_time
                ))
              )), '[]'::json) AS shift_details
      FROM wiw_shifts ws
      JOIN wiw_locations wl ON wl.id = ws.wiw_location_id
       LEFT JOIN wiw_users wu ON wu.id = ws.wiw_user_id
      WHERE wl.account_id = ho.account_id
        AND (ws.start_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")})::date = ho.holiday_date
        AND ws.status <> 'deleted'
    ) shift_summary ON true
    WHERE ${where.join(" AND ")}
  `;
  const outerWhere: string[] = [];
  if (filters.exception) {
    values.push(filters.exception);
    outerWhere.push(`exception_type = $${values.length}`);
  }
  if (filters.schedulingConflict === "yes") {
    outerWhere.push("exception_type IN ('closed_with_shifts', 'modified_hours_conflict', 'unconfirmed_with_shifts')");
  }
  if (filters.schedulingConflict === "no") {
    outerWhere.push("(exception_type IS NULL OR exception_type NOT IN ('closed_with_shifts', 'modified_hours_conflict', 'unconfirmed_with_shifts'))");
  }
  const query = outerWhere.length
    ? `SELECT * FROM (${base}) rows WHERE ${outerWhere.join(" AND ")} ORDER BY network NULLS LAST, customer_name`
    : `${base} ORDER BY network NULLS LAST, customer_name`;
  const { rows } = await pool.query(query, values);
  const summary = rows.reduce((acc: Record<string, number>, row: any) => {
    acc.applicableAccounts++;
    acc[row.operating_status] = (acc[row.operating_status] ?? 0) + 1;
    if (row.exception_type?.includes("conflict") || row.exception_type === "closed_with_shifts") acc.schedulingConflicts++;
    if (row.exception_type === "communication_failed") acc.communicationFailures++;
    if (row.exception_type === "no_response") acc.noResponses++;
    return acc;
  }, { applicableAccounts: 0, unconfirmed: 0, open: 0, modified_hours: 0, closed: 0, schedulingConflicts: 0, communicationFailures: 0, noResponses: 0 });
  return { records: rows, summary };
}

export async function getHolidayMetadata(year: number) {
  await ensureHolidayOperations(year);
  const [{ rows: networkRows }, accountRows, { rows: specialDates }] = await Promise.all([
    pool.query(
      `SELECT DISTINCT c.network
       FROM customers c
       JOIN wiw_locations wl ON wl.account_id = c.id
       WHERE LOWER(COALESCE(c.status, 'active')) = 'active'
         AND c.network IS NOT NULL AND BTRIM(c.network) <> ''
       ORDER BY c.network`,
    ),
    getApplicableHolidayAccounts(),
    pool.query(
      `SELECT holiday_code AS code, holiday_name AS name, holiday_date AS date, notes, applies_to_all_accounts
       FROM holiday_operation_special_dates
       WHERE holiday_year = $1
       ORDER BY holiday_date, holiday_name`,
      [year],
    ),
  ]);
  return {
    holidays: [
      ...HOLIDAYS.map((holiday) => ({ ...holiday, date: holidayDate(holiday.code, year), isSpecial: false })),
      ...specialDates.map((holiday) => ({ ...holiday, isSpecial: true })),
    ],
    networks: networkRows.map((row) => row.network),
    accounts: accountRows,
  };
}

export async function listAccountHolidayHistory(accountId: string) {
  const { rows } = await pool.query(
    `SELECT ho.*,
       c.customer_name, c.network,
       CONCAT_WS(' ', confirmed_user.first_name, confirmed_user.last_name) AS confirmed_by_user_name,
       CONCAT_WS(' ', confirmed_contact.first_name, confirmed_contact.last_name) AS confirmed_by_contact_name,
       CONCAT_WS(' ', contact.first_name, contact.last_name) AS primary_contact_name,
       contact.email AS primary_contact_email,
       shift_summary.scheduled_drivers,
       shift_summary.scheduled_shifts,
       shift_summary.conflict_shifts
     FROM holiday_operations ho
     JOIN customers c ON c.id = ho.account_id
     LEFT JOIN users confirmed_user ON confirmed_user.id = ho.confirmed_by_user_id
     LEFT JOIN account_contacts confirmed_contact ON confirmed_contact.id = ho.confirmed_by_contact_id
     LEFT JOIN LATERAL (
       SELECT ac.first_name, ac.last_name, ac.email
       FROM account_contacts ac
       WHERE ac.account_id = ho.account_id AND ac.status = 'active'
         AND NOT ac.is_archived AND ac.email IS NOT NULL
       ORDER BY ac.receives_schedule_emails DESC, ac.is_communication DESC,
                ac.is_primary DESC, ac.created_at
       LIMIT 1
     ) contact ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT ws.wiw_user_id)::int AS scheduled_drivers,
              COUNT(ws.id)::int AS scheduled_shifts,
              COUNT(ws.id) FILTER (
                WHERE ho.operating_status = 'modified_hours'
                  AND (
                    (ws.start_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")})::time < ho.opening_time
                    OR (ws.end_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")})::time > ho.closing_time
                  )
              )::int AS conflict_shifts,
              COALESCE(json_agg(json_build_object(
                'driver', COALESCE(wu.name, 'Unassigned'),
                'startTime', to_char(ws.start_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")}, 'YYYY-MM-DD HH12:MI AM'),
                'endTime', to_char(ws.end_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")}, 'YYYY-MM-DD HH12:MI AM')
              ) ORDER BY ws.start_time) FILTER (WHERE ws.id IS NOT NULL), '[]'::json) AS shift_details
       FROM wiw_shifts ws
       JOIN wiw_locations wl ON wl.id = ws.wiw_location_id
       LEFT JOIN wiw_users wu ON wu.id = ws.wiw_user_id
       WHERE wl.account_id = ho.account_id
         AND (ws.start_time AT TIME ZONE ${timezoneSql("wl.timezone", "ho.timezone")})::date = ho.holiday_date
         AND ws.status <> 'deleted'
     ) shift_summary ON true
     WHERE ho.account_id = $1
     ORDER BY ho.holiday_year DESC, ho.holiday_date DESC, ho.holiday_name`,
    [accountId],
  );
  return rows;
}

function responseUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/holiday-response?token=${encodeURIComponent(token)}`;
}

export async function sendHolidayConfirmation(
  operationId: string,
  origin: string,
  requestedContactId?: string | null,
  communicationType = "confirmation_request",
) {
  if (!HOLIDAY_CONFIRMATION_EMAIL_DELIVERY_ENABLED) {
    return { sent: false, reason: "delivery_disabled" };
  }

  const { rows } = await pool.query(
    `SELECT ho.*, c.customer_name,
      ac.id AS contact_id, ac.first_name, ac.last_name, ac.email
     FROM holiday_operations ho
     JOIN customers c ON c.id = ho.account_id
     LEFT JOIN LATERAL (
       SELECT id, first_name, last_name, email FROM account_contacts
       WHERE account_id = ho.account_id AND status = 'active' AND NOT is_archived
         AND email IS NOT NULL AND ($2::varchar IS NULL OR id = $2)
       ORDER BY receives_schedule_emails DESC, is_communication DESC, is_primary DESC, created_at
       LIMIT 1
     ) ac ON true
     WHERE ho.id = $1`,
    [operationId, requestedContactId ?? null],
  );
  const operation = rows[0];
  if (!operation) throw new Error("Holiday operation not found");
  if (operation.operating_status !== "unconfirmed") throw new Error("This Account has already confirmed its holiday status");
  if (!operation.contact_id || !operation.email) {
    await pool.query(
      `UPDATE holiday_operations SET communication_status = 'missing_recipient', communication_failure_type = 'missing_recipient', updated_at = NOW() WHERE id = $1`,
      [operationId],
    );
    await pool.query(
      `INSERT INTO holiday_operations_communications
        (holiday_operation_id, communication_type, delivery_status, failure_type)
        VALUES ($1, $2, 'missing_recipient', 'missing_recipient')`,
       [operationId, communicationType],
    );
    return { sent: false, reason: "missing_recipient" };
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await pool.query(
    `INSERT INTO holiday_operations_response_tokens (holiday_operation_id, contact_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4::date + INTERVAL '30 days')`,
    [operationId, operation.contact_id, tokenHash, operation.holiday_date],
  );
  const contactName = `${operation.first_name} ${operation.last_name}`.trim();
  const responseLink = responseUrl(origin, rawToken);
  const mailConfig = await getEffectiveMs365Config();
  const result = await sendEmail({
    to: [operation.email],
    subject: `Holiday operating status: ${operation.customer_name} — ${operation.holiday_name}`,
    bodyHtml: `<p>Hello ${contactName || "there"},</p>
      <p>Will <strong>${operation.customer_name}</strong> be operating on <strong>${operation.holiday_name}, ${operation.holiday_date}</strong>?</p>
      <p>Please confirm whether the dealership will be open normally, operating modified hours, or closed.</p>
      <p><a href="${responseLink}">Confirm holiday operating status</a></p>
      <p>This secure link is specific to your account and does not require a DriverHub login.</p>`,
  });
  const deliveryStatus = result.ok ? "sent" : "failed";
  await pool.query(
    `INSERT INTO holiday_operations_communications
      (holiday_operation_id, contact_id, contact_name, contact_email, communication_type, sent_at, delivery_status, failure_type, provider_message, sender_mailbox)
      VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 = 'sent' THEN NOW() ELSE NULL END, $6, $7, $8, $9)`,
     [operationId, operation.contact_id, contactName, operation.email, communicationType, deliveryStatus, result.skipped ? "provider_not_configured" : (result.ok ? null : "provider_error"), result.error ?? null, mailConfig.senderEmail],
  );
  await pool.query(
    `UPDATE holiday_operations
     SET recipient_contact_id = $2, communication_status = $3, communication_failure_type = $4, updated_at = NOW()
     WHERE id = $1`,
    [operationId, operation.contact_id, deliveryStatus, result.ok ? null : (result.skipped ? "provider_not_configured" : "provider_error")],
  );
  return { sent: result.ok, reason: result.error ?? null };
}

export async function getResponseToken(token: string) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const { rows } = await pool.query(
    `SELECT rt.id AS token_id, rt.used_at, rt.expires_at, ho.*, c.customer_name,
      CONCAT_WS(' ', ac.first_name, ac.last_name) AS contact_name
     FROM holiday_operations_response_tokens rt
     JOIN holiday_operations ho ON ho.id = rt.holiday_operation_id
     JOIN customers c ON c.id = ho.account_id
     LEFT JOIN account_contacts ac ON ac.id = rt.contact_id
     WHERE rt.token_hash = $1`,
    [hash],
  );
  const record = rows[0];
  if (!record || record.used_at || new Date(record.expires_at) < new Date()) return null;
  return record;
}

export async function acceptHolidayResponse(token: string, body: { status: HolidayStatus; openingTime?: string; closingTime?: string; notes?: string }) {
  const record = await getResponseToken(token);
  if (!record) throw new Error("This holiday response link is invalid or has expired");
  if (record.operating_status !== "unconfirmed") throw new Error("This holiday status has already been confirmed");
  if (!["open", "modified_hours", "closed"].includes(body.status)) throw new Error("Select Open, Modified Hours, or Closed");
  const claim = await pool.query(
    `UPDATE holiday_operations_response_tokens
     SET used_at = NOW()
     WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING id`,
    [record.token_id],
  );
  if (!claim.rows[0]) throw new Error("This holiday response link has already been used or has expired");
  let updated;
  try {
    updated = await updateHolidayStatus({
      operationId: record.id,
      status: body.status,
      openingTime: body.openingTime,
      closingTime: body.closingTime,
      notes: body.notes,
      source: "Account Response",
      contactId: record.contact_id,
      expectedCurrentStatus: "unconfirmed",
    });
  } catch (error) {
    // A competing response may have confirmed the operation first. Do not
    // resurrect this token after the successful transaction invalidated it.
    if (!(error instanceof Error && error.message === "This holiday status has already been confirmed")) {
      await pool.query(`UPDATE holiday_operations_response_tokens SET used_at = NULL WHERE id = $1`, [record.token_id]);
    }
    throw error;
  }
  await pool.query(
    `UPDATE holiday_operations_communications
     SET response_status = $2, responded_at = NOW()
     WHERE holiday_operation_id = $1 AND contact_id IS NOT DISTINCT FROM $3 AND response_status IS NULL`,
    [record.id, body.status, record.contact_id],
  );
  return updated;
}

export async function runHolidayReminderSweep() {
  if (!HOLIDAY_CONFIRMATION_EMAIL_DELIVERY_ENABLED) {
    return { attempted: 0, sent: 0, skipped: "delivery_disabled" };
  }

  const origin = process.env.PUBLIC_APP_URL || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "");
  if (!origin) return { attempted: 0, skipped: "public_url_not_configured" };
  const { rows } = await pool.query(
    `SELECT id,
       CASE
         WHEN holiday_date - CURRENT_DATE <= 7 THEN 'confirmation_request_7d'
         WHEN holiday_date - CURRENT_DATE <= 14 THEN 'confirmation_request_14d'
         ELSE 'confirmation_request_30d'
       END AS reminder_type
      FROM holiday_operations
     WHERE operating_status = 'unconfirmed'
        AND holiday_date - CURRENT_DATE BETWEEN 0 AND 30
       AND NOT EXISTS (
         SELECT 1 FROM holiday_operations_communications hc
         WHERE hc.holiday_operation_id = holiday_operations.id
            AND hc.communication_type = CASE
              WHEN holiday_operations.holiday_date - CURRENT_DATE <= 7 THEN 'confirmation_request_7d'
              WHEN holiday_operations.holiday_date - CURRENT_DATE <= 14 THEN 'confirmation_request_14d'
              ELSE 'confirmation_request_30d'
            END
       )`,
  );
  let sent = 0;
  for (const row of rows) {
    try {
      const outcome = await sendHolidayConfirmation(row.id, origin, null, row.reminder_type);
      if (outcome.sent) sent++;
    } catch (error) {
      console.error("[HolidayOperations] Reminder send failed", row.id, error);
    }
  }
  return { attempted: rows.length, sent };
}