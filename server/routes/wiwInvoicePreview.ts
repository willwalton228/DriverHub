/**
 * WIW Shift Invoice Preview & Generation
 * Mounted at /api/billing/wiw-invoice-preview
 *
 * GET  /        — preview shift data, flags, and billing rates for an account + date range
 * POST /generate — create a draft invoice with per-driver-per-date line items (straight time only)
 * GET  /pdf      — stream a branded PDF of the shift invoice
 *
 * BILLING LOGIC: Independent Contractors — straight time only.
 * ALL hours billed at the contracted rate. NO overtime calculation.
 * Bill Amount = Total Hours × Bill Rate  (one row per driver per date)
 */
import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  wiwShifts,
  wiwTimes,
  wiwUsers,
  wiwPositions,
  wiwLocationAccountMap,
  wiwLocations,
  customers,
  invoices,
  invoiceLineItems,
  accountProducts,
  products,
  accountServicePositions,
  accountServiceRates,
} from "@shared/schema";
import { eq, and, gte, lt, inArray, sql } from "drizzle-orm";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const TZ = "America/Chicago";

function minutesToHours(mins: number | null): number {
  if (!mins) return 0;
  return Math.round((mins / 60) * 100) / 100;
}

function formatTime(ts: Date | string | null, tz = TZ): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}

function formatDate(ts: Date | string | null, tz = TZ): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
}

function formatDateISO(ts: Date | string | null, tz = TZ): string {
  if (!ts) return "";
  // Render in Chicago time, return YYYY-MM-DD
  const d = new Date(ts);
  return d.toLocaleDateString("en-CA", { timeZone: tz }); // en-CA = YYYY-MM-DD
}

// ─── Core data loader ─────────────────────────────────────────────────────────

