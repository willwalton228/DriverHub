import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db";

const router = Router();
const EDITOR_EMAIL = "will@driverondemand.co";
const READ_ROLES = new Set(["admin", "corporate_admin", "super_user", "super_admin"]);
const unsupportedComponents = [
  "priority",
  "rush_emergency",
  "mileage",
  "repositioning",
  "minimum_move_charges",
  "hybrid_final_pricing",
] as const;

const id = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.union([z.string(), z.number()]).transform(String).refine(
  (value) => /^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/.test(value),
  "Must be a non-negative decimal with at most four decimal places",
);
const multiplier = z.union([z.string(), z.number()]).transform(String).refine(
  (value) => /^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(value) && Number(value) > 0,
  "Must be a positive decimal with at most four decimal places",
);

function normalizedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function canViewSalesPricing(user: any): boolean {
  const email = normalizedEmail(user?.email);
  return email === EDITOR_EMAIL || user?.corporateAccessAdmin === true ||
    READ_ROLES.has(String(user?.role || "").toLowerCase());
}

export function canEditSalesPricing(user: any): boolean {
  return normalizedEmail(user?.email) === EDITOR_EMAIL;
}

function decimalUnits(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale, "0").slice(0, scale) || "0");
}

export function multiplyMoney(rate: string, factor: string): string {
  const product = decimalUnits(rate, 4) * decimalUnits(factor, 4);
  const cents = (product + 500000n) / 1000000n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export type PricingRules = {
  shift_multiplier: string;
  dd_standard_multiplier: string;
  dd_preferred_multiplier: string;
  dd_preferred_plus_multiplier: string;
  preferred_threshold: number;
  preferred_plus_threshold: number;
  shift_opportunity_threshold: number;
  new_account_days: number;
};

export function calculatePricing(rate: string, serviceModel: "driverdash" | "drivershift", accountAgeDays: number, moves: number, rules: PricingRules) {
  if (serviceModel === "drivershift") {
    return {
      tier: "DriverShift",
      multiplier: rules.shift_multiplier,
      hourlyRate: multiplyMoney(rate, rules.shift_multiplier),
      nextTier: null,
      movesRequiredForNextTier: null,
      shiftOpportunity: moves >= rules.shift_opportunity_threshold,
    };
  }
  let tier = "Standard";
  let factor = rules.dd_standard_multiplier;
  let nextTier: string | null = "Preferred";
  let nextAt: number | null = rules.preferred_threshold;
  if (accountAgeDays >= rules.new_account_days) {
    if (moves >= rules.preferred_plus_threshold) {
      tier = "Preferred Plus";
      factor = rules.dd_preferred_plus_multiplier;
      nextTier = moves < rules.shift_opportunity_threshold ? "Shift Opportunity" : null;
      nextAt = moves < rules.shift_opportunity_threshold ? rules.shift_opportunity_threshold : null;
    } else if (moves >= rules.preferred_threshold) {
      tier = "Preferred";
      factor = rules.dd_preferred_multiplier;
      nextTier = "Preferred Plus";
      nextAt = rules.preferred_plus_threshold;
    }
  }
  return {
    tier,
    multiplier: factor,
    hourlyRate: multiplyMoney(rate, factor),
    nextTier,
    movesRequiredForNextTier: nextAt === null ? null : Math.max(0, nextAt - moves),
    shiftOpportunity: moves >= rules.shift_opportunity_threshold,
  };
}

async function currentUser(req: any) {
  const userId = req.session?.userId || req.user?.claims?.sub;
  const claimsEmail = normalizedEmail(req.user?.claims?.email);
  if (userId) {
    const found = await pool.query("SELECT id, email, role, corporate_access_admin AS \"corporateAccessAdmin\" FROM users WHERE id = $1 LIMIT 1", [userId]);
    if (found.rows[0]) return found.rows[0];
  }
  if (claimsEmail) {
    const found = await pool.query("SELECT id, email, role, corporate_access_admin AS \"corporateAccessAdmin\" FROM users WHERE lower(trim(email)) = $1 LIMIT 1", [claimsEmail]);
    if (found.rows[0]) return found.rows[0];
  }
  return null;
}

router.use(async (req: any, res: Response, next: NextFunction) => {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    if (!canViewSalesPricing(user)) return res.status(403).json({ error: "FORBIDDEN", message: "Sales pricing access required" });
    req.salesPricingUser = user;
    next();
  } catch (error) {
    next(error);
  }
});

