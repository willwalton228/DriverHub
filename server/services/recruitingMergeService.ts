import { db } from "../db";
import { eq, and, or, ne, sql, ilike, isNull } from "drizzle-orm";
import {
  recruitingCandidates,
  recruitingApplications,
  recruitingDocuments,
  recruitingCandidateTags,
  recruitingCandidateMerges,
  recruitingAuditEvents,
  RecruitingCandidate,
  DuplicateMatchType,
} from "@shared/schema";

export interface DuplicateMatch {
  candidate: RecruitingCandidate;
  matchType: DuplicateMatchType;
  matchConfidence: number;
  matchReasons: string[];
}

export interface MergePreview {
  sourceCandidate: RecruitingCandidate;
  targetCandidate: RecruitingCandidate;
  applicationsToMove: number;
  documentsToMove: number;
  tagsToMove: number;
  warnings: string[];
}

export interface MergeResult {
  success: boolean;
  mergeId: string;
  applicationsMoved: string[];
  documentsMoved: string[];
  tagsMoved: string[];
  message: string;
}

function normalizeNameForMatching(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z]/g, '');
}

function getPhoneSuffix(phone: string | null | undefined, length: number = 7): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-length);
}

function getEmailLocalPart(email: string): string {
  return email.split('@')[0].toLowerCase();
}

export async function detectDuplicates(candidateId: string): Promise<DuplicateMatch[]> {
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, candidateId),
  });

  if (!candidate) {
    return [];
  }

  const duplicates: DuplicateMatch[] = [];
  const seenIds = new Set<string>([candidateId]);

  const exactEmailMatches = await db
    .select()
    .from(recruitingCandidates)
    .where(
      and(
        eq(recruitingCandidates.emailNormalized, candidate.emailNormalized),
        ne(recruitingCandidates.id, candidateId),
        ne(recruitingCandidates.status, 'merged'),
        eq(recruitingCandidates.isArchived, false)
      )
    );

  for (const match of exactEmailMatches) {
    if (!seenIds.has(match.id)) {
      seenIds.add(match.id);
      duplicates.push({
        candidate: match,
        matchType: 'exact_email',
        matchConfidence: 100,
        matchReasons: [`Exact email match: ${match.email}`],
      });
    }
  }

  if (candidate.phoneNormalized) {
    const exactPhoneMatches = await db
      .select()
      .from(recruitingCandidates)
      .where(
        and(
          eq(recruitingCandidates.phoneNormalized, candidate.phoneNormalized),
          ne(recruitingCandidates.id, candidateId),
          ne(recruitingCandidates.status, 'merged'),
          eq(recruitingCandidates.isArchived, false)
        )
      );

    for (const match of exactPhoneMatches) {
      if (!seenIds.has(match.id)) {
        seenIds.add(match.id);
        duplicates.push({
          candidate: match,
          matchType: 'exact_phone',
          matchConfidence: 100,
          matchReasons: [`Exact phone match: ${match.phone}`],
        });
      }
    }
  }

  const normalizedFirstName = normalizeNameForMatching(candidate.firstName);
  const normalizedLastName = normalizeNameForMatching(candidate.lastName);

  const fuzzyNameMatches = await db
    .select()
    .from(recruitingCandidates)
    .where(
      and(
        ilike(recruitingCandidates.firstName, `%${candidate.firstName}%`),
        ilike(recruitingCandidates.lastName, `%${candidate.lastName}%`),
        ne(recruitingCandidates.id, candidateId),
        ne(recruitingCandidates.status, 'merged'),
        eq(recruitingCandidates.isArchived, false)
      )
    )
    .limit(50);

  const emailLocalPart = getEmailLocalPart(candidate.email);
  const phoneSuffix = getPhoneSuffix(candidate.phoneNormalized);

  for (const match of fuzzyNameMatches) {
    if (seenIds.has(match.id)) continue;

    const matchedFirstName = normalizeNameForMatching(match.firstName);
    const matchedLastName = normalizeNameForMatching(match.lastName);

    const firstNameMatch = matchedFirstName === normalizedFirstName || 
      matchedFirstName.includes(normalizedFirstName) || 
      normalizedFirstName.includes(matchedFirstName);
    const lastNameMatch = matchedLastName === normalizedLastName;

    if (!firstNameMatch || !lastNameMatch) continue;

    const matchEmailLocalPart = getEmailLocalPart(match.email);
    const matchPhoneSuffix = getPhoneSuffix(match.phoneNormalized);

    const matchReasons: string[] = [];
    let confidence = 0;

    if (matchedFirstName === normalizedFirstName && lastNameMatch) {
      matchReasons.push(`Name match: ${match.firstName} ${match.lastName}`);
      confidence = 50;
    } else if (firstNameMatch && lastNameMatch) {
      matchReasons.push(`Similar name: ${match.firstName} ${match.lastName}`);
      confidence = 40;
    }

    if (emailLocalPart === matchEmailLocalPart) {
      matchReasons.push(`Same email username: ${emailLocalPart}`);
      confidence += 30;
    }

    if (phoneSuffix && matchPhoneSuffix && phoneSuffix === matchPhoneSuffix) {
      matchReasons.push(`Phone number ends with: ...${phoneSuffix.slice(-4)}`);
      confidence += 25;
    }

    if (confidence >= 60 && matchReasons.length >= 2) {
      seenIds.add(match.id);
      const matchType: DuplicateMatchType = phoneSuffix && matchPhoneSuffix === phoneSuffix 
        ? 'fuzzy_name_phone' 
        : 'fuzzy_name_email';

      duplicates.push({
        candidate: match,
        matchType,
        matchConfidence: Math.min(confidence, 95),
        matchReasons,
      });
    }
  }

  duplicates.sort((a, b) => b.matchConfidence - a.matchConfidence);

  return duplicates;
}