async function loadShiftData(accountId: string, startDate: string, endDate: string) {
  const start       = new Date(`${startDate}T00:00:00Z`);
  const endInclusive = new Date(`${endDate}T23:59:59Z`);

  // Account
  const [account] = await db
    .select({ id: customers.id, name: customers.customerName, number: customers.customerNumber, status: customers.status })
    .from(customers)
    .where(eq(customers.id, accountId))
    .limit(1);

  if (!account) return null;

  // Location mappings
  const locationMaps = await db
    .select({
      id: wiwLocationAccountMap.id,
      wiwLocationId: wiwLocationAccountMap.wiwLocationId,
      wiwLocationName: wiwLocationAccountMap.wiwLocationName,
      mappingStatus: wiwLocationAccountMap.mappingStatus,
    })
    .from(wiwLocationAccountMap)
    .where(eq(wiwLocationAccountMap.driverHubAccountId, accountId));

  const locationIds = locationMaps.map((m) => m.wiwLocationId).filter(Boolean) as string[];

  const locationDetails = locationIds.length
    ? await db.select({ id: wiwLocations.id, name: wiwLocations.name }).from(wiwLocations).where(inArray(wiwLocations.id, locationIds))
    : [];

  // Shifts (exclude deleted)
  const shiftRows = locationIds.length
    ? await db
        .select({
          id: wiwShifts.id,
          externalShiftId: wiwShifts.externalShiftId,
          startTime: wiwShifts.startTime,
          endTime: wiwShifts.endTime,
          scheduledMinutes: wiwShifts.scheduledMinutes,
          status: wiwShifts.status,
          wiwUserId: wiwShifts.wiwUserId,
          wiwPositionId: wiwShifts.wiwPositionId,
          wiwLocationId: wiwShifts.wiwLocationId,
        })
        .from(wiwShifts)
        .where(
          and(
            inArray(wiwShifts.wiwLocationId, locationIds),
            gte(wiwShifts.startTime, start),
            lt(wiwShifts.startTime, endInclusive),
          ),
        )
        .orderBy(wiwShifts.startTime)
    : [];

  const active = shiftRows.filter((s) => s.status !== "deleted");

  // Users + positions
  const userIds      = [...new Set(active.map((s) => s.wiwUserId).filter(Boolean))] as string[];
  const positionIds  = [...new Set(active.map((s) => s.wiwPositionId).filter(Boolean))] as string[];

  const [wiwUserRows, wiwPositionRows] = await Promise.all([
    userIds.length
      ? db.select({ id: wiwUsers.id, name: wiwUsers.name, email: wiwUsers.email, employeeCode: wiwUsers.employeeCode })
          .from(wiwUsers).where(inArray(wiwUsers.id, userIds))
      : [],
    positionIds.length
      ? db.select({ id: wiwPositions.id, name: wiwPositions.name }).from(wiwPositions).where(inArray(wiwPositions.id, positionIds))
      : [],
  ]);

  const userMap = Object.fromEntries(wiwUserRows.map((u) => [u.id, u]));
  const posMap  = Object.fromEntries(wiwPositionRows.map((p) => [p.id, p]));

  // Time records
  const acceptedIds = active.map((s) => s.id);
  let timeRows: Array<{
    wiw_shift_id: string;
    clock_in: string | null;
    clock_out: string | null;
    total_minutes: number | null;
    approval_status: string | null;
    approved_at: string | null;
  }> = [];

  if (acceptedIds.length) {
    const idList = sql.join(acceptedIds.map((id) => sql`${id}`), sql`, `);
    const result = await db.execute(
      sql`SELECT wiw_shift_id, clock_in, clock_out, total_minutes, approval_status, approved_at
          FROM wiw_times WHERE wiw_shift_id IN (${idList})`
    );
    timeRows = result.rows as typeof timeRows;
  }
  const timeByShift = Object.fromEntries(timeRows.map((t) => [t.wiw_shift_id, t]));

  // Configured bill rate from Services & Billing
  const serviceRateRows = await db
    .select({
      productName: products.name,
      positionName: accountServicePositions.positionName,
      billRate: accountServiceRates.billRate,
      rateType: accountServiceRates.rateType,
      billingUnit: accountServiceRates.billingUnit,
    })
    .from(accountProducts)
    .innerJoin(products, eq(products.id, accountProducts.productId))
    .leftJoin(accountServicePositions, eq(accountServicePositions.accountProductId, accountProducts.id))
    .leftJoin(
      accountServiceRates,
      and(eq(accountServiceRates.positionId, accountServicePositions.id), eq(accountServiceRates.isActive, true)),
    )
    .where(and(eq(accountProducts.customerId, accountId), eq(accountProducts.isActive, true)));

  const hasConfiguredRate = serviceRateRows.some((r) => r.billRate !== null && Number(r.billRate) > 0);
  const configuredBillRate = hasConfiguredRate
    ? Number(serviceRateRows.find((r) => r.billRate !== null)?.billRate ?? 0)
    : null;

  // ── Assemble per-shift rows (ONE ROW PER DRIVER PER DATE — straight time only) ──
  const shifts = active.map((shift) => {
    const user     = userMap[shift.wiwUserId ?? ""];
    const position = posMap[shift.wiwPositionId ?? ""];
    const time     = timeByShift[shift.id];

    const scheduledHrs = minutesToHours(shift.scheduledMinutes);
    // STRAIGHT TIME ONLY — no overtime calculation whatsoever
    const billableHrs  = time ? minutesToHours(time.total_minutes) : scheduledHrs;

    return {
      shiftId:        shift.id,
      date:           formatDate(shift.startTime),
      dateISO:        formatDateISO(shift.startTime),
      scheduledStart: formatTime(shift.startTime),
      scheduledEnd:   formatTime(shift.endTime),
      scheduledHrs,
      clockIn:        time ? formatTime(time.clock_in) : null,
      clockOut:       time ? formatTime(time.clock_out) : null,
      billableHrs,          // all billable at straight rate
      approvalStatus: time?.approval_status ?? null,
      hasTimeRecord:  !!time,
      driverName:     user?.name ?? "Unknown",
      employeeCode:   user?.employeeCode ?? null,
      positionName:   position?.name ?? "Shift Driver",
      locationName:   locationDetails.find((l) => l.id === shift.wiwLocationId)?.name ?? "Unknown",
    };
  });

  // Flags
  const flags: Array<{ type: string; code: string; message: string }> = [];
  if (!hasConfiguredRate) {
    flags.push({ type: "warning", code: "NO_CONFIGURED_RATE", message: "No bill rate configured for this account. Enter a rate below to calculate amounts." });
  }
  const missingTimes = shifts.filter((s) => !s.hasTimeRecord);
  if (missingTimes.length) {
    flags.push({ type: "info", code: "MISSING_TIME_RECORDS", message: `${missingTimes.length} shift(s) have no time record — using scheduled hours.` });
  }
  const unapproved = shifts.filter((s) => s.hasTimeRecord && s.approvalStatus !== "approved");
  if (unapproved.length) {
    flags.push({ type: "warning", code: "UNAPPROVED_TIMES", message: `${unapproved.length} time record(s) are not yet approved in WIW.` });
  }
  if (locationMaps.some((m) => m.mappingStatus !== "mapped")) {
    flags.push({ type: "info", code: "PARTIAL_MAPPING", message: "Some WIW locations for this account are not fully mapped." });
  }

  return {
    account,
    locationMaps: locationMaps.map((m) => ({
      ...m,
      locationName: locationDetails.find((l) => l.id === m.wiwLocationId)?.name,
    })),
    shifts,
    flags,
    configuredBillRate,
    hasConfiguredRate,
  };
}