function requireEditor(req: any, res: Response, next: NextFunction) {
  if (!canEditSalesPricing(req.salesPricingUser)) {
    return res.status(403).json({ error: "WILL_ONLY", message: "Only Will Walton may modify sales pricing" });
  }
  next();
}

async function rules() {
  const result = await pool.query(
    `SELECT * FROM sales_pricing_company_rule_versions
     WHERE status = 'published' AND effective_date <= CURRENT_DATE
     ORDER BY effective_date DESC, version DESC LIMIT 1`,
  );
  if (!result.rows[0]) throw new Error("No effective company pricing rules are configured");
  return result.rows[0] as PricingRules;
}

async function audit(client: any, user: any, action: string, data: {
  marketId?: string; oldValue?: unknown; newValue?: unknown; effectiveDate?: string;
  applicationMode?: string; affectedCount?: number;
}) {
  await client.query(
    `INSERT INTO sales_pricing_audit_log
      (action, actor_user_id, actor_email, market_id, old_value, new_value, effective_date, application_mode, affected_count)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`,
    [action, user.id, normalizedEmail(user.email), data.marketId || null,
      data.oldValue == null ? null : JSON.stringify(data.oldValue),
      data.newValue == null ? null : JSON.stringify(data.newValue),
      data.effectiveDate || null, data.applicationMode || null, data.affectedCount || 0],
  );
}

router.get("/authorization/status", (req: any, res) => {
  res.json({ canView: true, canEdit: canEditSalesPricing(req.salesPricingUser), editorPolicy: "normalized_email_exact_match" });
});

router.get("/markets", async (_req, res, next) => {
  try {
    const companyRules = await rules();
    const result = await pool.query(
      `SELECT m.*, r.id rate_version_id, r.shift_hourly_rate, r.effective_date rate_effective_date
       FROM sales_pricing_markets m
       LEFT JOIN LATERAL (
         SELECT * FROM sales_pricing_market_rate_versions rv
         WHERE rv.market_id=m.id AND rv.status='published' AND rv.effective_date <= CURRENT_DATE
         ORDER BY rv.effective_date DESC, rv.version DESC LIMIT 1
       ) r ON true ORDER BY m.name, m.state`,
    );
    res.json(result.rows.map((row) => ({
      ...row,
      calculatedRates: row.shift_hourly_rate ? {
        driverShift: multiplyMoney(row.shift_hourly_rate, companyRules.shift_multiplier),
        standard: multiplyMoney(row.shift_hourly_rate, companyRules.dd_standard_multiplier),
        preferred: multiplyMoney(row.shift_hourly_rate, companyRules.dd_preferred_multiplier),
        preferredPlus: multiplyMoney(row.shift_hourly_rate, companyRules.dd_preferred_plus_multiplier),
      } : null,
    })));
  } catch (e) { next(e); }
});

router.get("/markets/:id", async (req, res, next) => {
  try {
    const marketId = id.parse(req.params.id);
    const market = await pool.query("SELECT * FROM sales_pricing_markets WHERE id=$1", [marketId]);
    if (!market.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
    const history = await pool.query(
      "SELECT * FROM sales_pricing_market_rate_versions WHERE market_id=$1 ORDER BY effective_date DESC, version DESC", [marketId],
    );
    res.json({ ...market.rows[0], rateHistory: history.rows });
  } catch (e) { next(e); }
});

router.get("/company-rules", async (_req, res, next) => {
  try {
    const history = await pool.query("SELECT * FROM sales_pricing_company_rule_versions ORDER BY version DESC");
    res.json({ current: await rules(), history: history.rows, unsupportedComponents });
  } catch (e) { next(e); }
});

router.get("/audits", async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit);
    const result = await pool.query("SELECT * FROM sales_pricing_audit_log ORDER BY created_at DESC LIMIT $1", [limit]);
    res.json(result.rows);
  } catch (e) { next(e); }
});

