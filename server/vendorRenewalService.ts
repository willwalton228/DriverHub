import { db } from "./db";
import { vendors, vendorContracts, vendorRenewalAlerts, notifications, users } from "@shared/schema";
import { eq, and, sql, gte, lte, isNull, inArray, isNotNull, or, asc } from "drizzle-orm";
import { insertNotificationWithWPI } from "./services/notificationService";

export interface RenewalScanResult {
  renewalAlerts: number;
  cancellationAlerts: number;
  noticeDeadlineAlerts: number;
  autoRenewalRiskAlerts: number;
  notificationsSent: number;
  errors: number;
}

const NOTICE_THRESHOLDS = [120, 90, 60, 30, 14];

export async function scanVendorRenewals(): Promise<RenewalScanResult> {
  const result: RenewalScanResult = {
    renewalAlerts: 0,
    cancellationAlerts: 0,
    noticeDeadlineAlerts: 0,
    autoRenewalRiskAlerts: 0,
    notificationsSent: 0,
    errors: 0,
  };

  try {
    const activeVendors = await db
      .select({ vendor: vendors })
      .from(vendors)
      .where(and(eq(vendors.status, "active"), isNull(vendors.deletedAt)));

    for (const { vendor } of activeVendors) {
      try {
        const activeContracts = await db
          .select()
          .from(vendorContracts)
          .where(and(
            eq(vendorContracts.vendorId, vendor.id),
            eq(vendorContracts.contractStatus, "active"),
          ));

        const thresholdDays = vendor.renewalThresholdDays ?? 60;
        const today = new Date();

        for (const contract of activeContracts) {
          const endDate = new Date(contract.endDate);
          const daysUntilEnd = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          // --- Legacy: contract end date proximity alert ---
          if (daysUntilEnd >= 0 && daysUntilEnd <= thresholdDays) {
            const existing = await db
              .select({ id: vendorRenewalAlerts.id })
              .from(vendorRenewalAlerts)
              .where(and(
                eq(vendorRenewalAlerts.contractId, contract.id),
                eq(vendorRenewalAlerts.alertType, "renewal_due_soon"),
                eq(vendorRenewalAlerts.isDismissed, false),
              ))
              .limit(1);

            if (existing.length === 0) {
              await db.insert(vendorRenewalAlerts).values({
                vendorId: vendor.id,
                contractId: contract.id,
                alertType: "renewal_due_soon",
                daysRemaining: daysUntilEnd,
                contractEndDate: contract.endDate,
                notifiedUserId: vendor.vendorOwner,
              });
              result.renewalAlerts++;

              if (vendor.vendorOwner) {
                await insertNotificationWithWPI({
                  userId: vendor.vendorOwner,
                  type: "vendor_renewal",
                  title: `Vendor contract renewal due soon`,
                  message: `Contract "${contract.contractName}" for vendor "${vendor.name}" expires in ${daysUntilEnd} days (${new Date(contract.endDate).toLocaleDateString()}). Review and take action.`,
                  relatedEntityType: "vendor_contract",
                  relatedEntityId: contract.id,
                  priority: daysUntilEnd <= 30 ? "high" : "medium",
                });
                result.notificationsSent++;
              }
            } else {
              await db.update(vendorRenewalAlerts)
                .set({ daysRemaining: daysUntilEnd })
                .where(eq(vendorRenewalAlerts.id, existing[0].id));
            }
          }

          // --- Legacy: cancellation window alert ---
          if (contract.noticePeriodDays && contract.noticePeriodDays > 0) {
            const cancelDeadline = new Date(endDate);
            cancelDeadline.setDate(cancelDeadline.getDate() - contract.noticePeriodDays);
            const daysUntilCancel = Math.ceil((cancelDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntilCancel >= 0 && daysUntilCancel <= thresholdDays) {
              const existing = await db
                .select({ id: vendorRenewalAlerts.id })
                .from(vendorRenewalAlerts)
                .where(and(
                  eq(vendorRenewalAlerts.contractId, contract.id),
                  eq(vendorRenewalAlerts.alertType, "cancellation_window"),
                  eq(vendorRenewalAlerts.isDismissed, false),
                ))
                .limit(1);

              if (existing.length === 0) {
                await db.insert(vendorRenewalAlerts).values({
                  vendorId: vendor.id,
                  contractId: contract.id,
                  alertType: "cancellation_window",
                  daysRemaining: daysUntilCancel,
                  contractEndDate: contract.endDate,
                  notifiedUserId: vendor.vendorOwner,
                });
                result.cancellationAlerts++;

                if (vendor.vendorOwner) {
                  await insertNotificationWithWPI({
                    userId: vendor.vendorOwner,
                    type: "vendor_cancellation_window",
                    title: `Vendor contract cancellation window closing`,
                    message: `Contract "${contract.contractName}" for vendor "${vendor.name}" has a ${contract.noticePeriodDays}-day notice period. Cancellation deadline is in ${daysUntilCancel} days (${cancelDeadline.toLocaleDateString()}). Contract ends ${new Date(contract.endDate).toLocaleDateString()}.`,
                    relatedEntityType: "vendor_contract",
                    relatedEntityId: contract.id,
                    priority: daysUntilCancel <= 14 ? "critical" : "high",
                  });
                  result.notificationsSent++;
                }
              } else {
                await db.update(vendorRenewalAlerts)
                  .set({ daysRemaining: daysUntilCancel })
                  .where(eq(vendorRenewalAlerts.id, existing[0].id));
              }
            }
          }

          // --- NEW: notice_deadline_date threshold alerts (120/90/60/30/14 days) ---
          if (contract.noticeDeadlineDate) {
            const noticeDeadline = new Date(contract.noticeDeadlineDate);
            const daysUntilNotice = Math.ceil((noticeDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            for (const threshold of NOTICE_THRESHOLDS) {
              if (daysUntilNotice >= 0 && daysUntilNotice <= threshold) {
                const existing = await db
                  .select({ id: vendorRenewalAlerts.id })
                  .from(vendorRenewalAlerts)
                  .where(and(
                    eq(vendorRenewalAlerts.contractId, contract.id),
                    eq(vendorRenewalAlerts.alertType, "notice_deadline"),
                    eq(vendorRenewalAlerts.thresholdDays, threshold),
                    eq(vendorRenewalAlerts.isDismissed, false),
                  ))
                  .limit(1);

                if (existing.length === 0) {
                  const recipients: string[] = [];
                  if (vendor.vendorOwner) recipients.push(vendor.vendorOwner);
                  if (contract.renewalOwnerId && contract.renewalOwnerId !== vendor.vendorOwner) {
                    recipients.push(contract.renewalOwnerId);
                  }

                  await db.insert(vendorRenewalAlerts).values({
                    vendorId: vendor.id,
                    contractId: contract.id,
                    alertType: "notice_deadline",
                    daysRemaining: daysUntilNotice,
                    contractEndDate: contract.endDate,
                    thresholdDays: threshold,
                    notifiedUserId: recipients[0] ?? null,
                  });
                  result.noticeDeadlineAlerts++;

                  for (const recipientId of recipients) {
                    await insertNotificationWithWPI({
                      userId: recipientId,
                      type: "vendor_renewal",
                      title: `Notice deadline in ${daysUntilNotice} days — action required`,
                      message: `Contract "${contract.contractName}" (${vendor.name}) must have a renewal decision by ${noticeDeadline.toLocaleDateString()} — ${daysUntilNotice} days away. Current decision: ${contract.renewalDecisionStatus ?? "undecided"}.`,
                      relatedEntityType: "vendor_contract",
                      relatedEntityId: contract.id,
                      priority: daysUntilNotice <= 30 ? "critical" : "high",
                    });
                    result.notificationsSent++;
                  }
                }
                break; // only fire the smallest triggered threshold per contract
              }
            }
          }

          // --- NEW: auto_renewal_risk — autoRenew=true, no decision, within 60 days of notice deadline ---
          if (
            contract.autoRenew &&
            contract.noticeDeadlineDate &&
            (contract.renewalDecisionStatus ?? "undecided") === "undecided"
          ) {
            const noticeDeadline = new Date(contract.noticeDeadlineDate);
            const daysUntilNotice = Math.ceil((noticeDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntilNotice >= 0 && daysUntilNotice <= 60) {
              const existing = await db
                .select({ id: vendorRenewalAlerts.id })
                .from(vendorRenewalAlerts)
                .where(and(
                  eq(vendorRenewalAlerts.contractId, contract.id),
                  eq(vendorRenewalAlerts.alertType, "auto_renewal_risk"),
                  eq(vendorRenewalAlerts.isDismissed, false),
                ))
                .limit(1);

              if (existing.length === 0) {
                await db.insert(vendorRenewalAlerts).values({
                  vendorId: vendor.id,
                  contractId: contract.id,
                  alertType: "auto_renewal_risk",
                  daysRemaining: daysUntilNotice,
                  contractEndDate: contract.endDate,
                  notifiedUserId: vendor.vendorOwner,
                });
                result.autoRenewalRiskAlerts++;

                if (vendor.vendorOwner) {
                  await insertNotificationWithWPI({
                    userId: vendor.vendorOwner,
                    type: "vendor_renewal",
                    title: `Auto-renewal risk: decision required in ${daysUntilNotice} days`,
                    message: `Contract "${contract.contractName}" (${vendor.name}) is set to auto-renew and no decision has been recorded. Notice deadline is ${noticeDeadline.toLocaleDateString()} — ${daysUntilNotice} days away. Log your renewal decision immediately.`,
                    relatedEntityType: "vendor_contract",
                    relatedEntityId: contract.id,
                    priority: "critical",
                  });
                  result.notificationsSent++;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`[VendorRenewal] Error processing vendor ${vendor.id}:`, err);
        result.errors++;
      }
    }
  } catch (err) {
    console.error("[VendorRenewal] Fatal error during renewal scan:", err);
    result.errors++;
  }

  return result;
}

export interface RenewalCalendarEntry {
  contractId: string;
  vendorId: string;
  vendorName: string;
  contractName: string;
  contractType: string;
  contractStatus: string;
  endDate: string;
  noticeDeadlineDate: string | null;
  autoRenewalDate: string | null;
  autoRenew: boolean;
  renewalDecisionStatus: string;
  renewalOwnerId: string | null;
  noticePeriodDays: number | null;
  renewalTermDays: number | null;
  daysUntilEnd: number;
  daysUntilNotice: number | null;
  isAutoRenewalRisk: boolean;
  isImmediateAction: boolean;
  openAlerts: number;
}

export async function getRenewalCalendar(horizonDays = 180): Promise<RenewalCalendarEntry[]> {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + horizonDays);
  const horizonStr = horizon.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  const rows = await db
    .select({
      contract: vendorContracts,
      vendorName: vendors.name,
    })
    .from(vendorContracts)
    .innerJoin(vendors, eq(vendorContracts.vendorId, vendors.id))
    .where(and(
      isNull(vendors.deletedAt),
      or(
        and(gte(vendorContracts.endDate, todayStr), lte(vendorContracts.endDate, horizonStr)),
        and(isNotNull(vendorContracts.noticeDeadlineDate), gte(vendorContracts.noticeDeadlineDate, todayStr), lte(vendorContracts.noticeDeadlineDate, horizonStr)),
        and(isNotNull(vendorContracts.autoRenewalDate), gte(vendorContracts.autoRenewalDate, todayStr), lte(vendorContracts.autoRenewalDate, horizonStr)),
      ),
      inArray(vendorContracts.contractStatus, ["active", "draft"]),
    ));

  const alertCounts = await db
    .select({
      contractId: vendorRenewalAlerts.contractId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(vendorRenewalAlerts)
    .where(eq(vendorRenewalAlerts.isDismissed, false))
    .groupBy(vendorRenewalAlerts.contractId);

  const alertMap = new Map(alertCounts.map(a => [a.contractId, a.cnt]));

  return rows.map(({ contract, vendorName }) => {
    const endDate = new Date(contract.endDate);
    const daysUntilEnd = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let daysUntilNotice: number | null = null;
    if (contract.noticeDeadlineDate) {
      const noticeDate = new Date(contract.noticeDeadlineDate);
      daysUntilNotice = Math.ceil((noticeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    const isAutoRenewalRisk =
      contract.autoRenew &&
      !!contract.noticeDeadlineDate &&
      (contract.renewalDecisionStatus ?? "undecided") === "undecided" &&
      daysUntilNotice !== null &&
      daysUntilNotice <= 60;

    const isImmediateAction =
      (daysUntilNotice !== null && daysUntilNotice <= 14) ||
      daysUntilEnd <= 14;

    return {
      contractId: contract.id,
      vendorId: contract.vendorId,
      vendorName,
      contractName: contract.contractName,
      contractType: contract.contractType,
      contractStatus: contract.contractStatus,
      endDate: contract.endDate,
      noticeDeadlineDate: contract.noticeDeadlineDate ?? null,
      autoRenewalDate: contract.autoRenewalDate ?? null,
      autoRenew: contract.autoRenew,
      renewalDecisionStatus: contract.renewalDecisionStatus ?? "undecided",
      renewalOwnerId: contract.renewalOwnerId ?? null,
      noticePeriodDays: contract.noticePeriodDays ?? null,
      renewalTermDays: contract.renewalTermDays ?? null,
      daysUntilEnd,
      daysUntilNotice,
      isAutoRenewalRisk,
      isImmediateAction,
      openAlerts: alertMap.get(contract.id) ?? 0,
    };
  }).sort((a, b) => {
    if (a.isImmediateAction !== b.isImmediateAction) return a.isImmediateAction ? -1 : 1;
    if (a.isAutoRenewalRisk !== b.isAutoRenewalRisk) return a.isAutoRenewalRisk ? -1 : 1;
    const aDays = a.daysUntilNotice ?? a.daysUntilEnd;
    const bDays = b.daysUntilNotice ?? b.daysUntilEnd;
    return aDays - bDays;
  });
}

export interface RenewalDashboardData {
  upcomingRenewals: RenewalCalendarEntry[];
  immediateAction: RenewalCalendarEntry[];
  autoRenewalRisk: RenewalCalendarEntry[];
  totalUpcoming: number;
  totalImmediate: number;
  totalRisk: number;
}

export async function getRenewalDashboard(): Promise<RenewalDashboardData> {
  const all = await getRenewalCalendar(180);
  const immediateAction = all.filter(c => c.isImmediateAction);
  const autoRenewalRisk = all.filter(c => c.isAutoRenewalRisk);
  const upcomingRenewals = all.filter(c => !c.isImmediateAction).slice(0, 10);

  return {
    upcomingRenewals,
    immediateAction,
    autoRenewalRisk,
    totalUpcoming: all.length,
    totalImmediate: immediateAction.length,
    totalRisk: autoRenewalRisk.length,
  };
}

export async function getVendorRenewalAlerts(vendorId: string) {
  return db
    .select()
    .from(vendorRenewalAlerts)
    .where(and(
      eq(vendorRenewalAlerts.vendorId, vendorId),
      eq(vendorRenewalAlerts.isDismissed, false),
    ))
    .orderBy(vendorRenewalAlerts.createdAt);
}

export async function dismissRenewalAlert(alertId: string, userId: string) {
  const [updated] = await db
    .update(vendorRenewalAlerts)
    .set({
      isDismissed: true,
      dismissedAt: new Date(),
      dismissedBy: userId,
    })
    .where(eq(vendorRenewalAlerts.id, alertId))
    .returning();
  return updated;
}
