/**
 * User Notification Preferences – API Routes
 *
 * GET  /api/me/notification-preferences
 *   Returns all preference rows for the authenticated user.
 *   An absent row means "enabled" (opt-out model).
 *
 * PATCH /api/me/notification-preferences
 *   Body: { preferences: [{ module, category, channel, enabled }] }
 *   Upserts the supplied preferences. Sending enabled=true deletes the
 *   opt-out row (restoring the default). Mandatory events cannot be
 *   disabled here — they are enforced server-side in the engine.
 *
 * GET /api/me/notification-preferences/schema
 *   Returns the static preference schema (modules, categories, channel
 *   options, mandatory flags) so the frontend can render a self-describing
 *   preferences UI without hardcoding it.
 */

import { Router, Request, Response } from "express";
import {
  getUserPreferences,
  setUserPreferences,
  type PreferenceUpsert,
  type NotificationChannel,
} from "../services/notificationPreferencesService";

const router = Router();

// ── Session helper ─────────────────────────────────────────────────────────────
function getSessionUserId(req: Request): string | null {
  const u = (req as any).user;
  return u?.claims?.sub ?? (req.session as any)?.userId ?? u?.id ?? null;
}

// ── Static schema ─────────────────────────────────────────────────────────────
// Defines which preference controls are shown in the UI per module.
// mandatory=true means the engine delivers it regardless of the user's preference row.
const PREFERENCE_SCHEMA = [
  {
    module: "tickets",
    label: "AMRs",
    description: "App Modification Requests you are involved with",
    categories: [
      { category: "assigned_to_me", label: "Assigned to Me", description: "When an AMR is assigned to you as developer or tester", mandatory: true },
      { category: "status_changes", label: "Status Changes", description: "When an AMR you submitted or are involved with changes status" },
      { category: "comments", label: "Comments", description: "When someone comments on an AMR you are participating in" },
      { category: "mentions", label: "Mentions", description: "When you are @mentioned in a comment" },
      { category: "cc_updates", label: "CC Updates", description: "When you are added to the CC list on an AMR" },
    ],
  },
  {
    module: "recruiting",
    label: "Recruiting",
    description: "Recruiting requests and candidate activity",
    categories: [
      { category: "approval_requests", label: "Approval Requests", description: "Recruiting requests awaiting your approval", mandatory: true },
      { category: "assigned_to_me", label: "Assigned Requests", description: "When a recruiting request is assigned to you" },
      { category: "status_changes", label: "Status Changes", description: "When a request you submitted or manage changes status" },
    ],
  },
  {
    module: "claims",
    label: "Claims",
    description: "Claim lifecycle events for claims you manage",
    categories: [
      { category: "status_changes", label: "Status Changes", description: "When a claim changes status" },
      { category: "assigned_to_me", label: "Action Required", description: "When documentation or follow-up is required on a claim" },
      { category: "completed_tasks", label: "Resolved Claims", description: "When a claim is closed or resolved" },
    ],
  },
  {
    module: "invoices",
    label: "Invoices",
    description: "Invoice approval and payment activity",
    categories: [
      { category: "approval_requests", label: "Awaiting Approval", description: "Invoices submitted for your approval" },
      { category: "status_changes", label: "Approval Decisions", description: "When an invoice you submitted is approved or rejected" },
      { category: "assigned_to_me", label: "Overdue & Exceptions", description: "Overdue invoices and payment exceptions on accounts you manage" },
    ],
  },
  {
    module: "staffing",
    label: "Driver Management",
    description: "Driver status and scheduling alerts for your accounts",
    categories: [
      { category: "status_changes", label: "Driver Status Changes", description: "When a driver's status changes on an account you manage" },
      { category: "assigned_to_me", label: "Alerts", description: "Shortage alerts, projected OT, and expiring documents" },
    ],
  },
  {
    module: "vendors",
    label: "Vendors",
    description: "Contract renewals and compliance for vendors you own",
    categories: [
      { category: "assigned_to_me", label: "Renewal & Compliance Alerts", description: "Contract renewal windows and expiring compliance documents" },
      { category: "status_changes", label: "New Vendors", description: "When a new vendor is added to the system" },
    ],
  },
  {
    module: "system",
    label: "System & Administration",
    description: "Platform-level access and security events",
    categories: [
      { category: "approval_requests", label: "Access Requests", description: "User access requests requiring your approval", mandatory: true },
      { category: "system_announcements", label: "Account Changes", description: "User account disabled or restored events", mandatory: true },
    ],
  },
];

const VALID_CHANNELS: NotificationChannel[] = ["in_app", "email", "sms", "digest"];
const VALID_CATEGORIES = new Set([
  "assigned_to_me", "status_changes", "comments", "mentions",
  "approval_requests", "cc_updates", "completed_tasks", "system_announcements",
]);
const VALID_MODULES = new Set([
  "all", "tickets", "recruiting", "claims", "invoices", "staffing", "vendors", "system",
]);

// ── GET /api/me/notification-preferences/schema ───────────────────────────────

router.get("/schema", (_req: Request, res: Response) => {
  res.json(PREFERENCE_SCHEMA);
});

// ── GET /api/me/notification-preferences ─────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const prefs = await getUserPreferences(userId);
    res.json(prefs);
  } catch (err: any) {
    console.error("[NotifPrefsRoute] GET error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/me/notification-preferences ────────────────────────────────────

router.patch("/", async (req: Request, res: Response) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { preferences } = req.body;
    if (!Array.isArray(preferences)) {
      return res.status(400).json({ error: "preferences must be an array" });
    }

    // Validate each entry
    const valid: PreferenceUpsert[] = [];
    const errors: string[] = [];

    for (const p of preferences) {
      if (!VALID_MODULES.has(p.module)) {
        errors.push(`Unknown module: ${p.module}`);
        continue;
      }
      if (!VALID_CATEGORIES.has(p.category)) {
        errors.push(`Unknown category: ${p.category}`);
        continue;
      }
      if (!VALID_CHANNELS.includes(p.channel)) {
        errors.push(`Unknown channel: ${p.channel}`);
        continue;
      }
      if (typeof p.enabled !== "boolean") {
        errors.push(`enabled must be boolean for ${p.module}:${p.category}:${p.channel}`);
        continue;
      }
      valid.push({ module: p.module, category: p.category, channel: p.channel, enabled: p.enabled });
    }

    if (errors.length) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }

    await setUserPreferences(userId, valid);
    const updated = await getUserPreferences(userId);
    res.json(updated);
  } catch (err: any) {
    console.error("[NotifPrefsRoute] PATCH error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
