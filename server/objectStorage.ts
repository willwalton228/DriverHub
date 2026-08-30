import { Storage, File } from "@google-cloud/storage";
import { Client as ReplitStorageClient } from "@replit/object-storage";
import { Response } from "express";

// CRITICAL PATCH: downloadAsBytes in @replit/object-storage always returns 1 byte
// regardless of actual file content (SDK bug). Patch the prototype here so every
// instance — including dynamic imports and direct new Client() calls in routes.ts —
// uses downloadAsStream internally and returns the correct bytes.
(ReplitStorageClient.prototype as any)._patchedDownloadAsBytes = true;
const _originalProtoDownloadAsStream = ReplitStorageClient.prototype.downloadAsStream;
(ReplitStorageClient.prototype as any).downloadAsBytes = async function(objectName: string) {
  try {
    const stream = await _originalProtoDownloadAsStream.call(this, objectName);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    return { ok: true as const, value: new Uint8Array(Buffer.concat(chunks)) };
  } catch (err: any) {
    return { ok: false as const, error: err };
  }
};
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import { isS3Configured, S3StorageService } from "./s3Storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export function getStorageProvider(): "s3" | "replit" {
  if (isS3Configured()) return "s3";
  return "replit";
}

let _s3Service: S3StorageService | null = null;
export function getS3StorageService(): S3StorageService {
  if (!_s3Service) _s3Service = new S3StorageService();
  return _s3Service;
}

// Replit Object Storage client - works in both dev and production
// Note: Client initialization is lazy - create when needed with bucket ID
// The prototype-level downloadAsBytes patch above ensures all instances work correctly.
function getReplitStorageClient(): ReplitStorageClient {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error(
      "DEFAULT_OBJECT_STORAGE_BUCKET_ID not set. Create a bucket in 'Object Storage' tool first."
    );
  }
  return new ReplitStorageClient({ bucketId });
}

