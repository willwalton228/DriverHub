import { db } from "../db";
import {
  recruitingCandidates,
  recruitingApplications,
  recruitingRequisitions,
  recruitingAuditEvents,
  recruitingDocuments,
  recruitingExportLogs,
  users,
  type RecruitingExportType,
  type RecruitingExportFormat,
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql, inArray, like, or } from "drizzle-orm";
import { getApplicationTimeline, getCandidateTimeline, type TimelineEntry } from "../recruitingService";
import PDFDocument from "pdfkit";

interface ExportFilters {
  status?: string;
  stage?: string;
  requisitionId?: string;
  market?: string;
  dateFrom?: string;
  dateTo?: string;
  actionType?: string;
  entityType?: string;
  search?: string;
}

interface ExportResult {
  csv: string;
  recordCount: number;
  watermark: string;
  fileSizeBytes: number;
}

export function generateWatermark(userEmail: string): string {
  const timestamp = new Date().toISOString();
  return `Exported by: ${userEmail} | Date: ${timestamp} | DriverHub 360 - CONFIDENTIAL`;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const dataLines = rows.map(row => row.map(escapeCsvValue).join(","));
  return [headerLine, ...dataLines].join("\n");
}

export async function exportCandidates(
  filters: ExportFilters,
  userEmail: string
): Promise<ExportResult> {
  const watermark = generateWatermark(userEmail);
  
  let query = db.select({
    id: recruitingCandidates.id,
    firstName: recruitingCandidates.firstName,
    lastName: recruitingCandidates.lastName,
    email: recruitingCandidates.email,
    phone: recruitingCandidates.phone,
    city: recruitingCandidates.city,
    state: recruitingCandidates.state,
    source: recruitingCandidates.source,
    status: recruitingCandidates.status,
    yearsExperience: recruitingCandidates.yearsExperience,
    hasCommercialLicense: recruitingCandidates.hasCommercialLicense,
    createdAt: recruitingCandidates.createdAt,
    updatedAt: recruitingCandidates.updatedAt,
  }).from(recruitingCandidates);

  const conditions: any[] = [];

  if (filters.status) {
    conditions.push(eq(recruitingCandidates.status, filters.status as any));
  }

  if (filters.dateFrom) {
    conditions.push(gte(recruitingCandidates.createdAt, new Date(filters.dateFrom)));
  }

  if (filters.dateTo) {
    conditions.push(lte(recruitingCandidates.createdAt, new Date(filters.dateTo)));
  }

  if (filters.search) {
    const searchPattern = `%${filters.search}%`;
    conditions.push(
      or(
        like(recruitingCandidates.firstName, searchPattern),
        like(recruitingCandidates.lastName, searchPattern),
        like(recruitingCandidates.email, searchPattern)
      )
    );
  }

  const results = conditions.length > 0 
    ? await query.where(and(...conditions)).orderBy(desc(recruitingCandidates.createdAt))
    : await query.orderBy(desc(recruitingCandidates.createdAt));

  const headers = [
    "ID", "First Name", "Last Name", "Email", "Phone", "City", "State",
    "Source", "Status", "Years Experience", "Has Commercial License",
    "Created At", "Updated At"
  ];

  const rows = results.map(r => [
    r.id,
    r.firstName,
    r.lastName,
    r.email,
    r.phone,
    r.city,
    r.state,
    r.source,
    r.status,
    r.yearsExperience,
    r.hasCommercialLicense ? "Yes" : "No",
    r.createdAt?.toISOString(),
    r.updatedAt?.toISOString(),
  ]);

  const csvContent = `# ${watermark}\n${arrayToCsv(headers, rows)}`;

  return {
    csv: csvContent,
    recordCount: results.length,
    watermark,
    fileSizeBytes: Buffer.byteLength(csvContent, "utf8"),
  };
}

