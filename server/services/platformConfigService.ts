import { db } from "../db";
import { platformConfigs } from "../../shared/schema";
import { and, eq, isNull, or } from "drizzle-orm";

export interface ResolvedConfig {
  configKey: string;
  configValue: any;
  scopeType: string;
  scopeId: string | null;
  label: string;
  configCategory: string;
}

/**
 * Resolve the effective config value for a given key and scope context.
 *
 * Resolution order (most-specific wins):
 *   1. Exact scope match  (scopeType + scopeId)
 *   2. Global             (scopeType = "global")
 *
 * Returns null if no config exists for the key.
 */
export async function resolveConfig(
  configKey: string,
  opts: { scopeType?: string; scopeId?: string } = {}
): Promise<ResolvedConfig | null> {
  const { scopeType, scopeId } = opts;

  const rows = await db
    .select()
    .from(platformConfigs)
    .where(
      and(
        eq(platformConfigs.configKey, configKey),
        eq(platformConfigs.isActive, true)
      )
    );

  if (rows.length === 0) return null;

  // Priority: scoped match first, then global
  let scoped: typeof rows[0] | undefined;
  let global: typeof rows[0] | undefined;

  for (const row of rows) {
    if (row.scopeType === "global" && !row.scopeId) {
      global = row;
    } else if (
      scopeType &&
      row.scopeType === scopeType &&
      row.scopeId === (scopeId ?? null)
    ) {
      scoped = row;
    }
  }

  const effective = scoped ?? global ?? null;
  if (!effective) return null;

  return {
    configKey: effective.configKey,
    configValue: effective.configValue,
    scopeType: effective.scopeType,
    scopeId: effective.scopeId ?? null,
    label: effective.label,
    configCategory: effective.configCategory,
  };
}

/**
 * Resolve a picklist (returns string[] or empty array).
 */
export async function resolvePicklist(
  configKey: string,
  opts: { scopeType?: string; scopeId?: string } = {}
): Promise<string[]> {
  const result = await resolveConfig(configKey, opts);
  if (!result) return [];
  const val = result.configValue;
  if (Array.isArray(val)) return val as string[];
  if (val && Array.isArray(val.items)) return val.items as string[];
  return [];
}

/**
 * Upsert a global config value by key.
 * If a global record exists, updates configValue. Otherwise inserts a new record.
 */
export async function upsertConfig(
  configKey: string,
  configValue: any,
  meta: { label?: string; configCategory?: string; description?: string } = {}
): Promise<void> {
  const rows = await db
    .select({ id: platformConfigs.id })
    .from(platformConfigs)
    .where(
      and(
        eq(platformConfigs.configKey, configKey),
        eq(platformConfigs.scopeType, "global"),
        isNull(platformConfigs.scopeId)
      )
    )
    .limit(1);

  if (rows.length > 0) {
    await db
      .update(platformConfigs)
      .set({ configValue, updatedAt: new Date() })
      .where(eq(platformConfigs.id, rows[0].id));
  } else {
    await db.insert(platformConfigs).values({
      configKey,
      configCategory: meta.configCategory ?? "default",
      label: meta.label ?? configKey,
      description: meta.description,
      configValue,
      scopeType: "global",
      scopeId: null,
      isActive: true,
    });
  }
}

/**
 * Seed global defaults if they don't yet exist.
 * Called once at startup.
 */
