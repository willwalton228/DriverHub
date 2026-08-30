import twilio from 'twilio';
import { db } from '../db';
import { recruitingCommunications, candidates } from '@shared/schema';
import { eq } from 'drizzle-orm';
import {
  getRecruitingExternalDeliverySuppressionReason,
  isRecruitingExternalDeliverySuppressed,
} from './recruitingDeliverySafety';

const STOP_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
const MAX_SMS_LENGTH = 1600;

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

interface SendSmsResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  blockedReason?: 'opted_out' | 'no_consent' | 'no_phone' | 'do_not_contact' | 'throttled' | 'delivery_suppressed';
  nextAllowedAt?: Date;
  dailyCount?: number;
  maxPerDay?: number;
}

interface InboundSmsData {
  from: string;
  to: string;
  body: string;
  messageSid: string;
  accountSid: string;
  numMedia?: string;
  mediaUrls?: string[];
}

function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  
  if (!accountSid || !authToken || !fromNumber) {
    return null;
  }
  
  return { accountSid, authToken, fromNumber };
}

export function isTwilioConfigured(): boolean {
  return getTwilioConfig() !== null;
}

export function validateSmsMessage(message: string): { valid: boolean; error?: string } {
  if (!message || message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  if (message.length > MAX_SMS_LENGTH) {
    return { valid: false, error: `Message exceeds maximum length of ${MAX_SMS_LENGTH} characters` };
  }
  return { valid: true };
}

export async function sendSms(
  candidateId: string,
  message: string,
  sentBy: string,
  applicationId?: string,
  options?: { isAutomated?: boolean; overrideThrottle?: boolean; overrideJustification?: string; senderEmail?: string | null }
): Promise<SendSmsResult> {
  const validation = validateSmsMessage(message);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const config = getTwilioConfig();
  if (!config) {
    return { success: false, error: 'Twilio is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.' };
  }

  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) {
    return { success: false, error: 'Candidate not found' };
  }

  if (!candidate.phone) {
    return { success: false, blockedReason: 'no_phone', error: 'Candidate has no phone number' };
  }

  if (candidate.doNotContact) {
    return { success: false, blockedReason: 'do_not_contact', error: 'Candidate marked as Do Not Contact' };
  }

  if (candidate.smsOptOut) {
    return { success: false, blockedReason: 'opted_out', error: 'Candidate has opted out of SMS' };
  }

  if (!candidate.smsConsent) {
    return { success: false, blockedReason: 'no_consent', error: 'Candidate has not provided SMS consent' };
  }

  if (isRecruitingExternalDeliverySuppressed()) {
    const reason = getRecruitingExternalDeliverySuppressionReason();
    await db.insert(recruitingCommunications).values({
      candidateId,
      applicationId,
      type: 'sms',
      direction: 'outbound',
      content: message,
      sentBy,
      sentAt: new Date(),
      isAutomated: options?.isAutomated ?? false,
      provider: 'twilio',
      providerStatus: 'suppressed',
      providerError: reason,
      fromNumber: config.fromNumber,
      toNumber: candidate.phone,
    });
    console.info(`[Recruiting Delivery Safety] Suppressed Twilio SMS for candidate ${candidateId}`);
    return { success: false, blockedReason: 'delivery_suppressed', error: reason };
  }

  const { checkThrottle, recordThrottleEvent } = await import('./recruitingCommunicationThrottleService');
  const throttleResult = await checkThrottle(candidateId, 'sms', options?.isAutomated);

  if (!throttleResult.allowed) {
    if (options?.overrideThrottle && options?.overrideJustification) {
      await recordThrottleEvent(
        candidateId, applicationId || null, 'sms', 'override',
        throttleResult.blockedReason!, sentBy, options.senderEmail || null,
        throttleResult.ruleId || null, throttleResult.dailyCount || null,
        throttleResult.nextAllowedAt || null, options.overrideJustification
      );
    } else {
      await recordThrottleEvent(
        candidateId, applicationId || null, 'sms', 'blocked',
        throttleResult.blockedReason!, sentBy, options?.senderEmail || null,
        throttleResult.ruleId || null, throttleResult.dailyCount || null,
        throttleResult.nextAllowedAt || null
      );
      const reason = throttleResult.blockedReason === 'daily_limit'
        ? `Daily SMS limit reached (${throttleResult.dailyCount}/${throttleResult.maxPerDay})`
        : `Cooldown active. Next allowed: ${throttleResult.nextAllowedAt?.toLocaleString()}`;
      return {
        success: false,
        blockedReason: 'throttled',
        error: reason,
        nextAllowedAt: throttleResult.nextAllowedAt,
        dailyCount: throttleResult.dailyCount,
        maxPerDay: throttleResult.maxPerDay,
      };
    }
  }

  const client = twilio(config.accountSid, config.authToken);

  try {
    const twilioMessage = await client.messages.create({
      body: message,
      from: config.fromNumber,
      to: candidate.phone,
    });

    const [communication] = await db.insert(recruitingCommunications).values({
      candidateId,
      applicationId,
      type: 'sms',
      direction: 'outbound',
      content: message,
      sentBy,
      sentAt: new Date(),
      provider: 'twilio',
      externalMessageId: twilioMessage.sid,
      providerStatus: twilioMessage.status,
      fromNumber: config.fromNumber,
      toNumber: candidate.phone,
    }).returning();

    console.log(`[Twilio] SMS sent to candidate ${candidateId}, SID: ${twilioMessage.sid}`);

    return {
      success: true,
      messageSid: twilioMessage.sid,
    };
  } catch (error: any) {
    console.error('[Twilio] Failed to send SMS:', error);

    await db.insert(recruitingCommunications).values({
      candidateId,
      applicationId,
      type: 'sms',
      direction: 'outbound',
      content: message,
      sentBy,
      sentAt: new Date(),
      provider: 'twilio',
      providerStatus: 'failed',
      providerError: error.message || 'Unknown error',
      fromNumber: config.fromNumber,
      toNumber: candidate.phone,
    });

    return {
      success: false,
      error: error.message || 'Failed to send SMS',
    };
  }
}

