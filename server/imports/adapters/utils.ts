/**
 * Shared adapter utilities.
 */

/**
 * Apply a field map to an array of rows.
 *
 * fieldMap: { sourceColumnName → canonicalHeaderName }
 * Columns absent from the map pass through with their original name.
 *
 * This is the single place where column-name normalisation happens for ALL
 * adapters.  The validation layer always sees canonical names (TripId, Dealer,
 * Driver, …) regardless of how the source stores them.
 */
export function applyFieldMap(
  rows: Record<string, unknown>[],
  fieldMap: Record<string, string>,
): Record<string, unknown>[] {
  if (!fieldMap || Object.keys(fieldMap).length === 0) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[fieldMap[k] ?? k] = v;
    }
    return out;
  });
}
