import { pool } from "../db";

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS claims_widget_preferences (
        id             varchar        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        varchar        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        widget_order   text[]         NOT NULL DEFAULT '{}',
        hidden_widgets text[]         NOT NULL DEFAULT '{}',
        updated_at     timestamptz    NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS claims_widget_prefs_user_idx
        ON claims_widget_preferences(user_id);
    `);
    console.log("✓ claims_widget_preferences table ready");
  } finally {
    client.release();
    process.exit(0);
  }
}

run().catch((e) => { console.error(e.message); process.exit(1); });
