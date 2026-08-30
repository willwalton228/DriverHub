import { pool } from "../db";

async function run() {
  await pool.query(`ALTER TABLE recruiting_requests ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE recruiting_requests ADD COLUMN IF NOT EXISTS archived_at timestamptz`);
  await pool.query(`ALTER TABLE recruiting_requests ADD COLUMN IF NOT EXISTS archived_by varchar(200)`);
  await pool.query(`ALTER TABLE recruiting_requests ADD COLUMN IF NOT EXISTS archive_reason text`);
  await pool.query(`ALTER TABLE recruiting_requests ADD COLUMN IF NOT EXISTS archive_previous_status varchar(50)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS recruiting_requests_is_archived_idx ON recruiting_requests (is_archived)`);
  console.log('Archive columns migration complete');
  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
