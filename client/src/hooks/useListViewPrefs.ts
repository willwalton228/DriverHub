/**
 * useListViewPrefs — Reusable list view preference persistence.
 *
 * Persists filters, sort order, search, and any other list state to
 * localStorage, keyed per user and per module. Reads synchronously on
 * mount so the list renders immediately with the restored state (no flash).
 *
 * Usage:
 *   const { prefs, setPrefs, resetPrefs } = useListViewPrefs({
 *     moduleKey: "campaigns",     // unique per list screen
 *     userId:    user?.id,        // namespaces per user
 *     defaults:  MY_DEFAULTS,     // typed defaults object
 *   });
 *
 * Supported across all DriverHub list pages:
 *   Recruiting, Claims, Drivers, Moves, Accounts, Users, Invoices,
 *   Payments, Modification Requests, Scheduling, and future modules.
 *
 * Future extensions (not yet wired):
 *   - Saved Views / Team Views — store named snapshots of prefs
 *   - Column visibility / widths — add to the prefs object
 *   - Role-based default views — pass roleDefaults alongside defaults
 */

import { useState, useCallback } from "react";

// ── Storage helpers ────────────────────────────────────────────────────────────

const STORAGE_PREFIX = "dh:listprefs";

function storageKey(userId: string | undefined, moduleKey: string): string {
  return `${STORAGE_PREFIX}:${userId ?? "anon"}:${moduleKey}`;
}

function readStorage<T>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<T>;
    // Shallow-merge with defaults so new fields added in future code are
    // always present even if not yet in the stored snapshot.
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (e.g. private mode on some browsers) — fail silently.
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseListViewPrefsOptions<T> {
  /** Unique key for this list screen — e.g. "campaigns", "claims", "drivers". */
  moduleKey: string;
  /** User ID — namespaces the storage so different users on the same device
   *  get independent preferences. Pass undefined before auth resolves. */
  userId: string | undefined;
  /** System defaults — used on first visit and after resetPrefs(). */
  defaults: T;
}

export interface UseListViewPrefsResult<T> {
  /** The current preferences (filters, sort, search, etc.). */
  prefs: T;
  /** Merge a partial update into prefs and persist immediately. */
  setPrefs: (patch: Partial<T>) => void;
  /** Reset to system defaults and clear the stored snapshot. */
  resetPrefs: () => void;
}

export function useListViewPrefs<T extends object>(
  opts: UseListViewPrefsOptions<T>,
): UseListViewPrefsResult<T> {
  const key = storageKey(opts.userId, opts.moduleKey);

  // Lazy initializer — reads localStorage synchronously once so the
  // component renders with restored state immediately, no second render.
  const [prefs, setPrefsState] = useState<T>(() => readStorage<T>(key, opts.defaults));

  const setPrefs = useCallback(
    (patch: Partial<T>) => {
      setPrefsState((prev) => {
        const next = { ...prev, ...patch };
        writeStorage(key, next);
        return next;
      });
    },
    [key],
  );

  const resetPrefs = useCallback(() => {
    setPrefsState(opts.defaults);
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key, opts.defaults]);

  return { prefs, setPrefs, resetPrefs };
}

// ── Scroll position helpers ───────────────────────────────────────────────────
// Used by list components to save/restore window.scrollY across sessions.

export function saveScrollPosition(userId: string | undefined, moduleKey: string): void {
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}:scroll:${userId ?? "anon"}:${moduleKey}`,
      String(Math.round(window.scrollY)),
    );
  } catch {
    // ignore
  }
}

export function readScrollPosition(userId: string | undefined, moduleKey: string): number {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:scroll:${userId ?? "anon"}:${moduleKey}`);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export function clearScrollPosition(userId: string | undefined, moduleKey: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}:scroll:${userId ?? "anon"}:${moduleKey}`);
  } catch {
    // ignore
  }
}
