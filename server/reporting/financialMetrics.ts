/**
 * Canonical Financial Metrics Engine
 * ====================================
 * Single source of truth for all financial calculations used across
 * the Report Builder, scheduled exports, and any future reporting surfaces.
 *
 * DEFINITIONS
 * ───────────
 *   Revenue          = account_bill_rate × actual_hours
 *   Labor Cost       = driver_hourly_rate × actual_hours
 *   Rideshare Cost   = per-move rideshare cost (default 0)
 *   Other Direct Cost= per-move miscellaneous direct cost (default 0)
 *   Total Direct Cost= labor_cost + rideshare_cost + other_direct_cost
 *   Gross Profit ($) = revenue − total_direct_cost
 *   Gross Profit (%) = gross_profit / revenue  (NULL when revenue = 0)
 *
 * DATA MAPPING (move_snapshots columns)
 * ──────────────────────────────────────
 *   account_bill_rate    → bill_rate
 *   driver_hourly_rate   → pay_rate
 *   actual_hours         → estimated_minutes_snapshot / 60.0
 *   rideshare_cost       → rideshare_cost  (default 0)
 *   other_direct_cost    → other_direct_cost (default 0)
 *
 * RULES
 * ─────
 *   - All formulas are defined HERE and imported everywhere else.
 *   - No other file may redefine these calculations.
 *   - Divide-by-zero in GP% returns NULL (never an error).
 *
 * HOW TO USE
 * ──────────
 *   1. Import FIN_SUBQUERY_SQL into a subject's baseJoin to attach the `fin` CTE.
 *   2. Use FIN_EXPRESSIONS to compose the SELECT field sqlExpr values.
 *   3. Use FINANCE_ROLES for role-gating sensitive fields.
 *   4. Use buildFinancialFieldGroup() to get the ready-to-use field group object.
 */

// ── Role gate ─────────────────────────────────────────────────────────────────
/** Roles that may view cost, gross-profit, and other sensitive financial fields. */
export const FINANCE_ROLES = ["super_user", "corporate_admin"] as const;
export type FinanceRole = typeof FINANCE_ROLES[number];

// ── Pre-aggregated fin subquery ───────────────────────────────────────────────
/**
 * SQL fragment for the `fin` pre-aggregated subquery.
 * Join this onto the primary FROM clause with:
 *   LEFT JOIN (<FIN_SUBQUERY_SQL>) fin ON fin.driver_id = d.id
 *
 * Columns produced:
 *   fin_revenue        — total revenue billed to accounts
 *   fin_labor_cost     — total driver labor cost
 *   fin_rideshare_cost — total rideshare cost (COALESCE 0 when absent)
 *   fin_other_cost     — total other direct cost (COALESCE 0 when absent)
 */
export const FIN_SUBQUERY_SQL = `
  SELECT
    driver_id,
    SUM(COALESCE(bill_rate, 0) * COALESCE(estimated_minutes_snapshot, 0) / 60.0) AS fin_revenue,
    SUM(COALESCE(pay_rate,  0) * COALESCE(estimated_minutes_snapshot, 0) / 60.0) AS fin_labor_cost,
    SUM(COALESCE(rideshare_cost, 0))                                               AS fin_rideshare_cost,
    SUM(COALESCE(other_direct_cost, 0))                                            AS fin_other_cost
  FROM move_snapshots
  WHERE driver_id IS NOT NULL
  GROUP BY driver_id`.trim();

// ── Intermediate SQL building blocks ─────────────────────────────────────────
// These reference subquery columns via the `fin` alias.
// Keeping them as named constants prevents copy-paste drift.

const REV = `COALESCE(fin.fin_revenue, 0)`;
const LAB = `COALESCE(fin.fin_labor_cost, 0)`;
const RS  = `COALESCE(fin.fin_rideshare_cost, 0)`;
const OTH = `COALESCE(fin.fin_other_cost, 0)`;
const TDC = `(${LAB} + ${RS} + ${OTH})`;
const GPD = `(${REV} - ${TDC})`;

// ── Aggregate building blocks (GROUP BY context) ──────────────────────────────
// Rule: always SUM the raw fin subquery values first, then round once.
// This prevents double-rounding (SUM of pre-rounded per-row values) and ensures
// that grouped GP% = SUM(GP$) / SUM(Revenue) is mathematically consistent with
// the grouped GP$ and Revenue columns shown in the same table.
const AGG_REV = `SUM(${REV})`;
const AGG_LAB = `SUM(${LAB})`;
const AGG_RS  = `SUM(${RS})`;
const AGG_OTH = `SUM(${OTH})`;
// Total Direct Cost aggregate — sum each cost component separately so the
// result is algebraically identical to AGG_REV − AGG_GPD.
const AGG_TDC = `(${AGG_LAB} + ${AGG_RS} + ${AGG_OTH})`;
// Gross Profit aggregate — SUM(revenue) − SUM(all costs).
// Algebraically equivalent to SUM(row-level GP) but avoids accumulating
// per-row rounding errors that would create a discrepancy with the GP% field.
const AGG_GPD = `(${AGG_REV} - ${AGG_LAB} - ${AGG_RS} - ${AGG_OTH})`;