export async function exportApplicationPipeline(
  filters: ExportFilters,
  userEmail: string
): Promise<ExportResult> {
  const watermark = generateWatermark(userEmail);

  const results = await db.select({
    applicationId: recruitingApplications.id,
    candidateFirstName: recruitingCandidates.firstName,
    candidateLastName: recruitingCandidates.lastName,
    candidateEmail: recruitingCandidates.email,
    requisitionTitle: recruitingRequisitions.title,
    requisitionMarket: recruitingRequisitions.market,
    currentStage: recruitingApplications.currentStage,
    currentStageEnteredAt: recruitingApplications.currentStageEnteredAt,
    readinessStatus: recruitingApplications.readinessStatus,
    readinessScore: recruitingApplications.readinessScore,
    disposition: recruitingApplications.disposition,
    dispositionReason: recruitingApplications.dispositionReason,
    disposedAt: recruitingApplications.disposedAt,
    archivedAt: recruitingApplications.archivedAt,
    createdAt: recruitingApplications.createdAt,
    updatedAt: recruitingApplications.updatedAt,
  })
    .from(recruitingApplications)
    .leftJoin(recruitingCandidates, eq(recruitingApplications.candidateId, recruitingCandidates.id))
    .leftJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .where(
      and(
        filters.stage ? eq(recruitingApplications.currentStage, filters.stage) : undefined,
        filters.requisitionId ? eq(recruitingApplications.requisitionId, filters.requisitionId) : undefined,
        filters.market ? eq(recruitingRequisitions.market, filters.market) : undefined,
        filters.dateFrom ? gte(recruitingApplications.createdAt, new Date(filters.dateFrom)) : undefined,
        filters.dateTo ? lte(recruitingApplications.createdAt, new Date(filters.dateTo)) : undefined
      )
    )
    .orderBy(desc(recruitingApplications.createdAt));

  const headers = [
    "Application ID", "Candidate First Name", "Candidate Last Name", "Candidate Email",
    "Requisition Title", "Market", "Current Stage", "Stage Entered At",
    "Readiness Status", "Readiness Score", "Disposition", "Disposition Reason",
    "Disposed At", "Archived", "Created At", "Updated At"
  ];

  const rows = results.map(r => [
    r.applicationId,
    r.candidateFirstName,
    r.candidateLastName,
    r.candidateEmail,
    r.requisitionTitle,
    r.requisitionMarket,
    r.currentStage,
    r.currentStageEnteredAt?.toISOString(),
    r.readinessStatus,
    r.readinessScore,
    r.disposition,
    r.dispositionReason,
    r.disposedAt?.toISOString(),
    r.archivedAt ? "Yes" : "No",
    r.createdAt?.toISOString(),
    r.updatedAt?.toISOString(),
  ]);

  const csvContent = `# ${watermark}\n${arrayToCsv(headers, rows)}`;

  return {
    csv: csvContent,
    recordCount: results.length,
    watermark,
    fileSizeBytes: Buffer.byteLength(csvContent, "utf8"),
  };
}

function computeFieldDiffs(previousValue: string | null, newValue: string | null, changedFields: string[] | null): Array<{ field: string; before: any; after: any }> {
  const diffs: Array<{ field: string; before: any; after: any }> = [];
  try {
    const prev = previousValue ? JSON.parse(previousValue) : {};
    const next = newValue ? JSON.parse(newValue) : {};
    const fields = changedFields && changedFields.length > 0
      ? changedFields
      : Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));
    for (const field of fields) {
      const before = prev[field];
      const after = next[field];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({ field, before: before ?? null, after: after ?? null });
      }
    }
  } catch {
    if (previousValue || newValue) {
      diffs.push({ field: '_raw', before: previousValue, after: newValue });
    }
  }
  return diffs;
}

