/**
 * WhenIWork (WIW) API Client
 * Docs: https://apidocs.wheniwork.com/
 *
 * Auth: W-Token header with API token resolved from environment config.
 * When token is absent, all methods return empty results without throwing.
 *
 * Each environment uses its own token:
 *   production  → WHENIWORK_API_TOKEN
 *   staging     → WHENIWORK_API_TOKEN_STAGING
 *   development → WHENIWORK_API_TOKEN (or unset — sync disabled)
 */

import { resolveWiwToken, ENV_LOG_PREFIX } from "../config/environment";

const WIW_BASE_URL = "https://api.wheniwork.com/2";
const WIW_TOKEN = resolveWiwToken();

export function isWiwApiConfigured(): boolean {
  return !!WIW_TOKEN;
}

interface WiwTimeclock {
  id: number;
  user_id: number;
  start_time: string;
  end_time: string | null;
  length: number | null;
  notes: string | null;
}

interface WiwShift {
  id: number;
  user_id: number;
  start_time: string;
  end_time: string;
  length: number;
  published: boolean;
  notes: string | null;
}

interface WiwUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

async function wiwFetch<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  if (!WIW_TOKEN) return null;

  const url = new URL(`${WIW_BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "W-Token": WIW_TOKEN,
        "W-Version": "2",
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`${ENV_LOG_PREFIX}[WIW API] ${path} returned ${res.status}: ${await res.text()}`);
      return null;
    }

    return await res.json() as T;
  } catch (err) {
    console.warn(`${ENV_LOG_PREFIX}[WIW API] Fetch error for ${path}:`, err);
    return null;
  }
}

/**
 * Returns map of wiwUserId -> total worked hours for the given date range.
 * Uses the /timeclocks endpoint (actual clock-in/out records).
 * Returns empty map if API is not configured or call fails.
 */
export async function fetchWorkedHoursByUser(
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!WIW_TOKEN) return result;

  const data = await wiwFetch<{ timeclocks: WiwTimeclock[] }>("/timeclocks", {
    start: startDate,
    end: endDate,
  });

  if (!data?.timeclocks) return result;

  for (const tc of data.timeclocks) {
    if (!tc.user_id || !tc.end_time) continue;
    const uid = String(tc.user_id);
    const lengthSeconds = tc.length ?? 0;
    const hours = lengthSeconds / 3600;
    result.set(uid, (result.get(uid) ?? 0) + hours);
  }

  return result;
}

/**
 * Returns map of wiwUserId -> total future scheduled hours for the given date range.
 * Uses the /shifts endpoint. Only published shifts are included.
 * Returns empty map if API is not configured or call fails.
 */
export async function fetchRemainingScheduledHoursByUser(
  startDate: string,
  endDate: string,
  afterTimestamp: Date
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!WIW_TOKEN) return result;

  const data = await wiwFetch<{ shifts: WiwShift[] }>("/shifts", {
    start: startDate,
    end: endDate,
  });

  if (!data?.shifts) return result;

  const afterMs = afterTimestamp.getTime();
  for (const shift of data.shifts) {
    if (!shift.user_id || !shift.published) continue;
    const shiftStart = new Date(shift.start_time).getTime();
    if (shiftStart <= afterMs) continue;
    const uid = String(shift.user_id);
    const hours = (shift.length ?? 0) / 3600;
    result.set(uid, (result.get(uid) ?? 0) + hours);
  }

  return result;
}

/**
 * Returns list of WIW users for mapping to DriverHub employees.
 */
export async function fetchWiwUsers(): Promise<WiwUser[]> {
  if (!WIW_TOKEN) return [];
  const data = await wiwFetch<{ users: WiwUser[] }>("/users");
  return data?.users ?? [];
}
