import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  candidateDocumentRequests,
  recruitingFileAccessLog,
  recruitingApplications,
  recruitingRequisitions,
  type InsertRecruitingFileAccessLog,
} from "@shared/schema";
import {
  getUserRecruitingContext,
  hasPermission,
  hasMarketAccess,
  type UserRecruitingContext,
} from "../recruitingPermissions";
import { ObjectStorageService, parseObjectPath, signObjectURL, getStorageProvider, getS3StorageService } from "../objectStorage";
import { randomUUID } from "crypto";

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "docx"]);

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

const SIGNED_URL_TTL_SECONDS = 900; // 15 minutes

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export interface UploadInitResult {
  uploadId: string;
  signedUploadUrl: string;
  storagePath: string;
  expiresInSeconds: number;
  useServerUpload?: boolean;
}

export interface SignedDownloadResult {
  signedUrl: string;
  fileName: string;
  mimeType: string;
  expiresInSeconds: number;
}

export function validateFileType(mimeType: string, fileName: string): FileValidationResult {
  const normalizedMime = mimeType.toLowerCase().trim();

  if (!ALLOWED_MIME_TYPES[normalizedMime]) {
    return {
      valid: false,
      error: `File type "${normalizedMime}" is not allowed. Accepted types: PDF, JPG, PNG, DOCX`,
    };
  }

  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File extension ".${ext || "unknown"}" is not allowed. Accepted extensions: .pdf, .jpg, .jpeg, .png, .docx`,
    };
  }

  const expectedExt = ALLOWED_MIME_TYPES[normalizedMime];
  if (ext !== expectedExt && !(normalizedMime === "image/jpeg" && ext === "jpeg")) {
    return {
      valid: false,
      error: `File extension ".${ext}" does not match content type "${normalizedMime}"`,
    };
  }

  return { valid: true };
}

export function validateFileSize(sizeBytes: number): FileValidationResult {
  if (sizeBytes <= 0) {
    return { valid: false, error: "File size must be greater than 0 bytes" };
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    const maxMB = MAX_FILE_SIZE_BYTES / (1024 * 1024);
    const fileMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size ${fileMB}MB exceeds maximum allowed size of ${maxMB}MB`,
    };
  }

  return { valid: true };
}

export interface AntivirusScanResult {
  status: "clean" | "infected" | "pending" | "error";
  details?: string;
}

export async function antivirusScanHook(
  _storagePath: string,
  _fileName: string,
  _mimeType: string
): Promise<AntivirusScanResult> {
  return {
    status: "clean",
    details: "Antivirus scan stub: no scanner configured. File accepted by default.",
  };
}

export async function logFileAccess(
  entry: InsertRecruitingFileAccessLog
): Promise<void> {
  try {
    await db.insert(recruitingFileAccessLog).values(entry);
  } catch (err) {
    console.error("[FileAccessAudit] Failed to log access event:", err);
  }
}

async function getDocumentMarket(
  applicationId: string
): Promise<string | null> {
  const [result] = await db
    .select({ market: recruitingRequisitions.market })
    .from(recruitingApplications)
    .innerJoin(
      recruitingRequisitions,
      eq(recruitingApplications.requisitionId, recruitingRequisitions.id)
    )
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);

  return result?.market ?? null;
}