export async function handleInboundSms(data: InboundSmsData): Promise<void> {
  const { from, to, body, messageSid } = data;
  
  const normalizedPhone = normalizePhoneNumber(from);
  
  const candidateResults = await db.select().from(candidates)
    .where(eq(candidates.phone, normalizedPhone));
  
  let candidateWithPhone = candidateResults.length > 0 ? candidateResults[0] : null;
  
  if (!candidateWithPhone) {
    const phoneDigits = normalizedPhone.replace(/\D/g, '').slice(-10);
    const allCandidates = await db.select().from(candidates);
    candidateWithPhone = allCandidates.find(c => {
      if (!c.phone) return false;
      const candidateDigits = c.phone.replace(/\D/g, '').slice(-10);
      return candidateDigits === phoneDigits;
    }) || null;
  }

  if (!candidateWithPhone) {
    console.log(`[Twilio] Received SMS from unknown number: ${from}`);
    return;
  }

  const upperBody = body.toUpperCase().trim();
  const isOptOut = STOP_KEYWORDS.some(keyword => upperBody === keyword || upperBody.startsWith(keyword + ' '));

  if (isOptOut) {
    await db.update(candidates)
      .set({
        smsOptOut: true,
        smsOptOutAt: new Date(),
        smsOptOutSource: upperBody.split(' ')[0],
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidateWithPhone.id));

    console.log(`[Twilio] Candidate ${candidateWithPhone.id} opted out via SMS: ${upperBody}`);
  }

  await db.insert(recruitingCommunications).values({
    candidateId: candidateWithPhone.id,
    type: 'sms',
    direction: 'inbound',
    content: body,
    provider: 'twilio',
    externalMessageId: messageSid,
    providerStatus: 'received',
    fromNumber: from,
    toNumber: to,
    createdAt: new Date(),
  });

  console.log(`[Twilio] Inbound SMS logged for candidate ${candidateWithPhone.id}`);
}

export async function updateSmsDeliveryStatus(
  messageSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  const updateData: any = {
    providerStatus: status,
  };

  if (status === 'delivered') {
    updateData.deliveredAt = new Date();
  }

  if (errorCode || errorMessage) {
    updateData.providerError = `${errorCode || ''}: ${errorMessage || ''}`.trim();
  }

  await db.update(recruitingCommunications)
    .set(updateData)
    .where(eq(recruitingCommunications.externalMessageId, messageSid));

  console.log(`[Twilio] Updated delivery status for ${messageSid}: ${status}`);
}

export function validateTwilioWebhook(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const twilioLib = twilio;
  return twilioLib.validateRequest(authToken, signature, url, params);
}

function normalizePhoneNumber(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
    return '+' + digitsOnly;
  }
  if (digitsOnly.length === 10) {
    return '+1' + digitsOnly;
  }
  return phone;
}

export async function grantSmsConsent(
  candidateId: string,
  source: string
): Promise<void> {
  await db.update(candidates)
    .set({
      smsConsent: true,
      smsConsentAt: new Date(),
      smsConsentSource: source,
      smsOptOut: false,
      smsOptOutAt: null,
      smsOptOutSource: null,
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId));

  console.log(`[SMS] Consent granted for candidate ${candidateId}, source: ${source}`);
}

export async function revokeSmsConsent(
  candidateId: string,
  source: string
): Promise<void> {
  await db.update(candidates)
    .set({
      smsOptOut: true,
      smsOptOutAt: new Date(),
      smsOptOutSource: source,
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId));

  console.log(`[SMS] Consent revoked for candidate ${candidateId}, source: ${source}`);
}
