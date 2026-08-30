import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import {
  recruitingIdentityHistory,
  recruitingAuditEvents,
  identityTrackedFields,
  type RecruitingIdentityHistory,
} from "@shared/schema";

const IDENTITY_FIELDS: readonly string[] = identityTrackedFields;

export async function recordIdentityChanges(
  candidateId: string,
  existingData: Record<string, unknown>,
  newData: Record<string, unknown>,
  userId: string | null,
  userEmail: string | null,
  source: string = "ui"
): Promise<RecruitingIdentityHistory[]> {
  const changes: RecruitingIdentityHistory[] = [];

  for (let i = 0; i < IDENTITY_FIELDS.length; i++) {
    const field = IDENTITY_FIELDS[i];
    if (!(field in newData)) continue;

    const oldValue = existingData[field] as string | null | undefined;
    const newValue = newData[field] as string | null | undefined;

    const oldStr = oldValue ?? null;
    const newStr = newValue ?? null;

    if (oldStr === newStr) continue;

    const [record] = await db.insert(recruitingIdentityHistory).values({
      candidateId,
      field,
      oldValue: oldStr,
      newValue: newStr,
      changedBy: userId,
      changedByEmail: userEmail,
      source,
    }).returning();

    changes.push(record);
  }

  if (changes.length > 0) {
    await db.insert(recruitingAuditEvents).values({
      actionType: "IDENTITY_CHANGED",
      entityType: "candidate",
      entityId: candidateId,
      userId,
      userEmail,
      source,
      previousValue: JSON.stringify(
        Object.fromEntries(changes.map(c => [c.field, c.oldValue]))
      ),
      newValue: JSON.stringify(
        Object.fromEntries(changes.map(c => [c.field, c.newValue]))
      ),
      changedFields: changes.map(c => c.field),
    });
  }

  return changes;
}

export async function getIdentityHistory(
  candidateId: string
): Promise<RecruitingIdentityHistory[]> {
  return db
    .select()
    .from(recruitingIdentityHistory)
    .where(eq(recruitingIdentityHistory.candidateId, candidateId))
    .orderBy(desc(recruitingIdentityHistory.changedAt));
}
