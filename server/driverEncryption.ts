import crypto from "crypto";

/**
 * Server-side encryption utilities for sensitive driver data
 * SECURITY: These use Node.js crypto module and must NOT be imported by frontend code
 */

// Constants for encryption - env var is REQUIRED for production
// AES-256 requires exactly 32 bytes
const ENCRYPTION_KEY = process.env.DRIVER_DATA_ENCRYPTION_KEY || "dev-temp-key-changeme-exactly32!";
const ALGORITHM = "aes-256-cbc";

// Warn if using fallback key in development
if (!process.env.DRIVER_DATA_ENCRYPTION_KEY) {
  console.warn("WARNING: Using development fallback encryption key. Set DRIVER_DATA_ENCRYPTION_KEY secret for production!");
}

// Validate key length
if (ENCRYPTION_KEY.length !== 32) {
  throw new Error(`DRIVER_DATA_ENCRYPTION_KEY must be exactly 32 bytes long. Current length: ${ENCRYPTION_KEY.length}`);
}

/**
 * Encrypt SSN/EIN for storage
 */
export function encryptSsnOrEin(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt SSN/EIN from storage
 */
export function decryptSsnOrEin(encrypted: string): string {
  const parts = encrypted.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Extract last 4 digits from SSN/EIN
 */
export function extractLast4Digits(ssnOrEin: string): string {
  return ssnOrEin.slice(-4);
}

/**
 * Mask SSN/EIN to show only last 4 digits
 */
export function maskSsnOrEin(ssnOrEin: string): string {
  if (ssnOrEin.length <= 4) return ssnOrEin;
  return "***-**-" + ssnOrEin.slice(-4);
}
