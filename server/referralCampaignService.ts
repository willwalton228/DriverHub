import { db } from "./db";
import {
  referralCampaigns,
  referralCampaignMilestones,
  referralMilestoneProgress,
  type ReferralCampaign,
  type ReferralCampaignMilestone,
  type InsertReferralCampaign,
  type InsertReferralCampaignMilestone,
  type InsertReferralMilestoneProgress,
} from "@shared/schema";
import { eq, and, sql, desc, inArray, or, isNull, lte, gte } from "drizzle-orm";

// ─── Campaign CRUD ─────────────────────────────────────────────────────────────

export async function listCampaigns(filter?: { status?: string }) {
  const rows = await db.select().from(referralCampaigns).orderBy(desc(referralCampaigns.createdAt));
  const campaigns = filter?.status ? rows.filter((c) => c.status === filter.status) : rows;
  // attach milestone summaries
  const ids = campaigns.map((c) => c.id);
  const milestones = ids.length
    ? await db.select().from(referralCampaignMilestones).where(inArray(referralCampaignMilestones.campaignId, ids))
    : [];
  const milestoneMap: Record<string, ReferralCampaignMilestone[]> = {};
  for (const m of milestones) {
    if (!milestoneMap[m.campaignId]) milestoneMap[m.campaignId] = [];
    milestoneMap[m.campaignId].push(m);
  }
  return campaigns.map((c) => ({
    ...c,
    milestones: (milestoneMap[c.id] || []).sort((a, b) => a.sortOrder - b.sortOrder),
    totalPotentialReward: (milestoneMap[c.id] || []).reduce((s, m) => s + Number(m.rewardAmount), 0),
  }));
}

export async function getCampaign(id: string) {
  const [campaign] = await db.select().from(referralCampaigns).where(eq(referralCampaigns.id, id));
  if (!campaign) return null;
  const milestones = await db
    .select()
    .from(referralCampaignMilestones)
    .where(eq(referralCampaignMilestones.campaignId, id))
    .orderBy(referralCampaignMilestones.sortOrder);
  return {
    ...campaign,
    milestones,
    totalPotentialReward: milestones.reduce((s, m) => s + Number(m.rewardAmount), 0),
  };
}

export async function createCampaign(
  data: InsertReferralCampaign,
  milestones: InsertReferralCampaignMilestone[],
  createdBy?: string
) {
  const [campaign] = await db
    .insert(referralCampaigns)
    .values({ ...data, createdBy: createdBy ?? null })
    .returning();
  const ms = milestones.length
    ? await db
        .insert(referralCampaignMilestones)
        .values(milestones.map((m, i) => ({ ...m, campaignId: campaign.id, sortOrder: i })))
        .returning()
    : [];
  return { ...campaign, milestones: ms, totalPotentialReward: ms.reduce((s, m) => s + Number(m.rewardAmount), 0) };
}

export async function updateCampaign(
  id: string,
  data: Partial<InsertReferralCampaign>,
  milestones?: InsertReferralCampaignMilestone[]
) {
  const [campaign] = await db
    .update(referralCampaigns)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(referralCampaigns.id, id))
    .returning();
  if (!campaign) return null;

  let ms: ReferralCampaignMilestone[] = [];
  if (milestones !== undefined) {
    // replace all milestones
    await db.delete(referralCampaignMilestones).where(eq(referralCampaignMilestones.campaignId, id));
    ms = milestones.length
      ? await db
          .insert(referralCampaignMilestones)
          .values(milestones.map((m, i) => ({ ...m, campaignId: id, sortOrder: i })))
          .returning()
      : [];
  } else {
    ms = await db
      .select()
      .from(referralCampaignMilestones)
      .where(eq(referralCampaignMilestones.campaignId, id))
      .orderBy(referralCampaignMilestones.sortOrder);
  }
  return { ...campaign, milestones: ms, totalPotentialReward: ms.reduce((s, m) => s + Number(m.rewardAmount), 0) };
}

export async function duplicateCampaign(id: string, createdBy?: string) {
  const original = await getCampaign(id);
  if (!original) return null;
  const { milestones, totalPotentialReward, id: _id, createdAt, updatedAt, ...rest } = original;
  return createCampaign(
    { ...rest, name: `${rest.name} (Copy)`, status: "draft" },
    milestones.map(({ id: _mid, campaignId: _cid, createdAt: _cat, ...m }) => m),
    createdBy
  );
}

export async function setCampaignStatus(id: string, status: string) {
  const [campaign] = await db
    .update(referralCampaigns)
    .set({ status, updatedAt: new Date() })
    .where(eq(referralCampaigns.id, id))
    .returning();
  return campaign;
}

// ─── Driver-Facing: active campaigns eligibility ───────────────────────────────

