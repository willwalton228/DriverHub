/**
 * Seed built-in system reports.
 * Called once at server startup — idempotent (skips any report that already exists).
 */

const SYSTEM_OWNER_ID = "00000000-0000-0000-0000-000000000000";

interface SystemReportSeed {
  name: string;
  description: string;
  subject: string;
  config: Record<string, unknown>;
}

const SYSTEM_REPORTS: SystemReportSeed[] = [
  {
    name: "Active Drivers by Classification by State",
    description:
      "Count of active drivers grouped first by worker classification, then by state. Useful for workforce composition and regional breakdown.",
    subject: "Drivers",
    config: {
      fields: ["name", "status", "classification", "state"],
      filterField: "status",
      filterValue: "Active",
      groupBy: ["classification", "state"],
    },
  },
];

export async function seedSystemReports(): Promise<void> {
  const { pool } = await import("./db");

  for (const report of SYSTEM_REPORTS) {
    const existing = await pool.query(
      `SELECT id FROM custom_reports WHERE name = $1 AND is_system = true LIMIT 1`,
      [report.name]
    );
    if (existing.rows.length > 0) {
      continue; // already seeded
    }

    await pool.query(
      `INSERT INTO custom_reports
         (name, description, subject, is_public, is_system, config, owner_id, owner_name)
       VALUES ($1, $2, $3, true, true, $4, $5, 'System')`,
      [
        report.name,
        report.description,
        report.subject,
        JSON.stringify(report.config),
        SYSTEM_OWNER_ID,
      ]
    );
    console.log(`[SystemReports] Seeded: "${report.name}"`);
  }
}
