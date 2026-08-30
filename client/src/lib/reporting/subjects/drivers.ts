import { Users } from "lucide-react";
import { frontendRegistry } from "../registry";

// Finance-role gate — mirrors server/reporting/financialMetrics.ts FINANCE_ROLES.
// Keep in sync if roles are ever changed there.
const FINANCE_ROLES = ["super_user", "corporate_admin"] as const;

frontendRegistry.register({
  id: "drivers",
  label: "Drivers",
  icon: Users,
  color: "text-blue-600 dark:text-blue-400",
  defaultFields: ["name", "status", "classification", "state"],
  fieldGroups: [
    {
      label: "Core",
      fields: [
        { key: "name",           label: "Driver Name"                                                       },
        { key: "status",         label: "Status",                filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "classification", label: "Worker Classification",  filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "state",          label: "State",                 filterable: true, groupable: true, sortable: true },
        { key: "account",        label: "Primary Account",                                         sortable: true },
        { key: "hireDate",       label: "Hire Date",                                               sortable: true },
        { key: "employmentType", label: "Employment Type",       filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "market",         label: "Market",                filterable: true, groupable: true, sortable: true, capitalizeValue: true },
        { key: "licenseState",   label: "License State",         filterable: true, groupable: true, sortable: true, capitalizeValue: true },
      ],
    },
    {
      label: "Performance",
      fields: [
        { key: "performanceScore", label: "Performance Score",                                     sortable: true },
        { key: "performanceTier",  label: "Performance Tier",  filterable: true, groupable: true, sortable: true, capitalizeValue: true },
      ],
    },
    {
      label: "Compliance",
      fields: [
        { key: "riskScore", label: "Risk Score", sortable: true },
      ],
    },
    {
      label: "Activity",
      fields: [
        { key: "lastMoveDate", label: "Last Move Date", sortable: true },
        { key: "totalMoves",   label: "Total Moves",    sortable: true },
        { key: "tenure",       label: "Tenure"                        },
      ],
    },
    // ── Financial fields ──────────────────────────────────────────────────────
    // Formulas are canonically defined in server/reporting/financialMetrics.ts.
    // Labels, tooltips, and role gates here must remain consistent with that file.
    {
      label: "Financial",
      isCalculated: true,
      fields: [
        {
          key:            "calc_revenue",
          label:          "Revenue",
          sortable:       true,
          isCurrency:     true,
          formulaTooltip: "Bill Rate × Actual Hours — summed across all moves",
        },
        {
          key:            "calc_labor_cost",
          label:          "Labor Cost",
          sortable:       true,
          isCurrency:     true,
          requiresRole:   FINANCE_ROLES,
          formulaTooltip: "Driver Hourly Rate × Actual Hours — summed across all moves",
        },
        {
          key:            "calc_rideshare_cost",
          label:          "Rideshare Cost",
          sortable:       true,
          isCurrency:     true,
          requiresRole:   FINANCE_ROLES,
          formulaTooltip: "Per-move rideshare cost — summed across all moves",
        },
        {
          key:            "calc_other_direct_cost",
          label:          "Other Direct Cost",
          sortable:       true,
          isCurrency:     true,
          requiresRole:   FINANCE_ROLES,
          formulaTooltip: "Per-move miscellaneous direct cost — summed across all moves",
        },
        {
          key:            "calc_total_direct_cost",
          label:          "Total Direct Cost",
          sortable:       true,
          isCurrency:     true,
          requiresRole:   FINANCE_ROLES,
          formulaTooltip: "Labor Cost + Rideshare Cost + Other Direct Cost",
        },
        {
          key:            "calc_gp_dollars",
          label:          "Gross Profit ($)",
          sortable:       true,
          isCurrency:     true,
          requiresRole:   FINANCE_ROLES,
          formulaTooltip: "Revenue − Total Direct Cost",
        },
        {
          key:            "calc_gp_pct",
          label:          "Gross Profit (%)",
          sortable:       true,
          isPercent:      true,
          requiresRole:   FINANCE_ROLES,
          formulaTooltip: "Gross Profit / Revenue × 100 — returns blank when Revenue is zero",
        },
      ],
    },
  ],
});