export async function getActiveCampaigns(driverType?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const all = await db.select().from(referralCampaigns).where(eq(referralCampaigns.status, "active"));
  const eligible = all.filter((c) => {
    if (c.startDate && c.startDate > today) return false;
    if (c.endDate && c.endDate < today) return false;
    if (driverType && c.eligibleDriverTypes.length > 0 && !c.eligibleDriverTypes.includes(driverType)) return false;
    return true;
  });
  const ids = eligible.map((c) => c.id);
  const milestones = ids.length
    ? await db.select().from(referralCampaignMilestones).where(inArray(referralCampaignMilestones.campaignId, ids))
    : [];
  const milestoneMap: Record<string, ReferralCampaignMilestone[]> = {};
  for (const m of milestones) {
    if (!milestoneMap[m.campaignId]) milestoneMap[m.campaignId] = [];
    milestoneMap[m.campaignId].push(m);
  }
  return eligible.map((c) => ({
    ...c,
    milestones: (milestoneMap[c.id] || []).sort((a, b) => a.sortOrder - b.sortOrder),
    totalPotentialReward: (milestoneMap[c.id] || []).reduce((s, m) => s + Number(m.rewardAmount), 0),
    daysRemaining: c.endDate
      ? Math.max(0, Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000))
      : null,
  }));
}

// ─── Driver referral reward progress ──────────────────────────────────────────

export async function getDriverReferralRewards(driverIdOrUserId: string) {
  const rows = await db
    .select({
      progress: referralMilestoneProgress,
      campaign: referralCampaigns,
      milestone: referralCampaignMilestones,
    })
    .from(referralMilestoneProgress)
    .innerJoin(referralCampaigns, eq(referralCampaigns.id, referralMilestoneProgress.campaignId))
    .innerJoin(referralCampaignMilestones, eq(referralCampaignMilestones.id, referralMilestoneProgress.milestoneId))
    .where(eq(referralMilestoneProgress.referrerDriverId, driverIdOrUserId))
    .orderBy(desc(referralMilestoneProgress.achievedAt));

  const totalEarned = rows
    .filter((r) => r.progress.achievedAt && r.progress.paymentStatus !== "voided")
    .reduce((s, r) => s + Number(r.progress.rewardAmount), 0);
  const totalPaid = rows
    .filter((r) => r.progress.paymentStatus === "paid")
    .reduce((s, r) => s + Number(r.progress.rewardAmount), 0);
  const totalPending = rows
    .filter((r) => r.progress.achievedAt && r.progress.paymentStatus === "pending")
    .reduce((s, r) => s + Number(r.progress.rewardAmount), 0);

  return { rows, totalEarned, totalPaid, totalPending };
}

// ─── Admin: campaign reporting ─────────────────────────────────────────────────

export async function getCampaignReport(campaignId?: string) {
  let query = db
    .select({
      progress: referralMilestoneProgress,
      campaign: referralCampaigns,
      milestone: referralCampaignMilestones,
    })
    .from(referralMilestoneProgress)
    .innerJoin(referralCampaigns, eq(referralCampaigns.id, referralMilestoneProgress.campaignId))
    .innerJoin(referralCampaignMilestones, eq(referralCampaignMilestones.id, referralMilestoneProgress.milestoneId));

  const rows = campaignId
    ? await query.where(eq(referralMilestoneProgress.campaignId, campaignId))
    : await query;

  const totalBonusesEarned = rows
    .filter((r) => r.progress.achievedAt && r.progress.paymentStatus !== "voided")
    .reduce((s, r) => s + Number(r.progress.rewardAmount), 0);
  const totalBonusesPaid = rows
    .filter((r) => r.progress.paymentStatus === "paid")
    .reduce((s, r) => s + Number(r.progress.rewardAmount), 0);

  // Top referring drivers
  const driverMap: Record<string, number> = {};
  for (const r of rows.filter((r) => r.progress.achievedAt)) {
    const d = r.progress.referrerDriverId ?? "unknown";
    driverMap[d] = (driverMap[d] ?? 0) + 1;
  }
  const topDrivers = Object.entries(driverMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([driverId, count]) => ({ driverId, count }));

  return { rows, totalBonusesEarned, totalBonusesPaid, topDrivers };
}

// ─── Mark milestone achieved ──────────────────────────────────────────────────

export async function markMilestoneAchieved(
  referralId: string,
  milestoneId: string,
  referrerDriverId?: string
) {
  const [milestone] = await db
    .select()
    .from(referralCampaignMilestones)
    .where(eq(referralCampaignMilestones.id, milestoneId));
  if (!milestone) throw new Error("Milestone not found");

  const [existing] = await db
    .select()
    .from(referralMilestoneProgress)
    .where(
      and(
        eq(referralMilestoneProgress.referralId, referralId),
        eq(referralMilestoneProgress.milestoneId, milestoneId)
      )
    );
  if (existing?.achievedAt) return existing; // already achieved

  if (existing) {
    const [updated] = await db
      .update(referralMilestoneProgress)
      .set({ achievedAt: new Date(), rewardAmount: String(milestone.rewardAmount) })
      .where(eq(referralMilestoneProgress.id, existing.id))
      .returning();
    return updated;
  }

  const [progress] = await db
    .insert(referralMilestoneProgress)
    .values({
      referralId,
      campaignId: milestone.campaignId,
      milestoneId,
      referrerDriverId: referrerDriverId ?? null,
      achievedAt: new Date(),
      rewardAmount: String(milestone.rewardAmount),
      paymentStatus: "pending",
    })
    .onConflictDoNothing()
    .returning();
  return progress;
}

export async function updateMilestonePaymentStatus(progressId: string, paymentStatus: string, notes?: string) {
  const [row] = await db
    .update(referralMilestoneProgress)
    .set({ paymentStatus, paidAt: paymentStatus === "paid" ? new Date() : null, notes: notes ?? null })
    .where(eq(referralMilestoneProgress.id, progressId))
    .returning();
  return row;
}
