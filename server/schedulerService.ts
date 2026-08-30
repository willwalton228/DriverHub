import * as cron from "node-cron";
import { resolveConfig } from "./services/platformConfigService";
import { buildInviteUrl } from "./appConfig";
import { syncCustomersFromHubSpot, isHubSpotConfigured } from "./hubspotService";
import { storage } from "./storage";
import { processInvoiceReminders } from "./invoiceReminderService";
import { processBatchAutopay } from "./autopayService";
import { runNudgeScan } from "./services/recruitingNudgeEngine";
import { expireVendorContracts } from "./vendorContractService";
import { scanVendorRenewals } from "./vendorRenewalService";
import { evaluateAllActiveDrivers } from "./services/driverNeedsUpdateEngine";
import { runReconciliation } from "./services/reconciliationService";
import { scanAndCreateLeaveAlerts } from "./services/leaveAlertService";
import { runOTAlertScan } from "./services/overtimeAlertService";
import { syncDriverWeeklyHours } from "./services/driverWeeklyHoursService";
import { runWeeklyReportBatch } from "./services/weeklyReportService";
import { runScheduledGenerationPoll, runWeeklyGenerationBatch, runDriverShiftWeeklyBatch } from "./services/weeklyGenerationService";
import { runWeeklyDeliveryPoll } from "./services/weeklyDeliveryService";
import { runRiskScoreDecay } from "./services/securityEventService";
import { db } from "./db";
import { users, userAccessRequests, organizations, tickets, notifications, TICKET_AGING_THRESHOLDS } from "@shared/schema";
import { insertNotificationWithWPI } from "./services/notificationService";
import { notify } from "./services/notificationEngine";
import { eq, and, lte, or, isNull, sql as drizzleSql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendUserInviteEmail } from "./emailService";

