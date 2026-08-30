import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { pool } from "../db";

const router = Router();
const VIEW_ROLES = new Set(["corporate_admin", "super_admin", "root_super_admin", "super_user"]);

const querySchema = z.object({
  market: z.string().trim().min(1).max(100),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  productId: z.string().trim().max(100).optional(),
  driverModel: z.string().trim().max(50).optional(),
  pricingModel: z.string().trim().max(50).optional(),
  rateType: z.string().trim().max(50).optional(),
  status: z.enum(["all", "active", "inactive"]).default("active"),
  pricingScope: z.enum(["all", "standard", "account_specific"]).default("all"),
  search: z.string().trim().max(200).optional(),
});

async function currentUser(req: any) {
  const userId = req.user?.claims?.sub || req.session?.userId;
  const claimsEmail = String(req.user?.claims?.email || "").trim().toLowerCase();
  if (userId) {
    const found = await pool.query(
      `SELECT id, email, role, corporate_access_admin AS "corporateAccessAdmin"
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    if (found.rows[0]) return found.rows[0];
  }
  if (claimsEmail) {
    const found = await pool.query(
      `SELECT id, email, role, corporate_access_admin AS "corporateAccessAdmin"
       FROM users WHERE lower(trim(email)) = $1 LIMIT 1`,
      [claimsEmail],
    );
    if (found.rows[0]) return found.rows[0];
  }
  return null;
}

export function canViewMarketPricingOverview(user: any): boolean {
  return user?.corporateAccessAdmin === true ||
    VIEW_ROLES.has(String(user?.role || "").trim().toLowerCase());
}

export function calculateConfiguredMargin(customerPrice: unknown, driverCost: unknown) {
  if (customerPrice == null || driverCost == null) return null;
  const price = Number(customerPrice);
  const cost = Number(driverCost);
  if (!Number.isFinite(price) || !Number.isFinite(cost)) return null;
  const dollars = price - cost;
  return {
    dollars: dollars.toFixed(2),
    percentage: price === 0 ? null : (dollars / price).toFixed(4),
  };
}

router.use(async (req: any, res: Response, next: NextFunction) => {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    if (!canViewMarketPricingOverview(user)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Corporate Admin or Super Admin access required" });
    }
    req.marketPricingOverviewUser = user;
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/markets", async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        trim(network) AS name,
        COUNT(*)::int AS account_count,
        COUNT(*) FILTER (WHERE lower(status) = 'active')::int AS active_account_count,
        array_remove(array_agg(DISTINCT customer_state ORDER BY customer_state), NULL) AS states
      FROM customers
      WHERE network IS NOT NULL AND trim(network) <> ''
      GROUP BY trim(network)
      ORDER BY trim(network)
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_QUERY", details: parsed.error.flatten() });
    }

    const filters = parsed.data;
    const asOf = filters.asOf || new Date().toISOString().slice(0, 10);
    const params: unknown[] = [filters.market, asOf];
    const where = [`lower(trim(c.network)) = lower(trim($1))`];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace("?", `$${params.length}`));
    };

    if (filters.productId) add("p.id = ?", filters.productId);
    if (filters.driverModel) add("lower(c.driver_model) = lower(?)", filters.driverModel);
    if (filters.pricingModel) add("lower(p.pricing_model) = lower(?)", filters.pricingModel);
    if (filters.rateType) add("lower(COALESCE(lr.rate_type, '')) = lower(?)", filters.rateType);
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(
        c.customer_name ILIKE $${params.length}
        OR c.dealer_id ILIKE $${params.length}
        OR p.name ILIKE $${params.length}
        OR COALESCE(asp.position_name, '') ILIKE $${params.length}
        OR COALESCE(p.pricing_model, '') ILIKE $${params.length}
      )`);
    }

    const activeExpression = `(
      lower(COALESCE(c.status, '')) = 'active'
      AND ap.is_active = true
      AND p.is_active = true
      AND COALESCE(asp.is_active, true) = true
      AND COALESCE(lr.is_active, true) = true
      AND (ap.start_date IS NULL OR ap.start_date <= $2::date)
      AND (ap.end_date IS NULL OR ap.end_date >= $2::date)
      AND (lr.effective_date IS NULL OR lr.effective_date <= $2::date)
      AND (lr.end_date IS NULL OR lr.end_date >= $2::date)
    )`;
    if (filters.status === "active") where.push(activeExpression);
    if (filters.status === "inactive") where.push(`NOT ${activeExpression}`);

    const accountSpecificExpression = `(ap.price_override IS NOT NULL OR lr.id IS NOT NULL)`;
    if (filters.pricingScope === "standard") where.push(`NOT ${accountSpecificExpression}`);
    if (filters.pricingScope === "account_specific") where.push(accountSpecificExpression);

    const result = await pool.query(`
      WITH ranked_rates AS (
        SELECT
          asr.*,
          ROW_NUMBER() OVER (
            PARTITION BY asr.position_id, asr.rate_type
            ORDER BY
              CASE WHEN asr.is_active = true
                AND asr.effective_date <= $2::date
                AND (asr.end_date IS NULL OR asr.end_date >= $2::date)
                THEN 0 ELSE 1 END,
              asr.effective_date DESC,
              asr.updated_at DESC
          ) AS rank
        FROM account_service_rates asr
      ),
      latest_financials AS (
        SELECT DISTINCT ON (account_id)
          account_id, period_start, period_end, total_revenue, total_cost,
          gross_profit, margin_pct, calculated_at
        FROM account_financial_summary
        WHERE account_id IS NOT NULL
        ORDER BY account_id, period_end DESC, calculated_at DESC
      )
      SELECT
        c.id AS account_id,
        c.customer_name AS account_name,
        c.dealer_id AS account_number,
        trim(c.network) AS market,
        c.customer_city AS city,
        c.customer_state AS state,
        c.driver_model,
        c.status AS account_status,
        c.shift_bill_rate AS legacy_shift_bill_rate,
        ap.id AS account_product_id,
        ap.price_override,
        ap.billing_method,
        ap.billing_frequency_override,
        ap.start_date AS account_product_start_date,
        ap.end_date AS account_product_end_date,
        ap.is_active AS account_product_active,
        ap.notes AS account_product_notes,
        p.id AS product_id,
        p.name AS product_name,
        p.sku AS product_sku,
        p.product_type,
        p.service_category,
        p.pricing_model,
        p.unit_price AS standard_unit_price,
        p.min_price,
        p.max_price,
        p.suggested_price,
        p.cost AS product_cost,
        p.margin_target,
        p.effective_date AS product_effective_date,
        p.price_book,
        p.is_active AS product_active,
        asp.id AS position_id,
        asp.position_name,
        asp.quantity,
        asp.is_active AS position_active,
        lr.id AS rate_id,
        lr.bill_rate,
        lr.pay_rate,
        lr.rate_type,
        lr.billing_unit,
        lr.effective_date AS rate_effective_date,
        lr.end_date AS rate_end_date,
        lr.overtime_eligible,
        lr.is_active AS rate_active,
        lr.notes AS rate_notes,
        ${activeExpression} AS is_active,
        ${accountSpecificExpression} AS has_account_specific_pricing,
        lf.period_start AS financial_period_start,
        lf.period_end AS financial_period_end,
        lf.total_revenue AS realized_revenue,
        lf.total_cost AS realized_cost,
        lf.gross_profit AS realized_gross_profit,
        lf.margin_pct AS realized_margin_pct,
        lf.calculated_at AS financials_calculated_at,
        GREATEST(p.updated_at, ap.updated_at, asp.updated_at, lr.updated_at) AS last_updated_at,
        COALESCE(rate_user.email, account_product_user.email, product_user.email) AS last_updated_by
      FROM customers c
      JOIN account_products ap ON ap.customer_id = c.id
      JOIN products p ON p.id = ap.product_id
      LEFT JOIN account_service_positions asp ON asp.account_product_id = ap.id
      LEFT JOIN ranked_rates lr ON lr.position_id = asp.id AND lr.rank = 1
      LEFT JOIN latest_financials lf ON lf.account_id = c.id
      LEFT JOIN users rate_user ON rate_user.id = lr.updated_by
      LEFT JOIN users account_product_user ON account_product_user.id = ap.updated_by
      LEFT JOIN users product_user ON product_user.id = p.updated_by
      WHERE ${where.join(" AND ")}
      ORDER BY p.name, c.customer_name, asp.position_name, lr.rate_type
    `, params);

    const rows = result.rows.map((row: any) => {
      const customerPrice = row.bill_rate ?? row.price_override ?? row.standard_unit_price ?? null;
      const driverCost = row.pay_rate ?? (row.rate_id == null ? row.product_cost : null);
      const margin = calculateConfiguredMargin(customerPrice, driverCost);
      const priceSource = row.bill_rate != null
        ? "account_service_rate"
        : row.price_override != null
          ? "account_product_override"
          : "product_default";

      return {
        ...row,
        pricing_tier: null,
        customer_price: customerPrice,
        driver_cost: driverCost,
        configured_margin_dollars: margin?.dollars ?? null,
        configured_margin_pct: margin?.percentage ?? null,
        price_source: priceSource,
        hourly_rate: row.billing_unit === "hourly" ? row.bill_rate : null,
        per_move_rate: ["per_move", "per_trip", "flat"].includes(row.billing_unit) ? row.bill_rate : null,
        mileage_rate: ["mile", "mileage", "per_mile"].includes(row.billing_unit) ? row.bill_rate : null,
      };
    });

    const auditResult = await pool.query(`
      SELECT
        a.id, a.rate_id, a.account_id, a.account_name, a.product_id,
        a.product_name, a.position_name, a.previous_rate, a.new_rate,
        a.changed_by_name, a.changed_at, a.change_source, a.notes
      FROM account_billing_rate_audit a
      JOIN customers c ON c.id = a.account_id
      WHERE lower(trim(c.network)) = lower(trim($1))
      ORDER BY a.changed_at DESC
      LIMIT 100
    `, [filters.market]);

    const distinct = (key: string) => Array.from(new Set(rows.map((row: any) => row[key]).filter(Boolean))).sort();
    const timestamps = rows.map((row: any) => row.last_updated_at).filter(Boolean);
    const mostRecent = timestamps.length
      ? timestamps.sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0]
      : null;
    const mostRecentRow = mostRecent ? rows.find((row: any) => row.last_updated_at === mostRecent) : null;
    const locations = Array.from(new Set(rows
      .map((row: any) => [row.city, row.state].filter(Boolean).join(", "))
      .filter(Boolean))).sort();

    res.json({
      market: filters.market,
      asOf,
      summary: {
        marketName: filters.market,
        locations,
        driverModels: distinct("driver_model"),
        costBases: distinct("billing_unit"),
        accountCount: new Set(rows.map((row: any) => row.account_id)).size,
        activeAccountCount: new Set(rows.filter((row: any) => row.is_active).map((row: any) => row.account_id)).size,
        productCount: new Set(rows.map((row: any) => row.product_id).filter(Boolean)).size,
        accountSpecificCount: rows.filter((row: any) => row.has_account_specific_pricing).length,
        missingPricingCount: rows.filter((row: any) => row.customer_price == null).length,
        activePricingConfigurations: new Set(rows.filter((row: any) => row.is_active).map((row: any) => row.account_product_id)).size,
        pricingTiers: null,
        effectivePricingDate: rows
          .map((row: any) => row.rate_effective_date ?? row.product_effective_date ?? row.account_product_start_date)
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? null,
        lastPricingUpdate: mostRecent,
        lastUpdatedBy: mostRecentRow?.last_updated_by ?? auditResult.rows[0]?.changed_by_name ?? null,
      },
      filters: {
        products: Array.from(new Map(rows.map((row: any) => [row.product_id, {
          id: row.product_id,
          name: row.product_name,
        }])).values()).filter((item: any) => item.id),
        driverModels: distinct("driver_model"),
        pricingModels: distinct("pricing_model"),
        rateTypes: distinct("rate_type"),
      },
      rows,
      history: auditResult.rows,
      limitations: [
        "Production pricing tiers are not configured in a normalized source.",
        "Minimum hours, weekly commitments, repositioning charges, and other fees are not available as unified production pricing fields.",
        "Configured margin is shown only when both customer price and driver/product cost are available from the same account configuration.",
      ],
      readOnly: true,
      source: "production_account_pricing",
    });
  } catch (error) {
    next(error);
  }
});

export default router;