export async function seedGlobalDefaults(): Promise<void> {
  const defaults: Array<{
    configKey: string;
    label: string;
    configCategory: string;
    description: string;
    configValue: any;
  }> = [
    {
      configKey: "driver.types",
      label: "Driver Types",
      configCategory: "picklist",
      description: "Allowable driver employment/contract types.",
      configValue: ["IC", "W2"],
    },
    {
      configKey: "driver.models",
      label: "Driver Models",
      configCategory: "picklist",
      description: "Operational driver models available for assignment.",
      configValue: ["DNS Shifts", "DriverShift", "Hybrid"],
    },
    {
      configKey: "driver.networks",
      label: "Driver Networks",
      configCategory: "picklist",
      description: "Network classifications for drivers.",
      configValue: ["National", "Regional", "Local"],
    },
    {
      configKey: "account.programs",
      label: "Account Programs",
      configCategory: "picklist",
      description: "OEM or operator programs an account can be enrolled in.",
      configValue: ["Driver on Demand", "Lincoln", "Ford", "Cadillac", "Hyundai", "Toyota", "Tesla", "Rivian"],
    },
    {
      configKey: "account.regions",
      label: "Account Regions",
      configCategory: "picklist",
      description: "Geographic regions used for account classification.",
      configValue: ["Central", "East", "West", "Southeast", "Northeast", "Southwest", "Midwest"],
    },
    {
      configKey: "account.types",
      label: "Account Types",
      configCategory: "picklist",
      description: "Business type classifications for accounts.",
      configValue: ["Dealership", "Fleet", "Rental", "OEM", "Corporate", "Other"],
    },
    {
      configKey: "claim.statuses",
      label: "Claim Statuses",
      configCategory: "picklist",
      description: "Lifecycle statuses for claims.",
      configValue: ["open", "pending_review", "under_investigation", "closed", "denied"],
    },
    {
      configKey: "claim.types",
      label: "Claim Types",
      configCategory: "picklist",
      description: "Types of claims that can be filed.",
      configValue: ["accident", "property_damage", "bodily_injury", "theft", "liability", "other"],
    },
    {
      configKey: "driver.classifications",
      label: "Driver Classifications",
      configCategory: "picklist",
      description: "Classification levels for drivers.",
      configValue: ["Standard", "Senior", "Lead", "Trainer", "Probationary"],
    },
    {
      configKey: "account.ar_statuses",
      label: "A/R Statuses",
      configCategory: "picklist",
      description: "Accounts-receivable standing classifications.",
      configValue: ["Good", "Watch", "Past Due", "Collections", "Write-Off"],
    },
    {
      configKey: "scoring.health_weight_activity",
      label: "Health Score: Activity Weight",
      configCategory: "threshold",
      description: "Weight (0–100) given to recent activity when computing account health.",
      configValue: { value: 30, unit: "percent" },
    },
    {
      configKey: "scoring.health_weight_ar",
      label: "Health Score: A/R Weight",
      configCategory: "threshold",
      description: "Weight (0–100) given to A/R standing when computing account health.",
      configValue: { value: 40, unit: "percent" },
    },
    {
      configKey: "feature.rideshare_billing",
      label: "Rideshare Billing",
      configCategory: "feature_flag",
      description: "Enable the rideshare reconciliation and billing workflow.",
      configValue: { enabled: true },
    },
    {
      configKey: "feature.openforce_reconciliation",
      label: "OpenForce Reconciliation",
      configCategory: "feature_flag",
      description: "Enable OpenForce settlement file import and reconciliation.",
      configValue: { enabled: true },
    },
    {
      configKey: "billing.cutoff_day",
      label: "Billing Cutoff Day",
      configCategory: "default",
      description: "Day of the week on which the weekly invoice cycle closes. 0 = Sunday, 1 = Monday, 2 = Tuesday (default), 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday. Charges dated after this day's midnight go to the next billing cycle.",
      configValue: { day: 2, label: "Tuesday" },
    },
    {
      configKey: "billing.cutoff_config",
      label: "Billing Cutoff Configuration",
      configCategory: "default",
      description: "Full billing cutoff configuration including day of week, cutoff rule, timezone, and lock behavior.",
      configValue: {
        day: 2,
        cutoffRule: "same_day_end",
        timezone: "America/Los_Angeles",
        lockAfterRun: false,
      },
    },
    {
      configKey: "billing.last_run_date",
      label: "Last Billing Run Date",
      configCategory: "default",
      description: "Tracks the most recent successful weekly billing run. Used to enforce lock-after-run behavior.",
      configValue: { date: null, cycleStart: null, cycleEnd: null },
    },
    {
      configKey: "mvr.unresponsive_days",
      label: "MVR Unresponsive Threshold (days)",
      configCategory: "threshold",
      description: "Number of days after MVR request sent with no driver action before the record is auto-flagged as Unresponsive.",
      configValue: { days: 3 },
    },
  ];

  for (const d of defaults) {
    const existing = await db
      .select({ id: platformConfigs.id })
      .from(platformConfigs)
      .where(
        and(
          eq(platformConfigs.configKey, d.configKey),
          eq(platformConfigs.scopeType, "global"),
          isNull(platformConfigs.scopeId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(platformConfigs).values({
        configKey: d.configKey,
        configCategory: d.configCategory,
        label: d.label,
        description: d.description,
        configValue: d.configValue,
        scopeType: "global",
        scopeId: null,
        isActive: true,
      });
    }
  }

  console.log("[PlatformConfig] Global defaults seeded");
}