// ── Canonical SELECT expressions ──────────────────────────────────────────────
/**
 * Ready-to-use SQL expressions for SELECT clauses (row-level, not grouped).
 * Each expression is self-contained — no external aliases required beyond `fin`.
 */
export const FIN_EXPRESSIONS = {
  /** Revenue = bill_rate × hours.  Rounded to 2 decimal places. */
  revenue: `ROUND(${REV}::numeric, 2)`,

  /** Labor Cost = pay_rate × hours.  Rounded to 2 decimal places. */
  laborCost: `ROUND(${LAB}::numeric, 2)`,

  /** Rideshare Cost.  Rounded to 2 decimal places. */
  rideshareCost: `ROUND(${RS}::numeric, 2)`,

  /** Other Direct Cost.  Rounded to 2 decimal places. */
  otherDirectCost: `ROUND(${OTH}::numeric, 2)`,

  /**
   * Total Direct Cost = labor + rideshare + other.
   * This is the full cost basis used for gross profit calculations.
   */
  totalDirectCost: `ROUND(${TDC}::numeric, 2)`,

  /**
   * Gross Profit ($) = revenue − total_direct_cost.
   * Rounded to 2 decimal places.
   */
  grossProfitDollars: `ROUND(${GPD}::numeric, 2)`,

  /**
   * Gross Profit (%) = gross_profit / revenue × 100.
   * Returns NULL when revenue = 0 to prevent divide-by-zero.
   * Rounded to 1 decimal place.
   */
  grossProfitPct: `CASE WHEN ${REV} > 0 THEN ROUND((${GPD} / ${REV} * 100)::numeric, 1) ELSE NULL END`,
} as const;

// ── Canonical GROUP BY aggregate expressions ──────────────────────────────────
/**
 * SQL expressions for use inside a GROUP BY query's SELECT list.
 *
 * RULE: SUM base components first → derive GP → derive GP% from the
 *       same SUM values.  Never average row-level GP% or calculate GP%
 *       before aggregation.
 *
 * All currency values round AFTER summing (not before) to prevent the
 * double-rounding artifact that occurs when SUM-ing pre-rounded per-row
 * values.
 */
export const FIN_AGG_EXPRESSIONS = {
  revenue:         `ROUND(${AGG_REV}::numeric, 2)`,
  laborCost:       `ROUND(${AGG_LAB}::numeric, 2)`,
  rideshareCost:   `ROUND(${AGG_RS}::numeric, 2)`,
  otherDirectCost: `ROUND(${AGG_OTH}::numeric, 2)`,
  totalDirectCost: `ROUND(${AGG_TDC}::numeric, 2)`,
  /** GP($) = SUM(rev) − SUM(cost).  Ensures grouped GP$ + grouped cost = grouped revenue. */
  grossProfitDollars: `ROUND(${AGG_GPD}::numeric, 2)`,
  /**
   * GP(%) = SUM(GP$) / SUM(Revenue) × 100.
   * Uses the same SUM components as grossProfitDollars and revenue —
   * guarantees GP% is mathematically consistent with those columns.
   * Returns NULL when total revenue is zero.
   */
  grossProfitPct: `CASE WHEN ${AGG_REV} > 0 THEN ROUND((${AGG_GPD} / ${AGG_REV} * 100)::numeric, 1) ELSE NULL END`,
} as const;

// ── No-rideshare variants ─────────────────────────────────────────────────────
// Used when the "Include Rideshare Cost" toggle is OFF in the Report Builder.
// Only TDC, GP$, and GP% differ; revenue, labor, and other cost are unchanged.
const TDC_NO_RS     = `(${LAB} + ${OTH})`;
const GPD_NO_RS     = `(${REV} - ${TDC_NO_RS})`;
const AGG_TDC_NO_RS = `(${AGG_LAB} + ${AGG_OTH})`;
const AGG_GPD_NO_RS = `(${AGG_REV} - ${AGG_LAB} - ${AGG_OTH})`;

export const FIN_EXPRESSIONS_NO_RIDESHARE = {
  revenue:            FIN_EXPRESSIONS.revenue,
  laborCost:          FIN_EXPRESSIONS.laborCost,
  rideshareCost:      FIN_EXPRESSIONS.rideshareCost,
  otherDirectCost:    FIN_EXPRESSIONS.otherDirectCost,
  totalDirectCost:    `ROUND(${TDC_NO_RS}::numeric, 2)`,
  grossProfitDollars: `ROUND(${GPD_NO_RS}::numeric, 2)`,
  grossProfitPct:     `CASE WHEN ${REV} > 0 THEN ROUND((${GPD_NO_RS} / ${REV} * 100)::numeric, 1) ELSE NULL END`,
};

