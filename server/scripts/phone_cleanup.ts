/**
 * Phone Data Normalization Script
 *
 * Normalizes all phone fields across drivers, employees, and customers tables.
 * Storage standard: 10 raw digits only (no formatting, no country code).
 *
 * Rules:
 *   - NULL / empty string         → set to NULL (silently cleaned up)
 *   - Strip all non-digit chars
 *   - 10 digits exactly           → VALID  → update
 *   - 11 digits starting with "1" → strip leading "1" → VALID → update
 *   - Anything else               → INVALID → leave as-is → exception report
 *
 * Run: npx tsx server/scripts/phone_cleanup.ts
 * Or:  npx tsx server/scripts/phone_cleanup.ts --dry-run
 */

import pg from "pg";
const { Pool } = pg;
import * as fs from "fs";
import * as path from "path";

const isDryRun = process.argv.includes("--dry-run");

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

interface PhoneTarget {
  table: string;
  column: string;
  idColumn: string;
  labelColumn: string; // single label expression (SQL)
}

const TARGETS: PhoneTarget[] = [
  { table: "drivers",   column: "phone_number",           idColumn: "id", labelColumn: "COALESCE(driver_number, id)" },
  { table: "drivers",   column: "emergency_contact_phone", idColumn: "id", labelColumn: "COALESCE(driver_number, id)" },
  { table: "employees", column: "phone",                   idColumn: "id", labelColumn: "COALESCE(first_name || ' ' || last_name, id)" },
  { table: "customers", column: "primary_contact_number",  idColumn: "id", labelColumn: "COALESCE(customer_name, id)" },
  { table: "customers", column: "primary_contact_cell",    idColumn: "id", labelColumn: "COALESCE(customer_name, id)" },
  { table: "customers", column: "billing_contact_number",  idColumn: "id", labelColumn: "COALESCE(customer_name, id)" },
];

type Action = "already_clean" | "normalize" | "strip_country_code" | "null_empty" | "invalid";

interface NormResult {
  normalized: string | null; // null means set to NULL
  action: Action;
  reason?: string;
}

function normalize(raw: string | null): NormResult {
  // NULL or whitespace-only → set to NULL cleanly
  if (raw === null || raw.trim() === "") {
    return { normalized: null, action: "null_empty" };
  }

  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    const isFormatted = raw !== digits;
    return { normalized: digits, action: isFormatted ? "normalize" : "already_clean" };
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return { normalized: digits.slice(1), action: "strip_country_code" };
  }

  let reason: string;
  if (digits.length === 0) reason = `no digits found — raw value: "${raw}"`;
  else if (digits.length < 10) reason = `only ${digits.length} digits extracted from "${raw}"`;
  else if (digits.length === 11) reason = `11 digits but no leading 1 — raw: "${raw}"`;
  else reason = `${digits.length} digits (too many) — raw: "${raw}"`;

  return { normalized: null, action: "invalid", reason };
}

interface RowException {
  table: string;
  column: string;
  id: string;
  label: string;
  raw: string;
  reason: string;
}

interface ColumnSummary {
  table: string;
  column: string;
  totalNonNull: number;
  alreadyClean: number;
  normalized: number;
  strippedCountryCode: number;
  nulledEmpty: number;
  invalid: number;
}