async function runAmrAgingScan(): Promise<{ ownerNotified: number; adminNotified: number; errors: string[] }> {
  const results = { ownerNotified: 0, adminNotified: 0, errors: [] as string[] };
  try {
    const now = new Date();
    // Fetch all open tickets that have a defined aging threshold
    const openStatuses = Object.keys(TICKET_AGING_THRESHOLDS);
    const allTickets = await db.select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      title: tickets.title,
      status: tickets.status,
      planningStatus: tickets.planningStatus,
      submittedByUserId: tickets.submittedByUserId,
      lastStatusChangeAt: tickets.lastStatusChangeAt,
      agingOwnerNotifiedAt: tickets.agingOwnerNotifiedAt,
      agingAdminNotifiedAt: tickets.agingAdminNotifiedAt,
    }).from(tickets)
      // Roadmapped and Scheduled AMRs are exempt from ticket-age governance; they are
      // governed by their roadmap dates instead (via the Roadmap Dashboard).
      .where(drizzleSql`status::text = ANY(ARRAY[${drizzleSql.join(openStatuses.map(s => drizzleSql`${s}`), drizzleSql`, `)}]::text[]) AND status::text NOT IN ('completed','cancelled','on_hold') AND (planning_status IS NULL OR planning_status::text NOT IN ('roadmapped', 'scheduled'))`);

    for (const ticket of allTickets) {
      const thresholdHours = TICKET_AGING_THRESHOLDS[ticket.status];
      if (!thresholdHours) continue;
      const thresholdMs = thresholdHours * 60 * 60 * 1000;
      const lastChange = ticket.lastStatusChangeAt ? new Date(ticket.lastStatusChangeAt) : null;
      if (!lastChange) continue;
      const staleMs = now.getTime() - lastChange.getTime();
      const hoursStale = Math.floor(staleMs / (1000 * 60 * 60));
      const daysStale = Math.round(staleMs / (1000 * 60 * 60 * 24) * 10) / 10;

      // OWNER notification at 1x threshold — routed through the engine so the
      // submitter receives it via AMR_AGING (responsibility: owner).
      const ownerNeedsNotify = staleMs >= thresholdMs && (
        !ticket.agingOwnerNotifiedAt ||
        new Date(ticket.agingOwnerNotifiedAt) < lastChange
      );

      if (ownerNeedsNotify && ticket.submittedByUserId) {
        try {
          await notify("AMR_AGING", {
            actorUserId: null,
            payload: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
              title: ticket.title,
              submittedByUserId: ticket.submittedByUserId,
              daysOpen: daysStale,
              hoursOpen: hoursStale,
              status: ticket.status,
            },
          });
          await db.update(tickets)
            .set({ agingOwnerNotifiedAt: now })
            .where(eq(tickets.id, ticket.id));
          results.ownerNotified++;
        } catch (err: any) {
          results.errors.push(`owner notify ${ticket.id}: ${err.message}`);
        }
      }

      // ADMIN escalation at 2x threshold — routed through the engine so
      // bySystemRole("escalation-target") handles admin fan-out with deduplication.
      const adminNeedsNotify = staleMs >= thresholdMs * 2 && (
        !ticket.agingAdminNotifiedAt ||
        new Date(ticket.agingAdminNotifiedAt) < lastChange
      );

      if (adminNeedsNotify) {
        try {
          await notify("AMR_AGING_ESCALATION", {
            actorUserId: null,
            payload: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
              title: ticket.title,
              submittedByUserId: ticket.submittedByUserId,
              daysOpen: daysStale,
              hoursOpen: hoursStale,
              status: ticket.status,
            },
          });
          await db.update(tickets)
            .set({ agingAdminNotifiedAt: now })
            .where(eq(tickets.id, ticket.id));
          results.adminNotified++;
        } catch (err: any) {
          results.errors.push(`admin notify ${ticket.id}: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    results.errors.push(`scan failed: ${err.message}`);
  }
  return results;
}

async function runPendingActivations(): Promise<{ activated: number; errors: string[] }> {
  const today = new Date().toISOString().split("T")[0];
  const errors: string[] = [];
  let activated = 0;

  try {
    const pendingRequests = await db.select().from(userAccessRequests)
      .where(and(
        eq(userAccessRequests.status, "approved_pending_activation"),
        lte(userAccessRequests.startDate as any, today),
      ));

    for (const request of pendingRequests) {
      try {
        if (!request.resultingUserId) continue;

        const [org] = await db.select().from(organizations).where(eq(organizations.id, request.orgId)).limit(1);
        const [targetUser] = await db.select().from(users).where(eq(users.id, request.resultingUserId)).limit(1);

        if (!targetUser || !targetUser.pendingActivation) continue;

        const inviteToken = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await db.update(users).set({
          pendingActivation: false,
          inviteToken,
          inviteTokenExpiresAt: expiresAt,
          status: "INVITED",
          updatedAt: new Date(),
        }).where(eq(users.id, request.resultingUserId));

        await db.update(userAccessRequests).set({
          status: "approved",
          activationSentAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(userAccessRequests.id, request.id));

        if (targetUser.email && org) {
          const inviteUrl = buildInviteUrl(inviteToken);
          await sendUserInviteEmail({ to: targetUser.email, organizationName: org.name, inviteUrl, role: targetUser.role });
        }

        activated++;
      } catch (err: any) {
        errors.push(`Request ${request.id}: ${err?.message || "unknown error"}`);
        console.error(`[Scheduler] Failed to activate request ${request.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Pending activation scan error:", err);
    errors.push(`Scan error: ${(err as any)?.message}`);
  }

  return { activated, errors };
}

let hubspotSyncJob: ReturnType<typeof cron.schedule> | null = null;
let healthRecalcJob: ReturnType<typeof cron.schedule> | null = null;
let playbookEvalJob: ReturnType<typeof cron.schedule> | null = null;
let overrideExpirationJob: ReturnType<typeof cron.schedule> | null = null;
let invoiceReminderJob: ReturnType<typeof cron.schedule> | null = null;
let autopayDueDateJob: ReturnType<typeof cron.schedule> | null = null;
let lateFeeProcessingJob: ReturnType<typeof cron.schedule> | null = null;
let nudgeScanJob: ReturnType<typeof cron.schedule> | null = null;
let contractExpirationJob: ReturnType<typeof cron.schedule> | null = null;
let vendorRenewalScanJob: ReturnType<typeof cron.schedule> | null = null;
let driverNeedsUpdateJob: ReturnType<typeof cron.schedule> | null = null;
let reconciliationJob: ReturnType<typeof cron.schedule> | null = null;
let leaveAlertScanJob: ReturnType<typeof cron.schedule> | null = null;
let otAlertScanJob: ReturnType<typeof cron.schedule> | null = null;
let riskScoreDecayJob: ReturnType<typeof cron.schedule> | null = null;
let pendingActivationJob: ReturnType<typeof cron.schedule> | null = null;
let amrAgingScanJob: ReturnType<typeof cron.schedule> | null = null;
let forecastEngineJob: ReturnType<typeof cron.schedule> | null = null;
let workforceRecommendationsJob: ReturnType<typeof cron.schedule> | null = null;

// ── Global Weekly Report Schedule (configurable via Platform Admin) ────────────
let weeklyReportJob: ReturnType<typeof cron.schedule> | null = null;
let weekendMondayReminderJob: ReturnType<typeof cron.schedule> | null = null;

// ── Claims Loss Accrual Report Schedule ────────────────────────────────────────
let lossAccrualReportJob: ReturnType<typeof cron.schedule> | null = null;
export let activeLossAccrualCron = "0 8 * * 1"; // default: Monday 8:00 AM CST
export let activeWeeklyReportCron = "5 7 * * 1"; // default: Monday 7:05 AM CST

const DAY_TO_CRON: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

export function buildLossAccrualCron(day: string, time: string): string {
  const dayNum = DAY_TO_CRON[day?.toLowerCase()] ?? 1;
  const [hourStr = "8", minStr = "0"] = (time ?? "08:00").split(":");
  return `${parseInt(minStr, 10)} ${parseInt(hourStr, 10)} * * ${dayNum}`;
}

export function rescheduleLossAccrualReport(day: string, time: string, enabled: boolean): void {
  if (lossAccrualReportJob) {
    lossAccrualReportJob.stop();
    lossAccrualReportJob = null;
  }
  if (!enabled) {
    console.log("[Scheduler] Loss Accrual Report: scheduled delivery disabled");
    return;
  }
  const cronExpr = buildLossAccrualCron(day, time);
  activeLossAccrualCron = cronExpr;
  lossAccrualReportJob = cron.schedule(cronExpr, async () => {
    console.log("[Scheduler] Starting loss accrual report delivery at", new Date().toISOString());
    try {
      const { runLossAccrualReportDelivery } = await import("./services/lossAccrualReportService");
      await runLossAccrualReportDelivery();
    } catch (err) {
      console.error("[Scheduler] Loss accrual report delivery failed:", err);
    }
  }, { timezone: "America/Chicago" });
  console.log(`[Scheduler] Loss Accrual Report scheduled: cron="${cronExpr}" (${day} ${time} CST)`);
}

export function buildWeeklyReportCron(day: string, time: string): string {
  const dayNum = DAY_TO_CRON[day?.toLowerCase()] ?? 1; // default Monday
  const [hourStr = "7", minStr = "5"] = (time ?? "07:05").split(":");
  const hour = parseInt(hourStr, 10);
  const min  = parseInt(minStr, 10);
  return `${min} ${hour} * * ${dayNum}`;
}

export function rescheduleWeeklyReports(day: string, time: string): string {
  if (weeklyReportJob) {
    weeklyReportJob.stop();
    weeklyReportJob = null;
  }
  const cronExpr = buildWeeklyReportCron(day, time);
  activeWeeklyReportCron = cronExpr;
  weeklyReportJob = cron.schedule(cronExpr, async () => {
    console.log("[Scheduler] Starting weekly account report batch at", new Date().toISOString());
    try {
      const result = await runWeeklyReportBatch();
      console.log(
        `[Scheduler] Weekly report batch complete: attempted=${result.attempted}, ` +
        `success=${result.succeeded}, skipped=${result.skipped}, failed=${result.failed}`
      );
      if (result.errors.length > 0) {
        console.error("[Scheduler] Weekly report errors:", result.errors);
      }
    } catch (error) {
      console.error("[Scheduler] Weekly report batch failed:", error);
    }
  }, { timezone: "America/Chicago" });
  console.log(`[Scheduler] Weekly account reports rescheduled: cron="${cronExpr}" (${day} ${time} CST)`);
  return cronExpr;
}

export function initializeScheduler(): void {
  console.log("[Scheduler] Initializing scheduled tasks...");

  // HubSpot sync at 4:00 AM CST daily
  // Using America/Chicago timezone which handles CST/CDT automatically
  // Cron format: minute hour day month day-of-week
  // '0 4 * * *' = At 4:00 AM in the specified timezone every day
  hubspotSyncJob = cron.schedule("0 4 * * *", async () => {
    console.log("[Scheduler] Starting scheduled HubSpot sync at", new Date().toISOString());
    
    if (!isHubSpotConfigured()) {
      console.log("[Scheduler] HubSpot sync skipped - not configured");
      return;
    }

    try {
      const result = await syncCustomersFromHubSpot();
      console.log(`[Scheduler] HubSpot sync completed:`, {
        success: result.success,
        created: result.created,
        updated: result.updated,
        errors: result.errors.length,
        syncedAt: result.syncedAt,
      });
    } catch (error) {
      console.error("[Scheduler] HubSpot sync failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] HubSpot sync scheduled for 4:00 AM CST daily");

  // AI Workforce Planning Recommendations — nightly at 2:15 AM CST
  // Regenerates recommendations for all active markets in marketDemandSignals
  workforceRecommendationsJob = cron.schedule("15 2 * * *", async () => {
    console.log("[Scheduler] Starting AI workforce recommendations generation at", new Date().toISOString());
    try {
      const { marketDemandSignals } = await import("@shared/schema");
      const { generateAndSaveRecommendation } = await import("./services/workforcePlanningService");
      const { db: schedulerDb } = await import("./db");
      const { eq: schedulerEq } = await import("drizzle-orm");

      const signals = await schedulerDb
        .select({ market: marketDemandSignals.market })
        .from(marketDemandSignals)
        .where(schedulerEq(marketDemandSignals.isActive, true));

      const markets = [...new Set(signals.map((s) => s.market).filter(Boolean))];
      let success = 0;
      let failed = 0;

      for (const market of markets) {
        try {
          await generateAndSaveRecommendation(market);
          success++;
        } catch (err: any) {
          console.error(`[Scheduler] WFP recommendation failed for ${market}:`, err.message);
          failed++;
        }
      }

      console.log(`[Scheduler] AI workforce recommendations complete: markets=${markets.length}, success=${success}, failed=${failed}`);
    } catch (err: any) {
      console.error("[Scheduler] AI workforce recommendations job failed:", err);
    }
  }, { timezone: "America/Chicago" });

  console.log("[Scheduler] AI workforce recommendations scheduled for 2:15 AM CST daily");

  // Health recalculation at 2:00 AM CST daily (before HubSpot sync)
  // This recalculates all account health statuses based on Next Required Touch dates
  healthRecalcJob = cron.schedule("0 2 * * *", async () => {
    console.log("[Scheduler] Starting nightly health recalculation at", new Date().toISOString());

    try {
      const result = await storage.recalculateAllAccountHealth();
      console.log(`[Scheduler] Health recalculation completed:`, {
        processed: result.processed,
        errors: result.errors,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Scheduler] Health recalculation failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Health recalculation scheduled for 2:00 AM CST daily");

  // Playbook evaluation at 3:00 AM CST daily (after health recalculation, before HubSpot sync)
  // This evaluates all playbook triggers and executes actions for matching accounts
  playbookEvalJob = cron.schedule("0 3 * * *", async () => {
    console.log("[Scheduler] Starting playbook evaluation at", new Date().toISOString());

    try {
      const result = await storage.runPlaybooksForAllAccounts();
      console.log(`[Scheduler] Playbook evaluation completed:`, {
        processed: result.processed,
        triggered: result.triggered,
        errors: result.errors,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Scheduler] Playbook evaluation failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Playbook evaluation scheduled for 3:00 AM CST daily");

  // Health override expiration check at 1:00 AM CST daily (before health recalculation)
  // This checks for expired health overrides and triggers recalculations
  overrideExpirationJob = cron.schedule("0 1 * * *", async () => {
    console.log("[Scheduler] Starting health override expiration check at", new Date().toISOString());

    try {
      const expiredCount = await storage.expireHealthOverrides();
      console.log(`[Scheduler] Health override expiration completed:`, {
        expiredCount,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Scheduler] Health override expiration check failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Health override expiration scheduled for 1:00 AM CST daily");

  // Invoice reminder processing at 8:00 AM CST daily (business hours)
  // This checks all unpaid invoices and sends reminders based on configured schedules
  invoiceReminderJob = cron.schedule("0 8 * * *", async () => {
    console.log("[Scheduler] Starting invoice reminder processing at", new Date().toISOString());

    try {
      const result = await processInvoiceReminders();
      console.log(`[Scheduler] Invoice reminder processing completed:`, {
        processed: result.processed,
        remindersSent: result.remindersSent,
        errors: result.errors,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Scheduler] Invoice reminder processing failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Invoice reminders scheduled for 8:00 AM CST daily");

  // Autopay for invoices with on_due_date trigger at 6:00 AM CST daily
  // Runs before invoice reminders to process autopay first
  autopayDueDateJob = cron.schedule("0 6 * * *", async () => {
    console.log("[Scheduler] Starting autopay on_due_date processing at", new Date().toISOString());
    try {
      const result = await processBatchAutopay('on_due_date');
      console.log(`[Scheduler] Autopay processing complete: ${result.processed} processed, ${result.successful} successful, ${result.failed} failed`);
    } catch (error) {
      console.error("[Scheduler] Autopay processing failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Autopay on_due_date scheduled for 6:00 AM CST daily");

  // Late fee processing at 7:00 AM CST daily (after autopay, before invoice reminders)
  // This applies late fees to overdue invoices based on customer billing profile policy
  lateFeeProcessingJob = cron.schedule("0 7 * * *", async () => {
    console.log("[Scheduler] Starting late fee processing at", new Date().toISOString());
    try {
      const eligibleInvoices = await storage.getInvoicesEligibleForLateFee();
      let applied = 0;
      let skipped = 0;
      let errors = 0;

      for (const invoice of eligibleInvoices) {
        try {
          const result = await storage.applyLateFeeToInvoice(invoice.id, 'system');
          if (result) {
            applied++;
          } else {
            skipped++;
          }
        } catch (err) {
          console.error(`[Scheduler] Error applying late fee to invoice ${invoice.id}:`, err);
          errors++;
        }
      }

      console.log(`[Scheduler] Late fee processing complete: ${eligibleInvoices.length} eligible, ${applied} applied, ${skipped} skipped, ${errors} errors`);
    } catch (error) {
      console.error("[Scheduler] Late fee processing failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Late fee processing scheduled for 7:00 AM CST daily");

  nudgeScanJob = cron.schedule("0 9,14 * * *", async () => {
    console.log("[Scheduler] Starting recruiting nudge scan at", new Date().toISOString());
    try {
      const result = await runNudgeScan();
      console.log(`[Scheduler] Nudge scan complete: ${result.sent} sent, ${result.suppressed} suppressed, ${result.errors} errors`);
    } catch (error) {
      console.error("[Scheduler] Nudge scan failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Recruiting nudge scan scheduled for 9:00 AM and 2:00 PM CST daily");

  contractExpirationJob = cron.schedule("0 0 * * *", async () => {
    console.log("[Scheduler] Starting vendor contract expiration check at", new Date().toISOString());
    try {
      const count = await expireVendorContracts();
      console.log(`[Scheduler] Vendor contract expiration check completed: ${count} contract(s) expired`);
    } catch (error) {
      console.error("[Scheduler] Vendor contract expiration check failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Vendor contract expiration scheduled for midnight CST daily");

  vendorRenewalScanJob = cron.schedule("0 6 * * *", async () => {
    console.log("[Scheduler] Starting vendor renewal alert scan at", new Date().toISOString());
    try {
      const result = await scanVendorRenewals();
      console.log(`[Scheduler] Vendor renewal scan completed: ${result.renewalAlerts} renewal alerts, ${result.cancellationAlerts} cancellation alerts, ${result.notificationsSent} notifications sent, ${result.errors} errors`);
    } catch (error) {
      console.error("[Scheduler] Vendor renewal scan failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Vendor renewal alert scan scheduled for 6:00 AM CST daily");

  driverNeedsUpdateJob = cron.schedule("30 2 * * *", async () => {
    console.log("[Scheduler] Starting driver needs-update evaluation at", new Date().toISOString());
    try {
      const result = await evaluateAllActiveDrivers();
      console.log(`[Scheduler] Driver needs-update evaluation completed: ${result.total} drivers evaluated, ${result.flagged} newly flagged, ${result.cleared} cleared`);
    } catch (error) {
      console.error("[Scheduler] Driver needs-update evaluation failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Driver needs-update evaluation scheduled for 2:30 AM CST daily");

  reconciliationJob = cron.schedule("0 3 * * *", async () => {
    console.log("[Scheduler] Starting financial reconciliation at", new Date().toISOString());
    try {
      const result = await runReconciliation("scheduler");
      console.log(`[Scheduler] Financial reconciliation completed: status=${result.status}, discrepancies=${result.discrepancies.length}, time=${result.executionTimeMs}ms`);
    } catch (error) {
      console.error("[Scheduler] Financial reconciliation failed:", error);
    }
    // Run exception engine full scan immediately after reconciliation
    try {
      const { runFullExceptionScan } = await import("./services/exceptionEngine");
      const newExceptions = await runFullExceptionScan();
      console.log(`[Scheduler] Exception engine scan completed: ${newExceptions} new exceptions flagged`);
    } catch (error) {
      console.error("[Scheduler] Exception engine scan failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Financial reconciliation scheduled for 3:00 AM CST daily");

  // Leave alert scan — 6 AM CST nightly
  leaveAlertScanJob = cron.schedule("0 6 * * *", async () => {
    console.log("[Scheduler] Starting leave compliance alert scan at", new Date().toISOString());
    try {
      // Get all active orgs and scan each
      const orgs = await db.select({ id: organizations.id }).from(organizations);
      let totalScanned = 0, totalCreated = 0;
      for (const org of orgs) {
        const result = await scanAndCreateLeaveAlerts(org.id);
        totalScanned += result.scanned;
        totalCreated += result.created;
      }
      console.log(`[Scheduler] Leave alert scan complete: scanned=${totalScanned} cases, created=${totalCreated} notifications`);
    } catch (error) {
      console.error("[Scheduler] Leave alert scan failed:", error);
    }
  }, {
    timezone: "America/Chicago",
  });

  console.log("[Scheduler] Leave compliance alerts scheduled for 6:00 AM CST daily");

  // ── QuickBooks full sync at 3:30 AM CST daily ─────────────────────────────
  // Pulls: expense transactions, customers, AR transactions (invoices/payments),
  // then generates the daily finance KPI snapshot.
  // QB is read-only system of record — DriverHub never writes back.
  cron.schedule("30 3 * * *", async () => {
    console.log("[Scheduler] Starting daily QB full sync at", new Date().toISOString());
    try {
      const { runSyncJob } = await import("./services/qboSyncEngine");
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const until = new Date().toISOString().slice(0, 10);
      const result = await runSyncJob({
        jobType: "full_sync",
        since,
        until,
        triggeredBySystem: true,
      });
      console.log(`[Scheduler] QB full sync complete: ${result.status} — ${result.message}`);
    } catch (err: any) {
      console.error("[Scheduler] QB full sync failed:", err.message);
    }
  }, { timezone: "America/Chicago" });
  console.log("[Scheduler] QuickBooks daily full sync scheduled for 3:30 AM CST daily");

  // ── QB Sync Queue Processor — every 15 min ────────────────────────────────
  // Picks up any pending/retry jobs that were manually enqueued or left by a
  // failed run. This closes the loop so retryJob() actually re-executes.
  cron.schedule("*/15 * * * *", async () => {
    try {
      const { getPendingJobs, runSyncJob, auditLog } = await import("./services/qboSyncEngine");
      const pending = await getPendingJobs(5);
      for (const job of pending) {
        // Skip jobs that are already covered by the daily scheduled run
        // (those are enqueued + processed inline). Only pick up orphaned ones.
        const ageMs = Date.now() - new Date(job.createdAt ?? 0).getTime();
        if (ageMs < 60_000) continue; // allow 1 min for inline processing to complete
        console.log(`[Scheduler] QB queue processor picking up orphaned job ${job.id} (${job.jobType}, ${job.status})`);
        await runSyncJob({
          jobType:           job.jobType as any,
          since:             job.dateRangeStart ?? undefined,
          until:             job.dateRangeEnd   ?? undefined,
          triggeredBySystem: true,
        });
      }
    } catch (err: any) {
      console.error("[Scheduler] QB queue processor error:", err.message);
    }
  }, { timezone: "America/Chicago" });
  console.log("[Scheduler] QB sync queue processor scheduled every 15 minutes");

  // OT Alert scan every hour
  otAlertScanJob = cron.schedule("0 * * * *", async () => {
    console.log("[Scheduler] Starting projected OT alert scan at", new Date().toISOString());
    try {
      const result = await runOTAlertScan();
      console.log(`[Scheduler] OT alert scan complete: scanned=${result.employeesScanned}, sent=${result.alertsSent}, skipped=${result.alertsSkipped}, errors=${result.errors.length}`);
    } catch (error) {
      console.error("[Scheduler] OT alert scan failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Projected OT alert scan scheduled every hour");

  // Driver Weekly Hours sync — runs every hour at :15 (staggered from OT alert scan at :00)
  cron.schedule("15 * * * *", async () => {
    console.log("[Scheduler] Starting driver weekly hours sync at", new Date().toISOString());
    try {
      const result = await syncDriverWeeklyHours();
      console.log(`[Scheduler] Driver weekly hours sync complete: scanned=${result.driversScanned}, upserted=${result.driversUpserted}, alerts=${result.alertsSent}, errors=${result.errors.length}`);
    } catch (error) {
      console.error("[Scheduler] Driver weekly hours sync failed:", error);
    }
  }, { timezone: "America/Chicago" });
  console.log("[Scheduler] Driver weekly hours sync scheduled every hour at :15");

  // ── DriverShift Global Weekly Batch (Ticket 2.3) — Monday 6:00 AM CST ────────
  // Generates PDF + Excel for all active DriverShift accounts.
  // Reports cover the PREVIOUS full week (Mon–Sun). No email — storage only.
  cron.schedule("0 6 * * 1", async () => {
    console.log("[Scheduler] DriverShift weekly batch starting at", new Date().toISOString());
    try {
      const result = await runDriverShiftWeeklyBatch();
      console.log(
        `[Scheduler] DriverShift batch done: attempted=${result.attempted}, ` +
        `success=${result.succeeded}, partial=${result.partial}, failed=${result.failed}`
      );
      if (result.errors.length > 0) {
        console.error("[Scheduler] DriverShift batch errors:", result.errors);
      }
    } catch (error: any) {
      console.error("[Scheduler] DriverShift batch crashed:", error?.message ?? error);
    }
  }, { timezone: "America/Chicago" });
  console.log("[Scheduler] DriverShift weekly batch scheduled for Monday 6:00 AM CST");

  // weeklyReportService Monday 7:05 cron — DISABLED
  // This service wrote to report_delivery_logs (not connected to Delivery History UI),
  // was blocked at the global prereqs gate every week, and ran in parallel with
  // weeklyGenerationService (creating duplicate send attempts).
  // The weeklyDeliveryService hourly poll at :12 is now the single authoritative sender.
  // rescheduleWeeklyReports is kept in scope for the admin API reschedule endpoint.
  console.log("[Scheduler] weeklyReportService Monday batch cron: DISABLED (superseded by hourly delivery poll at :12)");

  // weeklyGenerationService hourly :08 poll — DISABLED
  // weeklyDeliveryService (:12 poll) is now the single authoritative sender.
  // It handles: eligibility check, PDF generation, Object Storage archival,
  // email delivery, account_report_logs write, and campaign run tracking.
  // runScheduledGenerationPoll is kept exported for on-demand use if needed.
  console.log("[Scheduler] weeklyGenerationService hourly poll: DISABLED (consolidated into delivery poll at :12)");

  // Automated Weekly Delivery Job — single authoritative weekly schedule sender
  // Runs every hour at :12 CST, timezone-aware per account.
  // Covers all driver_model types (drivershift, hybrid, driverdash, etc.)
  cron.schedule("12 * * * *", async () => {
    try {
      await runWeeklyDeliveryPoll();
    } catch (e: any) {
      console.error("[Scheduler] Weekly delivery poll error:", e.message);
    }
  });
  console.log("[Scheduler] Weekly schedule delivery poll scheduled hourly at :12 (single authoritative sender)");

  // AMR aging scan — runs every hour at :30 to stagger with OT scan
  amrAgingScanJob = cron.schedule("30 * * * *", async () => {
    console.log("[Scheduler] Starting AMR aging scan at", new Date().toISOString());
    try {
      const result = await runAmrAgingScan();
      console.log(`[Scheduler] AMR aging scan complete: ownerNotified=${result.ownerNotified}, adminNotified=${result.adminNotified}, errors=${result.errors.length}`);
      if (result.errors.length > 0) {
        console.error("[Scheduler] AMR aging scan errors:", result.errors);
      }
    } catch (error) {
      console.error("[Scheduler] AMR aging scan failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] AMR aging scan scheduled every hour at :30");

  // Security risk score decay — runs daily at midnight
  riskScoreDecayJob = cron.schedule("0 0 * * *", async () => {
    console.log("[Scheduler] Starting security risk score decay at", new Date().toISOString());
    try {
      const result = await runRiskScoreDecay();
      console.log(`[Scheduler] Risk score decay complete: decayed=${result.decayed} users`);
    } catch (error) {
      console.error("[Scheduler] Risk score decay failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Security risk score decay scheduled for midnight CST daily");

  // Pending activation start-date trigger — runs daily at 7:05 AM CST
  pendingActivationJob = cron.schedule("5 7 * * *", async () => {
    console.log("[Scheduler] Starting pending activation scan at", new Date().toISOString());
    try {
      const result = await runPendingActivations();
      console.log(`[Scheduler] Pending activation scan complete: activated=${result.activated}, errors=${result.errors.length}`);
    } catch (error) {
      console.error("[Scheduler] Pending activation scan failed:", error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log("[Scheduler] Pending activation start-date trigger scheduled for 7:05 AM CST daily");

  // SSN/EIN DWP sync — runs at startup (once) then daily at 5 AM CST
  const runSsnEinScan = async () => {
    try {
      const { retroactiveSsnEinDwpScan } = await import("./services/ssnEinDwpService");
      const result = await retroactiveSsnEinDwpScan();
      console.log(`[Scheduler] SSN/EIN DWP scan complete: created=${result.created}, completed=${result.completed}`);
    } catch (error) {
      console.error("[Scheduler] SSN/EIN DWP scan failed:", error);
    }
  };

  // Run once at startup (after a short delay so routes/DB are fully ready)
  setTimeout(runSsnEinScan, 15000);

  cron.schedule("0 5 * * *", runSsnEinScan, { timezone: "America/Chicago" });
  console.log("[Scheduler] SSN/EIN DWP scan scheduled for 5:00 AM CST daily (also runs at startup)");

  // Autonomous 12-month Forecast Engine — runs nightly at 2:30 AM CST
  forecastEngineJob = cron.schedule("30 2 * * *", async () => {
    try {
      const { runForecastEngine } = await import("./services/forecastEngine");
      const result = await runForecastEngine();
      console.log(
        `[Scheduler] Forecast engine complete: ${result.monthsGenerated} months, ` +
        `confidence=${result.confidence}, annualRevenue=$${Math.round(result.totalRevenueForecast).toLocaleString()}`
      );
    } catch (error) {
      console.error("[Scheduler] Forecast engine failed:", error);
    }
  }, { timezone: "America/Chicago" });

  console.log("[Scheduler] Autonomous forecast engine scheduled for 2:30 AM CST daily");

  // Automated Secure File Drop — poll all enabled configs every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const { pollAllFileDropConfigs } = await import("./services/fileDropService");
      await pollAllFileDropConfigs();
    } catch (error) {
      console.error("[Scheduler] File drop poll failed:", error);
    }
  });

  console.log("[Scheduler] Secure File Drop polling scheduled every 5 minutes");

  // ── WIW Hybrid Sync (scheduled + webhook) ────────────────────────────────
  // Per-entity cadences with incremental cursors.
  // All jobs gate on sync_mode != 'manual' AND sync_enabled = true.

  async function wiwShouldRun(): Promise<boolean> {
    const { pool: dbPool } = await import("./db");
    const cfg = await dbPool.query(
      `SELECT sync_enabled, sync_mode FROM wiw_api_config LIMIT 1`
    );
    const row = cfg.rows[0];
    if (!row?.sync_enabled) return false;
    if (row.sync_mode === "manual") return false;
    return true;
  }

  async function runWiwEntity(entity: string, label: string): Promise<void> {
    try {
      if (!(await wiwShouldRun())) {
        console.log(`[Scheduler] WIW ${label} skipped — sync disabled or manual mode`);
        return;
      }
      const { runEntitySync } = await import("./services/wiwSyncService");
      const result = await runEntitySync(entity as any, "scheduled");
      const deleted = (result as any).deleted ?? 0;
      console.log(
        `[Scheduler] WIW ${label}: ${result.fetched} fetched, ` +
        `${result.inserted} inserted, ${result.updated} updated, ` +
        `${deleted} soft-deleted, ${result.errors} errors`
      );
    } catch (err) {
      console.error(`[Scheduler] WIW ${label} failed:`, err);
    }
  }

  // Shifts — every 15 minutes (incremental via cursor)
  cron.schedule("*/15 * * * *", () => runWiwEntity("shifts", "shifts (15-min)"));
  console.log("[Scheduler] WIW shifts sync scheduled every 15 minutes");

  // Times — every 15 minutes (incremental via cursor)
  cron.schedule("*/15 * * * *", () => runWiwEntity("times", "times (15-min)"));
  console.log("[Scheduler] WIW times sync scheduled every 15 minutes");

  // No Show Monitor — every 5 minutes. The evaluator persists one exception
  // per driver/WIW shift only while it is in the detection window and data is
  // fresh, so historical page views cannot create alert backfill.
  cron.schedule("*/5 * * * *", async () => {
    try {
      const { getNoShowMonitor } = await import("./services/noShowMonitorService");
      const now = new Date();
      await getNoShowMonitor({
        from: new Date(now.getTime() - 90 * 60 * 1000),
        to: new Date(now.getTime() + 15 * 60 * 1000),
      });
    } catch (error: any) {
      console.error("[Scheduler] No Show Monitor evaluation failed:", error?.message);
    }
  });
  console.log("[Scheduler] No Show Monitor evaluation scheduled every 5 minutes");

  // Absences — hourly at :05 (incremental via cursor)
  cron.schedule("5 * * * *", () => runWiwEntity("absences", "absences (hourly)"));
  console.log("[Scheduler] WIW absences sync scheduled hourly at :05");

  // Time-Off Requests (dedicated table) — daily at 4:00 AM CST, syncs current year
  cron.schedule("0 4 * * *", async () => {
    try {
      const { syncTimeOffRequests } = await import("./services/wiwSyncService");
      const ytdStart = `${new Date().getFullYear()}-01-01`;
      const result = await syncTimeOffRequests({ start: ytdStart });
      console.log(`[Scheduler] WIW time-off sync: fetched=${result.fetched}, inserted=${result.inserted}, updated=${result.updated}, errors=${result.errors}`);
    } catch (err: any) {
      console.error("[Scheduler] WIW time-off sync error:", err?.message ?? err);
    }
  }, { timezone: "America/Chicago" });
  console.log("[Scheduler] WIW time-off requests sync scheduled daily at 4:00 AM CST");

  // Attendance notices — hourly at :10 (incremental via cursor)
  cron.schedule("10 * * * *", () => runWiwEntity("notices", "notices (hourly)"));
  console.log("[Scheduler] WIW attendance notices sync scheduled hourly at :10");

  // Users — nightly 3:30 AM CST (reference data, full pull)
  cron.schedule("30 3 * * *", () => runWiwEntity("users", "users (nightly)"), {
    timezone: "America/Chicago",
  });
  console.log("[Scheduler] WIW users sync scheduled nightly at 3:30 AM CST");

  // Locations — nightly 3:35 AM CST (reference data, full pull)
  cron.schedule("35 3 * * *", () => runWiwEntity("locations", "locations (nightly)"), {
    timezone: "America/Chicago",
  });
  console.log("[Scheduler] WIW locations sync scheduled nightly at 3:35 AM CST");

  // Positions — nightly 3:40 AM CST (reference data, full pull)
  cron.schedule("40 3 * * *", () => runWiwEntity("positions", "positions (nightly)"), {
    timezone: "America/Chicago",
  });
  console.log("[Scheduler] WIW positions sync scheduled nightly at 3:40 AM CST");

  // Webhook event retry — every 10 minutes (processes failed events, max 5 retries)
  cron.schedule("*/10 * * * *", async () => {
    try {
      const { retryFailedEvents } = await import("./services/wiwWebhookService");
      await retryFailedEvents();
    } catch (err) {
      console.error("[Scheduler] WIW webhook retry failed:", err);
    }
  });
  console.log("[Scheduler] WIW webhook event retry scheduled every 10 minutes");

  // ── Attendance Full Reconciliation — nightly at 12:00 AM server time ─────
  // Re-derives driver_attendance_records for all active drivers across a
  // retention window, then recomputes driver_attendance_metrics for all
  // active drivers. Catches anything the incremental sync/webhook hooks
  // missed, so DriverConnect's attendance data stays fully caught up without
  // requiring any manual sync step.
  cron.schedule("0 0 * * *", async () => {
    console.log("[Scheduler] Nightly attendance reconciliation starting...");
    try {
      const { deriveAttendanceRecords } = await import("./services/attendanceRecordService");
      const { computeMetricsForAllActiveDrivers } = await import("./services/attendanceMetricsService");

      // 120-day retention window keeps the nightly full pass reasonably scoped
      // while comfortably covering the metrics rolling window (90 days).
      const sinceDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const derivation = await deriveAttendanceRecords({ sinceDate });
      console.log(
        `[Scheduler] Attendance reconciliation: ${derivation.processed} shifts re-derived, ` +
        `${derivation.errors} errors`
      );

      const metrics = await computeMetricsForAllActiveDrivers();
      console.log(
        `[Scheduler] Attendance metrics recomputed: ${metrics.processed} drivers, ` +
        `${metrics.errors} errors`
      );
    } catch (err) {
      console.error("[Scheduler] Nightly attendance reconciliation failed:", err);
    }
  });
  console.log("[Scheduler] Nightly attendance reconciliation scheduled at 12:00 AM server time");

  // ── Driver Performance Scores — nightly at 4:30 AM CST ───────────────────
  cron.schedule("30 4 * * *", async () => {
    try {
      const { computeAllDriverScores } = await import("./services/driverScoringService");
      await computeAllDriverScores();
    } catch (err) {
      console.error("[Scheduler] Driver score computation failed:", err);
    }
  }, { timezone: "America/Chicago" });
  console.log("[Scheduler] Driver performance scores scheduled nightly at 4:30 AM CST");

  // ── MVR Unresponsive Sweep — nightly at 6:45 AM CST ──────────────────────
  cron.schedule("45 6 * * *", async () => {
    try {
      const { resolveConfig } = await import("./services/platformConfigService");
      const cfg = await resolveConfig("mvr.unresponsive_days");
      const threshold: number = (cfg?.configValue as any)?.days ?? 3;

      const { pool } = await import("./db");
      const result = await pool.query(
        `UPDATE drivers
         SET mvr_progress            = 'Unresponsive',
             mvr_progress_updated_at = NOW()
         WHERE mvr_progress = 'Link Sent'
           AND mvr_request_sent_date IS NOT NULL
           AND (CURRENT_DATE - mvr_request_sent_date) >= $1`,
        [threshold]
      );
      const count = result.rowCount ?? 0;
      if (count > 0) {
        console.log(`[Scheduler] MVR unresponsive sweep: flagged ${count} driver(s) as Unresponsive (threshold=${threshold}d)`);
      }
    } catch (err) {
      console.error("[Scheduler] MVR unresponsive sweep failed:", err);
    }
  }, { timezone: "America/Chicago" });
  console.log("[Scheduler] MVR unresponsive sweep scheduled nightly at 6:45 AM CST");

  // ── Weekend Monday Reminder — timezone-aware Saturday polling ──────────────
  // The service selects only WIW/account scheduling timezones that have reached
  // Saturday 2:00 PM local time. Its durable driver-cycle ledger makes repeated
  // polls safe across restarts and multiple application instances.
  weekendMondayReminderJob = cron.schedule("*/5 * * * *", async () => {
    console.log("[Scheduler] Polling Weekend Monday Reminder timezones at", new Date().toISOString());
    try {
      const { runWeekendMondayReminders } = await import("./services/weekendMondayReminderService");
      const result = await runWeekendMondayReminders(undefined, "scheduler");
      console.log("[Scheduler] Weekend Monday Reminders complete:", result);
    } catch (err: any) {
      console.error("[Scheduler] Weekend Monday Reminders failed:", err?.message);
    }
  }, { timezone: "UTC" });

  console.log("[Scheduler] Weekend Monday Reminder polls every 5 minutes for Saturday 2:00 PM local scheduling time");

  // ── Loss Accrual Report — load schedule from DB on startup ────────────────
  // Runs asynchronously so it doesn't block scheduler init if the DB is slow.
  (async () => {
    try {
      const { pool } = await import("./db");
      const result = await pool.query(
        "SELECT enabled, day_of_week, delivery_time FROM claim_report_schedules WHERE report_type = 'loss_accrual' LIMIT 1"
      );
      if (result.rows.length > 0) {
        const { enabled, day_of_week, delivery_time } = result.rows[0];
        if (enabled) {
          rescheduleLossAccrualReport(day_of_week, delivery_time, true);
        } else {
          console.log("[Scheduler] Loss Accrual Report: scheduled delivery is disabled");
        }
      }
    } catch (err) {
      console.error("[Scheduler] Failed to load loss accrual report schedule:", err);
    }
  })();

  // ── Move Export Schedules (Task #85) ─────────────────────────────────────────
  // Each user schedule is registered as a live cron task when the scheduler starts.
  // We poll the DB once at startup then register dynamic tasks per schedule.
  // A nightly refresh (2 AM) re-syncs any new/changed schedules without restart.
  const registeredExportTasks = new Map<string, ReturnType<typeof cron.schedule>>();

  async function refreshMoveExportSchedules(): Promise<void> {
    try {
      const { storage: schedulerStorage } = await import("./storage");
      const { runMoveExportSchedule } = await import("./services/moveExportService");
      const schedules = await schedulerStorage.getAllEnabledMoveExportSchedules();

      // Stop tasks for removed/disabled schedules
      const activeIds = new Set(schedules.map((s: any) => s.id));
      for (const [id, task] of registeredExportTasks.entries()) {
        if (!activeIds.has(id)) {
          task.stop();
          registeredExportTasks.delete(id);
          console.log(`[Scheduler] Removed move export task id=${id}`);
        }
      }

      // Register new schedules
      for (const schedule of schedules) {
        if (registeredExportTasks.has(schedule.id)) continue;
        if (!cron.validate(schedule.cronExpression)) {
          console.warn(`[Scheduler] Invalid cron expression for move export "${schedule.name}": ${schedule.cronExpression}`);
          continue;
        }
        const task = cron.schedule(schedule.cronExpression, async () => {
          console.log(`[Scheduler] Firing move export schedule "${schedule.name}" (id=${schedule.id})`);
          try {
            const result = await runMoveExportSchedule(schedule);
            console.log(`[Scheduler] Move export "${schedule.name}": status=${result.status}, rows=${result.rowCount}`);
          } catch (err: any) {
            console.error(`[Scheduler] Move export "${schedule.name}" failed:`, err?.message);
          }
        }, { timezone: schedule.timezone ?? "America/Chicago" });
        registeredExportTasks.set(schedule.id, task);
        console.log(`[Scheduler] Registered move export schedule "${schedule.name}" cron="${schedule.cronExpression}"`);
      }
    } catch (err: any) {
      console.error("[Scheduler] Move export schedule refresh failed:", err?.message);
    }
  }

  // Initial registration at startup (after 5s to let DB settle)
  setTimeout(refreshMoveExportSchedules, 5000);

  // Nightly refresh at 2:05 AM to pick up any new/changed schedules
  cron.schedule("5 2 * * *", refreshMoveExportSchedules, { timezone: "America/Chicago" });
  console.log("[Scheduler] Move export schedules: initial registration at startup + nightly refresh at 2:05 AM CST");
}

export function stopScheduler(): void {
  if (riskScoreDecayJob) {
    riskScoreDecayJob.stop();
    riskScoreDecayJob = null;
  }
  if (pendingActivationJob) {
    pendingActivationJob.stop();
    console.log("[Scheduler] Stopped pending activation job");
  }
  if (hubspotSyncJob) {
    hubspotSyncJob.stop();
    console.log("[Scheduler] Stopped HubSpot sync job");
  }
  if (healthRecalcJob) {
    healthRecalcJob.stop();
    console.log("[Scheduler] Stopped health recalculation job");
  }
  if (playbookEvalJob) {
    playbookEvalJob.stop();
    console.log("[Scheduler] Stopped playbook evaluation job");
  }
  if (overrideExpirationJob) {
    overrideExpirationJob.stop();
    console.log("[Scheduler] Stopped health override expiration job");
  }
  if (invoiceReminderJob) {
    invoiceReminderJob.stop();
    console.log("[Scheduler] Stopped invoice reminder job");
  }
  if (autopayDueDateJob) {
    autopayDueDateJob.stop();
    console.log("[Scheduler] Stopped autopay due date job");
  }
  if (lateFeeProcessingJob) {
    lateFeeProcessingJob.stop();
    console.log("[Scheduler] Stopped late fee processing job");
  }
  if (nudgeScanJob) {
    nudgeScanJob.stop();
    console.log("[Scheduler] Stopped nudge scan job");
  }
  if (contractExpirationJob) {
    contractExpirationJob.stop();
    console.log("[Scheduler] Stopped contract expiration job");
  }
  if (driverNeedsUpdateJob) {
    driverNeedsUpdateJob.stop();
    console.log("[Scheduler] Stopped driver needs-update evaluation job");
  }
  if (otAlertScanJob) {
    otAlertScanJob.stop();
    console.log("[Scheduler] Stopped OT alert scan job");
  }
  if (amrAgingScanJob) {
    amrAgingScanJob.stop();
    console.log("[Scheduler] Stopped AMR aging scan job");
  }
  if (reconciliationJob) {
    reconciliationJob.stop();
    console.log("[Scheduler] Stopped financial reconciliation job");
  }
}

export function getSchedulerStatus(): {
  hubspotSync: {
    enabled: boolean;
    schedule: string;
    timezone: string;
    nextRun?: string;
  };
  healthRecalculation: {
    enabled: boolean;
    schedule: string;
    timezone: string;
  };
  playbookEvaluation: {
    enabled: boolean;
    schedule: string;
    timezone: string;
  };
  overrideExpiration: {
    enabled: boolean;
    schedule: string;
    timezone: string;
  };
  invoiceReminders: {
    enabled: boolean;
    schedule: string;
    timezone: string;
  };
  nudgeScan: {
    enabled: boolean;
    schedule: string;
    timezone: string;
  };
  contractExpiration: {
    enabled: boolean;
    schedule: string;
    timezone: string;
  };
  driverNeedsUpdate: {
    enabled: boolean;
    schedule: string;
    timezone: string;
  };
} {
  return {
    weekendMondayReminder: {
      enabled: weekendMondayReminderJob !== null,
      schedule: "2:00 PM CST Saturdays",
      timezone: "America/Chicago",
    },
    hubspotSync: {
      enabled: hubspotSyncJob !== null,
      schedule: "4:00 AM CST daily",
      timezone: "America/Chicago",
    },
    healthRecalculation: {
      enabled: healthRecalcJob !== null,
      schedule: "2:00 AM CST daily",
      timezone: "America/Chicago",
    },
    playbookEvaluation: {
      enabled: playbookEvalJob !== null,
      schedule: "3:00 AM CST daily",
      timezone: "America/Chicago",
    },
    overrideExpiration: {
      enabled: overrideExpirationJob !== null,
      schedule: "1:00 AM CST daily",
      timezone: "America/Chicago",
    },
    invoiceReminders: {
      enabled: invoiceReminderJob !== null,
      schedule: "8:00 AM CST daily",
      timezone: "America/Chicago",
    },
    nudgeScan: {
      enabled: nudgeScanJob !== null,
      schedule: "9:00 AM, 2:00 PM CST daily",
      timezone: "America/Chicago",
    },
    contractExpiration: {
      enabled: contractExpirationJob !== null,
      schedule: "Midnight CST daily",
      timezone: "America/Chicago",
    },
    driverNeedsUpdate: {
      enabled: driverNeedsUpdateJob !== null,
      schedule: "2:30 AM CST daily",
      timezone: "America/Chicago",
    },
    financialReconciliation: {
      enabled: reconciliationJob !== null,
      schedule: "3:00 AM CST daily",
      timezone: "America/Chicago",
    },
    leaveAlertScan: {
      enabled: leaveAlertScanJob !== null,
      schedule: "6:00 AM CST daily",
      timezone: "America/Chicago",
    },
  };
}
