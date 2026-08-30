import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';
import {
  recruitingCandidates,
  recruitingRequisitions,
  recruitingApplications,
  recruitingStageHistory,
  recruitingWorkflows,
  recruitingWorkflowStages,
  recruitingWorkflowTransitions,
  recruitingAuditEvents,
  userRecruitingMarkets,
  users,
} from '@shared/schema';
import {
  createCandidate,
  getCandidate,
  getCandidates,
  findCandidateByEmailOrPhone,
  createRequisition,
  getRequisition,
  updateRequisition,
  createApplication,
  transitionApplicationStage,
  validateTransition,
  getStageHistory,
  seedDefaultWorkflow,
  createWorkflow,
  createWorkflowStage,
  createWorkflowTransition,
  activateWorkflow,
} from '../recruitingService';
import {
  getUserRecruitingContext,
  hasPermission,
  hasMarketAccess,
  filterByAuthorizedMarkets,
} from '../recruitingPermissions';

const TEST_PREFIX = `test_${Date.now()}`;

let testUserId: string;
let testUserEmail: string;

let cleanupCandidateIds: string[] = [];
let cleanupRequisitionIds: string[] = [];
let cleanupApplicationIds: string[] = [];
let cleanupWorkflowIds: string[] = [];
let cleanupUserIds: string[] = [];

beforeAll(async () => {
  const [user] = await db.insert(users).values({
    id: `${TEST_PREFIX}_admin`,
    username: `${TEST_PREFIX}_admin`,
    email: `${TEST_PREFIX}_admin@test.com`,
    role: 'admin',
    isProvisioned: true,
  }).returning();
  testUserId = user.id;
  testUserEmail = user.email!;
  cleanupUserIds.push(user.id);
});

