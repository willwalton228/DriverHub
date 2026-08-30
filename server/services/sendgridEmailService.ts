import sgMail from '@sendgrid/mail';
import { db } from '../db';
import { recruitingCommunications, candidates, recruitingCandidates } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getLocalizedTemplate, SupportedLanguage } from '../localizationService';
import {
  getRecruitingExternalDeliverySuppressionReason,
  isRecruitingExternalDeliverySuppressed,
} from './recruitingDeliverySafety';

interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  blockedReason?: 'opted_out' | 'no_email' | 'do_not_contact' | 'throttled' | 'delivery_suppressed';
  nextAllowedAt?: Date;
  dailyCount?: number;
  maxPerDay?: number;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

function getSendGridConfig(): SendGridConfig | null {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || 'DriverHub Recruiting';

  if (!apiKey || !fromEmail) {
    return null;
  }

  return { apiKey, fromEmail, fromName };
}

export function isSendGridConfigured(): boolean {
  return getSendGridConfig() !== null;
}

export async function sendEmail(
  candidateId: string,
  subject: string,
  htmlContent: string,
  textContent: string,
  sentBy: string,
  applicationId?: string,
  templateId?: string,
  options?: { isAutomated?: boolean; overrideThrottle?: boolean; overrideJustification?: string; senderEmail?: string | null }
): Promise<SendEmailResult> {
  const config = getSendGridConfig();
  if (!config) {
    return { 
      success: false, 
      error: 'SendGrid is not configured. Please set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.' 
    };
  }

  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) {
    return { success: false, error: 'Candidate not found' };
  }

  if (!candidate.email) {
    return { success: false, blockedReason: 'no_email', error: 'Candidate has no email address' };
  }

  if (candidate.doNotContact) {
    return { success: false, blockedReason: 'do_not_contact', error: 'Candidate marked as Do Not Contact' };
  }

  if (candidate.emailOptOut) {
    return { success: false, blockedReason: 'opted_out', error: 'Candidate has opted out of emails' };
  }

  if (isRecruitingExternalDeliverySuppressed()) {
    const reason = getRecruitingExternalDeliverySuppressionReason();
    await db.insert(recruitingCommunications).values({
      candidateId,
      applicationId,
      type: 'email',
      direction: 'outbound',
      subject,
      content: htmlContent,
      sentBy,
      sentAt: new Date(),
      isAutomated: options?.isAutomated ?? false,
      provider: 'sendgrid',
      providerStatus: 'suppressed',
      providerError: reason,
      templateId,
      fromEmail: config.fromEmail,
      toEmail: candidate.email,
    });
    console.info(`[Recruiting Delivery Safety] Suppressed SendGrid email for candidate ${candidateId}`);
    return { success: false, blockedReason: 'delivery_suppressed', error: reason };
  }

  const { checkThrottle, recordThrottleEvent } = await import('./recruitingCommunicationThrottleService');
  const throttleResult = await checkThrottle(candidateId, 'email', options?.isAutomated);

  if (!throttleResult.allowed) {
    if (options?.overrideThrottle && options?.overrideJustification) {
      await recordThrottleEvent(
        candidateId, applicationId || null, 'email', 'override',
        throttleResult.blockedReason!, sentBy, options.senderEmail || null,
        throttleResult.ruleId || null, throttleResult.dailyCount || null,
        throttleResult.nextAllowedAt || null, options.overrideJustification
      );
    } else {
      await recordThrottleEvent(
        candidateId, applicationId || null, 'email', 'blocked',
        throttleResult.blockedReason!, sentBy, options?.senderEmail || null,
        throttleResult.ruleId || null, throttleResult.dailyCount || null,
        throttleResult.nextAllowedAt || null
      );
      const reason = throttleResult.blockedReason === 'daily_limit'
        ? `Daily email limit reached (${throttleResult.dailyCount}/${throttleResult.maxPerDay})`
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

  sgMail.setApiKey(config.apiKey);

  const msg = {
    to: candidate.email,
    from: {
      email: config.fromEmail,
      name: config.fromName,
    },
    subject,
    text: textContent,
    html: htmlContent,
    trackingSettings: {
      clickTracking: { enable: true },
      openTracking: { enable: true },
    },
  };

  try {
    const [response] = await sgMail.send(msg);
    
    const messageId = response.headers['x-message-id'] as string || `sg-${Date.now()}`;

    const [communication] = await db.insert(recruitingCommunications).values({
      candidateId,
      applicationId,
      type: 'email',
      direction: 'outbound',
      subject,
      content: htmlContent,
      sentBy,
      sentAt: new Date(),
      provider: 'sendgrid',
      externalMessageId: messageId,
      providerStatus: 'sent',
      templateId,
      fromEmail: config.fromEmail,
      toEmail: candidate.email,
    }).returning();

    console.log(`[SendGrid] Email sent to candidate ${candidateId}, Message ID: ${messageId}`);

    return {
      success: true,
      messageId,
    };
  } catch (error: any) {
    console.error('[SendGrid] Failed to send email:', error);

    await db.insert(recruitingCommunications).values({
      candidateId,
      applicationId,
      type: 'email',
      direction: 'outbound',
      subject,
      content: htmlContent,
      sentBy,
      sentAt: new Date(),
      provider: 'sendgrid',
      providerStatus: 'failed',
      providerError: error.message || 'Unknown error',
      templateId,
      fromEmail: config.fromEmail,
      toEmail: candidate.email,
    });

    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}

export function validateTemplateVariables(
  template: EmailTemplate,
  variables: Record<string, string>
): { valid: boolean; missingVariables: string[] } {
  const placeholderRegex = /\{\{(\w+)\}\}/g;
  const allPlaceholders = new Set<string>();
  
  let match;
  while ((match = placeholderRegex.exec(template.subject)) !== null) {
    allPlaceholders.add(match[1]);
  }
  placeholderRegex.lastIndex = 0;
  while ((match = placeholderRegex.exec(template.htmlContent)) !== null) {
    allPlaceholders.add(match[1]);
  }
  if (template.textContent) {
    placeholderRegex.lastIndex = 0;
    while ((match = placeholderRegex.exec(template.textContent)) !== null) {
      allPlaceholders.add(match[1]);
    }
  }
  
  const missingVariables = Array.from(allPlaceholders).filter(
    placeholder => !(placeholder in variables) || !variables[placeholder]
  );
  
  return {
    valid: missingVariables.length === 0,
    missingVariables,
  };
}

export async function sendTemplatedEmail(
  candidateId: string,
  template: EmailTemplate,
  variables: Record<string, string>,
  sentBy: string,
  applicationId?: string
): Promise<SendEmailResult> {
  const validation = validateTemplateVariables(template, variables);
  if (!validation.valid) {
    return {
      success: false,
      error: `Missing required template variables: ${validation.missingVariables.join(', ')}`,
    };
  }

  let subject = template.subject;
  let htmlContent = template.htmlContent;
  let textContent = template.textContent || '';

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    subject = subject.replace(new RegExp(placeholder, 'g'), value);
    htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), value);
    textContent = textContent.replace(new RegExp(placeholder, 'g'), value);
  }

  return sendEmail(
    candidateId,
    subject,
    htmlContent,
    textContent,
    sentBy,
    applicationId,
    template.id
  );
}