export async function checkDocumentRbacAccess(
  userId: string,
  userRole: string,
  documentRequestId: string,
  ip?: string,
  userAgent?: string
): Promise<{
  allowed: boolean;
  reason?: string;
  context?: UserRecruitingContext;
  market?: string | null;
  docRequest?: any;
}> {
  const [docRequest] = await db
    .select()
    .from(candidateDocumentRequests)
    .where(eq(candidateDocumentRequests.id, documentRequestId))
    .limit(1);

  if (!docRequest) {
    return { allowed: false, reason: "Document request not found" };
  }

  const context = await getUserRecruitingContext(userId, userRole);

  if (!hasPermission(context, "read")) {
    await logFileAccess({
      documentRequestId,
      applicationId: docRequest.applicationId,
      action: "signed_url_generated",
      userId,
      userRole,
      accessGranted: false,
      denialReason: "Insufficient permissions",
      ip: ip || null,
      userAgent: userAgent || null,
    });
    return { allowed: false, reason: "Insufficient permissions" };
  }

  const market = await getDocumentMarket(docRequest.applicationId);

  if (market && !hasMarketAccess(context, market)) {
    await logFileAccess({
      documentRequestId,
      applicationId: docRequest.applicationId,
      market,
      action: "signed_url_generated",
      userId,
      userRole,
      accessGranted: false,
      denialReason: `No access to market: ${market}`,
      ip: ip || null,
      userAgent: userAgent || null,
    });
    return { allowed: false, reason: `No access to market: ${market}` };
  }

  return { allowed: true, context, market, docRequest };
}

export function buildStoragePath(
  applicationId: string,
  docRequestId: string,
  fileName: string
): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "bin";
  const uniqueId = randomUUID().slice(0, 8);
  return `recruiting/documents/${applicationId}/${docRequestId}/${uniqueId}.${ext}`;
}