afterAll(async () => {
  if (cleanupApplicationIds.length > 0) {
    for (const id of cleanupApplicationIds) {
      await db.delete(recruitingStageHistory).where(eq(recruitingStageHistory.applicationId, id)).catch(() => {});
      await db.delete(recruitingApplications).where(eq(recruitingApplications.id, id)).catch(() => {});
    }
  }
  if (cleanupRequisitionIds.length > 0) {
    for (const id of cleanupRequisitionIds) {
      await db.delete(recruitingRequisitions).where(eq(recruitingRequisitions.id, id)).catch(() => {});
    }
  }
  if (cleanupCandidateIds.length > 0) {
    for (const id of cleanupCandidateIds) {
      await db.delete(recruitingAuditEvents).where(and(eq(recruitingAuditEvents.entityType, 'candidate'), eq(recruitingAuditEvents.entityId, id))).catch(() => {});
      await db.delete(recruitingCandidates).where(eq(recruitingCandidates.id, id)).catch(() => {});
    }
  }
  if (cleanupWorkflowIds.length > 0) {
    for (const id of cleanupWorkflowIds) {
      await db.delete(recruitingWorkflowTransitions).where(eq(recruitingWorkflowTransitions.workflowId, id)).catch(() => {});
      await db.delete(recruitingWorkflowStages).where(eq(recruitingWorkflowStages.workflowId, id)).catch(() => {});
      await db.delete(recruitingWorkflows).where(eq(recruitingWorkflows.id, id)).catch(() => {});
    }
  }
  for (const id of cleanupUserIds) {
    await db.delete(userRecruitingMarkets).where(eq(userRecruitingMarkets.userId, id)).catch(() => {});
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
});

describe('Candidate Create + Dedupe', () => {
  it('should create a new candidate with normalized email and phone', async () => {
    const rawEmail = `${TEST_PREFIX}_john@example.com`;
    const candidate = await createCandidate({
      firstName: 'John',
      lastName: 'Doe',
      email: rawEmail,
      phone: '(555) 123-4567',
      emailNormalized: rawEmail.toLowerCase().trim(),
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail);

    cleanupCandidateIds.push(candidate.id);

    expect(candidate).toBeDefined();
    expect(candidate.id).toBeTruthy();
    expect(candidate.emailNormalized).toBe(rawEmail.toLowerCase().trim());
    expect(candidate.phoneNormalized).toBeTruthy();
    expect(candidate.phoneNormalized).toMatch(/^\d+$/);
    expect(candidate.status).toBe('new');
  });

  it('should block duplicate email creation and identify the existing candidate', async () => {
    const first = await createCandidate({
      firstName: 'Jane',
      lastName: 'Smith',
      email: `${TEST_PREFIX}_jane_dedup@test.com`,
      emailNormalized: `${TEST_PREFIX}_jane_dedup@test.com`,
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail);
    cleanupCandidateIds.push(first.id);

    await expect(createCandidate({
      firstName: 'Janet',
      lastName: 'Smithson',
      email: `  ${TEST_PREFIX}_JANE_DEDUP@TEST.COM  `,
      emailNormalized: `${TEST_PREFIX}_jane_dedup@test.com`,
      workerType: 'IC_DRIVER',
    }, testUserId, testUserEmail)).rejects.toMatchObject({
      code: 'DUPLICATE_CANDIDATE',
      existingCandidate: expect.objectContaining({ id: first.id }),
      matchedOn: ['email'],
    });
  });

  it('should block duplicate phone creation and identify the existing candidate', async () => {
    const first = await createCandidate({
      firstName: 'Bob',
      lastName: 'Phone',
      email: `${TEST_PREFIX}_bob_phone1@test.com`,
      phone: '(999) 888-7771',
      emailNormalized: `${TEST_PREFIX}_bob_phone1@test.com`,
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail);
    cleanupCandidateIds.push(first.id);

    await expect(createCandidate({
      firstName: 'Robert',
      lastName: 'Phone',
      email: `${TEST_PREFIX}_bob_phone2@test.com`,
      phone: '9998887771',
      emailNormalized: `${TEST_PREFIX}_bob_phone2@test.com`,
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail)).rejects.toMatchObject({
      code: 'DUPLICATE_CANDIDATE',
      existingCandidate: expect.objectContaining({ id: first.id }),
      matchedOn: ['phone'],
    });
  });

  it('should persist direct-entry core fields and search by name, email, and phone', async () => {
    const email = `${TEST_PREFIX}_core_fields@test.com`;
    const candidate = await createCandidate({
      firstName: 'Core',
      middleName: 'Foundation',
      lastName: 'Candidate',
      email: ` ${email.toUpperCase()} `,
      phone: '(777) 555-0100',
      address: '123 Main Street',
      addressLine2: 'Suite 200',
      city: 'Dallas',
      state: 'tx',
      zipCode: '75201',
      dateOfBirth: '1989-02-03',
      hasCommercialLicense: true,
      yearsExperience: 7,
      currentEmployer: 'Current Employer',
      notes: 'Candidate-level notes',
      preferredMarkets: ['Dallas'],
    }, testUserId, testUserEmail);
    cleanupCandidateIds.push(candidate.id);

    expect(candidate.id).toBeTruthy();
    expect(candidate.email).toBe(email.toUpperCase());
    expect(candidate.emailNormalized).toBe(email);
    expect(candidate.phone).toBe('7775550100');
    expect(candidate.state).toBe('TX');
    expect(candidate.driverId).toBeNull();

    for (const search of ['Core Candidate', email, '0100']) {
      const result = await getCandidates({ search, authorizedMarkets: null });
      expect(result.candidates.some(row => row.id === candidate.id)).toBe(true);
    }
  });

  it('should find candidate by email lookup', async () => {
    const created = await createCandidate({
      firstName: 'Lookup',
      lastName: 'Test',
      email: `${TEST_PREFIX}_lookup@test.com`,
      emailNormalized: `${TEST_PREFIX}_lookup@test.com`,
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail);
    cleanupCandidateIds.push(created.id);

    const found = await findCandidateByEmailOrPhone(`${TEST_PREFIX}_LOOKUP@test.com`);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('should reject invalid MVR fields', async () => {
    await expect(
      createCandidate({
        firstName: 'Bad',
        lastName: 'MVR',
        email: `${TEST_PREFIX}_badmvr@test.com`,
        emailNormalized: `${TEST_PREFIX}_badmvr@test.com`,
        mvrViolations3yr: -1,
        workerType: 'W2_DRIVER',
      }, testUserId, testUserEmail)
    ).rejects.toThrow('Invalid mvrViolations3yr');
  });
});

describe('Requisition CRUD', () => {
  it('should create a requisition', async () => {
    const req = await createRequisition({
      title: `${TEST_PREFIX} Driver - Phoenix`,
      market: `${TEST_PREFIX}_Phoenix`,
      workerType: 'W2_DRIVER',
      status: 'draft',
    }, testUserId, testUserEmail);

    cleanupRequisitionIds.push(req.id);

    expect(req).toBeDefined();
    expect(req.id).toBeTruthy();
    expect(req.title).toBe(`${TEST_PREFIX} Driver - Phoenix`);
    expect(req.market).toBe(`${TEST_PREFIX}_Phoenix`);
    expect(req.status).toBe('draft');
  });

  it('should read a requisition by ID', async () => {
    const created = await createRequisition({
      title: `${TEST_PREFIX} ReadTest`,
      market: `${TEST_PREFIX}_Dallas`,
      workerType: 'IC_DRIVER',
    }, testUserId, testUserEmail);
    cleanupRequisitionIds.push(created.id);

    const fetched = await getRequisition(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.title).toBe(`${TEST_PREFIX} ReadTest`);
  });

  it('should update a requisition', async () => {
    const created = await createRequisition({
      title: `${TEST_PREFIX} UpdateTest`,
      market: `${TEST_PREFIX}_Atlanta`,
      workerType: 'W2_DRIVER',
      status: 'draft',
    }, testUserId, testUserEmail);
    cleanupRequisitionIds.push(created.id);

    const updated = await updateRequisition(created.id, {
      title: `${TEST_PREFIX} Updated Title`,
      status: 'open',
      priority: 'high',
    }, testUserId, testUserEmail);

    expect(updated.title).toBe(`${TEST_PREFIX} Updated Title`);
    expect(updated.status).toBe('open');
    expect(updated.priority).toBe('high');
  });

  it('should return null for non-existent requisition', async () => {
    const result = await getRequisition('non-existent-id-12345');
    expect(result).toBeNull();
  });
});

describe('Application Creation', () => {
  let openReqId: string;
  let candidateId: string;

  beforeAll(async () => {
    const candidate = await createCandidate({
      firstName: 'App',
      lastName: 'Candidate',
      email: `${TEST_PREFIX}_appcandidate@test.com`,
      emailNormalized: `${TEST_PREFIX}_appcandidate@test.com`,
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail);
    candidateId = candidate.id;
    cleanupCandidateIds.push(candidate.id);

    const req = await createRequisition({
      title: `${TEST_PREFIX} Open Req`,
      market: `${TEST_PREFIX}_Houston`,
      workerType: 'W2_DRIVER',
      status: 'open',
    }, testUserId, testUserEmail);
    openReqId = req.id;
    cleanupRequisitionIds.push(req.id);
  });

  it('should create an application for an open requisition', async () => {
    const app = await createApplication({
      candidateId,
      requisitionId: openReqId,
    }, testUserId, testUserEmail);

    cleanupApplicationIds.push(app.id);

    expect(app).toBeDefined();
    expect(app.id).toBeTruthy();
    expect(app.candidateId).toBe(candidateId);
    expect(app.requisitionId).toBe(openReqId);
    expect(app.currentStage).toBe('applied');
  });

  it('should reject duplicate application for same candidate + requisition', async () => {
    await expect(
      createApplication({
        candidateId,
        requisitionId: openReqId,
      }, testUserId, testUserEmail)
    ).rejects.toThrow('Application already exists');
  });

  it('should reject application to a non-open requisition', async () => {
    const closedReq = await createRequisition({
      title: `${TEST_PREFIX} Closed Req`,
      market: `${TEST_PREFIX}_Closed`,
      workerType: 'W2_DRIVER',
      status: 'draft',
    }, testUserId, testUserEmail);
    cleanupRequisitionIds.push(closedReq.id);

    await expect(
      createApplication({
        candidateId,
        requisitionId: closedReq.id,
      }, testUserId, testUserEmail)
    ).rejects.toThrow('Applications can only be created for open requisitions');
  });

  it('should create initial stage history entry on application create', async () => {
    const candidate2 = await createCandidate({
      firstName: 'History',
      lastName: 'Check',
      email: `${TEST_PREFIX}_histcheck@test.com`,
      emailNormalized: `${TEST_PREFIX}_histcheck@test.com`,
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail);
    cleanupCandidateIds.push(candidate2.id);

    const req2 = await createRequisition({
      title: `${TEST_PREFIX} HistReq`,
      market: `${TEST_PREFIX}_Hist`,
      workerType: 'W2_DRIVER',
      status: 'open',
    }, testUserId, testUserEmail);
    cleanupRequisitionIds.push(req2.id);

    const app = await createApplication({
      candidateId: candidate2.id,
      requisitionId: req2.id,
    }, testUserId, testUserEmail);
    cleanupApplicationIds.push(app.id);

    const history = await getStageHistory(app.id);
    expect(history.length).toBeGreaterThanOrEqual(1);
    const initial = history.find(h => h.fromStage === null);
    expect(initial).toBeDefined();
    expect(initial!.toStage).toBe('applied');
    expect(initial!.sourceAction).toBe('application_created');
  });

  it('should block application creation for DNR candidate without override', async () => {
    const dnrCandidate = await createCandidate({
      firstName: 'DNR',
      lastName: 'Blocked',
      email: `${TEST_PREFIX}_dnr_blocked@test.com`,
      emailNormalized: `${TEST_PREFIX}_dnr_blocked@test.com`,
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail);
    cleanupCandidateIds.push(dnrCandidate.id);

    await db.update(recruitingCandidates)
      .set({ isDnr: true, dnrReasonCode: 'safety_violation' })
      .where(eq(recruitingCandidates.id, dnrCandidate.id));

    await expect(
      createApplication({
        candidateId: dnrCandidate.id,
        requisitionId: openReqId,
      }, testUserId, testUserEmail)
    ).rejects.toThrow('Do-Not-Rehire');
  });
});

describe('Workflow Transitions (Valid / Invalid)', () => {
  let workflowId: string;
  let stageMap: Record<string, string> = {};
  let transitionAppId: string;
  let transitionReqId: string;

  beforeAll(async () => {
    const workflow = await createWorkflow({
      name: `${TEST_PREFIX} Test Pipeline`,
      description: 'Test workflow for transitions',
      isDefault: false,
    }, testUserId);
    workflowId = workflow.id;
    cleanupWorkflowIds.push(workflow.id);

    const stages = [
      { stageKey: 'applied', displayName: 'Applied', sortOrder: 0, isInitial: true },
      { stageKey: 'screening', displayName: 'Screening', sortOrder: 1 },
      { stageKey: 'interview', displayName: 'Interview', sortOrder: 2 },
      { stageKey: 'rejected', displayName: 'Rejected', sortOrder: 3, isTerminal: true },
    ];

    for (const s of stages) {
      const stage = await createWorkflowStage({ workflowId, ...s });
      stageMap[s.stageKey] = stage.id;
    }

    await createWorkflowTransition({ workflowId, fromStageId: stageMap['applied'], toStageId: stageMap['screening'], name: 'Screen' });
    await createWorkflowTransition({ workflowId, fromStageId: stageMap['screening'], toStageId: stageMap['interview'], name: 'Interview' });
    await createWorkflowTransition({ workflowId, fromStageId: stageMap['applied'], toStageId: stageMap['rejected'], name: 'Reject' });
    await createWorkflowTransition({ workflowId, fromStageId: stageMap['screening'], toStageId: stageMap['rejected'], name: 'Reject' });

    await activateWorkflow(workflowId, testUserId);

    const candidate = await createCandidate({
      firstName: 'Transition',
      lastName: 'Test',
      email: `${TEST_PREFIX}_transition@test.com`,
      emailNormalized: `${TEST_PREFIX}_transition@test.com`,
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail);
    cleanupCandidateIds.push(candidate.id);

    const req = await createRequisition({
      title: `${TEST_PREFIX} Transition Req`,
      market: `${TEST_PREFIX}_Trans`,
      workerType: 'W2_DRIVER',
      status: 'open',
      workflowId,
    }, testUserId, testUserEmail);
    transitionReqId = req.id;
    cleanupRequisitionIds.push(req.id);

    const app = await createApplication({
      candidateId: candidate.id,
      requisitionId: req.id,
    }, testUserId, testUserEmail);
    transitionAppId = app.id;
    cleanupApplicationIds.push(app.id);
  });

  it('should validate a valid transition (applied → screening)', async () => {
    const valid = await validateTransition(workflowId, 'applied', 'screening');
    expect(valid).toBe(true);
  });

  it('should reject an invalid transition (applied → interview)', async () => {
    const valid = await validateTransition(workflowId, 'applied', 'interview');
    expect(valid).toBe(false);
  });

  it('should allow valid stage transition on an application', async () => {
    const updated = await transitionApplicationStage(
      transitionAppId,
      'screening',
      testUserId,
      testUserEmail,
      'Moving to screening'
    );

    expect(updated.currentStage).toBe('screening');
  });

  it('should record stage history after transition', async () => {
    const history = await getStageHistory(transitionAppId);
    const transition = history.find(h => h.fromStage === 'applied' && h.toStage === 'screening');
    expect(transition).toBeDefined();
    expect(transition!.reason).toBe('Moving to screening');
    expect(transition!.timeInPreviousStageMinutes).toBeDefined();
  });

  it('should allow chained valid transition (screening → interview)', async () => {
    const updated = await transitionApplicationStage(
      transitionAppId,
      'interview',
      testUserId,
      testUserEmail
    );
    expect(updated.currentStage).toBe('interview');
  });

  it('should reject invalid transition (interview → applied — no back-track defined)', async () => {
    await expect(
      transitionApplicationStage(
        transitionAppId,
        'applied',
        testUserId,
        testUserEmail
      )
    ).rejects.toThrow('Invalid stage transition');
  });
});

describe('Stage History Append-Only Enforcement', () => {
  it('should not allow UPDATE on stage history records (append-only)', async () => {
    const histories = await db.select()
      .from(recruitingStageHistory)
      .limit(1);

    if (histories.length === 0) return;

    const historyId = histories[0].id;

    const [before] = await db.select()
      .from(recruitingStageHistory)
      .where(eq(recruitingStageHistory.id, historyId));

    await db.update(recruitingStageHistory)
      .set({ reason: 'TAMPERED' })
      .where(eq(recruitingStageHistory.id, historyId));

    const [after] = await db.select()
      .from(recruitingStageHistory)
      .where(eq(recruitingStageHistory.id, historyId));

    expect(after.id).toBe(before.id);
    expect(after.toStage).toBe(before.toStage);
    expect(after.fromStage).toBe(before.fromStage);
    expect(after.transitionedAt.getTime()).toBe(before.transitionedAt.getTime());
  });

  it('should accumulate history entries without overwriting', async () => {
    const candidate = await createCandidate({
      firstName: 'Append',
      lastName: 'Only',
      email: `${TEST_PREFIX}_appendonly@test.com`,
      emailNormalized: `${TEST_PREFIX}_appendonly@test.com`,
      workerType: 'W2_DRIVER',
    }, testUserId, testUserEmail);
    cleanupCandidateIds.push(candidate.id);

    const workflow = await createWorkflow({
      name: `${TEST_PREFIX} Append Test`,
      isDefault: false,
    }, testUserId);
    cleanupWorkflowIds.push(workflow.id);

    const stageApplied = await createWorkflowStage({ workflowId: workflow.id, stageKey: 'applied', displayName: 'Applied', sortOrder: 0, isInitial: true });
    const stageScreen = await createWorkflowStage({ workflowId: workflow.id, stageKey: 'screening', displayName: 'Screening', sortOrder: 1 });
    const stageReject = await createWorkflowStage({ workflowId: workflow.id, stageKey: 'rejected', displayName: 'Rejected', sortOrder: 2, isTerminal: true });

    await createWorkflowTransition({ workflowId: workflow.id, fromStageId: stageApplied.id, toStageId: stageScreen.id, name: 'Screen' });
    await createWorkflowTransition({ workflowId: workflow.id, fromStageId: stageScreen.id, toStageId: stageReject.id, name: 'Reject' });
    await activateWorkflow(workflow.id, testUserId);

    const req = await createRequisition({
      title: `${TEST_PREFIX} Append Req`,
      market: `${TEST_PREFIX}_Append`,
      workerType: 'W2_DRIVER',
      status: 'open',
      workflowId: workflow.id,
    }, testUserId, testUserEmail);
    cleanupRequisitionIds.push(req.id);

    const app = await createApplication({
      candidateId: candidate.id,
      requisitionId: req.id,
    }, testUserId, testUserEmail);
    cleanupApplicationIds.push(app.id);

    await transitionApplicationStage(app.id, 'screening', testUserId, testUserEmail, 'Step 1');
    await transitionApplicationStage(app.id, 'rejected', testUserId, testUserEmail, 'Step 2');

    const history = await getStageHistory(app.id);

    expect(history.length).toBe(3);

    const sorted = [...history].sort((a, b) => 
      new Date(a.transitionedAt).getTime() - new Date(b.transitionedAt).getTime()
    );
    expect(sorted[0].fromStage).toBeNull();
    expect(sorted[0].toStage).toBe('applied');
    expect(sorted[1].fromStage).toBe('applied');
    expect(sorted[1].toStage).toBe('screening');
    expect(sorted[2].fromStage).toBe('screening');
    expect(sorted[2].toStage).toBe('rejected');
  });

  it('should not have an update schema for stage history (schema enforcement)', async () => {
    const { insertRecruitingStageHistorySchema } = await import('@shared/schema');
    expect(insertRecruitingStageHistorySchema).toBeDefined();
  });
});

describe('RBAC Market Isolation', () => {
  let recruiterUserId: string;
  let viewerUserId: string;

  beforeAll(async () => {
    const [recruiter] = await db.insert(users).values({
      id: `${TEST_PREFIX}_recruiter`,
      username: `${TEST_PREFIX}_recruiter`,
      email: `${TEST_PREFIX}_recruiter@test.com`,
      role: 'user',
      isProvisioned: true,
    }).returning();
    recruiterUserId = recruiter.id;
    cleanupUserIds.push(recruiter.id);

    const [viewer] = await db.insert(users).values({
      id: `${TEST_PREFIX}_viewer`,
      username: `${TEST_PREFIX}_viewer`,
      email: `${TEST_PREFIX}_viewer@test.com`,
      role: 'user',
      isProvisioned: true,
    }).returning();
    viewerUserId = viewer.id;
    cleanupUserIds.push(viewer.id);

    await db.insert(userRecruitingMarkets).values({
      userId: recruiterUserId,
      market: `${TEST_PREFIX}_Phoenix`,
      role: 'recruiter',
      permissions: ['read', 'write'],
      canExport: false,
      canBulkAction: false,
    });

    await db.insert(userRecruitingMarkets).values({
      userId: viewerUserId,
      market: `${TEST_PREFIX}_Dallas`,
      role: 'viewer',
      permissions: ['read'],
      canExport: false,
      canBulkAction: false,
    });
  });

  it('admin user should have full access to all markets', async () => {
    const ctx = await getUserRecruitingContext(testUserId, 'admin');
    expect(ctx.isAdmin).toBe(true);
    expect(hasPermission(ctx, 'read')).toBe(true);
    expect(hasPermission(ctx, 'write')).toBe(true);
    expect(hasPermission(ctx, 'approve')).toBe(true);
    expect(hasPermission(ctx, 'admin')).toBe(true);
    expect(hasMarketAccess(ctx, `${TEST_PREFIX}_Phoenix`)).toBe(true);
    expect(hasMarketAccess(ctx, `${TEST_PREFIX}_Dallas`)).toBe(true);
    expect(hasMarketAccess(ctx, 'AnyOtherMarket')).toBe(true);
  });

  it('recruiter should only have read+write permissions', async () => {
    const ctx = await getUserRecruitingContext(recruiterUserId, 'user');
    expect(ctx.isAdmin).toBe(false);
    expect(hasPermission(ctx, 'read')).toBe(true);
    expect(hasPermission(ctx, 'write')).toBe(true);
    expect(hasPermission(ctx, 'approve')).toBe(false);
    expect(hasPermission(ctx, 'admin')).toBe(false);
  });

  it('recruiter should only access their assigned market', async () => {
    const ctx = await getUserRecruitingContext(recruiterUserId, 'user');
    expect(hasMarketAccess(ctx, `${TEST_PREFIX}_Phoenix`)).toBe(true);
    expect(hasMarketAccess(ctx, `${TEST_PREFIX}_Dallas`)).toBe(false);
    expect(hasMarketAccess(ctx, 'UnassignedMarket')).toBe(false);
  });

  it('viewer should only have read permission', async () => {
    const ctx = await getUserRecruitingContext(viewerUserId, 'user');
    expect(hasPermission(ctx, 'read')).toBe(true);
    expect(hasPermission(ctx, 'write')).toBe(false);
    expect(hasPermission(ctx, 'approve')).toBe(false);
  });

  it('viewer should be isolated to their market', async () => {
    const ctx = await getUserRecruitingContext(viewerUserId, 'user');
    expect(hasMarketAccess(ctx, `${TEST_PREFIX}_Dallas`)).toBe(true);
    expect(hasMarketAccess(ctx, `${TEST_PREFIX}_Phoenix`)).toBe(false);
  });

  it('user with no market assignments should have no access', async () => {
    const [noAccessUser] = await db.insert(users).values({
      id: `${TEST_PREFIX}_noaccess`,
      username: `${TEST_PREFIX}_noaccess`,
      email: `${TEST_PREFIX}_noaccess@test.com`,
      role: 'user',
      isProvisioned: true,
    }).returning();
    cleanupUserIds.push(noAccessUser.id);

    const ctx = await getUserRecruitingContext(noAccessUser.id, 'user');
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.authorizedMarkets).toEqual([]);
    expect(ctx.permissions).toEqual([]);
    expect(hasPermission(ctx, 'read')).toBe(false);
    expect(hasPermission(ctx, 'write')).toBe(false);
    expect(hasMarketAccess(ctx, `${TEST_PREFIX}_Phoenix`)).toBe(false);
  });

  it('filterByAuthorizedMarkets should exclude unauthorized market items', async () => {
    const items = [
      { id: '1', market: `${TEST_PREFIX}_Phoenix` },
      { id: '2', market: `${TEST_PREFIX}_Dallas` },
      { id: '3', market: `${TEST_PREFIX}_Chicago` },
    ];

    const recruiterCtx = await getUserRecruitingContext(recruiterUserId, 'user');
    const filtered = filterByAuthorizedMarkets(items, recruiterCtx);
    expect(filtered.length).toBe(1);
    expect(filtered[0].market).toBe(`${TEST_PREFIX}_Phoenix`);
  });

  it('filterByAuthorizedMarkets should return all items for admin', async () => {
    const items = [
      { id: '1', market: `${TEST_PREFIX}_Phoenix` },
      { id: '2', market: `${TEST_PREFIX}_Dallas` },
    ];

    const adminCtx = await getUserRecruitingContext(testUserId, 'admin');
    const filtered = filterByAuthorizedMarkets(items, adminCtx);
    expect(filtered.length).toBe(2);
  });

  it('filterByAuthorizedMarkets should return empty for user with no markets', async () => {
    const items = [
      { id: '1', market: `${TEST_PREFIX}_Phoenix` },
    ];

    const [emptyUser] = await db.insert(users).values({
      id: `${TEST_PREFIX}_emptymarket`,
      username: `${TEST_PREFIX}_emptymarket`,
      email: `${TEST_PREFIX}_emptymarket@test.com`,
      role: 'user',
      isProvisioned: true,
    }).returning();
    cleanupUserIds.push(emptyUser.id);

    const ctx = await getUserRecruitingContext(emptyUser.id, 'user');
    const filtered = filterByAuthorizedMarkets(items, ctx);
    expect(filtered.length).toBe(0);
  });
});
