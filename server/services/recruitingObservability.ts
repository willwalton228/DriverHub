import { db } from "../db";
import { recruitingObservabilityEvents } from "@shared/schema";
import type { InsertRecruitingObservabilityEvent, RecruitingObservabilityEvent } from "@shared/schema";
import { desc, eq, gte, and, sql, count } from "drizzle-orm";

export type ObsEventType = InsertRecruitingObservabilityEvent["eventType"];
export type ObsSeverity = InsertRecruitingObservabilityEvent["severity"];
export type ObsStatus = InsertRecruitingObservabilityEvent["status"];

export interface LogEventParams {
  traceId?: string;
  eventType: ObsEventType;
  status: ObsStatus;
  severity?: ObsSeverity;
  userId?: string;
  applicationId?: string;
  requisitionId?: string;
  candidateId?: string;
  docRequestId?: string;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  route?: string;
  method?: string;
  metadata?: Record<string, any>;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  apply_submit: "Apply Submit",
  stage_transition: "Stage Transition",
  doc_upload_init: "Doc Upload Init",
  doc_upload_finalize: "Doc Upload Finalize",
  doc_download: "Doc Download",
  message_send: "Message Send",
  pipeline_load: "Pipeline Load",
  application_create: "Application Create",
  candidate_create: "Candidate Create",
  bulk_operation: "Bulk Operation",
};

export function logRecruitingEvent(params: LogEventParams): void {
  const severity = params.severity || (params.status === "error" ? "error" : "info");
  const label = EVENT_TYPE_LABELS[params.eventType] || params.eventType;

  const prefix = `[Recruiting:${label}]`;
  if (params.status === "error") {
    console.error(
      `${prefix} ERROR traceId=${params.traceId || "none"} ` +
      `code=${params.errorCode || "UNKNOWN"} msg=${params.errorMessage || ""} ` +
      `appId=${params.applicationId || ""} reqId=${params.requisitionId || ""} ` +
      `latency=${params.latencyMs ?? ""}ms`
    );
  } else {
    console.log(
      `${prefix} OK traceId=${params.traceId || "none"} ` +
      `appId=${params.applicationId || ""} reqId=${params.requisitionId || ""} ` +
      `latency=${params.latencyMs ?? ""}ms`
    );
  }

  const record: InsertRecruitingObservabilityEvent = {
    traceId: params.traceId || null,
    eventType: params.eventType,
    status: params.status,
    severity,
    userId: params.userId || null,
    applicationId: params.applicationId || null,
    requisitionId: params.requisitionId || null,
    candidateId: params.candidateId || null,
    docRequestId: params.docRequestId || null,
    latencyMs: params.latencyMs ?? null,
    errorCode: params.errorCode || null,
    errorMessage: params.errorMessage || null,
    route: params.route || null,
    method: params.method || null,
    metadata: params.metadata || null,
  };

  db.insert(recruitingObservabilityEvents)
    .values(record)
    .catch((err: any) => {
      console.error("[Recruiting:Observability] Failed to persist event:", err.message);
    });
}

export function withObservability<T>(
  req: { traceId?: string; path?: string; method?: string; user?: any },
  eventType: ObsEventType,
  entityIds: {
    applicationId?: string;
    requisitionId?: string;
    candidateId?: string;
    docRequestId?: string;
  },
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const traceId = req.traceId;
  const userId = req.user?.id;
  const route = req.path;
  const method = req.method;

  return fn().then(
    (result) => {
      logRecruitingEvent({
        traceId,
        eventType,
        status: "success",
        userId,
        ...entityIds,
        latencyMs: Date.now() - start,
        route,
        method,
      });
      return result;
    },
    (error) => {
      logRecruitingEvent({
        traceId,
        eventType,
        status: "error",
        severity: "error",
        userId,
        ...entityIds,
        latencyMs: Date.now() - start,
        errorCode: error.code || error.name || "INTERNAL_ERROR",
        errorMessage: error.message?.slice(0, 500),
        route,
        method,
      });
      throw error;
    }
  );
}