interface LocalizedEmailResult extends SendEmailResult {
  languageUsed: SupportedLanguage;
  usedFallback: boolean;
}

export async function sendLocalizedEmail(
  candidateId: string,
  templateKey: string,
  variables: Record<string, string>,
  sentBy: string,
  applicationId?: string
): Promise<LocalizedEmailResult> {
  const [recruitingCandidate] = await db.select({
    languagePreference: recruitingCandidates.languagePreference,
  }).from(recruitingCandidates).where(eq(recruitingCandidates.id, candidateId));

  const candidateLanguage: SupportedLanguage = (recruitingCandidate?.languagePreference as SupportedLanguage) || 'en';

  const localized = getLocalizedTemplate(templateKey, candidateLanguage, variables);

  if (!localized.body) {
    return {
      success: false,
      error: `Template not found: ${templateKey}`,
      languageUsed: localized.actualLanguage,
      usedFallback: localized.usedFallback,
    };
  }

  const htmlBody = localized.body.replace(/\n/g, '<br/>');

  const result = await sendEmail(
    candidateId,
    localized.subject || `Notification from DriverHub`,
    `<p>${htmlBody}</p>`,
    localized.body,
    sentBy,
    applicationId,
    templateKey
  );

  if (localized.usedFallback) {
    console.log(`[Localization] Used fallback for candidate ${candidateId}: requested ${candidateLanguage}, used ${localized.actualLanguage}`);
  }

  return {
    ...result,
    languageUsed: localized.actualLanguage,
    usedFallback: localized.usedFallback,
  };
}

export async function getLocalizedSmsContent(
  candidateId: string,
  templateKey: string,
  variables: Record<string, string>
): Promise<{ content: string; languageUsed: SupportedLanguage; usedFallback: boolean }> {
  const [recruitingCandidate] = await db.select({
    languagePreference: recruitingCandidates.languagePreference,
  }).from(recruitingCandidates).where(eq(recruitingCandidates.id, candidateId));

  const candidateLanguage: SupportedLanguage = (recruitingCandidate?.languagePreference as SupportedLanguage) || 'en';

  const localized = getLocalizedTemplate(templateKey, candidateLanguage, variables);

  if (localized.usedFallback) {
    console.log(`[Localization] SMS fallback for candidate ${candidateId}: requested ${candidateLanguage}, used ${localized.actualLanguage}`);
  }

  return {
    content: localized.smsBody || localized.body || '',
    languageUsed: localized.actualLanguage,
    usedFallback: localized.usedFallback,
  };
}

