/**
 * Invoice Assembly Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic engine that converts staged billable charges into structured
 * invoices. Implements all rules from the EPIC 1 — Invoice Creation spec.
 *
 * Two operating modes:
 *   • Preview (dryRun=true)  – no DB writes; returns proposed structure
 *   • Commit  (dryRun=false) – creates/updates draft invoice + links charges
 *
 * Both modes use identical grouping, eligibility, and totalling logic.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── Public Types ──────────────────────────────────────────────────────────────

export interface AssemblyOptions {
  /** Customer IDs that have been admin-overridden (errors suppressed) */
  overriddenAccounts?: string[];
  cycleStart: string;         // YYYY-MM-DD inclusive
  cycleEnd: string;           // YYYY-MM-DD inclusive
  dryRun: boolean;
  createdBy: string;
  customerIds?: string[];     // if set, limit to these customers
  tenantId?: string;
  invoiceDateOverride?: string; // YYYY-MM-DD; defaults to cycleEnd
  paymentTermsDays?: number;    // defaults to 30
}

export interface ExcludedCharge {
  chargeId: string;
  chargeDate: string;
  description: string;
  amount: number;
  reason: string;
  customerId: string;
}

export interface AssemblyLinePreview {
  groupingKey: string;
  productId: string;
  productName: string;
  revenueCategory: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  chargeIds: string[];
  serviceDateRange: { start: string; end: string };
}

export interface AccountAssemblyResult {
  customerId: string;
  customerName: string;
  status: "created" | "appended" | "skipped" | "error" | "preview";
  invoiceId?: string;
  invoiceNumber?: string;
  includedCharges: number;
  excludedCharges: number;
  lineCount: number;
  subtotal: number;
  lines: AssemblyLinePreview[];
  exclusions: ExcludedCharge[];
  validationErrors: string[];
}