// ─── GET /api/billing/wiw-invoice-preview ─────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;
    if (!accountId || !startDate || !endDate) {
      return res.status(400).json({ error: "MISSING_PARAMS", message: "accountId, startDate, and endDate are required." });
    }

    const data = await loadShiftData(accountId, startDate, endDate);
    if (!data) return res.status(404).json({ error: "ACCOUNT_NOT_FOUND", message: "Account not found." });

    if (!data.locationMaps.length) {
      return res.json({ ...data, shifts: [], flags: [{ type: "error", code: "NO_LOCATION_MAP", message: "No WIW location mapped to this account." }] });
    }

    res.json(data);
  } catch (err: any) {
    console.error("[WIW Shift Invoice] GET error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// ─── POST /api/billing/wiw-invoice-preview/generate ───────────────────────────
// Creates a draft invoice with ONE LINE ITEM PER DRIVER PER DATE.
// Straight time only — no OT.
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const {
      accountId,
      startDate,
      endDate,
      weekEnding,
      billRate,
      notes,
      dealerId = "9917",
      includeOnlyApproved = false,
    } = req.body as {
      accountId: string;
      startDate: string;
      endDate: string;
      weekEnding: string;
      billRate: number;
      notes?: string;
      dealerId?: string;
      includeOnlyApproved?: boolean;
    };

    if (!accountId || !startDate || !endDate || !weekEnding || !billRate) {
      return res.status(400).json({ error: "MISSING_PARAMS", message: "accountId, startDate, endDate, weekEnding, and billRate are required." });
    }

    const data = await loadShiftData(accountId, startDate, endDate);
    if (!data) return res.status(404).json({ error: "ACCOUNT_NOT_FOUND" });
    if (!data.locationMaps.length) return res.status(400).json({ error: "NO_LOCATION_MAP" });

    // Filter if needed
    const billable = includeOnlyApproved
      ? data.shifts.filter((s) => s.approvalStatus === "approved")
      : data.shifts;

    if (!billable.length) {
      return res.status(400).json({ error: "NO_BILLABLE_SHIFTS", message: "No billable shifts in this range." });
    }

    // Invoice number
    const [lastInv] = await db
      .select({ num: invoices.invoiceNumber })
      .from(invoices)
      .where(sql`invoice_number ~ '^INV-V1-[0-9]+$'`)
      .orderBy(sql`invoice_number DESC`)
      .limit(1);
    const maxSeq = lastInv?.num ? parseInt(lastInv.num.replace("INV-V1-", ""), 10) : 0;
    const invoiceNumber = `INV-V1-${String(maxSeq + 1).padStart(4, "0")}`;

    const invoiceDate = new Date().toISOString().slice(0, 10);
    const dueDate     = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Build one line per driver per date (straight time)
    const lineItems = billable.map((shift, i) => {
      const hrs = shift.billableHrs;
      const amt = Math.round(hrs * Number(billRate) * 100) / 100;
      return {
        driverName:  shift.driverName,
        date:        shift.dateISO,
        billableHrs: hrs,
        billRate:    Number(billRate),
        billAmount:  amt,
        position:    shift.positionName,
        startTime:   shift.clockIn ?? shift.scheduledStart,
        endTime:     shift.clockOut ?? shift.scheduledEnd,
        lineNumber:  (i + 1) * 10,
      };
    });

    const subtotal = Math.round(lineItems.reduce((s, l) => s + l.billAmount, 0) * 100) / 100;
    const sessionUser = (req as any).session?.userId ?? (req as any).user?.claims?.sub ?? null;

    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        customerId:         accountId,
        customerName:       data.account.name,
        invoiceDate,
        dueDate,
        billingPeriodStart: startDate,
        billingPeriodEnd:   weekEnding,
        paymentTerms:       "net_30",
        subtotalAmount:     String(subtotal),
        totalAmount:        String(subtotal),
        balanceDue:         String(subtotal),
        status:             "draft",
        internalNotes:      notes ?? null,
        notes:              `Shift invoice — Dealer ID ${dealerId} — week ending ${weekEnding}. Bill rate $${billRate}/hr. Straight time only (ICs).`,
        createdBy:          sessionUser,
        sourceReferenceId:  `wiw-shift-invoice:${accountId}:${startDate}:${endDate}`,
      })
      .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

    const lineItemValues = lineItems.map((l) => ({
      invoiceId:          invoice.id,
      lineNumber:         l.lineNumber,
      lineItemType:       "service" as const,
      description:        `${l.driverName} — ${l.date} — ${l.position} — ${l.startTime}–${l.endTime}`,
      quantity:           String(l.billableHrs),
      unitPrice:          String(l.billRate),
      totalPrice:         String(l.billAmount),
      dateOfService:      l.date,
      billingPeriodStart: startDate,
      billingPeriodEnd:   weekEnding,
      sourceRecordType:   "wiw_shift",
    }));

    if (lineItemValues.length) await db.insert(invoiceLineItems).values(lineItemValues);

    res.json({ success: true, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, subtotal, lineCount: lineItemValues.length });
  } catch (err: any) {
    console.error("[WIW Shift Invoice] POST /generate error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message, detail: (err as any).detail ?? null });
  }
});