async function candidates(marketId: string, asOfDate: string, executor: { query: (text: string, values?: any[]) => Promise<any> } = pool) {
  return executor.query(
    `SELECT c.id account_id, c.customer_name account_name, c.driver_model service_model,
            t.treatment, t.effective_date treatment_effective_date
     FROM customers c
     JOIN LATERAL (
       SELECT * FROM sales_pricing_account_treatments x
        WHERE x.account_id=c.id AND x.market_id=$1 AND x.effective_date <= $2::date
          AND x.ended_at IS NULL AND (x.expiration_date IS NULL OR x.expiration_date >= $2::date)
       ORDER BY x.effective_date DESC, x.created_at DESC LIMIT 1
     ) t ON true
     WHERE coalesce(c.is_deleted,false)=false AND coalesce(c.is_archived,false)=false
       AND lower(coalesce(c.status,'active'))='active'
      ORDER BY c.customer_name`, [marketId, asOfDate],
  );
}

router.get("/markets/:id/account-candidates", async (req, res, next) => {
  try {
    const asOfDate = req.query.effectiveDate ? isoDate.parse(req.query.effectiveDate) : new Date().toISOString().slice(0, 10);
    res.json((await candidates(id.parse(req.params.id), asOfDate)).rows);
  } catch (e) { next(e); }
});

