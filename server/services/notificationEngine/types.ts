/**
 * Notification Rules Engine – Core Types
 *
 * These interfaces define the contract for every notification event registered
 * with the engine. Adding a new notification type means adding one entry to the
 * relevant events/ file and registering it in bootstrapEngine.ts — no other
 * files need to change.
 */

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Passed to every resolver and template function when an event fires.
 * `payload` carries all event-specific data (claim fields, ticket ID, etc.).
 */
export interface NotificationContext {
  /**
   * The user who triggered the event.
   * When excludeActor is true (the default), this user is removed from the
   * final recipient list so people don't receive notifications about their
   * own actions.
   */
  actorUserId?: string | null;

  /**
   * Organization that owns the business event. Resolvers that use
   * organization-scoped configuration must return no recipients when this is
   * absent rather than reading an arbitrary organization's settings.
   */
  orgId?: string | null;

  /** All event-specific data. Shape is defined per-event. */
  payload: Record<string, any>;
}

// ── Recipients ────────────────────────────────────────────────────────────────

/**
 * A single resolver that answers: "who should receive this notification, and why?"
 * Multiple resolvers run in parallel and their results are merged.
 */
export interface RecipientResolver {
  /**
   * A short human-readable label explaining why this resolver's users are
   * being notified (e.g. "owner", "assignee", "cc").
   * Surfaced in admin audit logs and the dry-run endpoint.
   */
  reason: string;

  /**
   * Returns the user IDs that this resolver determines should be notified.
   * May be sync or async. Errors thrown here are caught and logged — they
   * will not prevent other resolvers from running.
   */
  resolve: (ctx: NotificationContext) => string[] | Promise<string[]>;
}

/** A resolved recipient with the reason they were selected. */
export interface ResolvedRecipient {
  userId: string;
  reason: string;
}

// ── Notification content ──────────────────────────────────────────────────────

export interface NotificationTemplate {
  /** Matches the `type` column in the notifications table (e.g. "claim_created"). */
  type: string;
  title: string;
  message: string;
}

export interface NotificationEntityRef {
  type: string;  // e.g. "claim", "ticket", "invoice"
  id: string;
  url?: string | null;
}

// ── Notification category (maps to user preference rows) ──────────────────────

/**
 * User-facing category for notification preferences.
 * Events tagged with a category can be opted out of via the preferences UI.
 * Events with mandatory=true are always delivered regardless of preferences.
 */
export type NotificationCategory =
  | "assigned_to_me"
  | "status_changes"
  | "comments"
  | "mentions"
  | "approval_requests"
  | "cc_updates"
  | "completed_tasks"
  | "system_announcements";

// ── Event definition ──────────────────────────────────────────────────────────

export interface NotificationEventDef {
  /**
   * Unique event identifier in SCREAMING_SNAKE_CASE.
   * This is the key used when calling notify("CLAIM_CREATED", ctx).
   */
  event: string;

  /**
   * Source module for categorisation and audit (e.g. "claims", "tickets").
   * Must match the module names in the user_notification_preferences table.
   */
  module: string;

  /** Human-readable description shown in the admin event registry. */
  description: string;

  /**
   * User-facing category that maps to a user_notification_preferences row.
   * When set, the engine checks whether each recipient has opted out of this
   * category before delivering the notification.
   *
   * Leave undefined for system-internal events with no user-facing preference.
   */
  category?: NotificationCategory;

  /**
   * When true, user preferences are ignored and the notification is always
   * delivered. Use for escalations, designated-approver events, and
   * system-level security events where silencing would prevent the user
   * from performing their core responsibilities.
   *
   * Default: false (preferences apply).
   */
  mandatory?: boolean;

  /**
   * Optional role allowlist. Only users whose role appears here will receive
   * notifications from this event. Full-access roles (super_user, admin,
   * corporate_admin) always pass regardless of this list.
   *
   * Leave undefined to allow all roles (use when recipients are tightly
   * scoped by ownership/assignment resolvers anyway).
   */
  eligibleRoles?: string[];

  /**
   * One or more resolvers. All run in parallel; results are merged and
   * deduplicated. Each resolver provides a distinct "reason" that explains
   * why those users are being notified.
   */
  recipients: RecipientResolver[];

  /**
   * Builds the in-app notification title and message from the event context.
   */
  template: (ctx: NotificationContext) => NotificationTemplate;

  /**
   * Links the notification to the business entity it concerns.
   * Drives the relatedEntityType, relatedEntityId, and actionUrl columns.
   */
  entity?: (ctx: NotificationContext) => NotificationEntityRef | null;

  /**
   * When true (the default), the actorUserId is excluded from recipients so
   * users don't receive notifications about their own actions.
   */
  excludeActor?: boolean;

  /**
   * Channels this event should be delivered on.
   * Default: ["in_app"]. Reserved for future multi-channel delivery.
   */
  channels?: Array<"in_app" | "email" | "sms" | "digest">;
}