// Legacy GCS client - only works in development
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async uploadFile(
    fileBuffer: Buffer,
    contentType: string,
    originalFilename?: string
  ): Promise<{ objectPath: string; uploadURL: string }> {
    const objectId = randomUUID();
    const extension = originalFilename
      ? (originalFilename.split('.').pop() || '').toLowerCase()
      : this.getExtensionFromContentType(contentType);
    const objectName = `uploads/${objectId}${extension ? `.${extension}` : ''}`;

    console.log(`[ObjectStorage] Uploading to path: ${objectName}, contentType: ${contentType}, bufferSize: ${fileBuffer.length}`);

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      const err = new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID environment variable is not set');
      (err as any).errorCode = 'STORAGE_NOT_CONFIGURED';
      throw err;
    }

    console.log(`[ObjectStorage] Uploading ${fileBuffer.length} bytes to: ${objectName}, bucketId: ${bucketId.substring(0, 20)}...`);

    const MAX_RETRIES = 3;
    let lastError: any = null;
    let lastErrorDetails = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const client = getReplitStorageClient();
        console.log(`[ObjectStorage] uploadFromBytes attempt ${attempt}/${MAX_RETRIES}...`);
        const result = await client.uploadFromBytes(objectName, fileBuffer);

        if (result.ok) {
          console.log(`[ObjectStorage] File saved successfully on attempt ${attempt}`);
          const objectPath = `/objects/${objectName}`;
          return { objectPath, uploadURL: objectPath };
        }

        const errObj = (result as any).error;
        lastErrorDetails = this.extractErrorDetails(errObj);
        lastError = new Error(`Upload failed: ${lastErrorDetails}`);
        console.warn(`[ObjectStorage] Attempt ${attempt} failed: ${lastErrorDetails}`);
      } catch (attemptError: any) {
        lastError = attemptError;
        lastErrorDetails = attemptError?.message || String(attemptError);
        console.warn(`[ObjectStorage] Attempt ${attempt} threw: ${lastErrorDetails}`);
      }

      if (attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        console.log(`[ObjectStorage] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error(`[ObjectStorage] All ${MAX_RETRIES} upload attempts failed. Last error: ${lastErrorDetails}`);

    const isIdentityError = lastErrorDetails.includes('replidentity') ||
      lastErrorDetails.includes('REPL_IDENTITY') ||
      lastErrorDetails.includes('token') ||
      lastErrorDetails.includes('credential');
    const isAuthError = lastErrorDetails.includes('permission') ||
      lastErrorDetails.includes('auth') ||
      lastErrorDetails.includes('403') ||
      lastErrorDetails.includes('401');

    let errorCode = 'STORAGE_ERROR';
    if (isIdentityError || isAuthError) {
      errorCode = 'STORAGE_AUTH_FAILED';
      console.error(`[ObjectStorage] Identity/auth failure detected: ${lastErrorDetails}`);
    }

    const enhancedError = new Error(
      `Object storage upload failed after ${MAX_RETRIES} attempts: ${lastErrorDetails}`
    );
    (enhancedError as any).errorCode = errorCode;
    (enhancedError as any).originalError = lastError;
    (enhancedError as any).errorDetails = lastErrorDetails;
    throw enhancedError;
  }

  async uploadFileWithKey(
    storageKey: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<void> {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      const err = new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID environment variable is not set');
      (err as any).errorCode = 'STORAGE_NOT_CONFIGURED';
      throw err;
    }

    console.log(`[ObjectStorage] uploadFileWithKey: key=${storageKey}, size=${fileBuffer.length}, type=${contentType}`);

    const MAX_RETRIES = 3;
    let lastError: any = null;
    let lastErrorDetails = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const client = getReplitStorageClient();
        console.log(`[ObjectStorage] uploadFileWithKey attempt ${attempt}/${MAX_RETRIES}...`);
        const result = await client.uploadFromBytes(storageKey, fileBuffer);

        if (result.ok) {
          console.log(`[ObjectStorage] uploadFileWithKey succeeded on attempt ${attempt}`);
          return;
        }

        const errObj = (result as any).error;
        lastErrorDetails = this.extractErrorDetails(errObj);
        lastError = new Error(`Upload failed: ${lastErrorDetails}`);
        console.warn(`[ObjectStorage] uploadFileWithKey attempt ${attempt} failed: ${lastErrorDetails}`);
      } catch (attemptError: any) {
        lastError = attemptError;
        lastErrorDetails = attemptError?.message || String(attemptError);
        console.warn(`[ObjectStorage] uploadFileWithKey attempt ${attempt} threw: ${lastErrorDetails}`);
      }

      if (attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        console.log(`[ObjectStorage] uploadFileWithKey retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error(`[ObjectStorage] uploadFileWithKey: all ${MAX_RETRIES} attempts failed. Last: ${lastErrorDetails}`);

    const isIdentityError = lastErrorDetails.includes('replidentity') ||
      lastErrorDetails.includes('REPL_IDENTITY') ||
      lastErrorDetails.includes('token') ||
      lastErrorDetails.includes('credential');
    const isAuthError = lastErrorDetails.includes('permission') ||
      lastErrorDetails.includes('auth') ||
      lastErrorDetails.includes('403') ||
      lastErrorDetails.includes('401');

    let errorCode = 'STORAGE_ERROR';
    if (isIdentityError || isAuthError) {
      errorCode = 'STORAGE_AUTH_FAILED';
      console.error(`[ObjectStorage] uploadFileWithKey: identity/auth failure: ${lastErrorDetails}`);
    }

    const enhancedError = new Error(
      `Object storage upload failed after ${MAX_RETRIES} attempts: ${lastErrorDetails}`
    );
    (enhancedError as any).errorCode = errorCode;
    (enhancedError as any).originalError = lastError;
    (enhancedError as any).errorDetails = lastErrorDetails;
    throw enhancedError;
  }

  private extractErrorDetails(errObj: any): string {
    if (!errObj) return 'Unknown error (no error object)';

    if (errObj instanceof Error) {
      const msg = errObj.message || errObj.toString();
      if (errObj.cause) {
        return `${msg} | cause: ${errObj.cause instanceof Error ? errObj.cause.message : String(errObj.cause)}`;
      }
      return msg;
    }

    if (typeof errObj === 'string') return errObj;

    if (typeof errObj === 'object') {
      const message = errObj.message || errObj.msg || '';
      const code = errObj.code || errObj.statusCode || errObj.status || '';
      const details = errObj.details || errObj.error || '';

      const parts: string[] = [];
      if (message) parts.push(typeof message === 'string' ? message : JSON.stringify(message));
      if (code) parts.push(`code=${code}`);
      if (details && typeof details === 'string') parts.push(details);
      else if (details && typeof details === 'object') parts.push(JSON.stringify(details));

      return parts.length > 0 ? parts.join(' | ') : JSON.stringify(errObj);
    }

    return String(errObj);
  }

  async downloadFromReplitStorage(objectPath: string, res: Response): Promise<boolean> {
    if (!objectPath.startsWith("/objects/")) {
      return false;
    }
    const objectName = objectPath.replace(/^\/objects\//, "");
    if (!objectName) return false;

    const ext = objectName.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const client = getReplitStorageClient();

        // Check existence first to distinguish "not found" from transient errors
        const existsResult = await client.exists(objectName);
        if (existsResult.ok && !existsResult.value) {
          return false;
        }

        // Use downloadAsStream — downloadAsBytes is broken (returns 1 byte regardless of content)
        const stream = await client.downloadAsStream(objectName);

        res.set({
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=3600',
        });

        await new Promise<void>((resolve, reject) => {
          stream.on('error', reject);
          res.on('error', reject);
          stream.pipe(res);
          stream.on('end', resolve);
        });

        return true;
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          console.warn(`[ObjectStorage] Replit download error for ${objectName}, attempt ${attempt}/${MAX_RETRIES}:`, error);
          await new Promise(r => setTimeout(r, 400 * attempt));
          continue;
        }
        console.error(`[ObjectStorage] Replit download error for ${objectName} after ${MAX_RETRIES} attempts:`, error);
        return false;
      }
    }
    return false;
  }

  // downloadAsBytes is broken in the Replit SDK (always returns 1 byte).
  // Use this helper everywhere instead — it collects the stream into a Buffer correctly.
  async downloadToBuffer(objectName: string): Promise<Buffer | null> {
    const client = getReplitStorageClient();
    const existsResult = await client.exists(objectName);
    if (existsResult.ok && !existsResult.value) return null;

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const stream = await client.downloadAsStream(objectName);
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          stream.on('data', (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        return Buffer.concat(chunks);
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 400 * attempt));
          continue;
        }
        console.error(`[ObjectStorage] downloadToBuffer failed for ${objectName}:`, error);
        return null;
      }
    }
    return null;
  }

  private getExtensionFromContentType(contentType: string): string {
    const mapping: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    return mapping[contentType] || '';
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
  
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
  
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
  
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

export function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

export async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  let response: globalThis.Response;
  try {
    response = await fetch(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }
    );
  } catch (fetchErr: any) {
    console.error("[ObjectStorage] Sidecar connection failed:", fetchErr.message);
    throw new Error("Storage service is unavailable. Please try again.");
  }

  if (!response.ok) {
    let responseBody = "";
    try {
      responseBody = await response.text();
    } catch (_) {}
    console.error(
      `[ObjectStorage] Signed URL request failed: status=${response.status}, ` +
      `bucket=${bucketName}, object=${objectName}, method=${method}, ` +
      `response=${responseBody}`
    );
    const err = new Error("Storage signed URL generation failed. The storage sidecar returned an error.");
    (err as any).errorCode = "STORAGE_NOT_CONFIGURED";
    (err as any).sidecarStatus = response.status;
    throw err;
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}