router.get("/account-treatments", async (req, res, next) => {
  try {
    const accountId = req.query.accountId ? id.parse(req.query.accountId) : null;
    const marketId = req.query.marketId ? id.parse(req.query.marketId) : null;
    const result = await pool.query(
      `SELECT * FROM sales_pricing_account_treatments
       WHERE ($1::varchar IS NULL OR account_id=$1) AND ($2::varchar IS NULL OR market_id=$2)
       ORDER BY effective_date DESC, created_at DESC`, [accountId, marketId],
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

router.get("/account-overrides", async (req, res, next) => {
  try {
    const accountId = req.query.accountId ? id.parse(req.query.accountId) : null;
    const marketId = req.query.marketId ? id.parse(req.query.marketId) : null;
    const result = await pool.query(
      `SELECT *, false AS production_pricing_active FROM sales_pricing_account_overrides
       WHERE ($1::varchar IS NULL OR account_id=$1) AND ($2::varchar IS NULL OR market_id=$2)
       ORDER BY effective_date DESC, created_at DESC`, [accountId, marketId],
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

const previewSchema = z.object({
  marketRateVersionId: id,
  applicationMode: z.enum(["new_only", "all_eligible", "selected_existing"]),
  selectedAccountIds: z.array(id).default([]),
});
export const rateApplicationPublishSchema = previewSchema.extend({ explicitlyConfirmed: z.literal(true) });

async function buildPreview(
  input: z.infer<typeof previewSchema>,
  executor: { query: (text: string, values?: any[]) => Promise<any> } = pool,
) {
  const rate = await executor.query(
    `SELECT rv.*, m.name market_name FROM sales_pricing_market_rate_versions rv
     JOIN sales_pricing_markets m ON m.id=rv.market_id WHERE rv.id=$1`, [input.marketRateVersionId],
  );
  if (!rate.rows[0]) throw Object.assign(new Error("Rate version not found"), { status: 404 });
  const all = (await candidates(rate.rows[0].market_id, rate.rows[0].effective_date, executor)).rows;
  const eligible = all.filter((row) => row.treatment === "automatic");
  const selected = new Set(input.selectedAccountIds);
  if (input.applicationMode === "selected_existing") {
    const eligibleIds = new Set(eligible.map((row) => row.account_id));
    if (input.selectedAccountIds.some((accountId) => !eligibleIds.has(accountId))) {
      throw Object.assign(new Error("Selected accounts must be eligible automatic-treatment preview candidates"), { status: 400 });
    }
  } else if (input.selectedAccountIds.length) {
    throw Object.assign(new Error("selectedAccountIds is only valid for selected_existing"), { status: 400 });
  }
  const affected = input.applicationMode === "new_only" ? [] :
    input.applicationMode === "all_eligible" ? eligible : eligible.filter((row) => selected.has(row.account_id));
  return {
    rateVersion: rate.rows[0],
    activeAccounts: all.length,
    eligibleAccounts: eligible.length,
    contractLockedAccounts: all.filter((row) => row.treatment === "contract_locked").length,
    approvalRequiredAccounts: all.filter((row) => row.treatment === "approval_required").length,
    affectedAccounts: affected,
    affectedCount: affected.length,
    productionPricingMutation: false,
  };
}

router.post("/impact-preview", async (req, res, next) => {
  try { res.json(await buildPreview(previewSchema.parse(req.body))); } catch (e) { next(e); }
});

const calculatorSchema = z.object({
  marketId: id,
  serviceModel: z.enum(["driverdash", "drivershift"]),
  accountAgeDays: z.coerce.number().int().min(0),
  averageMonthlyCompletedMoves: z.coerce.number().int().min(0),
});
router.post("/calculator", async (req, res, next) => {
  try {
    const input = calculatorSchema.parse(req.body);
    const rate = await pool.query(
      `SELECT shift_hourly_rate FROM sales_pricing_market_rate_versions
       WHERE market_id=$1 AND status='published' AND effective_date <= CURRENT_DATE
       ORDER BY effective_date DESC, version DESC LIMIT 1`, [input.marketId],
    );
    if (!rate.rows[0]) return res.status(422).json({ error: "NO_EFFECTIVE_RATE", message: "Market has no effective published rate" });
    const companyRules = await rules();
    res.json({
      informationalOnly: true,
      shiftMarketRate: rate.rows[0].shift_hourly_rate,
      ...calculatePricing(rate.rows[0].shift_hourly_rate, input.serviceModel, input.accountAgeDays, input.averageMonthlyCompletedMoves, companyRules),
      shiftOpportunityThreshold: companyRules.shift_opportunity_threshold,
      unsupportedComponents,
    });
  } catch (e) { next(e); }
});

const marketSchema = z.object({
  name: z.string().trim().min(1).max(120),
  state: z.string().trim().length(2).transform((v) => v.toUpperCase()),
  status: z.enum(["active", "inactive"]).default("inactive"),
});
router.post("/markets", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const input = marketSchema.parse(req.body);
    await client.query("BEGIN");
    const created = await client.query(
      "INSERT INTO sales_pricing_markets(name,state,status,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING *",
      [input.name, input.state, input.status, req.salesPricingUser.id],
    );
    await audit(client, req.salesPricingUser, "market_created", { marketId: created.rows[0].id, newValue: created.rows[0] });
    await client.query("COMMIT");
    res.status(201).json(created.rows[0]);
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

router.patch("/markets/:id", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const marketId = id.parse(req.params.id);
    const input = marketSchema.partial().refine((v) => Object.keys(v).length > 0).parse(req.body);
    await client.query("BEGIN");
    const before = await client.query("SELECT * FROM sales_pricing_markets WHERE id=$1 FOR UPDATE", [marketId]);
    if (!before.rows[0]) throw Object.assign(new Error("Market not found"), { status: 404 });
    const updated = await client.query(
      `UPDATE sales_pricing_markets SET name=coalesce($2,name), state=coalesce($3,state),
       status=coalesce($4,status), updated_by=$5, updated_at=now() WHERE id=$1 RETURNING *`,
      [marketId, input.name || null, input.state || null, input.status || null, req.salesPricingUser.id],
    );
    await audit(client, req.salesPricingUser, "market_updated", { marketId, oldValue: before.rows[0], newValue: updated.rows[0] });
    await client.query("COMMIT"); res.json(updated.rows[0]);
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

const rateSchema = z.object({ shiftHourlyRate: money, effectiveDate: isoDate });
router.post("/markets/:id/rates", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const marketId = id.parse(req.params.id); const input = rateSchema.parse(req.body);
    await client.query("BEGIN");
    const market = await client.query("SELECT id FROM sales_pricing_markets WHERE id=$1 FOR UPDATE", [marketId]);
    if (!market.rows[0]) throw Object.assign(new Error("Market not found"), { status: 404 });
    const created = await client.query(
      `INSERT INTO sales_pricing_market_rate_versions(market_id,version,shift_hourly_rate,effective_date,status,created_by)
       SELECT $1,coalesce(max(version),0)+1,$2,$3,'draft',$4 FROM sales_pricing_market_rate_versions WHERE market_id=$1 RETURNING *`,
      [marketId, input.shiftHourlyRate, input.effectiveDate, req.salesPricingUser.id],
    );
    await audit(client, req.salesPricingUser, "rate_draft_created", { marketId, newValue: created.rows[0], effectiveDate: input.effectiveDate });
    await client.query("COMMIT"); res.status(201).json(created.rows[0]);
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

const ruleSchema = z.object({
  effectiveDate: isoDate, shiftMultiplier: multiplier, ddStandardMultiplier: multiplier,
  ddPreferredMultiplier: multiplier, ddPreferredPlusMultiplier: multiplier,
  preferredThreshold: z.number().int().min(0), preferredPlusThreshold: z.number().int().min(0),
  shiftOpportunityThreshold: z.number().int().min(0), newAccountDays: z.number().int().min(0),
}).refine((v) => v.preferredThreshold <= v.preferredPlusThreshold && v.preferredPlusThreshold <= v.shiftOpportunityThreshold,
  "Thresholds must be ascending");
router.post("/company-rules", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const input = ruleSchema.parse(req.body); await client.query("BEGIN");
    const old = await client.query("SELECT * FROM sales_pricing_company_rule_versions WHERE status='published' ORDER BY version DESC LIMIT 1 FOR UPDATE");
    const created = await client.query(
      `INSERT INTO sales_pricing_company_rule_versions
       (version,status,effective_date,shift_multiplier,dd_standard_multiplier,dd_preferred_multiplier,dd_preferred_plus_multiplier,
        preferred_threshold,preferred_plus_threshold,shift_opportunity_threshold,new_account_days,created_by,published_by,published_at)
       SELECT coalesce(max(version),0)+1,'published',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,now()
       FROM sales_pricing_company_rule_versions RETURNING *`,
      [input.effectiveDate,input.shiftMultiplier,input.ddStandardMultiplier,input.ddPreferredMultiplier,input.ddPreferredPlusMultiplier,
        input.preferredThreshold,input.preferredPlusThreshold,input.shiftOpportunityThreshold,input.newAccountDays,req.salesPricingUser.id],
    );
    await audit(client, req.salesPricingUser, "company_rules_created", { oldValue: old.rows[0], newValue: created.rows[0], effectiveDate: input.effectiveDate });
    await client.query("COMMIT"); res.status(201).json(created.rows[0]);
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

router.post("/rate-applications/preview", requireEditor, async (req, res, next) => {
  try { res.json(await buildPreview(previewSchema.parse(req.body))); } catch (e) { next(e); }
});
router.post("/rate-applications/publish", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const input = rateApplicationPublishSchema.parse(req.body);
    await client.query("BEGIN");
    const locked = await client.query("SELECT * FROM sales_pricing_market_rate_versions WHERE id=$1 FOR UPDATE", [input.marketRateVersionId]);
    if (!locked.rows[0] || locked.rows[0].status !== "draft") throw Object.assign(new Error("Only a draft rate may be published"), { status: 409 });
    const preview = await buildPreview(input, client);
    const application = await client.query(
      `INSERT INTO sales_pricing_rate_applications
       (market_rate_version_id,application_mode,explicitly_confirmed,confirmed_at,published_by,affected_count,preview_snapshot)
       VALUES($1,$2,true,now(),$3,$4,$5::jsonb) RETURNING *`,
      [input.marketRateVersionId,input.applicationMode,req.salesPricingUser.id,preview.affectedCount,JSON.stringify(preview)],
    );
    for (const account of preview.affectedAccounts) {
      await client.query(
        "INSERT INTO sales_pricing_rate_application_targets(application_id,account_id,treatment_snapshot) VALUES($1,$2,$3)",
        [application.rows[0].id, account.account_id, account.treatment],
      );
    }
    await client.query(
      "UPDATE sales_pricing_market_rate_versions SET status='published',published_by=$2,published_at=now() WHERE id=$1",
      [input.marketRateVersionId, req.salesPricingUser.id],
    );
    await client.query(
      "UPDATE sales_pricing_markets SET updated_by=$2,updated_at=now() WHERE id=$1",
      [locked.rows[0].market_id, req.salesPricingUser.id],
    );
    await audit(client, req.salesPricingUser, "rate_application_published", {
      marketId: locked.rows[0].market_id, newValue: application.rows[0],
      effectiveDate: locked.rows[0].effective_date, applicationMode: input.applicationMode, affectedCount: preview.affectedCount,
    });
    await client.query("COMMIT");
    res.status(201).json({ application: application.rows[0], productionPricingMutation: false });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

const treatmentSchema = z.object({
  accountId: id, marketId: id,
  treatment: z.enum(["automatic", "approval_required", "contract_locked"]),
  effectiveDate: isoDate, expirationDate: isoDate.nullable().optional(), notes: z.string().max(2000).optional(),
}).refine((value) => !value.expirationDate || value.expirationDate >= value.effectiveDate, {
  message: "Expiration date must be on or after effective date",
  path: ["expirationDate"],
});
async function assertNoTreatmentOverlap(client: any, accountId: string, marketId: string, effectiveDate: string, expirationDate: string | null, excludeId?: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`sales-pricing-treatment:${accountId}:${marketId}`]);
  const overlap = await client.query(
    `SELECT id FROM sales_pricing_account_treatments
     WHERE account_id=$1 AND market_id=$2 AND ended_at IS NULL
       AND ($5::varchar IS NULL OR id <> $5)
       AND daterange(effective_date, coalesce(expiration_date, 'infinity'::date), '[]')
           && daterange($3::date, coalesce($4::date, 'infinity'::date), '[]')
     LIMIT 1`,
    [accountId, marketId, effectiveDate, expirationDate, excludeId || null],
  );
  if (overlap.rows[0]) throw Object.assign(new Error("Treatment effective dates overlap an existing active treatment"), { status: 409 });
}
async function assertNoOverrideOverlap(client: any, accountId: string, marketId: string, effectiveDate: string, expirationDate: string | null, excludeId?: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`sales-pricing-override:${accountId}:${marketId}`]);
  const overlap = await client.query(
    `SELECT id FROM sales_pricing_account_overrides
     WHERE account_id=$1 AND market_id=$2 AND removed_at IS NULL
       AND ($5::varchar IS NULL OR id <> $5)
       AND daterange(effective_date, coalesce(expiration_date, 'infinity'::date), '[]')
           && daterange($3::date, coalesce($4::date, 'infinity'::date), '[]')
     LIMIT 1`,
    [accountId, marketId, effectiveDate, expirationDate, excludeId || null],
  );
  if (overlap.rows[0]) throw Object.assign(new Error("Override effective dates overlap an existing active override"), { status: 409 });
}
router.post("/account-treatments", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const input = treatmentSchema.parse(req.body); await client.query("BEGIN");
    await assertNoTreatmentOverlap(client, input.accountId, input.marketId, input.effectiveDate, input.expirationDate || null);
    const row = await client.query(
      `INSERT INTO sales_pricing_account_treatments
       (account_id,market_id,treatment,effective_date,expiration_date,notes,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [input.accountId,input.marketId,input.treatment,input.effectiveDate,input.expirationDate||null,input.notes||null,req.salesPricingUser.id],
    );
    await audit(client, req.salesPricingUser, "account_treatment_created", { marketId: input.marketId, newValue: row.rows[0], effectiveDate: input.effectiveDate });
    await client.query("COMMIT"); res.status(201).json(row.rows[0]);
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});
router.patch("/account-treatments/:id", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const treatmentId = id.parse(req.params.id);
    const changes = treatmentSchema.omit({ accountId: true, marketId: true }).parse(req.body);
    await client.query("BEGIN");
    const prior = await client.query(
      "SELECT * FROM sales_pricing_account_treatments WHERE id=$1 AND ended_at IS NULL FOR UPDATE", [treatmentId],
    );
    if (!prior.rows[0]) throw Object.assign(new Error("Active treatment not found"), { status: 404 });
    await assertNoTreatmentOverlap(client, prior.rows[0].account_id, prior.rows[0].market_id, changes.effectiveDate, changes.expirationDate || null, treatmentId);
    await client.query(
      "UPDATE sales_pricing_account_treatments SET ended_at=now(),ended_by=$2 WHERE id=$1", [treatmentId, req.salesPricingUser.id],
    );
    const row = await client.query(
      `INSERT INTO sales_pricing_account_treatments
       (account_id,market_id,treatment,effective_date,expiration_date,notes,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [prior.rows[0].account_id,prior.rows[0].market_id,changes.treatment,changes.effectiveDate,
        changes.expirationDate||null,changes.notes||null,req.salesPricingUser.id],
    );
    await audit(client, req.salesPricingUser, "account_treatment_replaced", {
      marketId: prior.rows[0].market_id, oldValue: prior.rows[0], newValue: row.rows[0], effectiveDate: changes.effectiveDate,
    });
    await client.query("COMMIT"); res.json(row.rows[0]);
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});
router.delete("/account-treatments/:id", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const treatmentId = id.parse(req.params.id); await client.query("BEGIN");
    const row = await client.query(
      "UPDATE sales_pricing_account_treatments SET ended_at=now(),ended_by=$2 WHERE id=$1 AND ended_at IS NULL RETURNING *",
      [treatmentId,req.salesPricingUser.id],
    );
    if (!row.rows[0]) throw Object.assign(new Error("Active treatment not found"), { status: 404 });
    await audit(client, req.salesPricingUser, "account_treatment_ended", { marketId: row.rows[0].market_id, oldValue: row.rows[0] });
    await client.query("COMMIT"); res.status(204).end();
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

const overrideSchema = z.object({
  accountId: id, marketId: id, overrideType: z.enum(["rate", "multiplier", "rate_and_multiplier"]),
  overrideRate: money.optional(), overrideMultiplier: multiplier.optional(), reason: z.string().trim().min(1).max(2000),
  effectiveDate: isoDate, expirationDate: isoDate.nullable().optional(),
}).refine((v) => v.overrideRate !== undefined || v.overrideMultiplier !== undefined, "A rate or multiplier is required")
  .refine((value) => !value.expirationDate || value.expirationDate >= value.effectiveDate, {
    message: "Expiration date must be on or after effective date",
    path: ["expirationDate"],
  });
const overrideUpdateSchema = z.object({
  overrideType: z.enum(["rate", "multiplier", "rate_and_multiplier"]).optional(),
  overrideRate: money.optional(),
  overrideMultiplier: multiplier.optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  effectiveDate: isoDate.optional(),
  expirationDate: isoDate.nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, "At least one field is required");
router.post("/account-overrides", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const input = overrideSchema.parse(req.body); await client.query("BEGIN");
    await assertNoOverrideOverlap(client, input.accountId, input.marketId, input.effectiveDate, input.expirationDate || null);
    const row = await client.query(
      `INSERT INTO sales_pricing_account_overrides
       (account_id,market_id,override_type,override_rate,override_multiplier,reason,effective_date,expiration_date,authorized_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [input.accountId,input.marketId,input.overrideType,input.overrideRate||null,input.overrideMultiplier||null,input.reason,
        input.effectiveDate,input.expirationDate||null,req.salesPricingUser.id],
    );
    await audit(client, req.salesPricingUser, "account_override_created_future_only", { marketId: input.marketId, newValue: row.rows[0], effectiveDate: input.effectiveDate });
    await client.query("COMMIT"); res.status(201).json({ ...row.rows[0], productionPricingActive: false });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});
router.patch("/account-overrides/:id", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const overrideId = id.parse(req.params.id);
    const changes = overrideUpdateSchema.parse(req.body);
    await client.query("BEGIN");
    const prior = await client.query(
      "SELECT * FROM sales_pricing_account_overrides WHERE id=$1 AND removed_at IS NULL FOR UPDATE", [overrideId],
    );
    if (!prior.rows[0]) throw Object.assign(new Error("Active override not found"), { status: 404 });
    const nextEffectiveDate = changes.effectiveDate ?? prior.rows[0].effective_date;
    const nextExpirationDate = changes.expirationDate === undefined ? prior.rows[0].expiration_date : changes.expirationDate;
    if (nextExpirationDate && nextExpirationDate < nextEffectiveDate) {
      throw Object.assign(new Error("Expiration date must be on or after effective date"), { status: 400 });
    }
    await assertNoOverrideOverlap(
      client,
      prior.rows[0].account_id,
      prior.rows[0].market_id,
      nextEffectiveDate,
      nextExpirationDate || null,
      overrideId,
    );
    const row = await client.query(
      `UPDATE sales_pricing_account_overrides SET
       override_type=coalesce($2,override_type), override_rate=coalesce($3,override_rate),
       override_multiplier=coalesce($4,override_multiplier), reason=coalesce($5,reason),
       effective_date=coalesce($6,effective_date), expiration_date=coalesce($7,expiration_date), updated_at=now()
       WHERE id=$1 RETURNING *`,
      [overrideId,changes.overrideType||null,changes.overrideRate||null,changes.overrideMultiplier||null,
        changes.reason||null,changes.effectiveDate||null,changes.expirationDate||null],
    );
    await audit(client, req.salesPricingUser, "account_override_updated_future_only", {
      marketId: prior.rows[0].market_id, oldValue: prior.rows[0], newValue: row.rows[0],
      effectiveDate: row.rows[0].effective_date,
    });
    await client.query("COMMIT"); res.json({ ...row.rows[0], productionPricingActive: false });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});
router.delete("/account-overrides/:id", requireEditor, async (req: any, res, next) => {
  const client = await pool.connect();
  try {
    const overrideId = id.parse(req.params.id); await client.query("BEGIN");
    const row = await client.query(
      "UPDATE sales_pricing_account_overrides SET removed_at=now(),updated_at=now() WHERE id=$1 AND removed_at IS NULL RETURNING *", [overrideId],
    );
    if (!row.rows[0]) throw Object.assign(new Error("Active override not found"), { status: 404 });
    await audit(client, req.salesPricingUser, "account_override_removed", { marketId: row.rows[0].market_id, oldValue: row.rows[0] });
    await client.query("COMMIT"); res.status(204).end();
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

router.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: "VALIDATION_ERROR", details: error.errors });
  if (error?.code === "23505") return res.status(409).json({ error: "CONFLICT", message: "A conflicting pricing record already exists" });
  res.status(error?.status || 500).json({ error: error?.status ? "REQUEST_ERROR" : "INTERNAL_ERROR", message: error?.message || "Sales pricing request failed" });
});

export default router;