function buildAuditConditions(filters: ExportFilters) {
  const conditions: any[] = [];
  if (filters.actionType) {
    conditions.push(eq(recruitingAuditEvents.actionType, filters.actionType));
  }
  if (filters.entityType) {
    conditions.push(eq(recruitingAuditEvents.entityType, filters.entityType));
  }
  if (filters.dateFrom) {
    conditions.push(gte(recruitingAuditEvents.occurredAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    conditions.push(lte(recruitingAuditEvents.occurredAt, new Date(filters.dateTo)));
  }
  return conditions;
}

export async function exportAuditLog(
  filters: ExportFilters,
  userEmail: string
): Promise<ExportResult> {
  const watermark = generateWatermark(userEmail);
  const conditions = buildAuditConditions(filters);

  const results = await db.select({
    id: recruitingAuditEvents.id,
    actionType: recruitingAuditEvents.actionType,
    entityType: recruitingAuditEvents.entityType,
    entityId: recruitingAuditEvents.entityId,
    userEmail: recruitingAuditEvents.userEmail,
    actorRole: recruitingAuditEvents.actorRole,
    source: recruitingAuditEvents.source,
    previousValue: recruitingAuditEvents.previousValue,
    newValue: recruitingAuditEvents.newValue,
    changedFields: recruitingAuditEvents.changedFields,
    reason: recruitingAuditEvents.reason,
    metadata: recruitingAuditEvents.metadata,
    occurredAt: recruitingAuditEvents.occurredAt,
  })
    .from(recruitingAuditEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(recruitingAuditEvents.occurredAt))
    .limit(10000);

  const headers = [
    "ID", "Action Type", "Entity Type", "Entity ID", "User Email",
    "Actor Role", "Source", "Changed Fields", "Diffs (Before → After)",
    "Reason", "Metadata", "Occurred At"
  ];

  const rows = results.map(r => {
    const diffs = computeFieldDiffs(r.previousValue, r.newValue, r.changedFields);
    const diffStr = diffs.map(d => `${d.field}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`).join("; ");
    return [
      r.id,
      r.actionType,
      r.entityType,
      r.entityId,
      r.userEmail,
      r.actorRole || "",
      r.source || "",
      r.changedFields?.join("; ") || "",
      diffStr,
      r.reason,
      r.metadata ? JSON.stringify(r.metadata) : "",
      r.occurredAt?.toISOString(),
    ];
  });

  const csvContent = `# ${watermark}\n${arrayToCsv(headers, rows)}`;

  return {
    csv: csvContent,
    recordCount: results.length,
    watermark,
    fileSizeBytes: Buffer.byteLength(csvContent, "utf8"),
  };
}

export async function exportAuditLogJson(
  filters: ExportFilters,
  userEmail: string
): Promise<{ json: string; recordCount: number; watermark: string; fileSizeBytes: number }> {
  const watermark = generateWatermark(userEmail);
  const conditions = buildAuditConditions(filters);

  const results = await db.select({
    id: recruitingAuditEvents.id,
    actionType: recruitingAuditEvents.actionType,
    entityType: recruitingAuditEvents.entityType,
    entityId: recruitingAuditEvents.entityId,
    userEmail: recruitingAuditEvents.userEmail,
    actorRole: recruitingAuditEvents.actorRole,
    source: recruitingAuditEvents.source,
    previousValue: recruitingAuditEvents.previousValue,
    newValue: recruitingAuditEvents.newValue,
    changedFields: recruitingAuditEvents.changedFields,
    reason: recruitingAuditEvents.reason,
    metadata: recruitingAuditEvents.metadata,
    occurredAt: recruitingAuditEvents.occurredAt,
  })
    .from(recruitingAuditEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(recruitingAuditEvents.occurredAt))
    .limit(10000);

  const enriched = results.map(r => ({
    id: r.id,
    actionType: r.actionType,
    entityType: r.entityType,
    entityId: r.entityId,
    actor: {
      email: r.userEmail,
      role: r.actorRole || null,
    },
    source: r.source || null,
    diffs: computeFieldDiffs(r.previousValue, r.newValue, r.changedFields),
    changedFields: r.changedFields || [],
    reason: r.reason || null,
    metadata: r.metadata || null,
    occurredAt: r.occurredAt?.toISOString(),
  }));

  const jsonContent = JSON.stringify({
    watermark,
    exportedAt: new Date().toISOString(),
    recordCount: enriched.length,
    events: enriched,
  }, null, 2);

  return {
    json: jsonContent,
    recordCount: enriched.length,
    watermark,
    fileSizeBytes: Buffer.byteLength(jsonContent, "utf8"),
  };
}

export async function exportDocumentMetadata(
  filters: ExportFilters,
  userEmail: string
): Promise<ExportResult> {
  const watermark = generateWatermark(userEmail);

  const conditions: any[] = [];

  if (filters.dateFrom) {
    conditions.push(gte(recruitingDocuments.createdAt, new Date(filters.dateFrom)));
  }

  if (filters.dateTo) {
    conditions.push(lte(recruitingDocuments.createdAt, new Date(filters.dateTo)));
  }

  const results = await db.select({
    id: recruitingDocuments.id,
    applicationId: recruitingDocuments.applicationId,
    type: recruitingDocuments.type,
    name: recruitingDocuments.name,
    status: recruitingDocuments.status,
    esignProvider: recruitingDocuments.esignProvider,
    esignStatus: recruitingDocuments.esignStatus,
    esignSentAt: recruitingDocuments.esignSentAt,
    esignSignedAt: recruitingDocuments.esignSignedAt,
    createdAt: recruitingDocuments.createdAt,
    updatedAt: recruitingDocuments.updatedAt,
  })
    .from(recruitingDocuments)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(recruitingDocuments.createdAt));

  const headers = [
    "Document ID", "Application ID", "Type", "Name", "Status",
    "E-Sign Provider", "E-Sign Status", "E-Sign Sent At", "E-Sign Signed At",
    "Created At", "Updated At"
  ];

  const rows = results.map(r => [
    r.id,
    r.applicationId,
    r.type,
    r.name,
    r.status,
    r.esignProvider,
    r.esignStatus,
    r.esignSentAt?.toISOString(),
    r.esignSignedAt?.toISOString(),
    r.createdAt?.toISOString(),
    r.updatedAt?.toISOString(),
  ]);

  const csvContent = `# ${watermark}\n${arrayToCsv(headers, rows)}`;

  return {
    csv: csvContent,
    recordCount: results.length,
    watermark,
    fileSizeBytes: Buffer.byteLength(csvContent, "utf8"),
  };
}

export async function logExport(params: {
  exportType: RecruitingExportType;
  exportFormat: RecruitingExportFormat;
  exportedBy: string;
  exportedByEmail: string;
  filters: ExportFilters;
  recordCount: number;
  watermark: string;
  fileSizeBytes: number;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}): Promise<void> {
  await db.insert(recruitingExportLogs).values({
    exportType: params.exportType,
    exportFormat: params.exportFormat,
    exportedBy: params.exportedBy,
    exportedByEmail: params.exportedByEmail,
    filters: params.filters as any,
    recordCount: params.recordCount,
    watermark: params.watermark,
    fileSizeBytes: params.fileSizeBytes,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    reason: params.reason,
  });

  await db.insert(recruitingAuditEvents).values({
    actionType: "DATA_EXPORTED",
    entityType: params.exportType,
    entityId: "export",
    userId: params.exportedBy,
    userEmail: params.exportedByEmail,
    newValue: JSON.stringify({
      exportType: params.exportType,
      exportFormat: params.exportFormat,
      filters: params.filters,
      recordCount: params.recordCount,
    }),
    reason: params.reason || "Data export requested",
    metadata: {
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}

export async function getExportLogs(limit: number = 100) {
  return db.select()
    .from(recruitingExportLogs)
    .orderBy(desc(recruitingExportLogs.exportedAt))
    .limit(limit);
}

interface TimelineExportResult {
  data: Buffer;
  contentType: string;
  filename: string;
  recordCount: number;
  watermark: string;
  fileSizeBytes: number;
}

function formatTimelineDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function formatEventType(type: string): string {
  const labels: Record<string, string> = {
    stage_change: "Stage Change",
    communication: "Communication",
    document: "Document",
    interview: "Interview",
    audit: "Audit Event",
    compliance: "Compliance",
    consent: "Consent",
  };
  return labels[type] || type;
}

async function getApplicationContext(applicationId: string) {
  const result = await db
    .select({
      applicationId: recruitingApplications.id,
      candidateFirstName: recruitingCandidates.firstName,
      candidateLastName: recruitingCandidates.lastName,
      candidateEmail: recruitingCandidates.email,
      requisitionTitle: recruitingRequisitions.title,
      requisitionMarket: recruitingRequisitions.market,
      currentStage: recruitingApplications.currentStage,
      createdAt: recruitingApplications.createdAt,
    })
    .from(recruitingApplications)
    .leftJoin(recruitingCandidates, eq(recruitingApplications.candidateId, recruitingCandidates.id))
    .leftJoin(recruitingRequisitions, eq(recruitingApplications.requisitionId, recruitingRequisitions.id))
    .where(eq(recruitingApplications.id, applicationId))
    .limit(1);

  return result[0] || null;
}

export async function exportTimelineCsv(
  applicationId: string,
  userEmail: string
): Promise<TimelineExportResult> {
  const watermark = generateWatermark(userEmail);
  const context = await getApplicationContext(applicationId);
  const { events } = await getApplicationTimeline(applicationId, { limit: 10000 });

  const chronological = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const headers = [
    "Seq", "Timestamp", "Event Type", "Title", "Description", "Actor", "Details"
  ];

  const rows = chronological.map((e, i) => [
    i + 1,
    formatTimelineDate(e.timestamp),
    formatEventType(e.type),
    e.title,
    e.description || "",
    e.actorName || "",
    e.metadata ? JSON.stringify(e.metadata) : "",
  ]);

  const contextHeader = [
    `# ${watermark}`,
    `# Candidate: ${context?.candidateFirstName || ""} ${context?.candidateLastName || ""}`,
    `# Email: ${context?.candidateEmail || ""}`,
    `# Requisition: ${context?.requisitionTitle || "N/A"} (${context?.requisitionMarket || ""})`,
    `# Application ID: ${applicationId}`,
    `# Current Stage: ${context?.currentStage || ""}`,
    `# Total Events: ${chronological.length}`,
    "",
  ].join("\n");

  const csvContent = contextHeader + arrayToCsv(headers, rows);
  const buffer = Buffer.from(csvContent, "utf-8");

  const candidateName = context
    ? `${context.candidateFirstName || ""}_${context.candidateLastName || ""}`.replace(/\s+/g, "_")
    : "unknown";

  return {
    data: buffer,
    contentType: "text/csv",
    filename: `timeline_${candidateName}_${new Date().toISOString().split("T")[0]}.csv`,
    recordCount: chronological.length,
    watermark,
    fileSizeBytes: buffer.length,
  };
}

export async function exportTimelinePdf(
  applicationId: string,
  userEmail: string
): Promise<TimelineExportResult> {
  const watermark = generateWatermark(userEmail);
  const context = await getApplicationContext(applicationId);
  const { events } = await getApplicationTimeline(applicationId, { limit: 10000 });

  const chronological = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const candidateName = context
    ? `${context.candidateFirstName || ""} ${context.candidateLastName || ""}`.trim()
    : "Unknown Candidate";

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 50, bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const shortName = candidateName.replace(/\s+/g, "_");
        resolve({
          data: buffer,
          contentType: "application/pdf",
          filename: `timeline_${shortName}_${new Date().toISOString().split("T")[0]}.pdf`,
          recordCount: chronological.length,
          watermark,
          fileSizeBytes: buffer.length,
        });
      });
      doc.on("error", reject);

      doc.fontSize(18).text("Candidate Timeline Report", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor("#999999").text(watermark, { align: "center" });
      doc.moveDown(1);

      doc.fillColor("#000000").fontSize(10);
      doc.text(`Candidate: ${candidateName}`, { continued: false });
      doc.text(`Email: ${context?.candidateEmail || "N/A"}`);
      doc.text(`Requisition: ${context?.requisitionTitle || "N/A"} (${context?.requisitionMarket || ""})`);
      doc.text(`Application ID: ${applicationId}`);
      doc.text(`Current Stage: ${context?.currentStage || "N/A"}`);
      doc.text(`Total Events: ${chronological.length}`);
      doc.text(`Export Date: ${new Date().toISOString().split("T")[0]}`);
      doc.moveDown(1);

      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke("#cccccc");
      doc.moveDown(0.5);

      for (let i = 0; i < chronological.length; i++) {
        const event = chronological[i];

        if (doc.y > 680) {
          doc.addPage();
          doc.fontSize(8).fillColor("#999999").text(watermark, 50, 30, { align: "center" });
          doc.moveDown(0.5);
          doc.fillColor("#000000");
        }

        doc.fontSize(9).fillColor("#666666").text(
          `${i + 1}. ${formatTimelineDate(event.timestamp)}`,
          50
        );

        const typeColor = getTypeColor(event.type);
        doc.fontSize(9).fillColor(typeColor).text(
          `[${formatEventType(event.type)}]`,
          50,
          doc.y,
          { continued: true }
        );
        doc.fillColor("#000000").text(` ${event.title}`);

        if (event.description) {
          doc.fontSize(8).fillColor("#555555").text(
            event.description.substring(0, 300),
            70
          );
        }

        if (event.actorName) {
          doc.fontSize(8).fillColor("#888888").text(`By: ${event.actorName}`, 70);
        }

        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke("#eeeeee");
        doc.moveDown(0.3);
      }

      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(7).fillColor("#aaaaaa").text(
          `Page ${i + 1} of ${pageCount} | ${watermark}`,
          50,
          740,
          { align: "center", width: 512 }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    stage_change: "#3B82F6",
    communication: "#22C55E",
    document: "#A855F7",
    interview: "#F97316",
    compliance: "#EF4444",
    consent: "#14B8A6",
    audit: "#6B7280",
  };
  return colors[type] || "#000000";
}

export async function performExport(
  exportType: RecruitingExportType,
  filters: ExportFilters,
  user: { id: string; email: string },
  ipAddress?: string,
  userAgent?: string,
  reason?: string
): Promise<ExportResult> {
  let result: ExportResult;

  switch (exportType) {
    case "candidates":
      result = await exportCandidates(filters, user.email);
      break;
    case "applications":
      result = await exportApplicationPipeline(filters, user.email);
      break;
    case "audit_log":
      result = await exportAuditLog(filters, user.email);
      break;
    case "document_metadata":
      result = await exportDocumentMetadata(filters, user.email);
      break;
    default:
      throw new Error(`Unknown export type: ${exportType}`);
  }

  await logExport({
    exportType,
    exportFormat: "csv",
    exportedBy: user.id,
    exportedByEmail: user.email,
    filters,
    recordCount: result.recordCount,
    watermark: result.watermark,
    fileSizeBytes: result.fileSizeBytes,
    ipAddress,
    userAgent,
    reason,
  });

  return result;
}