export const FIN_AGG_EXPRESSIONS_NO_RIDESHARE = {
  revenue:            FIN_AGG_EXPRESSIONS.revenue,
  laborCost:          FIN_AGG_EXPRESSIONS.laborCost,
  rideshareCost:      FIN_AGG_EXPRESSIONS.rideshareCost,
  otherDirectCost:    FIN_AGG_EXPRESSIONS.otherDirectCost,
  totalDirectCost:    `ROUND(${AGG_TDC_NO_RS}::numeric, 2)`,
  grossProfitDollars: `ROUND(${AGG_GPD_NO_RS}::numeric, 2)`,
  grossProfitPct:     `CASE WHEN ${AGG_REV} > 0 THEN ROUND((${AGG_GPD_NO_RS} / ${AGG_REV} * 100)::numeric, 1) ELSE NULL END`,
};

// ── Field group builder ───────────────────────────────────────────────────────
/**
 * Returns the standard "Financial" field group for use in a reporting subject's
 * `fieldGroups` array.  Accepts an optional role list override; defaults to
 * FINANCE_ROLES for cost / GP fields.
 *
 * This is the ONLY place where financial field metadata is defined.
 * Import and call this function from any subject that needs financial metrics.
 */
export function buildFinancialFieldGroup(options: {
  financeRoles?: readonly string[];
} = {}): { label: string; fields: FinancialField[] } {
  const roles = (options.financeRoles ?? FINANCE_ROLES) as string[];

  return {
    label: "Financial",
    fields: [
      {
        key:           "calc_revenue",
        label:         "Revenue",
        sqlExpr:       FIN_EXPRESSIONS.revenue,
        dataType:      "currency",
        sortable:      true,
        requiresRole:  roles,
        // GROUP BY: SUM raw revenue, then round — avoids double-rounding.
        aggregateExpr: FIN_AGG_EXPRESSIONS.revenue,
      },
      {
        key:           "calc_labor_cost",
        label:         "Labor Cost",
        sqlExpr:       FIN_EXPRESSIONS.laborCost,
        dataType:      "currency",
        sortable:      true,
        requiresRole:  roles,
        aggregateExpr: FIN_AGG_EXPRESSIONS.laborCost,
      },
      {
        key:           "calc_rideshare_cost",
        label:         "Rideshare Cost",
        sqlExpr:       FIN_EXPRESSIONS.rideshareCost,
        dataType:      "currency",
        sortable:      true,
        requiresRole:  roles,
        aggregateExpr: FIN_AGG_EXPRESSIONS.rideshareCost,
      },
      {
        key:           "calc_other_direct_cost",
        label:         "Other Direct Cost",
        sqlExpr:       FIN_EXPRESSIONS.otherDirectCost,
        dataType:      "currency",
        sortable:      true,
        requiresRole:  roles,
        aggregateExpr: FIN_AGG_EXPRESSIONS.otherDirectCost,
      },
      {
        key:           "calc_total_direct_cost",
        label:         "Total Direct Cost",
        sqlExpr:       FIN_EXPRESSIONS.totalDirectCost,
        dataType:      "currency",
        sortable:      true,
        requiresRole:  roles,
        // GROUP BY: SUM each raw cost component then combine — algebraically
        // identical to AGG_REV − AGG_GPD, so revenue = cost + GP always holds.
        aggregateExpr: FIN_AGG_EXPRESSIONS.totalDirectCost,
      },
      {
        key:           "calc_gp_dollars",
        label:         "Gross Profit ($)",
        sqlExpr:       FIN_EXPRESSIONS.grossProfitDollars,
        dataType:      "currency",
        sortable:      true,
        requiresRole:  roles,
        // GROUP BY: SUM(revenue) − SUM(costs) then round — uses the same
        // SUM components as the GP% field so the two columns are consistent.
        aggregateExpr: FIN_AGG_EXPRESSIONS.grossProfitDollars,
      },
      {
        key:           "calc_gp_pct",
        label:         "Gross Profit (%)",
        sqlExpr:       FIN_EXPRESSIONS.grossProfitPct,
        dataType:      "percent",
        sortable:      true,
        requiresRole:  roles,
        // GROUP BY: GP% = SUM(GP$) / SUM(Revenue) × 100.
        // Uses the identical SUM(revenue) and SUM(cost) components as the
        // GP$ and Revenue columns — guarantees the values are consistent
        // and that no row-level GP% values are ever averaged together.
        aggregateExpr: FIN_AGG_EXPRESSIONS.grossProfitPct,
      },
    ],
  };
}

// ── Internal type for the field shape ────────────────────────────────────────
// Matches the FieldDef shape expected by the reporting registry.
interface FinancialField {
  key:            string;
  label:          string;
  sqlExpr:        string;
  dataType:       string;
  sortable:       boolean;
  requiresRole?:  string[];
  /** Custom SQL expression used in GROUP BY aggregation context (see FieldDef.aggregateExpr). */
  aggregateExpr?: string;
}
