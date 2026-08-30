import { db } from '../db';
import { recruitingBackgroundChecks, applications, recruitingAuditEvents } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

export interface BackgroundCheckRequest {
  applicationId: string;
  candidateInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    dateOfBirth?: string;
    ssn?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  checkType: 'standard' | 'enhanced' | 'mvr' | 'criminal_only';
}

export interface BackgroundCheckResult {
  status: 'clear' | 'consider' | 'failed' | 'pending';
  summary: string;
  details?: Record<string, any>;
  completedAt?: Date;
}

export interface BackgroundCheckProvider {
  name: string;
  createCheck(request: BackgroundCheckRequest): Promise<{
    success: boolean;
    checkId?: string;
    error?: string;
  }>;
  getCheckStatus(checkId: string): Promise<{
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    result?: BackgroundCheckResult;
    error?: string;
  }>;
  cancelCheck?(checkId: string): Promise<{ success: boolean; error?: string }>;
}

const providers: Map<string, BackgroundCheckProvider> = new Map();

export function registerProvider(provider: BackgroundCheckProvider): void {
  providers.set(provider.name, provider);
  console.log(`[BackgroundCheck] Provider registered: ${provider.name}`);
}

export function getProvider(name: string): BackgroundCheckProvider | undefined {
  return providers.get(name);
}

export function getAvailableProviders(): string[] {
  return Array.from(providers.keys());
}