export async function getMergePreview(
  sourceCandidateId: string,
  targetCandidateId: string
): Promise<MergePreview | null> {
  const [sourceCandidate, targetCandidate] = await Promise.all([
    db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, sourceCandidateId),
    }),
    db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, targetCandidateId),
    }),
  ]);

  if (!sourceCandidate || !targetCandidate) {
    return null;
  }

  const [sourceApplications, sourceTags] = await Promise.all([
    db
      .select({ id: recruitingApplications.id })
      .from(recruitingApplications)
      .where(eq(recruitingApplications.candidateId, sourceCandidateId)),
    db
      .select({ id: recruitingCandidateTags.id })
      .from(recruitingCandidateTags)
      .where(eq(recruitingCandidateTags.candidateId, sourceCandidateId)),
  ]);

  const applicationIds = sourceApplications.map(a => a.id);
  let documentsToMove = 0;

  if (applicationIds.length > 0) {
    const docs = await db
      .select({ count: sql<number>`count(*)` })
      .from(recruitingDocuments)
      .where(sql`${recruitingDocuments.applicationId} = ANY(${applicationIds})`);
    documentsToMove = Number(docs[0]?.count || 0);
  }

  const warnings: string[] = [];

  if (sourceCandidate.status === 'hired') {
    warnings.push('Source candidate has status "hired" - verify this is intentional');
  }
  if (targetCandidate.status === 'rejected' || targetCandidate.status === 'withdrawn') {
    warnings.push(`Target candidate has status "${targetCandidate.status}" - consider changing target`);
  }
  if (sourceApplications.length > 3) {
    warnings.push(`Source has ${sourceApplications.length} applications that will be moved`);
  }

  return {
    sourceCandidate,
    targetCandidate,
    applicationsToMove: sourceApplications.length,
    documentsToMove,
    tagsToMove: sourceTags.length,
    warnings,
  };
}

