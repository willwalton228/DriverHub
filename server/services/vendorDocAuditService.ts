import { db } from "../db";
import { vendorDocumentAuditLog } from "@shared/schema";

export type VendorDocAuditAction =
  | "upload" | "download" | "view" | "replace"
  | "delete" | "archive" | "restore" | "metadata_update";

export interface LogDocumentAuditParams {
  vendorId: string;
  documentId?: string | null;
  documentName: string;
  documentType?: string | null;
  action: VendorDocAuditAction;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Write a single vendor document audit event.
 * Fire-and-forget safe — all errors are swallowed with a console.warn so
 * audit logging never disrupts the primary request path.
 */
export async function logDocumentAudit(params: LogDocumentAuditParams): Promise<void> {
  try {
    await db.insert(vendorDocumentAuditLog).values({
      vendorId: params.vendorId,
      documentId: params.documentId ?? null,
      documentName: params.documentName,
      documentType: params.documentType ?? null,
      action: params.action,
      userId: params.userId,
      userEmail: params.userEmail ?? null,
      userName: params.userName ?? null,
      userRole: params.userRole ?? null,
      ipAddress: params.ipAddress ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (err: any) {
    console.warn("[DocAudit] Failed to write audit event:", err?.message);
  }
}