// ─── GET /api/billing/wiw-invoice-preview/pdf ─────────────────────────────────
// Streams a branded Puppeteer PDF. Query params:
//   accountId, startDate, endDate, billRate, weekEnding, dealerId (optional)
router.get("/pdf", async (req: Request, res: Response) => {
  try {
    const { accountId, startDate, endDate, billRate, weekEnding, dealerId = "9917" } = req.query as Record<string, string>;
    if (!accountId || !startDate || !endDate || !billRate) {
      return res.status(400).json({ error: "MISSING_PARAMS", message: "accountId, startDate, endDate, and billRate are required." });
    }

    const data = await loadShiftData(accountId, startDate, endDate);
    if (!data) return res.status(404).json({ error: "ACCOUNT_NOT_FOUND" });

    const rate = Number(billRate);
    const shifts = data.shifts;

    const { generateWiwShiftInvoicePdf } = await import("../services/wiwShiftInvoicePdfService");

    const pdfBuffer = await generateWiwShiftInvoicePdf({
      invoiceNumber: `WIW-PREVIEW-${Date.now()}`,
      invoiceDate:   new Date().toISOString().slice(0, 10),
      dueDate:       new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      weekEnding:    weekEnding ?? endDate,
      dealerId,
      billRate:      rate,
      accountName:   data.account.name,
      shifts,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="shift-invoice-${startDate}-${endDate}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err: any) {
    console.error("[WIW Shift Invoice] PDF error:", err);
    res.status(500).json({ error: "PDF_FAILED", message: err.message });
  }
});

export default router;
