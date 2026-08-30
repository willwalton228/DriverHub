import * as crypto from "crypto";
import { pool } from "../db";

const ALGORITHM = "aes-256-gcm";

function deriveKey(): Buffer {
  const raw = process.env.DRIVER_DATA_ENCRYPTION_KEY ?? "driverhub-dev-fallback-key-32bytes!";
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptToken(plain: string): { encrypted: string; iv: string; tag: string } {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

async function main() {
  const token = process.env.WHENIWORK_API_TOKEN;
  if (!token) { console.error("WHENIWORK_API_TOKEN not set"); process.exit(1); }

  const { encrypted, iv, tag } = encryptToken(token);
  const existing = await pool.query(`SELECT id FROM wiw_api_config LIMIT 1`);

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE wiw_api_config SET token_encrypted=$1, token_iv=$2, token_tag=$3, sync_enabled=true, connection_status='connected', updated_at=NOW() WHERE id=$4`,
      [encrypted, iv, tag, existing.rows[0].id]
    );
    console.log("Updated existing wiw_api_config — sync enabled.");
  } else {
    await pool.query(
      `INSERT INTO wiw_api_config (token_encrypted, token_iv, token_tag, sync_enabled, connection_status, base_url, created_at, updated_at)
       VALUES ($1,$2,$3,true,'connected','https://api.wheniwork.com/2',NOW(),NOW())`,
      [encrypted, iv, tag]
    );
    console.log("Inserted wiw_api_config — sync enabled.");
  }

  await pool.end();
  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
