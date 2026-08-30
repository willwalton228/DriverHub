import { db } from "../db";
import { recruitingSavedViews, type InsertRecruitingSavedView, type RecruitingSavedView } from "@shared/schema";
import { eq, and, or, sql, desc, asc, isNull } from "drizzle-orm";

export type SavedViewFilters = {
  market?: string;
  stage?: string;
  readinessStatus?: string;
  slaBreached?: boolean;
  tags?: string[];
  requisitionId?: string;
  assignedTo?: string;
  includeArchived?: boolean;
  dateRange?: {
    field: string;
    start?: string;
    end?: string;
  };
  searchQuery?: string;
};

const DEFAULT_SYSTEM_VIEWS: Omit<InsertRecruitingSavedView, "createdBy">[] = [
  {
    name: "All Applications",
    description: "View all active applications in the pipeline",
    type: "system",
    icon: "Users",
    color: "blue",
    filters: {},
    sortBy: "appliedAt",
    sortOrder: "desc",
    displayOrder: 0,
    isActive: true,
  },
  {
    name: "New Applications",
    description: "Recently submitted applications awaiting initial review",
    type: "system",
    icon: "UserPlus",
    color: "green",
    filters: { stage: "applied" },
    sortBy: "appliedAt",
    sortOrder: "desc",
    displayOrder: 1,
    isActive: true,
  },
  {
    name: "SLA Breached",
    description: "Applications that have exceeded their SLA time limits",
    type: "system",
    icon: "AlertTriangle",
    color: "red",
    filters: { slaBreached: true },
    sortBy: "appliedAt",
    sortOrder: "asc",
    displayOrder: 2,
    isActive: true,
  },
  {
    name: "Docs Pending",
    description: "Candidates with missing or expired documentation",
    type: "system",
    icon: "FileWarning",
    color: "orange",
    filters: { readinessStatus: "not_ready" },
    sortBy: "updatedAt",
    sortOrder: "desc",
    displayOrder: 3,
    isActive: true,
  },
  {
    name: "Ready for Approval",
    description: "Candidates who have completed all requirements and are ready for final approval",
    type: "system",
    icon: "CheckCircle",
    color: "emerald",
    filters: { readinessStatus: "ready", stage: "final_review" },
    sortBy: "appliedAt",
    sortOrder: "asc",
    displayOrder: 4,
    isActive: true,
  },
  {
    name: "In Review",
    description: "Applications currently under review",
    type: "system",
    icon: "Search",
    color: "purple",
    filters: { readinessStatus: "in_review" },
    sortBy: "updatedAt",
    sortOrder: "desc",
    displayOrder: 5,
    isActive: true,
  },
];

export const recruitingSavedViewsService = {
  async seedDefaultViews(): Promise<void> {
    const existingSystemViews = await db
      .select({ id: recruitingSavedViews.id })
      .from(recruitingSavedViews)
      .where(eq(recruitingSavedViews.type, "system"));

    if (existingSystemViews.length > 0) {
      console.log(`[SavedViews] ${existingSystemViews.length} system views already exist, skipping seed`);
      return;
    }

    console.log("[SavedViews] Seeding default system views...");
    for (const view of DEFAULT_SYSTEM_VIEWS) {
      await db.insert(recruitingSavedViews).values({
        ...view,
        createdBy: null,
      });
    }
    console.log(`[SavedViews] Created ${DEFAULT_SYSTEM_VIEWS.length} default system views`);
  },

  async getSavedViews(userId: string, userMarket?: string): Promise<RecruitingSavedView[]> {
    const views = await db
      .select()
      .from(recruitingSavedViews)
      .where(
        and(
          eq(recruitingSavedViews.isActive, true),
          or(
            eq(recruitingSavedViews.type, "system"),
            and(
              eq(recruitingSavedViews.type, "private"),
              eq(recruitingSavedViews.createdBy, userId)
            ),
            and(
              eq(recruitingSavedViews.type, "shared"),
              or(
                isNull(recruitingSavedViews.market),
                userMarket ? eq(recruitingSavedViews.market, userMarket) : sql`false`
              )
            )
          )
        )
      )
      .orderBy(asc(recruitingSavedViews.displayOrder), asc(recruitingSavedViews.name));

    return views;
  },

  async getSavedView(viewId: string): Promise<RecruitingSavedView | null> {
    const [view] = await db
      .select()
      .from(recruitingSavedViews)
      .where(and(
        eq(recruitingSavedViews.id, viewId),
        eq(recruitingSavedViews.isActive, true)
      ))
      .limit(1);
    return view || null;
  },

  async createSavedView(data: InsertRecruitingSavedView): Promise<RecruitingSavedView> {
    const [view] = await db
      .insert(recruitingSavedViews)
      .values(data)
      .returning();
    return view;
  },

  async updateSavedView(
    viewId: string,
    userId: string,
    updates: Partial<InsertRecruitingSavedView>
  ): Promise<RecruitingSavedView | null> {
    const existing = await this.getSavedView(viewId);
    if (!existing) return null;

    if (existing.type === "system") {
      throw new Error("Cannot modify system views");
    }

    if (existing.type === "private" && existing.createdBy !== userId) {
      throw new Error("Cannot modify another user's private view");
    }

    const [updated] = await db
      .update(recruitingSavedViews)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(recruitingSavedViews.id, viewId))
      .returning();

    return updated;
  },

  async deleteSavedView(viewId: string, userId: string): Promise<boolean> {
    const existing = await this.getSavedView(viewId);
    if (!existing) return false;

    if (existing.type === "system") {
      throw new Error("Cannot delete system views");
    }

    if (existing.type === "private" && existing.createdBy !== userId) {
      throw new Error("Cannot delete another user's private view");
    }

    await db
      .update(recruitingSavedViews)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(recruitingSavedViews.id, viewId));

    return true;
  },

  async trackViewUsage(viewId: string): Promise<void> {
    await db
      .update(recruitingSavedViews)
      .set({
        lastUsedAt: new Date(),
        usageCount: sql`COALESCE(${recruitingSavedViews.usageCount}, 0) + 1`,
      })
      .where(eq(recruitingSavedViews.id, viewId));
  },

  async duplicateView(
    viewId: string,
    userId: string,
    newName: string
  ): Promise<RecruitingSavedView | null> {
    const existing = await this.getSavedView(viewId);
    if (!existing) return null;

    const [duplicate] = await db
      .insert(recruitingSavedViews)
      .values({
        name: newName,
        description: existing.description,
        type: "private",
        icon: existing.icon,
        color: existing.color,
        filters: existing.filters,
        sortBy: existing.sortBy,
        sortOrder: existing.sortOrder,
        createdBy: userId,
        displayOrder: 99,
        isActive: true,
      })
      .returning();

    return duplicate;
  },
};