export async function requestBackgroundCheck(
  applicationId: string,
  providerName: string,
  candidateInfo: BackgroundCheckRequest['candidateInfo'],
  checkType: BackgroundCheckRequest['checkType'],
  requestedBy: string
): Promise<{ success: boolean; checkId?: string; error?: string }> {
  const provider = getProvider(providerName);
  if (!provider) {
    return { success: false, error: `Provider "${providerName}" not found. Available: ${getAvailableProviders().join(', ')}` };
  }

  const [application] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (!application) {
    return { success: false, error: 'Application not found' };
  }

  const existingChecks = await db.select().from(recruitingBackgroundChecks)
    .where(eq(recruitingBackgroundChecks.applicationId, applicationId))
    .orderBy(desc(recruitingBackgroundChecks.createdAt));

  const hasActiveCheck = existingChecks.some(c => 
    c.status === 'requested' || c.status === 'in_progress'
  );
  if (hasActiveCheck) {
    return { success: false, error: 'An active background check is already in progress for this application' };
  }

  try {
    const result = await provider.createCheck({
      applicationId,
      candidateInfo,
      checkType,
    });

    if (!result.success) {
      await logBackgroundCheckAudit(applicationId, 'background_check_failed', {
        provider: providerName,
        error: result.error,
      }, requestedBy);
      return result;
    }

    const [check] = await db.insert(recruitingBackgroundChecks).values({
      applicationId,
      provider: providerName,
      providerCheckId: result.checkId,
      status: 'requested',
      checkType,
      requestPayload: { candidateInfo: { ...candidateInfo, ssn: candidateInfo.ssn ? '***' : undefined } },
      requestedAt: new Date(),
      requestedBy,
    }).returning();

    await db.update(applications)
      .set({ 
        backgroundStatus: 'requested',
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    await logBackgroundCheckAudit(applicationId, 'background_check_requested', {
      provider: providerName,
      checkType,
      checkId: check.id,
      providerCheckId: result.checkId,
    }, requestedBy);

    console.log(`[BackgroundCheck] Check requested for application ${applicationId} via ${providerName}`);

    return { success: true, checkId: check.id };
  } catch (error: any) {
    console.error('[BackgroundCheck] Error creating check:', error);
    return { success: false, error: error.message || 'Failed to create background check' };
  }
}

export async function pollBackgroundCheckStatus(checkId: string): Promise<{
  success: boolean;
  status?: string;
  result?: BackgroundCheckResult;
  error?: string;
}> {
  const [check] = await db.select().from(recruitingBackgroundChecks)
    .where(eq(recruitingBackgroundChecks.id, checkId));

  if (!check) {
    return { success: false, error: 'Background check not found' };
  }

  if (check.status === 'completed' || check.status === 'failed' || check.status === 'cancelled') {
    return { 
      success: true, 
      status: check.status,
      result: check.responsePayload as BackgroundCheckResult | undefined,
    };
  }

  const provider = getProvider(check.provider);
  if (!provider) {
    return { success: false, error: `Provider "${check.provider}" not found` };
  }

  if (!check.providerCheckId) {
    return { success: false, error: 'No provider check ID available' };
  }

  try {
    const statusResult = await provider.getCheckStatus(check.providerCheckId);

    if (statusResult.error) {
      return { success: false, error: statusResult.error };
    }

    const updateData: any = {
      status: statusResult.status,
      updatedAt: new Date(),
    };

    if (statusResult.result) {
      updateData.responsePayload = statusResult.result;
      updateData.resultSummary = statusResult.result.summary;
    }

    if (statusResult.status === 'completed' || statusResult.status === 'failed') {
      updateData.completedAt = new Date();
    }

    await db.update(recruitingBackgroundChecks)
      .set(updateData)
      .where(eq(recruitingBackgroundChecks.id, checkId));

    let applicationStatus: 'in_progress' | 'passed' | 'failed' = 'in_progress';
    if (statusResult.status === 'completed' && statusResult.result) {
      applicationStatus = statusResult.result.status === 'clear' ? 'passed' : 'failed';
    } else if (statusResult.status === 'failed') {
      applicationStatus = 'failed';
    }

    if (statusResult.status !== 'pending') {
      await db.update(applications)
        .set({ 
          backgroundStatus: applicationStatus,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, check.applicationId));

      await logBackgroundCheckAudit(check.applicationId, 'background_check_status_update', {
        checkId,
        previousStatus: check.status,
        newStatus: statusResult.status,
        result: statusResult.result?.status,
      }, 'system');
    }

    return {
      success: true,
      status: statusResult.status,
      result: statusResult.result,
    };
  } catch (error: any) {
    console.error('[BackgroundCheck] Error polling status:', error);
    return { success: false, error: error.message || 'Failed to poll status' };
  }
}

export async function handleProviderWebhook(
  providerName: string,
  providerCheckId: string,
  status: 'in_progress' | 'completed' | 'failed',
  result?: BackgroundCheckResult
): Promise<void> {
  const checks = await db.select().from(recruitingBackgroundChecks)
    .where(eq(recruitingBackgroundChecks.providerCheckId, providerCheckId));

  if (checks.length === 0) {
    console.log(`[BackgroundCheck] Webhook received for unknown check: ${providerCheckId}`);
    return;
  }

  const check = checks[0];

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (result) {
    updateData.responsePayload = result;
    updateData.resultSummary = result.summary;
  }

  if (status === 'completed' || status === 'failed') {
    updateData.completedAt = new Date();
  }

  await db.update(recruitingBackgroundChecks)
    .set(updateData)
    .where(eq(recruitingBackgroundChecks.id, check.id));

  let applicationStatus: 'in_progress' | 'passed' | 'failed' = 'in_progress';
  if (status === 'completed' && result) {
    applicationStatus = result.status === 'clear' ? 'passed' : 'failed';
  } else if (status === 'failed') {
    applicationStatus = 'failed';
  }

  await db.update(applications)
    .set({ 
      backgroundStatus: applicationStatus,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, check.applicationId));

  await logBackgroundCheckAudit(check.applicationId, 'background_check_webhook', {
    provider: providerName,
    checkId: check.id,
    status,
    result: result?.status,
  }, 'system');

  console.log(`[BackgroundCheck] Webhook processed for check ${check.id}: ${status}`);
}

export async function getBackgroundChecks(applicationId: string): Promise<any[]> {
  return db.select().from(recruitingBackgroundChecks)
    .where(eq(recruitingBackgroundChecks.applicationId, applicationId))
    .orderBy(desc(recruitingBackgroundChecks.createdAt));
}

export async function checkBackgroundGate(applicationId: string): Promise<{
  canProceed: boolean;
  reason?: string;
}> {
  const [application] = await db.select().from(applications)
    .where(eq(applications.id, applicationId));

  if (!application) {
    return { canProceed: false, reason: 'Application not found' };
  }

  if (!application.backgroundGateEnabled) {
    return { canProceed: true };
  }

  if (application.backgroundStatus === 'passed') {
    return { canProceed: true };
  }

  if (application.backgroundStatus === 'none') {
    return { canProceed: false, reason: 'Background check not yet requested' };
  }

  if (application.backgroundStatus === 'requested' || application.backgroundStatus === 'in_progress') {
    return { canProceed: false, reason: 'Background check still in progress' };
  }

  if (application.backgroundStatus === 'failed') {
    return { canProceed: false, reason: 'Background check did not pass' };
  }

  return { canProceed: false, reason: 'Unknown background status' };
}

export async function setBackgroundGate(
  applicationId: string,
  enabled: boolean,
  userId: string
): Promise<void> {
  await db.update(applications)
    .set({ 
      backgroundGateEnabled: enabled,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  await logBackgroundCheckAudit(applicationId, 'background_gate_updated', {
    enabled,
  }, userId);
}

async function logBackgroundCheckAudit(
  applicationId: string,
  action: string,
  details: Record<string, any>,
  userId: string
): Promise<void> {
  const [application] = await db.select().from(applications)
    .where(eq(applications.id, applicationId));

  if (!application) return;

  await db.insert(recruitingAuditEvents).values({
    entityType: 'application',
    entityId: applicationId,
    actionType: action,
    userId: userId === 'system' ? null : userId,
    newValue: JSON.stringify(details),
    reason: `Background check: ${action}`,
  });
}

const mockProvider: BackgroundCheckProvider = {
  name: 'mock',
  async createCheck(request) {
    const checkId = `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[MockProvider] Created check ${checkId} for application ${request.applicationId}`);
    return { success: true, checkId };
  },
  async getCheckStatus(checkId) {
    const randomOutcome = Math.random();
    if (randomOutcome < 0.3) {
      return {
        status: 'pending',
      };
    } else if (randomOutcome < 0.6) {
      return {
        status: 'in_progress',
      };
    } else if (randomOutcome < 0.9) {
      return {
        status: 'completed',
        result: {
          status: 'clear',
          summary: 'Background check completed with no issues found.',
          completedAt: new Date(),
        },
      };
    } else {
      return {
        status: 'completed',
        result: {
          status: 'consider',
          summary: 'Background check completed with items requiring review.',
          details: { flags: ['minor_traffic_violation'] },
          completedAt: new Date(),
        },
      };
    }
  },
  async cancelCheck(checkId) {
    console.log(`[MockProvider] Cancelled check ${checkId}`);
    return { success: true };
  },
};

registerProvider(mockProvider);

export function initializeCheckrProvider(): void {
  const apiKey = process.env.CHECKR_API_KEY;
  if (!apiKey) {
    console.log('[BackgroundCheck] Checkr not configured (CHECKR_API_KEY not set)');
    return;
  }

  const checkrProvider: BackgroundCheckProvider = {
    name: 'checkr',
    async createCheck(request) {
      try {
        const response = await fetch('https://api.checkr.com/v1/invitations', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            package: request.checkType === 'enhanced' ? 'driver_pro' : 'driver_standard',
            candidate: {
              first_name: request.candidateInfo.firstName,
              last_name: request.candidateInfo.lastName,
              email: request.candidateInfo.email,
              phone: request.candidateInfo.phone,
              dob: request.candidateInfo.dateOfBirth,
            },
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          return { success: false, error: `Checkr API error: ${error}` };
        }

        const data = await response.json();
        return { success: true, checkId: data.id };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    async getCheckStatus(checkId) {
      try {
        const response = await fetch(`https://api.checkr.com/v1/reports/${checkId}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
          },
        });

        if (!response.ok) {
          return { status: 'pending' };
        }

        const data = await response.json();
        
        let status: 'pending' | 'in_progress' | 'completed' | 'failed' = 'pending';
        let result: BackgroundCheckResult | undefined;

        if (data.status === 'complete') {
          status = 'completed';
          result = {
            status: data.result === 'clear' ? 'clear' : 'consider',
            summary: data.result === 'clear' 
              ? 'Background check completed with no issues found.'
              : 'Background check completed with items requiring review.',
            details: data,
            completedAt: new Date(data.completed_at),
          };
        } else if (data.status === 'pending') {
          status = 'in_progress';
        }

        return { status, result };
      } catch (error: any) {
        return { status: 'pending', error: error.message };
      }
    },
  };

  registerProvider(checkrProvider);
  console.log('[BackgroundCheck] Checkr provider initialized');
}

initializeCheckrProvider();