export interface AssemblyRunResult {
  dryRun: boolean;
  cycleStart: string;
  cycleEnd: string;
  invoiceDate: string;
  accountsProcessed: number;
  invoicesCreated: number;
  invoicesAppended: number;
  invoicesSkipped: number;
  totalChargesIncluded: number;
  totalChargesExcluded: number;
  totalAmount: number;
  results: AccountAssemblyResult[];
  globalValidationErrors: string[];
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface RawCharge {
  id: string;
  customerId: string;
  customerName: string;
  productId: string | null;
  productName: string | null;
  revenueCategory: string | null;
  chargeDate: string;
  quantity: string;
  unitRate: string;
  amount: string;
  billingStatus: string;
  chargeStatus: string | null;
  invoiceId: string | null;
  description: string;
}

interface GroupAccumulator {
  key: string;
  productId: string;
  productName: string;
  revenueCategory: string;
  rate: number;
  quantity: number;
  amount: number;
  chargeIds: string[];
  minDate: string;
  maxDate: string;
}

// ─── Revenue category mapping ──────────────────────────────────────────────────

/**
 * Normalise any raw revenue_category value into one of the four canonical
 * invoice sections: labor | moves | rideshare | fees | other
 */
function classifyCategory(raw: string | null | undefined): string {
  if (!raw) return "other";
  const r = raw.toLowerCase().trim();
  if (r === "labor") return "labor";
  if (r === "moves" || r === "move") return "moves";
  if (r === "rideshare") return "rideshare";
  if (["fees", "fee", "insurance", "technology", "surcharge"].includes(r)) return "fees";
  return "fees"; // all unrecognised non-labor non-moves non-rideshare → fees section
}

/**
 * Map the canonical revenue category to the invoice_line_items.category enum.
 * Enum values: service | mileage | fee | surcharge | late_fee | bad_debt | other
 */
function toLineItemCategory(category: string): string {
  if (category === "fees") return "fee";
  if (category === "other") return "other";
  return "service"; // labor, moves, rideshare
}

const CATEGORY_ORDER: Record<string, number> = { labor: 1, moves: 2, rideshare: 3, fees: 4, other: 5 };

// ─── Date & currency helpers ───────────────────────────────────────────────────

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNum(v: any): number {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Line description generation (Spec §8) ────────────────────────────────────

function buildLineDescription(
  productName: string,
  category: string,
  quantity: number,
  cycleStart: string,
  cycleEnd: string,
): string {
  switch (category) {
    case "labor":
      return `${productName} — ${fmtDate(cycleStart)} to ${fmtDate(cycleEnd)}`;
    case "moves":
      return `${productName} — ${Math.round(quantity)} completed move${Math.round(quantity) !== 1 ? "s" : ""}`;
    case "rideshare":
      return `${productName} — ${Math.round(quantity)} trip${Math.round(quantity) !== 1 ? "s" : ""}`;
    default:
      return productName; // fees — just the product name
  }
}

// ─── Eligibility check (Spec §2) ──────────────────────────────────────────────

function checkEligibility(
  c: RawCharge,
  cycleStart: string,
  cycleEnd: string,
): { eligible: boolean; reason?: string } {
  if (c.billingStatus !== "unbilled") {
    return { eligible: false, reason: `Billing status is '${c.billingStatus}' (must be 'unbilled')` };
  }
  if (!c.customerId) {
    return { eligible: false, reason: "Missing account (customer_id is null)" };
  }
  if (!c.productId) {
    return { eligible: false, reason: "Missing product_id — assign a product before assembling" };
  }
  if (toNum(c.amount) <= 0) {
    return { eligible: false, reason: `Amount must be > 0 (got ${c.amount})` };
  }
  if (toNum(c.quantity) <= 0) {
    return { eligible: false, reason: `Quantity must be > 0 (got ${c.quantity})` };
  }
  if (toNum(c.unitRate) <= 0) {
    return { eligible: false, reason: `Unit rate must be > 0 (got ${c.unitRate})` };
  }
  const cd = c.chargeDate?.slice(0, 10) ?? "";
  if (!cd || cd < cycleStart || cd > cycleEnd) {
    return { eligible: false, reason: `Charge date ${cd} is outside billing cycle (${cycleStart} → ${cycleEnd})` };
  }
  if (c.invoiceId) {
    return { eligible: false, reason: `Already linked to invoice ${c.invoiceId}` };
  }
  if (c.chargeStatus === "voided" || c.chargeStatus === "cancelled") {
    return { eligible: false, reason: `Charge status is '${c.chargeStatus}'` };
  }
  return { eligible: true };
}

// ─── Grouping logic (Spec §7) ─────────────────────────────────────────────────

function buildGroupingKey(productId: string, category: string, rate: number): string {
  // Fees: group by product only — do not merge distinct fee products
  if (category === "fees") return `fees:${productId}`;
  // Labor, Moves, Rideshare: split by product + rate
  return `${category}:${productId}:${rate.toFixed(4)}`;
}

function groupCharges(charges: RawCharge[]): GroupAccumulator[] {
  const groups = new Map<string, GroupAccumulator>();
  for (const c of charges) {
    const category = classifyCategory(c.revenueCategory);
    const rate = toNum(c.unitRate);
    const key = buildGroupingKey(c.productId!, category, rate);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        productId: c.productId!,
        productName: c.productName || c.productId!,
        revenueCategory: category,
        rate,
        quantity: 0,
        amount: 0,
        chargeIds: [],
        minDate: c.chargeDate.slice(0, 10),
        maxDate: c.chargeDate.slice(0, 10),
      });
    }
    const g = groups.get(key)!;
    g.quantity = round2(g.quantity + toNum(c.quantity));
    g.amount = round2(g.amount + toNum(c.amount));
    g.chargeIds.push(c.id);
    const cd = c.chargeDate.slice(0, 10);
    if (cd < g.minDate) g.minDate = cd;
    if (cd > g.maxDate) g.maxDate = cd;
  }

  return Array.from(groups.values()).sort((a, b) => {
    const co = (CATEGORY_ORDER[a.revenueCategory] ?? 9) - (CATEGORY_ORDER[b.revenueCategory] ?? 9);
    if (co !== 0) return co;
    return a.productName.localeCompare(b.productName);
  });
}

// ─── Invoice number generation ────────────────────────────────────────────────

