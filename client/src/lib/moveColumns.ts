/**
 * Move List column definitions.
 *
 * Each entry defines one column in the Moves workspace table.
 * `defaultVisible` controls which columns appear on first load.
 * `sortField` must match a SortField value in Trips.tsx when sortable.
 * `alwaysVisible` columns (checkbox, actions) are never hidden by the chooser.
 */

export interface MoveColumnDef {
  key: string;
  label: string;
  sortField?: string;       // matches SortField in Trips.tsx
  defaultVisible: boolean;
  alwaysVisible?: boolean;  // excluded from column chooser
  width?: string;           // Tailwind max-w class or empty
}

export const MOVE_COLUMNS: MoveColumnDef[] = [
  // ── Always-visible structural columns ──────────────────────────────────
  { key: "__select",   label: "",          defaultVisible: true,  alwaysVisible: true },
  { key: "__actions",  label: "",          defaultVisible: true,  alwaysVisible: true },

  // ── Default visible columns ─────────────────────────────────────────────
  { key: "moveNumber",   label: "Move #",      sortField: "moveNumber",   defaultVisible: true,  width: "whitespace-nowrap" },
  { key: "tripDate",     label: "Date",        sortField: "tripDate",     defaultVisible: true,  width: "whitespace-nowrap" },
  { key: "customerName", label: "Account",     sortField: "customerName", defaultVisible: true,  width: "max-w-[160px]" },
  { key: "driverName",   label: "Driver",      sortField: "driverName",   defaultVisible: true,  width: "max-w-[140px]" },
  { key: "moveType",     label: "Type",        sortField: "moveType",     defaultVisible: true },
  { key: "status",       label: "Status",      sortField: "status",       defaultVisible: true,  width: "whitespace-nowrap" },
  { key: "route",        label: "Route",       defaultVisible: true,  width: "max-w-[180px]" },
  { key: "distance",     label: "Miles",       defaultVisible: true },
  { key: "drCount",      label: "DR",          defaultVisible: true },
  { key: "evidence",     label: "Evidence",    defaultVisible: true },

  // ── Optional columns (off by default) ───────────────────────────────────
  { key: "sourceSystem",     label: "Source",          defaultVisible: false },
  { key: "importBatchId",    label: "Batch ID",        defaultVisible: false },
  { key: "customerCharges",  label: "Charges",         defaultVisible: false },
  { key: "driverPay",        label: "Driver Pay",      defaultVisible: false },
  { key: "grossProfit",      label: "Gross Profit",    defaultVisible: false },
  { key: "grossMargin",      label: "Margin %",        defaultVisible: false },
];

/** Keys of columns that are always present and cannot be toggled. */
export const ALWAYS_VISIBLE_KEYS = new Set(
  MOVE_COLUMNS.filter((c) => c.alwaysVisible).map((c) => c.key)
);

/** Keys that are visible by default (excluding always-visible structural ones). */
export const DEFAULT_VISIBLE_KEYS = MOVE_COLUMNS
  .filter((c) => c.defaultVisible && !c.alwaysVisible)
  .map((c) => c.key);