async function processTarget(target: PhoneTarget): Promise<{ summary: ColumnSummary; exceptions: RowException[] }> {
  const { table, column, idColumn, labelColumn } = target;

  // Fetch all non-null rows (including empty strings)
  const res = await pool.query(
    `SELECT ${idColumn} AS id, ${column} AS phone, (${labelColumn})::text AS label
     FROM ${table}
     WHERE ${column} IS NOT NULL`
  );

  const summary: ColumnSummary = {
    table, column,
    totalNonNull: res.rows.length,
    alreadyClean: 0, normalized: 0, strippedCountryCode: 0, nulledEmpty: 0, invalid: 0,
  };

  const exceptions: RowException[] = [];
  const updates: Array<{ id: string; value: string | null }> = [];

  for (const row of res.rows) {
    const result = normalize(row.phone);

    switch (result.action) {
      case "already_clean":
        summary.alreadyClean++;
        break;
      case "normalize":
        summary.normalized++;
        updates.push({ id: row.id, value: result.normalized });
        break;
      case "strip_country_code":
        summary.strippedCountryCode++;
        updates.push({ id: row.id, value: result.normalized });
        break;
      case "null_empty":
        summary.nulledEmpty++;
        updates.push({ id: row.id, value: null });
        break;
      case "invalid":
        summary.invalid++;
        exceptions.push({
          table, column,
          id: row.id,
          label: (row.label ?? "").trim(),
          raw: row.phone,
          reason: result.reason!,
        });
        break;
    }
  }

  if (!isDryRun && updates.length > 0) {
    for (const { id, value } of updates) {
      await pool.query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${idColumn} = $2`,
        [value, id]
      );
    }
  }

  return { summary, exceptions };
}

async function main() {
  console.log(`\n${"=".repeat(64)}`);
  console.log(`  DriverHub 360 — Phone Data Normalization`);
  console.log(`  Mode : ${isDryRun ? "DRY RUN (no writes)" : "LIVE (writing to Neon DB)"}`);
  console.log(`${"=".repeat(64)}\n`);

  const allSummaries: ColumnSummary[] = [];
  const allExceptions: RowException[] = [];

  for (const target of TARGETS) {
    process.stdout.write(`  Processing ${target.table}.${target.column} ... `);
    try {
      const { summary, exceptions } = await processTarget(target);
      allSummaries.push(summary);
      allExceptions.push(...exceptions);

      const changed = summary.normalized + summary.strippedCountryCode + summary.nulledEmpty;
      console.log(
        `${String(summary.totalNonNull).padStart(5)} rows | ` +
        `clean=${summary.alreadyClean}  ` +
        `updated=${summary.normalized}  ` +
        `country_stripped=${summary.strippedCountryCode}  ` +
        `nulled_empty=${summary.nulledEmpty}  ` +
        `invalid=${summary.invalid}`
      );
    } catch (err) {
      console.log(`ERROR — ${(err as Error).message}`);
    }
  }

  // Totals
  const totClean = allSummaries.reduce((s, r) => s + r.alreadyClean, 0);
  const totNorm  = allSummaries.reduce((s, r) => s + r.normalized, 0);
  const totStrip = allSummaries.reduce((s, r) => s + r.strippedCountryCode, 0);
  const totNull  = allSummaries.reduce((s, r) => s + r.nulledEmpty, 0);
  const totInv   = allSummaries.reduce((s, r) => s + r.invalid, 0);
  const totRows  = allSummaries.reduce((s, r) => s + r.totalNonNull, 0);

  console.log(`\n${"─".repeat(64)}`);
  console.log("  TOTALS");
  console.log(`${"─".repeat(64)}`);
  console.log(`  Rows examined        : ${totRows}`);
  console.log(`  Already clean (10d)  : ${totClean}`);
  console.log(`  Formatted→digits     : ${totNorm}`);
  console.log(`  Country code stripped: ${totStrip}`);
  console.log(`  Empty→NULL           : ${totNull}`);
  console.log(`  INVALID (unfixed)    : ${totInv}`);
  console.log(`  Total changes        : ${totNorm + totStrip + totNull}`);
  console.log(`${"─".repeat(64)}\n`);

  // Exception report
  if (allExceptions.length > 0) {
    console.log(`  EXCEPTION REPORT — ${allExceptions.length} values left unchanged (require manual review):`);
    console.log(`${"─".repeat(64)}`);
    for (const ex of allExceptions) {
      console.log(`  [${ex.table}.${ex.column}]`);
      console.log(`    ID     : ${ex.id}`);
      console.log(`    Label  : ${ex.label || "(no label)"}`);
      console.log(`    Value  : "${ex.raw}"`);
      console.log(`    Reason : ${ex.reason}`);
      console.log();
    }
    console.log(`${"─".repeat(64)}\n`);
  } else {
    console.log("  No exceptions — all non-null phone values were successfully normalized.\n");
  }

  // Write JSON report
  const reportPath = path.join(process.cwd(), "phone_cleanup_report.json");
  const report = {
    runAt: new Date().toISOString(),
    mode: isDryRun ? "dry_run" : "live",
    database: "neon",
    totals: { rows: totRows, alreadyClean: totClean, normalized: totNorm, strippedCountryCode: totStrip, nulledEmpty: totNull, invalid: totInv },
    columnSummaries: allSummaries,
    exceptions: allExceptions,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`  Full report → ${reportPath}\n`);

  if (isDryRun) {
    console.log("  DRY RUN complete — no data was modified.\n  Re-run without --dry-run to apply.\n");
  } else {
    console.log(`  Done. ${totNorm + totStrip + totNull} phone values updated, ${totInv} flagged for manual review.\n`);
  }

  await pool.end();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
