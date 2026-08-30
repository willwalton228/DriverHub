import { db } from "./db";
import {
  slaDefinitions,
  slaProgramOverrides,
  customers,
  type SlaDefinition,
  type SlaProgramOverride,
  type InsertSlaDefinition,
  type InsertSlaProgramOverride,
} from "@shared/schema";
import { eq, and, desc, isNull } from "drizzle-orm";

export interface EffectiveSla {
  slaDefinitionId: string;
  name: string;
  slaType: string;
  version: number;
  durationMinutes: number | null;
  warningThresholdMinutes: number | null;
  criticalThresholdMinutes: number | null;
  config: Record<string, unknown> | null;
  isOverridden: boolean;
  overrideId?: string;
}

export async function getAllSlaDefinitions(includeArchived: boolean = false): Promise<SlaDefinition[]> {
  let query = db.select().from(slaDefinitions);
  
  if (!includeArchived) {
    query = query.where(isNull(slaDefinitions.archivedAt)) as typeof query;
  }

  return await query.orderBy(slaDefinitions.name, desc(slaDefinitions.version));
}

export async function getActiveSlaDefinitions(): Promise<SlaDefinition[]> {
  return await db.select()
    .from(slaDefinitions)
    .where(and(
      eq(slaDefinitions.isActive, true),
      isNull(slaDefinitions.archivedAt)
    ))
    .orderBy(slaDefinitions.name);
}

export async function getSlaDefinitionById(id: string): Promise<SlaDefinition | null> {
  const result = await db.query.slaDefinitions.findFirst({
    where: eq(slaDefinitions.id, id)
  });
  return result || null;
}

export async function createSlaDefinition(
  data: InsertSlaDefinition
): Promise<SlaDefinition> {
  const existing = await db.select()
    .from(slaDefinitions)
    .where(eq(slaDefinitions.name, data.name))
    .orderBy(desc(slaDefinitions.version))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

  if (existing.length > 0 && data.isActive) {
    await db.update(slaDefinitions)
      .set({ isActive: false })
      .where(and(
        eq(slaDefinitions.name, data.name),
        eq(slaDefinitions.isActive, true)
      ));
  }

  const [created] = await db.insert(slaDefinitions).values({
    ...data,
    version: nextVersion,
    isActive: data.isActive ?? true,
  }).returning();

  return created;
}

export async function updateSlaDefinition(
  id: string,
  data: Partial<InsertSlaDefinition>,
  userId?: string
): Promise<SlaDefinition | null> {
  const existing = await getSlaDefinitionById(id);
  if (!existing) return null;

  const [updated] = await db.update(slaDefinitions)
    .set({
      ...data,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(slaDefinitions.id, id))
    .returning();

  return updated;
}

export async function archiveSlaDefinition(id: string, userId: string): Promise<SlaDefinition | null> {
  const [archived] = await db.update(slaDefinitions)
    .set({
      isActive: false,
      archivedAt: new Date(),
      archivedBy: userId,
    })
    .where(eq(slaDefinitions.id, id))
    .returning();

  return archived || null;
}

export async function getSlaProgramOverrides(customerId?: string): Promise<SlaProgramOverride[]> {
  let query = db.select().from(slaProgramOverrides);
  
  if (customerId) {
    query = query.where(eq(slaProgramOverrides.customerId, customerId)) as typeof query;
  }

  return await query.orderBy(desc(slaProgramOverrides.effectiveFrom));
}

export async function createSlaProgramOverride(
  data: InsertSlaProgramOverride
): Promise<SlaProgramOverride> {
  const existing = await db.select()
    .from(slaProgramOverrides)
    .where(and(
      eq(slaProgramOverrides.slaDefinitionId, data.slaDefinitionId),
      eq(slaProgramOverrides.customerId, data.customerId),
      eq(slaProgramOverrides.isActive, true)
    ))
    .orderBy(desc(slaProgramOverrides.version))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

  if (existing.length > 0) {
    await db.update(slaProgramOverrides)
      .set({ 
        isActive: false,
        effectiveUntil: new Date()
      })
      .where(eq(slaProgramOverrides.id, existing[0].id));
  }

  const [created] = await db.insert(slaProgramOverrides).values({
    ...data,
    version: nextVersion,
  }).returning();

  return created;
}

export async function getEffectiveSlaForCustomer(
  customerId: string,
  slaType?: string
): Promise<EffectiveSla[]> {
  const baseSlas = await db.select()
    .from(slaDefinitions)
    .where(and(
      eq(slaDefinitions.isActive, true),
      isNull(slaDefinitions.archivedAt),
      slaType ? eq(slaDefinitions.slaType, slaType) : undefined
    ));

  const overrides = await db.select()
    .from(slaProgramOverrides)
    .where(and(
      eq(slaProgramOverrides.customerId, customerId),
      eq(slaProgramOverrides.isActive, true)
    ));

  const overrideMap = new Map(overrides.map(o => [o.slaDefinitionId, o]));

  return baseSlas.map(sla => {
    const override = overrideMap.get(sla.id);
    
    let config: Record<string, unknown> | null = null;
    if (sla.config) {
      try {
        config = JSON.parse(sla.config);
      } catch {}
    }
    if (override?.configOverride) {
      try {
        const overrideConfig = JSON.parse(override.configOverride);
        config = { ...config, ...overrideConfig };
      } catch {}
    }

    return {
      slaDefinitionId: sla.id,
      name: sla.name,
      slaType: sla.slaType,
      version: override ? override.version : sla.version,
      durationMinutes: override?.durationMinutes ?? sla.durationMinutes,
      warningThresholdMinutes: override?.warningThresholdMinutes ?? sla.warningThresholdMinutes,
      criticalThresholdMinutes: override?.criticalThresholdMinutes ?? sla.criticalThresholdMinutes,
      config,
      isOverridden: !!override,
      overrideId: override?.id,
    };
  });
}

export async function getSlaDefinitionsForOpsConsole(): Promise<{
  definitions: SlaDefinition[];
  overrides: (SlaProgramOverride & { customerName: string })[];
}> {
  const definitions = await getActiveSlaDefinitions();
  
  const overridesRaw = await db.select({
    override: slaProgramOverrides,
    customerName: customers.customerName,
  })
    .from(slaProgramOverrides)
    .innerJoin(customers, eq(slaProgramOverrides.customerId, customers.id))
    .where(eq(slaProgramOverrides.isActive, true));

  const overrides = overridesRaw.map(r => ({
    ...r.override,
    customerName: r.customerName,
  }));

  return { definitions, overrides };
}
