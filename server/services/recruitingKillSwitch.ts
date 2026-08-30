import { db } from "../db";
import { recruitingFeatureFlags } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export const KILL_SWITCH_KEYS = {
  PUBLIC_APPLY: "kill_switch_public_apply",
  OUTBOUND_COMMS: "kill_switch_outbound_comms",
} as const;

export const KILL_SWITCH_DEFAULTS: Record<string, {
  name: string;
  description: string;
  warningMessage: string;
}> = {
  [KILL_SWITCH_KEYS.PUBLIC_APPLY]: {
    name: "Disable Public Apply Intake",
    description: "When activated, all public job application forms will be disabled and new applications will be rejected. Existing applications and data remain accessible.",
    warningMessage: "This will immediately prevent all new candidate applications across the system. Existing data will not be affected.",
  },
  [KILL_SWITCH_KEYS.OUTBOUND_COMMS]: {
    name: "Disable Outbound Communications",
    description: "When activated, all automated outbound communications (nudges, follow-ups, notifications to candidates) will be suppressed. Manual actions remain available.",
    warningMessage: "This will immediately stop all automated outbound communications to candidates. Nudge scans will skip sending messages.",
  },
};

export type KillSwitchKey = typeof KILL_SWITCH_KEYS[keyof typeof KILL_SWITCH_KEYS];

export interface KillSwitchStatus {
  key: string;
  isActive: boolean;
  scope: "global" | "market";
  market: string | null;
  activatedAt: Date | null;
  activatedBy: string | null;
}

export async function isKillSwitchActive(
  key: KillSwitchKey,
  market?: string | null,
): Promise<boolean> {
  if (market) {
    const [marketFlag] = await db
      .select({ isEnabled: recruitingFeatureFlags.isEnabled })
      .from(recruitingFeatureFlags)
      .where(
        and(
          eq(recruitingFeatureFlags.flagKey, key),
          eq(recruitingFeatureFlags.scope, "market"),
          eq(recruitingFeatureFlags.market, market),
        ),
      );
    if (marketFlag?.isEnabled) return true;
  }

  const [globalFlag] = await db
    .select({ isEnabled: recruitingFeatureFlags.isEnabled })
    .from(recruitingFeatureFlags)
    .where(
      and(
        eq(recruitingFeatureFlags.flagKey, key),
        eq(recruitingFeatureFlags.scope, "global"),
      ),
    );

  return globalFlag?.isEnabled ?? false;
}

export async function getKillSwitchStatuses(): Promise<KillSwitchStatus[]> {
  const flags = await db
    .select()
    .from(recruitingFeatureFlags)
    .where(
      eq(recruitingFeatureFlags.flagKey, KILL_SWITCH_KEYS.PUBLIC_APPLY),
    );

  const commsFlags = await db
    .select()
    .from(recruitingFeatureFlags)
    .where(
      eq(recruitingFeatureFlags.flagKey, KILL_SWITCH_KEYS.OUTBOUND_COMMS),
    );

  const allFlags = [...flags, ...commsFlags];

  return allFlags.map((f) => ({
    key: f.flagKey,
    isActive: f.isEnabled,
    scope: f.scope,
    market: f.market,
    activatedAt: f.updatedAt,
    activatedBy: f.updatedByEmail,
  }));
}

export async function getActiveKillSwitchSummary(): Promise<{
  publicApplyDisabled: boolean;
  outboundCommsDisabled: boolean;
  activeMarketOverrides: { key: string; market: string }[];
}> {
  const publicApply = await isKillSwitchActive(KILL_SWITCH_KEYS.PUBLIC_APPLY);
  const outboundComms = await isKillSwitchActive(KILL_SWITCH_KEYS.OUTBOUND_COMMS);

  const marketOverrides = await db
    .select({
      flagKey: recruitingFeatureFlags.flagKey,
      market: recruitingFeatureFlags.market,
    })
    .from(recruitingFeatureFlags)
    .where(
      and(
        eq(recruitingFeatureFlags.scope, "market"),
        eq(recruitingFeatureFlags.isEnabled, true),
      ),
    );

  const killSwitchOverrides = marketOverrides
    .filter(
      (o) =>
        o.market !== null &&
        (o.flagKey === KILL_SWITCH_KEYS.PUBLIC_APPLY ||
          o.flagKey === KILL_SWITCH_KEYS.OUTBOUND_COMMS),
    )
    .map((o) => ({ key: o.flagKey, market: o.market! }));

  return {
    publicApplyDisabled: publicApply,
    outboundCommsDisabled: outboundComms,
    activeMarketOverrides: killSwitchOverrides,
  };
}
