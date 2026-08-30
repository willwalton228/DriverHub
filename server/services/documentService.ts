import { randomUUID } from "crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  documents,
  documentEvents,
  type Document,
  type InsertDocument,
  type DocumentEvent,
} from "@shared/schema";
import {
  ObjectStorageService,
  getStorageProvider,
  getS3StorageService,
} from "../objectStorage";
import { Client as ReplitStorageClient } from "@replit/object-storage";
import { isS3Configured } from "../s3Storage";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const PREVIEWABLE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/csv",
  "text/html",
  // Office files — client opens via Microsoft Office Online viewer using the signed URL
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
];

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
};

function getReplitClient(): ReplitStorageClient {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw Object.assign(new Error("Object storage not configured"), {
      errorCode: "STORAGE_NOT_CONFIGURED",
    });
  }
  return new ReplitStorageClient({ bucketId });
}

export function buildStorageKey(
  ownerType: string,
  ownerId: string | null,
  category: string,
  documentId: string,
  fileName: string,
  tenantId?: string | null
): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  const tenantPrefix = tenantId ? `tenants/${tenantId}/` : "";

  if (ownerType === "global") {
    return `${tenantPrefix}documents/global/${category}/${yyyy}/${mm}/${documentId}/${safe}`;
  }
  return `${tenantPrefix}documents/${ownerType}/${ownerId}/${category}/${yyyy}/${mm}/${documentId}/${safe}`;
}

export interface UploadDocumentInput {
  ownerType: string;
  ownerId?: string | null;
  category: string;
  title: string;
  fileName: string;
  contentType: string;
  fileSizeBytes?: number;
  fileBuffer: Buffer;
  uploadedByUserId: string;
  tenantId?: string | null;
  tags?: any;
}

