import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
});

async function run() {
  await client.connect();
  console.log("Connected to database");

  await client.query(`
    CREATE TABLE IF NOT EXISTS file_drop_configs (
      id                       VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name                     VARCHAR(200) NOT NULL,
      dataset_type             VARCHAR(50)  NOT NULL,
      enabled                  BOOLEAN      NOT NULL DEFAULT false,

      sftp_host                VARCHAR(255),
      sftp_port                INTEGER      DEFAULT 22,
      sftp_username            VARCHAR(100),
      sftp_password_encrypted  TEXT,
      sftp_private_key_encrypted TEXT,
      sftp_passphrase_encrypted TEXT,

      inbound_path             VARCHAR(500) NOT NULL DEFAULT '/inbound/',
      archive_path             VARCHAR(500) DEFAULT '/archive/processed/',
      error_path               VARCHAR(500) DEFAULT '/archive/error/',
      duplicate_path           VARCHAR(500) DEFAULT '/archive/duplicate/',

      poll_interval_minutes    INTEGER      NOT NULL DEFAULT 15,
      file_name_pattern        VARCHAR(255),
      auto_process             BOOLEAN      NOT NULL DEFAULT false,
      require_all_file_types   BOOLEAN      NOT NULL DEFAULT false,
      notes                    TEXT,
      last_polled_at           TIMESTAMPTZ,
      created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  console.log("✓ file_drop_configs table ready");

  await client.query(`
    CREATE TABLE IF NOT EXISTS file_drop_ingestion_log (
      id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      file_drop_config_id VARCHAR NOT NULL REFERENCES file_drop_configs(id) ON DELETE CASCADE,

      file_name           VARCHAR(500)  NOT NULL,
      remote_path         VARCHAR(1000),
      file_size           INTEGER,
      checksum            VARCHAR(64),

      status              VARCHAR(30)  NOT NULL DEFAULT 'pending',
      dataset_type        VARCHAR(50)  NOT NULL,
      import_job_id       VARCHAR,
      import_batch_id     VARCHAR,

      rows_staged         INTEGER,
      rows_committed      INTEGER,
      rows_failed         INTEGER,

      archived_path       VARCHAR(1000),
      error_message       TEXT,

      detected_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      processed_at        TIMESTAMPTZ,
      created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  console.log("✓ file_drop_ingestion_log table ready");

  await client.query(`CREATE INDEX IF NOT EXISTS idx_fdil_config ON file_drop_ingestion_log(file_drop_config_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fdil_status ON file_drop_ingestion_log(status);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fdil_checksum ON file_drop_ingestion_log(checksum);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fdil_detected ON file_drop_ingestion_log(detected_at DESC);`);
  console.log("✓ Indexes created");

  const verify = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('file_drop_configs','file_drop_ingestion_log')
    ORDER BY table_name
  `);
  console.log("Verified tables:", verify.rows.map(r => r.table_name));

  await client.end();
  console.log("Done.");
}

run().catch(e => { console.error("Error:", e.message); client.end(); process.exit(1); });