export async function initiateUpload(params: {
  docRequestId: string;
  applicationId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  userId?: string;
  userRole?: string;
  isPortalAccess: boolean;
  portalTokenId?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ success: true; result: UploadInitResult } | { success: false; error: string }> {
  const typeValidation = validateFileType(params.mimeType, params.fileName);
  if (!typeValidation.valid) {
    await logFileAccess({
      documentRequestId: params.docRequestId,
      applicationId: params.applicationId,
      action: "upload_init",
      userId: params.userId || null,
      userRole: params.userRole || null,
      isPortalAccess: params.isPortalAccess,
      portalTokenId: params.portalTokenId || null,
      fileName: params.fileName,
      fileMimeType: params.mimeType,
      fileSizeBytes: params.fileSizeBytes,
      accessGranted: false,
      denialReason: typeValidation.error!,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
    });
    return { success: false, error: typeValidation.error! };
  }

  const sizeValidation = validateFileSize(params.fileSizeBytes);
  if (!sizeValidation.valid) {
    await logFileAccess({
      documentRequestId: params.docRequestId,
      applicationId: params.applicationId,
      action: "upload_init",
      userId: params.userId || null,
      userRole: params.userRole || null,
      isPortalAccess: params.isPortalAccess,
      portalTokenId: params.portalTokenId || null,
      fileName: params.fileName,
      fileMimeType: params.mimeType,
      fileSizeBytes: params.fileSizeBytes,
      accessGranted: false,
      denialReason: sizeValidation.error!,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
    });
    return { success: false, error: sizeValidation.error! };
  }

  const storagePath = buildStoragePath(
    params.applicationId,
    params.docRequestId,
    params.fileName
  );

  const objectStorage = new ObjectStorageService();
  let signedUploadUrl: string;
  let useServerUpload = false;
  try {
    const privateDir = objectStorage.getPrivateObjectDir();
    if (!privateDir) {
      console.log("[FileStorage] PRIVATE_OBJECT_DIR not set, trying unified document service signing");
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (bucketId) {
        signedUploadUrl = await signObjectURL({
          bucketName: bucketId,
          objectName: storagePath,
          method: "PUT",
          ttlSec: SIGNED_URL_TTL_SECONDS,
        });
      } else {
        console.error("[FileStorage] No storage bucket configured, falling back to server upload");
        useServerUpload = true;
      }
    } else {
      const fullPath = `${privateDir}/${storagePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);

      console.log(`[FileStorage] Generating signed upload URL: bucket=${bucketName}, object=${objectName}`);

      signedUploadUrl = await signObjectURL({
        bucketName,
        objectName,
        method: "PUT",
        ttlSec: SIGNED_URL_TTL_SECONDS,
      });
    }
  } catch (err: any) {
    console.warn("[FileStorage] Signed URL generation failed, falling back to server upload:", err.message);
    useServerUpload = true;
  }

  const uploadId = randomUUID();

  await logFileAccess({
    documentRequestId: params.docRequestId,
    applicationId: params.applicationId,
    action: "upload_init",
    userId: params.userId || null,
    userRole: params.userRole || null,
    isPortalAccess: params.isPortalAccess,
    portalTokenId: params.portalTokenId || null,
    fileName: params.fileName,
    fileMimeType: params.mimeType,
    fileSizeBytes: params.fileSizeBytes,
    storagePath,
    accessGranted: true,
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });

  return {
    success: true,
    result: {
      uploadId,
      signedUploadUrl: useServerUpload ? "" : signedUploadUrl!,
      storagePath,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      useServerUpload,
    },
  };
}

export async function finalizeUpload(params: {
  docRequestId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  userId?: string;
  userRole?: string;
  isPortalAccess: boolean;
  portalTokenId?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const typeValidation = validateFileType(params.mimeType, params.fileName);
  if (!typeValidation.valid) {
    return { success: false, error: typeValidation.error! };
  }

  const sizeValidation = validateFileSize(params.fileSizeBytes);
  if (!sizeValidation.valid) {
    return { success: false, error: sizeValidation.error! };
  }

  const scanResult = await antivirusScanHook(
    params.storagePath,
    params.fileName,
    params.mimeType
  );

  const scanStatus = scanResult.status === "clean" ? "clean" : scanResult.status;

  const [docRequest] = await db
    .select()
    .from(candidateDocumentRequests)
    .where(eq(candidateDocumentRequests.id, params.docRequestId))
    .limit(1);

  if (!docRequest) {
    return { success: false, error: "Document request not found" };
  }

  if (docRequest.status === "approved") {
    return { success: false, error: "Document has already been approved" };
  }

  const objectStorage = new ObjectStorageService();
  let bucketName: string;
  try {
    const privateDir = objectStorage.getPrivateObjectDir();
    ({ bucketName } = parseObjectPath(`${privateDir}/placeholder`));
  } catch (err: any) {
    console.error("[FileStorage] Error resolving storage bucket for finalize:", err.message);
    return { success: false, error: "Storage not configured" };
  }

  await db
    .update(candidateDocumentRequests)
    .set({
      status: "uploaded",
      uploadedFileName: params.fileName,
      uploadedFileSize: String(params.fileSizeBytes),
      uploadedFileMimeType: params.mimeType,
      storagePath: params.storagePath,
      storageBucket: bucketName,
      antivirusScanStatus: scanStatus,
      antivirusScanAt: new Date(),
      uploadedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(candidateDocumentRequests.id, params.docRequestId));

  const market = await getDocumentMarket(docRequest.applicationId);

  await logFileAccess({
    documentRequestId: params.docRequestId,
    applicationId: docRequest.applicationId,
    candidateId: null,
    market,
    action: "upload_complete",
    userId: params.userId || null,
    userRole: params.userRole || null,
    isPortalAccess: params.isPortalAccess,
    portalTokenId: params.portalTokenId || null,
    fileName: params.fileName,
    fileMimeType: params.mimeType,
    fileSizeBytes: params.fileSizeBytes,
    storagePath: params.storagePath,
    accessGranted: true,
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });

  return { success: true };
}

export async function generateSignedDownloadUrl(params: {
  docRequestId: string;
  userId?: string;
  userRole?: string;
  isPortalAccess: boolean;
  portalTokenId?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ success: true; result: SignedDownloadResult } | { success: false; error: string; statusCode?: number }> {
  const [docRequest] = await db
    .select()
    .from(candidateDocumentRequests)
    .where(eq(candidateDocumentRequests.id, params.docRequestId))
    .limit(1);

  if (!docRequest) {
    return { success: false, error: "Document not found", statusCode: 404 };
  }

  if (!docRequest.storagePath) {
    return { success: false, error: "Document has no stored file (legacy base64 storage)", statusCode: 404 };
  }

  if (!params.isPortalAccess && params.userId && params.userRole) {
    const rbacCheck = await checkDocumentRbacAccess(
      params.userId,
      params.userRole,
      params.docRequestId,
      params.ip,
      params.userAgent
    );
    if (!rbacCheck.allowed) {
      return { success: false, error: rbacCheck.reason || "Access denied", statusCode: 403 };
    }
  }

  const objectStorage = new ObjectStorageService();
  let signedUrl: string;
  try {
    let privateDir = objectStorage.getPrivateObjectDir();
    if (!privateDir) {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (bucketId) {
        privateDir = `${bucketId}/.private`;
        console.warn("[FileStorage] PRIVATE_OBJECT_DIR not set, falling back to DEFAULT_OBJECT_STORAGE_BUCKET_ID/.private");
      } else {
        console.error("[FileStorage] PRIVATE_OBJECT_DIR and DEFAULT_OBJECT_STORAGE_BUCKET_ID both missing");
        return { success: false, error: "Uploads are not available in this environment yet. Please contact Admin." };
      }
    }
    const fullPath = `${privateDir}/${docRequest.storagePath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    console.log(`[FileStorage] Generating signed download URL: bucket=${bucketName}, object=${objectName}`);

    signedUrl = await signObjectURL({
      bucketName,
      objectName,
      method: "GET",
      ttlSec: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err: any) {
    console.error("[FileStorage] Error generating signed download URL:", err.message, err.stack);
    return { success: false, error: "File download is temporarily unavailable. Please try again or contact Admin." };
  }

  const market = await getDocumentMarket(docRequest.applicationId);

  await logFileAccess({
    documentRequestId: params.docRequestId,
    applicationId: docRequest.applicationId,
    market,
    action: params.isPortalAccess ? "view" : "download",
    userId: params.userId || null,
    userRole: params.userRole || null,
    isPortalAccess: params.isPortalAccess,
    portalTokenId: params.portalTokenId || null,
    fileName: docRequest.uploadedFileName,
    fileMimeType: docRequest.uploadedFileMimeType,
    storagePath: docRequest.storagePath,
    accessGranted: true,
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });

  return {
    success: true,
    result: {
      signedUrl,
      fileName: docRequest.uploadedFileName || "document",
      mimeType: docRequest.uploadedFileMimeType || "application/octet-stream",
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    },
  };
}

export async function getFileAccessLog(filters: {
  documentRequestId?: string;
  applicationId?: string;
  userId?: string;
  market?: string;
  action?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  let query = db.select().from(recruitingFileAccessLog);

  const conditions = [];
  if (filters.documentRequestId) {
    conditions.push(eq(recruitingFileAccessLog.documentRequestId, filters.documentRequestId));
  }
  if (filters.applicationId) {
    conditions.push(eq(recruitingFileAccessLog.applicationId, filters.applicationId));
  }
  if (filters.userId) {
    conditions.push(eq(recruitingFileAccessLog.userId, filters.userId));
  }
  if (filters.market) {
    conditions.push(eq(recruitingFileAccessLog.market, filters.market));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await (query as any)
    .orderBy(desc(recruitingFileAccessLog.createdAt))
    .limit(filters.limit || 50)
    .offset(filters.offset || 0);
}

export const FILE_CONSTRAINTS = {
  allowedMimeTypes: Object.keys(ALLOWED_MIME_TYPES),
  allowedExtensions: Array.from(ALLOWED_EXTENSIONS),
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  maxFileSizeMB: MAX_FILE_SIZE_BYTES / (1024 * 1024),
  signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS,
};