export interface DownloadResult {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

export async function uploadDocument(
  input: UploadDocumentInput
): Promise<Document> {
  if (input.fileBuffer.length > MAX_FILE_SIZE) {
    throw Object.assign(new Error(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`), {
      errorCode: "FILE_TOO_LARGE",
    });
  }

  const documentId = randomUUID();
  const storageKey = buildStorageKey(
    input.ownerType,
    input.ownerId || null,
    input.category,
    documentId,
    input.fileName,
    input.tenantId || null
  );
  const provider = getStorageProvider();

  if (provider === "s3" && isS3Configured()) {
    const s3 = getS3StorageService();
    await s3.uploadFileWithKey(storageKey, input.fileBuffer, input.contentType);
  } else {
    const storageService = new ObjectStorageService();
    await storageService.uploadFileWithKey(storageKey, input.fileBuffer, input.contentType);

    // Post-upload consistency check: Replit Object Storage (GCS-backed) can have a brief
    // eventual-consistency window. Verify the file is readable before returning, so
    // the caller gets a confirmed-accessible document.
    const verifyClient = getReplitClient();
    const VERIFY_ATTEMPTS = 5;
    for (let vi = 1; vi <= VERIFY_ATTEMPTS; vi++) {
      const vr = await verifyClient.downloadAsBytes(storageKey);
      if (vr.ok) break;
      if (vi < VERIFY_ATTEMPTS) {
        const delay = 300 * vi;
        console.warn(
          `[DocumentService] post-upload verify attempt ${vi}/${VERIFY_ATTEMPTS} key="${storageKey}" — not yet readable, retry in ${delay}ms`
        );
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.warn(
          `[DocumentService] post-upload verify exhausted for key="${storageKey}". Proceeding — download will retry.`
        );
      }
    }
  }

  const [doc] = await db
    .insert(documents)
    .values({
      id: documentId,
      ownerType: input.ownerType,
      ownerId: input.ownerId || null,
      category: input.category,
      title: input.title,
      fileName: input.fileName,
      contentType: input.contentType,
      fileSizeBytes: input.fileSizeBytes || input.fileBuffer.length,
      storageProvider: provider,
      storageKey,
      status: "active",
      tags: input.tags || null,
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning();

  await logEvent(documentId, input.ownerType, input.ownerId || null, "uploaded", input.uploadedByUserId, {
    fileName: input.fileName,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes || input.fileBuffer.length,
  });

  return doc;
}

export async function createDocumentRecord(
  input: Omit<UploadDocumentInput, "fileBuffer"> & { storageKey: string; storageProvider: string }
): Promise<Document> {
  const existing = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.storageKey, input.storageKey),
        eq(documents.ownerType, input.ownerType),
        sql`${documents.ownerId} = ${input.ownerId || null} OR (${documents.ownerId} IS NULL AND ${input.ownerId || null} IS NULL)`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const documentId = randomUUID();
  const [doc] = await db
    .insert(documents)
    .values({
      id: documentId,
      ownerType: input.ownerType,
      ownerId: input.ownerId || null,
      category: input.category,
      title: input.title,
      fileName: input.fileName,
      contentType: input.contentType,
      fileSizeBytes: input.fileSizeBytes,
      storageProvider: input.storageProvider,
      storageKey: input.storageKey,
      status: "active",
      tags: input.tags || null,
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning();

  await logEvent(documentId, input.ownerType, input.ownerId || null, "uploaded", input.uploadedByUserId, {
    fileName: input.fileName,
    contentType: input.contentType,
  });

  return doc;
}

export async function getDocuments(
  ownerType: string,
  ownerId: string | null
): Promise<Document[]> {
  if (ownerId) {
    return db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.ownerType, ownerType),
          eq(documents.ownerId, ownerId),
          eq(documents.status, "active")
        )
      )
      .orderBy(desc(documents.uploadedAt));
  }
  return db
    .select()
    .from(documents)
    .where(
      and(eq(documents.ownerType, ownerType), eq(documents.status, "active"))
    )
    .orderBy(desc(documents.uploadedAt));
}

export async function getDocument(
  documentId: string
): Promise<Document | null> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId));
  return doc || null;
}

export async function downloadDocument(
  documentId: string,
  userId: string
): Promise<DownloadResult> {
  const doc = await getDocument(documentId);
  if (!doc || doc.status === "deleted") {
    throw Object.assign(new Error("Document not found"), {
      errorCode: "NOT_FOUND",
    });
  }

  let buffer: Buffer;

  if (doc.storageProvider === "s3" && isS3Configured()) {
    const s3 = getS3StorageService();
    buffer = await s3.downloadAsBytes(doc.storageKey);
  } else {
    const client = getReplitClient();
    // Build candidate keys: strip any /objects/ prefix (from legacy paths).
    // For tenanted keys (tenants/...) and properly-prefixed keys (documents/...):
    // → use the stored key as-is — it's authoritative.
    // For bare legacy keys (no directory separator, e.g. old random alphanumeric ids):
    // → also try a documents/{key} fallback in case the file was stored with that prefix.
    const stripped = doc.storageKey.replace(/^\/objects\//, "").replace(/^\/+/, "");
    const isBareKey = !stripped.includes("/");
    const withPrefix = isBareKey ? `documents/${stripped}` : null;
    const candidateKeys: string[] = [stripped, ...(withPrefix ? [withPrefix] : [])].filter(
      (k, i, arr) => k.length > 0 && arr.indexOf(k) === i
    );

    let downloaded = false;
    let lastError: any;
    // Primary key gets more retries to handle transient object-storage consistency
    // misses that can occur in the brief window right after an upload completes.
    const MAX_RETRIES_PRIMARY = 4;
    const MAX_RETRIES_FALLBACK = 2;

    for (let ki = 0; ki < candidateKeys.length; ki++) {
      const key = candidateKeys[ki];
      const maxAttempts = ki === 0 ? MAX_RETRIES_PRIMARY : MAX_RETRIES_FALLBACK;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await client.downloadAsBytes(key);
          if (result.ok) {
            buffer = Buffer.from(result.value);
            downloaded = true;
            break;
          }
          const errMsg = (result as any).error?.message || String((result as any).error || "");
          const errMsgLower = errMsg.toLowerCase();
          const isNotFound =
            errMsgLower.includes("not found") ||
            errMsg.includes("404") ||
            errMsgLower.includes("no such") ||
            errMsgLower.includes("does not exist") ||
            errMsgLower.includes("object not found");

          lastError = errMsg || `download failed for key: ${key}`;

          if (isNotFound && ki > 0) {
            // Fallback keys: not-found is definitive, no point retrying.
            break;
          }
          // Primary key or non-not-found errors: retry with backoff.
          // Longer delay for not-found to give object storage time to propagate.
          if (attempt < maxAttempts) {
            const delay = isNotFound ? 700 * attempt : 350 * attempt;
            console.warn(
              `[DocumentService] download attempt ${attempt}/${maxAttempts} key="${key}" (${isNotFound ? "not-found" : "error"}), retry in ${delay}ms`
            );
            await new Promise(r => setTimeout(r, delay));
          } else {
            console.warn(`[DocumentService] download exhausted retries for key "${key}": ${errMsg}`);
          }
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 350 * attempt));
          }
        }
      }
      if (downloaded) break;
    }

    if (!downloaded) {
      console.error(
        "[DocumentService] Download failed for all key candidates:",
        candidateKeys,
        "lastError:",
        lastError
      );
      throw Object.assign(new Error("File not found in storage"), {
        errorCode: "FILE_NOT_FOUND",
      });
    }
  }

  await logEvent(documentId, doc.ownerType, doc.ownerId, "downloaded", userId);

  return {
    buffer,
    contentType: doc.contentType,
    fileName: doc.fileName,
  };
}

export async function downloadDocumentByStorageKey(
  storageKey: string,
  userId: string
): Promise<DownloadResult | null> {
  const normalizedKey = storageKey.replace(/^\/objects\//, "").replace(/^\//, "");

  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.storageKey, normalizedKey),
        eq(documents.status, "active")
      )
    )
    .limit(1);

  if (!doc) {
    const withPrefix = `documents/${normalizedKey}`;
    const [docAlt] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.storageKey, withPrefix),
          eq(documents.status, "active")
        )
      )
      .limit(1);
    if (!docAlt) return null;
    return downloadDocument(docAlt.id, userId);
  }

  return downloadDocument(doc.id, userId);
}

export async function generateSignedUploadUrl(
  ownerType: string,
  ownerId: string | null,
  category: string,
  fileName: string,
  contentType: string
): Promise<{ documentId: string; storageKey: string; uploadUrl: string; expiresAt: string; useServerProxy?: boolean }> {
  const documentId = randomUUID();
  const storageKey = buildStorageKey(ownerType, ownerId, category, documentId, fileName);

  const provider = getStorageProvider();

  if (provider === "s3" && isS3Configured()) {
    const s3 = getS3StorageService();
    const url = await s3.getSignedUploadUrl(storageKey, contentType, 900);
    return {
      documentId,
      storageKey,
      uploadUrl: url,
      expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
    };
  }

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw Object.assign(new Error("Object storage not configured: DEFAULT_OBJECT_STORAGE_BUCKET_ID is missing"), {
      errorCode: "STORAGE_NOT_CONFIGURED",
    });
  }

  try {
    const { signObjectURL } = await import("../objectStorage");
    const signedUrl = await signObjectURL({
      bucketName: bucketId,
      objectName: storageKey,
      method: "PUT",
      ttlSec: 900,
    });

    return {
      documentId,
      storageKey,
      uploadUrl: signedUrl,
      expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
    };
  } catch (signerErr: any) {
    console.warn(`[DocumentService] Sidecar signing failed, falling back to server-proxy upload: ${signerErr.message}`);
    console.warn(`[DocumentService] Signer stack: ${signerErr.stack?.substring(0, 500)}`);
    return {
      documentId,
      storageKey,
      uploadUrl: `/api/documents/upload-proxy`,
      expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
      useServerProxy: true,
    };
  }
}

export async function generateSignedDownloadUrl(
  documentId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; useServerProxy?: boolean }> {
  const doc = await getDocument(documentId);
  if (!doc || doc.status === "deleted") {
    throw Object.assign(new Error("Document not found"), {
      errorCode: "NOT_FOUND",
    });
  }

  const provider = getStorageProvider();

  if (provider === "s3" && isS3Configured()) {
    const s3 = getS3StorageService();
    const url = await s3.getSignedDownloadUrl(doc.storageKey, 900);
    await logEvent(documentId, doc.ownerType, doc.ownerId, "viewed", userId);
    return {
      downloadUrl: url,
      expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
    };
  }

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw Object.assign(new Error("Object storage not configured: DEFAULT_OBJECT_STORAGE_BUCKET_ID is missing"), {
      errorCode: "STORAGE_NOT_CONFIGURED",
    });
  }

  try {
    const { signObjectURL } = await import("../objectStorage");
    const signedUrl = await signObjectURL({
      bucketName: bucketId,
      objectName: doc.storageKey,
      method: "GET",
      ttlSec: 900,
    });

    await logEvent(documentId, doc.ownerType, doc.ownerId, "viewed", userId);

    return {
      downloadUrl: signedUrl,
      expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
    };
  } catch (signerErr: any) {
    console.warn(`[DocumentService] Sidecar signing failed for download, falling back to server-proxy: ${signerErr.message}`);
    console.warn(`[DocumentService] Signer stack: ${signerErr.stack?.substring(0, 500)}`);
    await logEvent(documentId, doc.ownerType, doc.ownerId, "viewed", userId);
    return {
      downloadUrl: `/api/documents/${documentId}/download`,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      useServerProxy: true,
    };
  }
}

export function isPreviewable(contentType: string): boolean {
  return PREVIEWABLE_TYPES.includes(contentType);
}

export async function softDeleteDocument(
  documentId: string,
  userId: string,
  deletionReason?: string
): Promise<void> {
  const doc = await getDocument(documentId);
  if (!doc) {
    throw Object.assign(new Error("Document not found"), {
      errorCode: "NOT_FOUND",
    });
  }

  await db
    .update(documents)
    .set({
      status: "deleted",
      updatedAt: new Date(),
      deletedByUserId: userId,
      deletedAt: new Date(),
      deletionReason: deletionReason || null,
    })
    .where(eq(documents.id, documentId));

  await logEvent(documentId, doc.ownerType, doc.ownerId, "deleted", userId, {
    deletionReason: deletionReason || null,
  });
}

export async function updateDocumentMetadata(
  documentId: string,
  updates: Partial<Pick<Document, "title" | "category" | "tags" | "status">>,
  userId: string
): Promise<Document> {
  const doc = await getDocument(documentId);
  if (!doc) {
    throw Object.assign(new Error("Document not found"), {
      errorCode: "NOT_FOUND",
    });
  }

  const [updated] = await db
    .update(documents)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(documents.id, documentId))
    .returning();

  const changedFields: Record<string, { before: any; after: any }> = {};
  if (updates.title !== undefined && updates.title !== doc.title) changedFields.title = { before: doc.title, after: updates.title };
  if (updates.category !== undefined && updates.category !== doc.category) changedFields.category = { before: doc.category, after: updates.category };
  if (updates.status !== undefined && updates.status !== doc.status) changedFields.status = { before: doc.status, after: updates.status };
  if (updates.tags !== undefined) changedFields.tags = { before: doc.tags, after: updates.tags };

  await logEvent(documentId, doc.ownerType, doc.ownerId, "viewed", userId, {
    changes: changedFields,
    fieldNames: Object.keys(changedFields),
  });

  return updated;
}

export async function getDocumentEvents(
  documentId: string
): Promise<DocumentEvent[]> {
  return db
    .select()
    .from(documentEvents)
    .where(eq(documentEvents.documentId, documentId))
    .orderBy(desc(documentEvents.createdAt));
}

export async function getEventsByOwner(
  ownerType: string,
  ownerId: string
): Promise<DocumentEvent[]> {
  return db
    .select()
    .from(documentEvents)
    .where(
      and(
        eq(documentEvents.ownerType, ownerType),
        eq(documentEvents.ownerId, ownerId)
      )
    )
    .orderBy(desc(documentEvents.createdAt));
}

async function logEvent(
  documentId: string,
  ownerType: string,
  ownerId: string | null,
  eventType: string,
  userId: string,
  metadata?: any
): Promise<void> {
  try {
    await db.insert(documentEvents).values({
      documentId,
      ownerType,
      ownerId,
      eventType,
      performedByUserId: userId,
      metadata: metadata || null,
    });
  } catch (err) {
    console.error("[DocumentService] Failed to log event:", err);
  }
}

export function getStorageStatus(): {
  provider: string;
  configured: boolean;
  details: Record<string, boolean>;
} {
  const provider = getStorageProvider();
  if (provider === "s3") {
    return {
      provider: "s3",
      configured: isS3Configured(),
      details: {
        S3_BUCKET: !!process.env.S3_BUCKET,
        S3_REGION: !!process.env.S3_REGION,
        S3_ACCESS_KEY_ID: !!process.env.S3_ACCESS_KEY_ID,
        S3_SECRET_ACCESS_KEY: !!process.env.S3_SECRET_ACCESS_KEY,
      },
    };
  }
  return {
    provider: "replit",
    configured: !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
    details: {
      DEFAULT_OBJECT_STORAGE_BUCKET_ID: !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
    },
  };
}
