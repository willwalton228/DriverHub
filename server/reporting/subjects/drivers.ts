import { reportingRegistry } from "../registry";
import { FIN_SUBQUERY_SQL, buildFinancialFieldGroup } from "../financialMetrics";

reportingRegistry.registerSubject({
  id: "drivers",
  label: "Drivers",
  // `fin` — pre-aggregated financial metrics derived from move_snapshots.
  // All formulas are defined in server/reporting/financialMetrics.ts — the
  // canonical financial metrics engine.  Do NOT redefine formulas here.
  baseJoin: `FROM drivers d
    LEFT JOIN users u ON d.user_id = u.id
    LEFT JOIN driver_accounts da ON da.driver_id = d.id AND da.is_primary = true AND da.assignment_ended_at IS NULL
    LEFT JOIN customers c ON c.id = da.account_id
    LEFT JOIN driver_performance_scores dps ON dps.driver_id = d.id
    LEFT JOIN (${FIN_SUBQUERY_SQL}) fin ON fin.driver_id = d.id`,
  baseWhere: `d.status != 'archived' AND d.user_id IS NOT NULL AND u.id IS NOT NULL`,
  rowIdColumn: "d.id",
  defaultFields: ["name", "status", "classification", "state"],
  fieldGroups: [
    {
      label: "Core",
      fields: [
        { key: "name",           label: "Driver Name",           sqlExpr: `TRIM(CONCAT(u.first_name, ' ', u.last_name))`,                                                                                                                           dataType: "string"                                          },
        { key: "status",         label: "Status",                sqlExpr: `d.status`,                dataType: "string",  filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "classification", label: "Worker Classification", sqlExpr: `d.driver_classification`, dataType: "string",  filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "state",          label: "State",                 sqlExpr: `d.state`,                 dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "account",        label: "Primary Account",       sqlExpr: `c.customer_name`,         dataType: "string",  sortable: true                                   },
        { key: "hireDate",       label: "Hire Date",             sqlExpr: `d.hire_date`,             dataType: "date",    sortable: true                                   },
        { key: "employmentType", label: "Employment Type",       sqlExpr: `d.employment_type`,       dataType: "string",  filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "market",         label: "Market",                sqlExpr: `d.market`,                dataType: "string",  filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "licenseState",   label: "License State",         sqlExpr: `d.license_state`,         dataType: "string",  filterable: true, groupable: true, sortable: true, capitalizeValue: true },
      ],
    },
    {
      label: "Performance",
      fields: [
        { key: "performanceScore", label: "Performance Score", sqlExpr: `ROUND(dps.score::numeric, 1)`, dataType: "number", sortable: true                                   },
        { key: "performanceTier",  label: "Performance Tier",  sqlExpr: `dps.tier`,                    dataType: "string", filterable: true, groupable: true, sortable: true, capitalizeValue: true },
      ],
    },
    {
      label: "Compliance",
      fields: [
        { key: "riskScore", label: "Risk Score", sqlExpr: `u.security_risk_score`, dataType: "number", sortable: true },
      ],
    },
    {
      label: "Activity",
      fields: [
        { key: "lastMoveDate", label: "Last Move Date", sqlExpr: `d.last_move_date`,                                                                                                                                                                 dataType: "date",   sortable: true },
        { key: "totalMoves",   label: "Total Moves",    sqlExpr: `d.total_moves_completed`,                                                                                                                                                          dataType: "number", sortable: true },
        { key: "tenure",       label: "Tenure",         sqlExpr: `CASE WHEN d.hire_date IS NOT NULL THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - d.hire_date)) / 86400 / 365.25)::int || ' yr' ELSE NULL END`,                                             dataType: "string"               },
      ],
    },
    // ── Financial fields ──────────────────────────────────────────────────────
    // All formulas are owned by server/reporting/financialMetrics.ts.
    // Revenue is available to all corporate users; cost and GP are finance-only.
    buildFinancialFieldGroup(),
  ],
});