export async function getRecentErrors(options: {
  since?: Date;
  limit?: number;
  eventType?: string;
}): Promise<{
  errors: RecruitingObservabilityEvent[];
  summary: {
    totalErrors: number;
    byEventType: Record<string, number>;
    byErrorCode: Record<string, number>;
  };
  metrics: {
    avgLatencyMs: Record<string, number>;
    totalEvents: number;
    errorRate: number;
  };
}> {
  const since = options.since || new Date(Date.now() - 24 * 60 * 60 * 1000);
  const limit = options.limit || 50;

  const conditions = [gte(recruitingObservabilityEvents.createdAt, since)];
  if (options.eventType) {
    conditions.push(eq(recruitingObservabilityEvents.eventType, options.eventType as any));
  }

  const errorConditions = [
    ...conditions,
    eq(recruitingObservabilityEvents.status, "error"),
  ];

  const [errors, errorCountsByType, totalEventsResult, avgLatencies] = await Promise.all([
    db.select()
      .from(recruitingObservabilityEvents)
      .where(and(...errorConditions))
      .orderBy(desc(recruitingObservabilityEvents.createdAt))
      .limit(limit),

    db.select({
      eventType: recruitingObservabilityEvents.eventType,
      count: count(),
    })
      .from(recruitingObservabilityEvents)
      .where(and(...errorConditions))
      .groupBy(recruitingObservabilityEvents.eventType),

    db.select({
      total: count(),
      errors: sql<number>`count(*) filter (where ${recruitingObservabilityEvents.status} = 'error')`,
    })
      .from(recruitingObservabilityEvents)
      .where(and(...conditions)),

    db.select({
      eventType: recruitingObservabilityEvents.eventType,
      avgLatency: sql<number>`round(avg(${recruitingObservabilityEvents.latencyMs}))`,
    })
      .from(recruitingObservabilityEvents)
      .where(and(...conditions))
      .groupBy(recruitingObservabilityEvents.eventType),
  ]);

  const byEventType: Record<string, number> = {};
  for (const row of errorCountsByType) {
    byEventType[row.eventType] = Number(row.count);
  }

  const byErrorCode: Record<string, number> = {};
  for (const err of errors) {
    const code = err.errorCode || "UNKNOWN";
    byErrorCode[code] = (byErrorCode[code] || 0) + 1;
  }

  const avgLatencyMs: Record<string, number> = {};
  for (const row of avgLatencies) {
    if (row.avgLatency != null) {
      avgLatencyMs[row.eventType] = Number(row.avgLatency);
    }
  }

  const totalEvents = Number(totalEventsResult[0]?.total || 0);
  const totalErrors = Number(totalEventsResult[0]?.errors || 0);
  const errorRate = totalEvents > 0 ? totalErrors / totalEvents : 0;

  return {
    errors,
    summary: {
      totalErrors,
      byEventType,
      byErrorCode,
    },
    metrics: {
      avgLatencyMs,
      totalEvents,
      errorRate,
    },
  };
}

export async function getObservabilityMetrics(since?: Date): Promise<{
  totalEvents: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  eventTypeBreakdown: Array<{ eventType: string; count: number; errorCount: number; avgLatency: number }>;
}> {
  const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);

  const breakdown = await db.select({
    eventType: recruitingObservabilityEvents.eventType,
    total: count(),
    errors: sql<number>`count(*) filter (where ${recruitingObservabilityEvents.status} = 'error')`,
    avgLatency: sql<number>`round(avg(${recruitingObservabilityEvents.latencyMs}))`,
  })
    .from(recruitingObservabilityEvents)
    .where(gte(recruitingObservabilityEvents.createdAt, sinceDate))
    .groupBy(recruitingObservabilityEvents.eventType);

  let totalEvents = 0;
  let totalErrors = 0;
  let latencySum = 0;
  let latencyCount = 0;
  const eventTypeBreakdown = breakdown.map(row => {
    const total = Number(row.total);
    const errors = Number(row.errors);
    const avgLatency = Number(row.avgLatency || 0);
    totalEvents += total;
    totalErrors += errors;
    if (avgLatency > 0) {
      latencySum += avgLatency * total;
      latencyCount += total;
    }
    return {
      eventType: row.eventType,
      count: total,
      errorCount: errors,
      avgLatency,
    };
  });

  return {
    totalEvents,
    successCount: totalEvents - totalErrors,
    errorCount: totalErrors,
    errorRate: totalEvents > 0 ? totalErrors / totalEvents : 0,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0,
    eventTypeBreakdown,
  };
}