export async function mergeCandidates(
  sourceCandidateId: string,
  targetCandidateId: string,
  matchType: DuplicateMatchType,
  matchConfidence: number,
  matchReasons: string[],
  actor: { id: string; email: string },
  mergeNotes?: string
): Promise<MergeResult> {
  const [sourceCandidate, targetCandidate] = await Promise.all([
    db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, sourceCandidateId),
    }),
    db.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, targetCandidateId),
    }),
  ]);

  if (!sourceCandidate || !targetCandidate) {
    return {
      success: false,
      mergeId: '',
      applicationsMoved: [],
      documentsMoved: [],
      tagsMoved: [],
      message: 'Source or target candidate not found',
    };
  }

  if (sourceCandidate.status === 'merged') {
    return {
      success: false,
      mergeId: '',
      applicationsMoved: [],
      documentsMoved: [],
      tagsMoved: [],
      message: 'Source candidate has already been merged',
    };
  }

  const sourceApplications = await db
    .select()
    .from(recruitingApplications)
    .where(eq(recruitingApplications.candidateId, sourceCandidateId));

  const applicationIds = sourceApplications.map(a => a.id);

  let sourceDocuments: { id: string }[] = [];
  if (applicationIds.length > 0) {
    sourceDocuments = await db
      .select({ id: recruitingDocuments.id })
      .from(recruitingDocuments)
      .where(sql`${recruitingDocuments.applicationId} = ANY(${applicationIds})`);
  }

  const sourceTags = await db
    .select()
    .from(recruitingCandidateTags)
    .where(eq(recruitingCandidateTags.candidateId, sourceCandidateId));

  const targetTags = await db
    .select()
    .from(recruitingCandidateTags)
    .where(eq(recruitingCandidateTags.candidateId, targetCandidateId));

  const targetTagIds = new Set(targetTags.map(t => t.tagId));

  await db.transaction(async (tx) => {
    if (applicationIds.length > 0) {
      await tx
        .update(recruitingApplications)
        .set({ candidateId: targetCandidateId })
        .where(eq(recruitingApplications.candidateId, sourceCandidateId));
    }

    for (const tag of sourceTags) {
      if (!targetTagIds.has(tag.tagId)) {
        await tx
          .update(recruitingCandidateTags)
          .set({ candidateId: targetCandidateId })
          .where(eq(recruitingCandidateTags.id, tag.id));
      } else {
        await tx
          .delete(recruitingCandidateTags)
          .where(eq(recruitingCandidateTags.id, tag.id));
      }
    }

    const updatedTargetCandidate = await tx.query.recruitingCandidates.findFirst({
      where: eq(recruitingCandidates.id, targetCandidateId),
    });

    await tx.insert(recruitingCandidateMerges).values({
      sourceCandidateId,
      targetCandidateId,
      matchType,
      matchConfidence,
      matchReasons: JSON.stringify(matchReasons),
      status: 'completed',
      sourceSnapshotBefore: JSON.stringify(sourceCandidate),
      targetSnapshotBefore: JSON.stringify(targetCandidate),
      targetSnapshotAfter: JSON.stringify(updatedTargetCandidate),
      applicationsMoved: JSON.stringify(applicationIds),
      documentsMoved: JSON.stringify(sourceDocuments.map(d => d.id)),
      tagsMoved: JSON.stringify(sourceTags.filter(t => !targetTagIds.has(t.tagId)).map(t => t.id)),
      mergedBy: actor.id,
      mergedByEmail: actor.email,
      mergeNotes,
    });

    await tx
      .update(recruitingCandidates)
      .set({
        status: 'merged',
        mergedIntoId: targetCandidateId,
        mergedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: actor.id,
      })
      .where(eq(recruitingCandidates.id, sourceCandidateId));

    await tx.insert(recruitingAuditEvents).values({
      actionType: 'candidate_merge',
      entityType: 'candidate',
      entityId: sourceCandidateId,
      userId: actor.id,
      userEmail: actor.email,
      previousValue: JSON.stringify({
        sourceCandidate,
        targetCandidate,
      }),
      newValue: JSON.stringify({
        mergedInto: targetCandidateId,
        applicationsMoved: applicationIds,
        tagsMoved: sourceTags.filter(t => !targetTagIds.has(t.tagId)).map(t => t.tagId),
      }),
      metadata: JSON.stringify({
        matchType,
        matchConfidence,
        matchReasons,
        mergeNotes,
      }),
    });
  });

  return {
    success: true,
    mergeId: sourceCandidateId,
    applicationsMoved: applicationIds,
    documentsMoved: sourceDocuments.map(d => d.id),
    tagsMoved: sourceTags.filter(t => !targetTagIds.has(t.tagId)).map(t => t.id),
    message: `Successfully merged candidate into ${targetCandidate.firstName} ${targetCandidate.lastName}`,
  };
}

export async function getMergeHistory(candidateId: string) {
  const mergesAsSource = await db
    .select()
    .from(recruitingCandidateMerges)
    .where(eq(recruitingCandidateMerges.sourceCandidateId, candidateId));

  const mergesAsTarget = await db
    .select()
    .from(recruitingCandidateMerges)
    .where(eq(recruitingCandidateMerges.targetCandidateId, candidateId));

  return {
    mergedInto: mergesAsSource,
    mergedFrom: mergesAsTarget,
  };
}
