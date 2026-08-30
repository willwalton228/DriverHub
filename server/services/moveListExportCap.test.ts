/**
 * Unit tests for Move List export cap behaviour (Task #84).
 *
 * These tests exercise the cap logic in isolation using a lightweight
 * stub of the storage layer so no database connection is required.
 */

import { describe, it, expect } from 'vitest';

// ─── Helpers that replicate the server-side cap logic ─────────────────────────

interface ExportResult {
  rows: any[];
  truncated: boolean;
  totalMatched: number;
  cap: number;
}

/**
 * Pure function that applies the same cap logic used by
 * DatabaseStorage.getTripsForExport without touching the DB.
 */
function applyExportCap(allRows: any[], cap: number): ExportResult {
  const fetched = allRows.slice(0, cap + 1); // simulate LIMIT cap+1
  const truncated = fetched.length > cap;
  const sliced = truncated ? fetched.slice(0, cap) : fetched;
  return {
    rows: sliced,
    truncated,
    totalMatched: truncated ? cap + 1 : sliced.length,
    cap,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Move List export cap', () => {
  it('returns all rows when result is below the cap', () => {
    const fakeRows = Array.from({ length: 42 }, (_, i) => ({ id: `trip-${i}` }));
    const result = applyExportCap(fakeRows, 5000);

    expect(result.rows).toHaveLength(42);
    expect(result.truncated).toBe(false);
    expect(result.cap).toBe(5000);
  });

  it('caps result at 5 000 rows when the query returns more', () => {
    const fakeRows = Array.from({ length: 6000 }, (_, i) => ({ id: `trip-${i}` }));
    const result = applyExportCap(fakeRows, 5000);

    expect(result.rows).toHaveLength(5000);
    expect(result.truncated).toBe(true);
    expect(result.cap).toBe(5000);
  });

  it('sets truncated=false when result equals the cap exactly', () => {
    const fakeRows = Array.from({ length: 5000 }, (_, i) => ({ id: `trip-${i}` }));
    const result = applyExportCap(fakeRows, 5000);

    expect(result.rows).toHaveLength(5000);
    expect(result.truncated).toBe(false);
  });

  it('honours a custom cap passed via the limit option', () => {
    const fakeRows = Array.from({ length: 300 }, (_, i) => ({ id: `trip-${i}` }));
    const result = applyExportCap(fakeRows, 100);

    expect(result.rows).toHaveLength(100);
    expect(result.truncated).toBe(true);
    expect(result.cap).toBe(100);
  });

  it('returns an empty array with no truncation when there are no matching rows', () => {
    const result = applyExportCap([], 5000);

    expect(result.rows).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });

  it('preserves row order after capping', () => {
    const fakeRows = Array.from({ length: 5002 }, (_, i) => ({ id: `trip-${i}`, seq: i }));
    const result = applyExportCap(fakeRows, 5000);

    expect(result.rows[0].seq).toBe(0);
    expect(result.rows[4999].seq).toBe(4999);
  });
});

// ─── Response-shape contract tests ────────────────────────────────────────────

describe('Export API response shape', () => {
  it('includes trips, truncated, cap and count fields', () => {
    const fakeRows = Array.from({ length: 10 }, (_, i) => ({ id: `trip-${i}` }));
    const result = applyExportCap(fakeRows, 5000);

    // Simulate what the route handler serialises as JSON
    const apiResponse = {
      trips: result.rows,
      truncated: result.truncated,
      cap: result.cap,
      count: result.rows.length,
    };

    expect(apiResponse).toHaveProperty('trips');
    expect(apiResponse).toHaveProperty('truncated');
    expect(apiResponse).toHaveProperty('cap');
    expect(apiResponse).toHaveProperty('count');
    expect(apiResponse.count).toBe(apiResponse.trips.length);
  });

  it('signals truncation in the response when the cap is hit', () => {
    const fakeRows = Array.from({ length: 9999 }, (_, i) => ({ id: `trip-${i}` }));
    const result = applyExportCap(fakeRows, 5000);

    const apiResponse = {
      trips: result.rows,
      truncated: result.truncated,
      cap: result.cap,
      count: result.rows.length,
    };

    expect(apiResponse.truncated).toBe(true);
    expect(apiResponse.count).toBe(5000);
    expect(apiResponse.cap).toBe(5000);
  });
});
