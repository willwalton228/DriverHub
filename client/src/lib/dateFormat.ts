import { format } from "date-fns";

/**
 * Parse any date value into a JavaScript Date using LOCAL calendar coordinates.
 *
 * Why this matters
 * ─────────────────
 * PostgreSQL `date` columns return "YYYY-MM-DD" strings via our Neon type-parser
 * override.  Passing such a string directly to `new Date()` makes JavaScript treat
 * it as **UTC midnight**, so in a US timezone (UTC-5/6) the date appears to be the
 * *prior* day.  This function avoids that by constructing the Date in LOCAL time.
 *
 * Handles:
 *   • JS Date objects  → extract local year/month/day (strips time component)
 *   • "YYYY-MM-DD"     → build local-time Date from components
 *   • "YYYY-MM-DD HH:MM…" / "YYYY-MM-DDTHH:MM…" → use date portion only, local time
 *   • anything else    → falls back to `new Date(str)` (best-effort)
 */
export function parseDateSafe(date: Date | string): Date {
  if (date instanceof Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  const str = String(date).trim();
  const dateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(parseInt(dateOnly[1]), parseInt(dateOnly[2]) - 1, parseInt(dateOnly[3]));
  }
  const withTime = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ]/);
  if (withTime) {
    return new Date(parseInt(withTime[1]), parseInt(withTime[2]) - 1, parseInt(withTime[3]));
  }
  return new Date(str);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  try {
    return format(parseDateSafe(date), "MM/dd/yyyy");
  } catch {
    return "—";
  }
}

export function parseFormDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  try {
    return format(parseDateSafe(date), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

export function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  try {
    return format(new Date(date), "MM/dd/yyyy 'at' h:mm a");
  } catch {
    return "";
  }
}

export function formatNoteDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  try {
    return format(new Date(date), "MM/dd/yyyy - HH:mm");
  } catch {
    return "";
  }
}