// ── Drivers → Accounts ────────────────────────────────────────────────────────
// Default grain mode: "primary_only" — joins only the driver's primary account
// so reports stay at 1 row per driver.  Users may override to "all_records"
// (full fan-out) or "summary" (pre-aggregated 1-row-per-driver with count).
reportingRegistry.registerRelationship({
  id:               "drivers_accounts",
  sourceSubjectId:  "drivers",
  targetSubjectId:  "accounts",
  joinCondition:    "rda.driver_id = d.id",

  // "all_records" mode — joins every account (may produce duplicate driver rows)
  joinSql: `LEFT JOIN driver_accounts rda ON rda.driver_id = d.id AND rda.assignment_ended_at IS NULL
    LEFT JOIN customers rac ON rac.id = rda.account_id`,

  supportsPrimaryOnly: true,

  // "primary_only" mode — joins only the record flagged is_primary = true (1 row per driver)
  primaryOnlyJoinSql: `LEFT JOIN driver_accounts rda ON rda.driver_id = d.id AND rda.is_primary = true AND rda.assignment_ended_at IS NULL
    LEFT JOIN customers rac ON rac.id = rda.account_id`,

  // "summary" mode — pre-aggregated subquery (1 row per driver) + primary-account details
  // Column aliases match the field SQL expressions so all existing acct_* fields still work.
  summaryJoinSql: `LEFT JOIN (
    SELECT
      da.driver_id,
      COUNT(*)                                                    AS acct_count,
      MAX(CASE WHEN da.is_primary THEN c.customer_name END)       AS customer_name,
      MAX(CASE WHEN da.is_primary THEN c.status END)              AS status,
      MAX(CASE WHEN da.is_primary THEN c.customer_type END)       AS customer_type,
      MAX(CASE WHEN da.is_primary THEN c.customer_group END)      AS customer_group,
      MAX(CASE WHEN da.is_primary THEN c.customer_city END)       AS customer_city,
      MAX(CASE WHEN da.is_primary THEN c.customer_state END)      AS customer_state
    FROM driver_accounts da
    JOIN customers c ON c.id = da.account_id
    WHERE da.assignment_ended_at IS NULL
    GROUP BY da.driver_id
  ) rac ON rac.driver_id = d.id
  LEFT JOIN driver_accounts rda ON rda.driver_id = d.id AND rda.is_primary = true AND rda.assignment_ended_at IS NULL`,

  cardinality:      "many_to_many",
  reportingAllowed: true,
  label:            "Accounts",

  relatedFieldGroups: [
    {
      label: "Account",
      fields: [
        { key: "acct_name",      label: "Account Name",       sqlExpr: `rac.customer_name`,    dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "acct_status",    label: "Account Status",     sqlExpr: `rac.status`,           dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "acct_type",      label: "Account Type",       sqlExpr: `rac.customer_type`,    dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "acct_group",     label: "Account Group",      sqlExpr: `rac.customer_group`,   dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "acct_city",      label: "Account City",       sqlExpr: `rac.customer_city`,    dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "acct_state",     label: "Account State",      sqlExpr: `rac.customer_state`,   dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "acct_isPrimary", label: "Is Primary Account", sqlExpr: `rda.is_primary::text`, dataType: "string",  filterable: true, groupable: true, sortable: true },
      ],
    },
  ],

  // Extra fields available only in "summary" mode (powered by the aggregation subquery)
  summaryFieldGroups: [
    {
      label: "Account Summary",
      fields: [
        { key: "acct_count", label: "Account Count", sqlExpr: `COALESCE(rac.acct_count, 0)`, dataType: "number", sortable: true },
      ],
    },
  ],
});

// ── Drivers → Moves ───────────────────────────────────────────────────────────
// Joins move_snapshots on driver_id — one row per move per driver.
reportingRegistry.registerRelationship({
  id:              "drivers_moves",
  sourceSubjectId: "drivers",
  targetSubjectId: "moves",
  joinCondition:   "ms.driver_id = d.id",
  joinSql:         `LEFT JOIN move_snapshots ms ON ms.driver_id = d.id`,
  cardinality:     "one_to_many",
  reportingAllowed: true,
  label:           "Moves",
  relatedFieldGroups: [
    {
      label: "Move",
      fields: [
        { key: "mv_workType",      label: "Work Type",        sqlExpr: `ms.work_type`,                      dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "mv_executionMode", label: "Execution Mode",   sqlExpr: `ms.execution_mode`,                 dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "mv_account",       label: "Move Account",     sqlExpr: `ms.customer_name`,                  dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "mv_market",        label: "Move Market",      sqlExpr: `ms.market_code`,                    dataType: "string",  filterable: true, groupable: true, sortable: true },
        { key: "mv_serviceDate",   label: "Service Date",     sqlExpr: `ms.service_datetime::date`,         dataType: "date",    sortable: true                                   },
        { key: "mv_origin",        label: "Origin Address",   sqlExpr: `ms.origin_address`,                 dataType: "string",  sortable: true                                   },
        { key: "mv_destination",   label: "Destination",      sqlExpr: `ms.destination_address`,            dataType: "string",  sortable: true                                   },
        { key: "mv_billRate",      label: "Bill Rate",        sqlExpr: `ms.bill_rate`,                      dataType: "number",  sortable: true                                   },
        { key: "mv_zone",          label: "Zone",             sqlExpr: `ms.zone_code`,                      dataType: "string",  filterable: true, groupable: true, sortable: true },
      ],
    },
  ],
});

// ── Drivers → Claims ──────────────────────────────────────────────────────────
// Joins accidents on driver_id — one row per claim per driver.
reportingRegistry.registerRelationship({
  id:              "drivers_claims",
  sourceSubjectId: "drivers",
  targetSubjectId: "claims",
  joinCondition:   "acc.driver_id = d.id",
  joinSql:         `LEFT JOIN accidents acc ON acc.driver_id = d.id`,
  cardinality:     "one_to_many",
  reportingAllowed: true,
  label:           "Claims",
  relatedFieldGroups: [
    {
      label: "Claim",
      fields: [
        { key: "claim_status",     label: "Claim Status",      sqlExpr: `acc.claim_status`,       dataType: "string",   filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "claim_type",       label: "Claim Type",        sqlExpr: `acc.claim_type`,         dataType: "string",   filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "claim_severity",   label: "Claim Severity",    sqlExpr: `acc.claim_severity`,     dataType: "string",   filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "claim_date",       label: "Accident Date",     sqlExpr: `acc.accident_date::date`,dataType: "date",     sortable: true                                                          },
        { key: "claim_location",   label: "Claim Location",    sqlExpr: `acc.location`,           dataType: "string",   filterable: true, groupable: true, sortable: true                      },
        { key: "claim_injuries",   label: "Injuries",          sqlExpr: `acc.injuries`,           dataType: "string",   filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "claim_totalEst",   label: "Total Estimate",    sqlExpr: `acc.total_estimate`,     dataType: "currency", sortable: true                                                          },
        { key: "claim_actualCost", label: "Actual Cost",       sqlExpr: `acc.actual_cost`,        dataType: "currency", sortable: true                                                          },
      ],
    },
  ],
});