export function normalizeMessageId(rawMessageId: string | undefined): string | null {
  if (!rawMessageId) return null;
  const cleaned = rawMessageId.split('.')[0].replace(/[<>]/g, '');
  return cleaned || null;
}

export async function updateEmailStatus(
  messageId: string,
  event: string,
  timestamp?: Date
): Promise<void> {
  const updateData: any = {
    providerStatus: event,
  };

  switch (event) {
    case 'delivered':
      updateData.deliveredAt = timestamp || new Date();
      break;
    case 'open':
      updateData.openedAt = timestamp || new Date();
      break;
    case 'click':
      break;
    case 'bounce':
    case 'dropped':
    case 'spamreport':
      updateData.providerError = event;
      break;
  }

  await db.update(recruitingCommunications)
    .set(updateData)
    .where(eq(recruitingCommunications.externalMessageId, messageId));

  console.log(`[SendGrid] Updated email status for ${messageId}: ${event}`);
}

export async function handleUnsubscribe(email: string): Promise<void> {
  const candidateResults = await db.select().from(candidates)
    .where(eq(candidates.email, email));

  for (const candidate of candidateResults) {
    await db.update(candidates)
      .set({
        emailOptOut: true,
        emailOptOutAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidate.id));

    console.log(`[SendGrid] Email opt-out recorded for candidate ${candidate.id}`);
  }
}

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'application_received',
    name: 'Application Received',
    subject: 'Thank you for applying to {{position}}',
    htmlContent: `
      <p>Dear {{firstName}},</p>
      <p>Thank you for your interest in the <strong>{{position}}</strong> position at {{company}}.</p>
      <p>We have received your application and our team will review it carefully. We will be in touch soon regarding next steps.</p>
      <p>Best regards,<br>{{recruiterName}}<br>{{company}} Recruiting Team</p>
    `,
    textContent: 'Dear {{firstName}}, Thank you for applying to {{position}} at {{company}}. We have received your application and will be in touch soon.',
  },
  {
    id: 'interview_scheduled',
    name: 'Interview Scheduled',
    subject: 'Your interview for {{position}} has been scheduled',
    htmlContent: `
      <p>Dear {{firstName}},</p>
      <p>We are pleased to inform you that your interview for the <strong>{{position}}</strong> position has been scheduled.</p>
      <p><strong>Date:</strong> {{interviewDate}}<br>
      <strong>Time:</strong> {{interviewTime}}<br>
      <strong>Location:</strong> {{interviewLocation}}</p>
      <p>Please confirm your attendance by replying to this email.</p>
      <p>Best regards,<br>{{recruiterName}}<br>{{company}} Recruiting Team</p>
    `,
    textContent: 'Dear {{firstName}}, Your interview for {{position}} is scheduled for {{interviewDate}} at {{interviewTime}}. Location: {{interviewLocation}}. Please confirm your attendance.',
  },
  {
    id: 'offer_extended',
    name: 'Offer Extended',
    subject: 'Offer of Employment - {{position}}',
    htmlContent: `
      <p>Dear {{firstName}},</p>
      <p>We are excited to extend an offer of employment for the <strong>{{position}}</strong> position at {{company}}.</p>
      <p>Please review the attached offer letter and let us know if you have any questions.</p>
      <p>We look forward to welcoming you to our team!</p>
      <p>Best regards,<br>{{recruiterName}}<br>{{company}} Recruiting Team</p>
    `,
    textContent: 'Dear {{firstName}}, We are pleased to offer you the {{position}} position at {{company}}. Please review the offer letter and let us know if you have questions.',
  },
  {
    id: 'status_update',
    name: 'Application Status Update',
    subject: 'Update on your application for {{position}}',
    htmlContent: `
      <p>Dear {{firstName}},</p>
      <p>We wanted to provide you with an update on your application for the <strong>{{position}}</strong> position.</p>
      <p>{{statusMessage}}</p>
      <p>If you have any questions, please don't hesitate to reach out.</p>
      <p>Best regards,<br>{{recruiterName}}<br>{{company}} Recruiting Team</p>
    `,
    textContent: 'Dear {{firstName}}, We have an update on your application for {{position}}: {{statusMessage}}',
  },
];

export function getEmailTemplate(templateId: string): EmailTemplate | undefined {
  return DEFAULT_TEMPLATES.find(t => t.id === templateId);
}

export function getAllEmailTemplates(): EmailTemplate[] {
  return DEFAULT_TEMPLATES;
}