async function generateInvoiceNumber(customerId: string, cycleEnd: string): Promise<string> {
  const base = `INV-WK-${cycleEnd.replace(/-/g, "")}-${customerId.slice(0, 6).toUpperCase()}`;
  const rows = ((await db.execute(sql`
    SELECT invoice_number FROM invoices
    WHERE invoice_number LIKE ${base + "%"}
    ORDER BY invoice_number
    LIMIT 20
  `)) as any).rows as any[];

  const taken = new Set((rows as any[]).map((r) => r.invoice_number as string));
  if (!taken.has(base)) return base;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

// ─── Core assembly engine (Spec §2–§15) ───────────────────────────────────────

export async function runAssembly(opts: AssemblyOptions): Promise<AssemblyRunResult> {
  const { cycleStart, cycleEnd, dryRun, createdBy, tenantId, customerIds, overriddenAccounts } = opts;
  const overrideSet = new Set<string>(overriddenAccounts ?? []);
  const paymentTermsDays = opts.paymentTermsDays ?? 30;
  const invoiceDate = opts.invoiceDateOverride ?? cycleEnd;
  const dueDate = addDays(invoiceDate, paymentTermsDays);
  const globalValidationErrors: string[] = [];

  // ── Fetch all charges in cycle window ────────────────────────────────────────
  // We pull ALL statuses so we can report exclusions accurately.
  const chargeQuery = sql`
    SELECT
      bc.id,
      bc.customer_id        AS "customerId",
      bc.product_id         AS "productId",
      bc.charge_date::text  AS "chargeDate",
      bc.quantity::text     AS "quantity",
      bc.unit_rate::text    AS "unitRate",
      bc.amount::text       AS "amount",
      bc.billing_status     AS "billingStatus",
      bc.status             AS "chargeStatus",
      bc.invoice_id         AS "invoiceId",
      bc.description,
      COALESCE(bc.revenue_category, p.revenue_category) AS "revenueCategory",
      COALESCE(c.customer_name, 'Unknown')              AS "customerName",
      COALESCE(p.name, bc.product_id)                   AS "productName"
    FROM billable_charges bc
    JOIN customers c ON c.id = bc.customer_id
    LEFT JOIN products p ON p.id = bc.product_id
    WHERE bc.charge_date::date >= ${cycleStart}::date
      AND bc.charge_date::date <= ${cycleEnd}::date
      ${
        customerIds?.length
          ? sql`AND bc.customer_id = ANY(ARRAY[${sql.join(
              customerIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::text[])`
          : sql``
      }
      ${
        tenantId
          ? sql`AND (bc.tenant_id = ${tenantId} OR bc.tenant_id IS NULL)`
          : sql``
      }
    ORDER BY bc.customer_id, bc.charge_date, bc.id
  `;

  const rawRows = ((await db.execute(chargeQuery)) as any).rows as any[];

  const allCharges: RawCharge[] = rawRows.map((r: any) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: r.customerName,
    productId: r.productId ?? null,
    productName: r.productName ?? null,
    revenueCategory: r.revenueCategory ?? null,
    chargeDate: (r.chargeDate ?? "").slice(0, 10),
    quantity: r.quantity ?? "0",
    unitRate: r.unitRate ?? "0",
    amount: r.amount ?? "0",
    billingStatus: r.billingStatus ?? "unbilled",
    chargeStatus: r.chargeStatus ?? null,
    invoiceId: r.invoiceId ?? null,
    description: r.description ?? "",
  }));

  // Group by customer
  const byCustomer = new Map<string, RawCharge[]>();
  for (const c of allCharges) {
    if (!byCustomer.has(c.customerId)) byCustomer.set(c.customerId, []);
    byCustomer.get(c.customerId)!.push(c);
  }

  const results: AccountAssemblyResult[] = [];
  let totalCreated = 0;
  let totalAppended = 0;
  let totalSkipped = 0;
  let totalIncluded = 0;
  let totalExcluded = 0;
  let totalAmount = 0;

  for (const [customerId, charges] of byCustomer) {
    const customerName = charges[0]?.customerName ?? "Unknown";
    const eligible: RawCharge[] = [];
    const excluded: ExcludedCharge[] = [];
    const validationErrors: string[] = [];

    // ── Eligibility pass ───────────────────────────────────────────────────────
    for (const c of charges) {
      const check = checkEligibility(c, cycleStart, cycleEnd);
      if (check.eligible) {
        eligible.push(c);
      } else {
        excluded.push({
          chargeId: c.id,
          chargeDate: c.chargeDate,
          description: c.description,
          amount: toNum(c.amount),
          reason: check.reason!,
          customerId,
        });
      }
    }

    totalExcluded += excluded.length;

    if (eligible.length === 0) {
      totalSkipped++;
      results.push({
        customerId,
        customerName,
        status: "skipped",
        includedCharges: 0,
        excludedCharges: excluded.length,
        lineCount: 0,
        subtotal: 0,
        lines: [],
        exclusions: excluded,
        validationErrors: excluded.length > 0 ? [] : ["No charges found in this billing cycle"],
      });
      continue;
    }

    // ── Grouping ───────────────────────────────────────────────────────────────
    const groups = groupCharges(eligible);

    const lines: AssemblyLinePreview[] = groups.map((g) => ({
      groupingKey: g.key,
      productId: g.productId,
      productName: g.productName,
      revenueCategory: g.revenueCategory,
      description: buildLineDescription(g.productName, g.revenueCategory, g.quantity, cycleStart, cycleEnd),
      quantity: g.quantity,
      rate: g.rate,
      amount: round2(g.amount),
      chargeIds: g.chargeIds,
      serviceDateRange: { start: g.minDate, end: g.maxDate },
    }));

    // ── Total validation ───────────────────────────────────────────────────────
    const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
    const chargeTotal = round2(eligible.reduce((s, c) => s + toNum(c.amount), 0));
    if (Math.abs(subtotal - chargeTotal) > 0.02) {
      validationErrors.push(
        `Total mismatch: grouped lines sum to ${subtotal.toFixed(2)} but raw charge sum is ${chargeTotal.toFixed(2)}`,
      );
    }

    if (validationErrors.length > 0 && !overrideSet.has(customerId)) {
      results.push({
        customerId,
        customerName,
        status: "error",
        includedCharges: eligible.length,
        excludedCharges: excluded.length,
        lineCount: lines.length,
        subtotal,
        lines,
        exclusions: excluded,
        validationErrors,
      });
      continue;
    }

    // ── Preview mode ───────────────────────────────────────────────────────────
    if (dryRun) {
      results.push({
        customerId,
        customerName,
        status: "preview",
        includedCharges: eligible.length,
        excludedCharges: excluded.length,
        lineCount: lines.length,
        subtotal,
        lines,
        exclusions: excluded,
        validationErrors: [],
      });
      totalIncluded += eligible.length;
      totalAmount += subtotal;
      continue;
    }

    // ── Commit mode ────────────────────────────────────────────────────────────
    // Check for an existing draft/approved invoice for this account + cycle
    const existingRows = ((await db.execute(sql`
      SELECT id, invoice_number,
             subtotal_amount::numeric AS subtotal_amount,
             total_amount::numeric    AS total_amount
      FROM invoices
      WHERE customer_id         = ${customerId}
        AND status              IN ('draft', 'approved')
        AND billing_period_start = ${cycleStart}::date
        AND billing_period_end   = ${cycleEnd}::date
      ORDER BY created_at ASC
      LIMIT 1
    `)) as any).rows as any[];

    let invoiceId: string;
    let invoiceNumber: string;
    let action: "created" | "appended";

    if (existingRows.length > 0) {
      // ── Append to existing draft ─────────────────────────────────────────────
      const existing = existingRows[0] as any;
      invoiceId = existing.id;
      invoiceNumber = existing.invoice_number;
      action = "appended";

      // Find max existing line number
      const maxLnRow = ((await db.execute(sql`
        SELECT COALESCE(MAX(line_number), 0) AS max_ln
        FROM invoice_line_items
        WHERE invoice_id = ${invoiceId}
      `)) as any).rows[0] as any;
      let lineNumber = (toNum(maxLnRow.max_ln) as number) + 1;

      // Detect charges already linked to this invoice to prevent double-linking
      const alreadyLinkedRows = ((await db.execute(sql`
        SELECT id FROM billable_charges
        WHERE invoice_id = ${invoiceId}
      `)) as any).rows as any[];
      const alreadyLinked = new Set((alreadyLinkedRows as any[]).map((r) => r.id as string));

      for (const line of lines) {
        const newChargeIds = line.chargeIds.filter((id) => !alreadyLinked.has(id));
        if (newChargeIds.length === 0) continue; // all already linked — skip

        await db.execute(sql`
          INSERT INTO invoice_line_items (
            invoice_id, line_number, line_item_type, category,
            service_type, description, quantity, unit_price, total_price,
            charge_id, source_type, source_record_type,
            billing_period_start, billing_period_end, notes
          ) VALUES (
            ${invoiceId}, ${lineNumber++}, 'service',
            ${toLineItemCategory(line.revenueCategory)},
            'billable_charge_group',
            ${line.description},
            ${line.quantity}, ${line.rate}, ${line.amount},
            ${newChargeIds[0] ?? null},
            'billable_charge',
            'billable_charge_group',
            ${line.serviceDateRange.start}::date,
            ${line.serviceDateRange.end}::date,
            ${JSON.stringify({
              sourceChargeIds: newChargeIds,
              groupingKey: line.groupingKey,
              revenueCategory: line.revenueCategory,
            })}
          )
        `);
      }

      // Recalculate invoice totals
      const newSubtotal = round2(toNum(existing.subtotal_amount) + subtotal);
      await db.execute(sql`
        UPDATE invoices
        SET subtotal_amount = ${newSubtotal},
            total_amount    = ${newSubtotal},
            balance_due     = ${newSubtotal},
            updated_at      = NOW()
        WHERE id = ${invoiceId}
      `);
    } else {
      // ── Create new draft invoice ──────────────────────────────────────────────
      invoiceNumber = await generateInvoiceNumber(customerId, cycleEnd);
      action = "created";

      const invRows = ((await db.execute(sql`
        INSERT INTO invoices (
          customer_id, customer_name, invoice_number, status,
          invoice_date, due_date,
          billing_period_start, billing_period_end,
          subtotal_amount, total_amount, balance_due,
          created_by
        ) VALUES (
          ${customerId},
          ${customerName},
          ${invoiceNumber},
          'draft',
          ${invoiceDate}::date,
          ${dueDate}::date,
          ${cycleStart}::date,
          ${cycleEnd}::date,
          ${subtotal}, ${subtotal}, ${subtotal},
          ${createdBy}
        )
        RETURNING id
      `)) as any).rows as any[];

      invoiceId = invRows[0].id as string;

      // Insert invoice line items
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        await db.execute(sql`
          INSERT INTO invoice_line_items (
            invoice_id, line_number, line_item_type, category,
            service_type, description, quantity, unit_price, total_price,
            charge_id, source_type, source_record_type,
            billing_period_start, billing_period_end, notes
          ) VALUES (
            ${invoiceId}, ${i + 1}, 'service',
            ${toLineItemCategory(line.revenueCategory)},
            'billable_charge_group',
            ${line.description},
            ${line.quantity}, ${line.rate}, ${line.amount},
            ${line.chargeIds[0] ?? null},
            'billable_charge',
            'billable_charge_group',
            ${line.serviceDateRange.start}::date,
            ${line.serviceDateRange.end}::date,
            ${JSON.stringify({
              sourceChargeIds: line.chargeIds,
              groupingKey: line.groupingKey,
              revenueCategory: line.revenueCategory,
            })}
          )
        `);
      }
    }

    // ── Link charges to invoice ───────────────────────────────────────────────
    const eligibleIds = eligible.map((c) => c.id);
    await db.execute(sql`
      UPDATE billable_charges
      SET billing_status = 'billed',
          billed_at      = NOW(),
          invoice_id     = ${invoiceId},
          updated_at     = NOW()
      WHERE id = ANY(ARRAY[${sql.join(
        eligibleIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[])
        AND (invoice_id IS NULL OR invoice_id = ${invoiceId})
    `);

    if (action === "created") totalCreated++;
    else totalAppended++;
    totalIncluded += eligible.length;
    totalAmount += subtotal;

    results.push({
      customerId,
      customerName,
      status: action,
      invoiceId,
      invoiceNumber,
      includedCharges: eligible.length,
      excludedCharges: excluded.length,
      lineCount: lines.length,
      subtotal,
      lines,
      exclusions: excluded,
      validationErrors: [],
    });
  }

  return {
    dryRun,
    cycleStart,
    cycleEnd,
    invoiceDate,
    accountsProcessed: byCustomer.size,
    invoicesCreated: totalCreated,
    invoicesAppended: totalAppended,
    invoicesSkipped: totalSkipped,
    totalChargesIncluded: totalIncluded,
    totalChargesExcluded: totalExcluded,
    totalAmount: round2(totalAmount),
    results,
    globalValidationErrors,
  };
}
