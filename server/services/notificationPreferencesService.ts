/**
 * User Notification Preferences Service
 *
 * Provides helpers for reading and writing per-user notification preferences,
 * and for filtering recipient lists based on those preferences.
 *
 * Design rules:
 *   - Default is ENABLED. A user with no preference rows receives everything.
 *   - Preferences are stored as opt-out rows: enabled=false means "don't send".
 *   - Mandatory engine events (def.mandatory === true) bypass this filter entirely.
 *   - Module 'all' is a wildcard that applies across every module.
 *
 * The filter query is a single batched NOT IN so it never issues N+1 queries.
 */

import { pool } from "../db";

export type NotificationChannel = "in_app" | "email" | "sms" | "digest";
export type NotificationCategory =
  | "assigned_to_me"
  | "status_changes"
  | "comments"
  | "mentions"
  | "approval_requests"
  | "cc_updates"
  | "completed_tasks"
  | "system_announcements";

export interface UserNotificationPreference {
  id: string;
  userId: string;
  module: string;
  category: string;
  channel: NotificationChannel;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreferenceUpsert {
  module: string;
  category: string;
  channel: NotificationChannel;
  enabled: boolean;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns all preference rows for a user.
 * An empty array means the user has no customisations (receives everything).
 */
export async function getUserPreferences(userId: string): Promise<UserNotificationPreference[]> {
  const r = await pool.query<UserNotificationPreference>(
    `SELECT id, user_id AS "userId", module, category, channel, enabled,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM user_notification_preferences
      WHERE user_id = $1
      ORDER BY module, category, channel`,
    [userId],
  );
  return r.rows;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Upserts one or more preference rows for a user.
 * Each row is identified by (userId, module, category, channel).
 * When enabled=true the row is deleted (falling back to the enabled default)
 * rather than storing a redundant enabled=true row.
 */
export async function setUserPreferences(
  userId: string,
  prefs: PreferenceUpsert[],
): Promise<void> {
  if (!prefs.length) return;

  // Delete rows being re-enabled (no need to store enabled=true defaults)
  const enabling = prefs.filter((p) => p.enabled);
  if (enabling.length) {
    for (const p of enabling) {
      await pool.query(
        `DELETE FROM user_notification_preferences
          WHERE user_id = $1 AND module = $2 AND category = $3 AND channel = $4`,
        [userId, p.module, p.category, p.channel],
      );
    }
  }

  // Upsert rows being disabled
  const disabling = prefs.filter((p) => !p.enabled);
  for (const p of disabling) {
    await pool.query(
      `INSERT INTO user_notification_preferences (user_id, module, category, channel, enabled, updated_at)
            VALUES ($1, $2, $3, $4, FALSE, NOW())
       ON CONFLICT (user_id, module, category, channel)
       DO UPDATE SET enabled = FALSE, updated_at = NOW()`,
      [userId, p.module, p.category, p.channel],
    );
  }
}

// ── Engine filter ─────────────────────────────────────────────────────────────

/**
 * Given a list of candidate user IDs, returns only those who have NOT
 * opted out of this (module, category, channel) combination.
 *
 * A user who has opted out of module='all' is excluded from every module.
 * A user who has opted out of a specific module is excluded only for that module.
 *
 * Non-throwing: on DB error returns the full input list (fail-open) so a
 * preferences DB outage never silently drops a notification.
 */
export async function filterByPreferences(
  userIds: string[],
  module: string,
  category: NotificationCategory | undefined,
  channel: NotificationChannel = "in_app",
): Promise<string[]> {
  if (!userIds.length || !category) return userIds;

  try {
    const r = await pool.query<{ user_id: string }>(
      `SELECT input_id AS user_id
         FROM unnest($1::text[]) AS input_id
        WHERE input_id NOT IN (
          SELECT user_id
            FROM user_notification_preferences
           WHERE user_id = ANY($1::text[])
             AND module IN ($2, 'all')
             AND category = $3
             AND channel = $4
             AND enabled = FALSE
        )`,
      [userIds, module, category, channel],
    );
    return r.rows.map((row) => row.user_id);
  } catch (err: any) {
    // Fail open — preference outage should not silence notifications
    console.error("[NotifPrefs] filterByPreferences error (fail-open):", err.message);
    return userIds;
  }
}
