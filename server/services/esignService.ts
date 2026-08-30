import { db } from '../db';
import { recruitingDocuments, recruitingAuditEvents } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { updateDocumentEsignStatus, getDocument } from './documentGenerationService';

export interface EsignRequest {
  documentId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  message?: string;
  callbackUrl?: string;
}

export interface EsignResult {
  success: boolean;
  envelopeId?: string;
  error?: string;
}

export interface EsignStatusResult {
  status: 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'voided' | 'unknown';
  viewedAt?: Date;
  signedAt?: Date;
  declinedAt?: Date;
  declineReason?: string;
  signedDocumentUrl?: string;
}

export interface EsignProvider {
  name: string;
  sendForSignature(request: EsignRequest, documentHtml: string): Promise<EsignResult>;
  getStatus(envelopeId: string): Promise<EsignStatusResult>;
  voidEnvelope?(envelopeId: string, reason: string): Promise<{ success: boolean; error?: string }>;
}

const providers: Map<string, EsignProvider> = new Map();

export function registerEsignProvider(provider: EsignProvider): void {
  providers.set(provider.name, provider);
  console.log(`[Esign] Provider registered: ${provider.name}`);
}

export function getEsignProvider(name: string): EsignProvider | undefined {
  return providers.get(name);
}

export function getAvailableEsignProviders(): string[] {
  return Array.from(providers.keys());
}

export async function sendDocumentForSignature(
  documentId: string,
  providerName: string,
  recipientEmail: string,
  recipientName: string,
  subject: string,
  message: string | undefined,
  userId: string
): Promise<EsignResult> {
  const provider = getEsignProvider(providerName);
  if (!provider) {
    return { 
      success: false, 
      error: `Provider "${providerName}" not found. Available: ${getAvailableEsignProviders().join(', ')}` 
    };
  }

  const document = await getDocument(documentId);
  if (!document) {
    return { success: false, error: 'Document not found' };
  }

  if (document.status !== 'finalized' && document.status !== 'draft') {
    return { success: false, error: `Document cannot be sent for signature in status: ${document.status}` };
  }

  try {
    const result = await provider.sendForSignature(
      {
        documentId,
        recipientEmail,
        recipientName,
        subject,
        message,
      },
      document.bodyHtml
    );

    if (!result.success) {
      await logEsignAudit(documentId, 'ESIGN_SEND_FAILED', userId, {
        provider: providerName,
        error: result.error,
      });
      return result;
    }

    await db.update(recruitingDocuments)
      .set({
        esignProvider: providerName,
        esignEnvelopeId: result.envelopeId,
        esignStatus: 'sent',
        esignSentAt: new Date(),
        status: 'sent_for_signature',
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(recruitingDocuments.id, documentId));

    await logEsignAudit(documentId, 'ESIGN_SENT', userId, {
      provider: providerName,
      envelopeId: result.envelopeId,
      recipientEmail,
    });

    console.log(`[Esign] Document ${documentId} sent for signature via ${providerName}`);
    return result;
  } catch (error: any) {
    console.error('[Esign] Error sending document:', error);
    return { success: false, error: error.message || 'Failed to send document for signature' };
  }
}

export async function pollEsignStatus(documentId: string): Promise<{
  success: boolean;
  status?: string;
  error?: string;
}> {
  const document = await getDocument(documentId);
  if (!document) {
    return { success: false, error: 'Document not found' };
  }

  if (!document.esignProvider || !document.esignEnvelopeId) {
    return { success: false, error: 'Document has not been sent for e-signature' };
  }

  const provider = getEsignProvider(document.esignProvider);
  if (!provider) {
    return { success: false, error: `Provider "${document.esignProvider}" not available` };
  }

  try {
    const statusResult = await provider.getStatus(document.esignEnvelopeId);
    
    await updateDocumentEsignStatus(documentId, statusResult.status, {
      viewedAt: statusResult.viewedAt,
      signedAt: statusResult.signedAt,
      declinedAt: statusResult.declinedAt,
      declineReason: statusResult.declineReason,
      signedDocumentUrl: statusResult.signedDocumentUrl,
    });

    return { success: true, status: statusResult.status };
  } catch (error: any) {
    console.error('[Esign] Error polling status:', error);
    return { success: false, error: error.message };
  }
}

export async function handleEsignWebhook(
  providerName: string,
  envelopeId: string,
  event: string,
  data: Record<string, any>
): Promise<void> {
  const documents = await db.query.recruitingDocuments.findMany({
    where: eq(recruitingDocuments.esignEnvelopeId, envelopeId),
  });

  if (documents.length === 0) {
    console.log(`[Esign] Webhook received for unknown envelope: ${envelopeId}`);
    return;
  }

  const document = documents[0];

  const statusMap: Record<string, string> = {
    'envelope-sent': 'sent',
    'envelope-delivered': 'sent',
    'envelope-viewed': 'viewed',
    'envelope-completed': 'signed',
    'envelope-declined': 'declined',
    'envelope-voided': 'voided',
    'recipient-viewed': 'viewed',
    'recipient-signed': 'signed',
    'recipient-declined': 'declined',
  };

  const status = statusMap[event] || event;

  await updateDocumentEsignStatus(document.id, status, {
    viewedAt: event.includes('viewed') ? new Date() : undefined,
    signedAt: event.includes('completed') || event.includes('signed') ? new Date() : undefined,
    declinedAt: event.includes('declined') ? new Date() : undefined,
    declineReason: data.declineReason,
    signedDocumentUrl: data.signedDocumentUrl,
  });

  await logEsignAudit(document.id, 'ESIGN_WEBHOOK', 'system', {
    provider: providerName,
    event,
    envelopeId,
    data,
  });

  console.log(`[Esign] Webhook processed for document ${document.id}: ${event}`);
}

export async function updateEsignStatusManually(
  documentId: string,
  status: 'viewed' | 'signed' | 'declined',
  userId: string,
  data?: {
    declineReason?: string;
    signedDocumentUrl?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateDocumentEsignStatus(documentId, status, {
      viewedAt: status === 'viewed' ? new Date() : undefined,
      signedAt: status === 'signed' ? new Date() : undefined,
      declinedAt: status === 'declined' ? new Date() : undefined,
      declineReason: data?.declineReason,
      signedDocumentUrl: data?.signedDocumentUrl,
    });

    await logEsignAudit(documentId, 'ESIGN_STATUS_MANUAL_UPDATE', userId, {
      status,
      ...data,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function logEsignAudit(
  documentId: string,
  action: string,
  userId: string,
  details: Record<string, any>
): Promise<void> {
  const document = await getDocument(documentId);
  
  await db.insert(recruitingAuditEvents).values({
    entityType: 'document',
    entityId: documentId,
    actionType: action,
    userId: userId === 'system' ? null : userId,
    newValue: JSON.stringify({
      ...details,
      applicationId: document?.applicationId,
    }),
    reason: `E-sign: ${action}`,
  });
}

const mockEsignProvider: EsignProvider = {
  name: 'mock',
  async sendForSignature(request, documentHtml) {
    const envelopeId = `mock-env-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[MockEsign] Created envelope ${envelopeId} for document ${request.documentId}`);
    console.log(`[MockEsign] Sent to: ${request.recipientEmail}`);
    return { success: true, envelopeId };
  },
  async getStatus(envelopeId) {
    const random = Math.random();
    if (random < 0.3) {
      return { status: 'sent' };
    } else if (random < 0.5) {
      return { status: 'viewed', viewedAt: new Date() };
    } else if (random < 0.8) {
      return { 
        status: 'signed', 
        viewedAt: new Date(Date.now() - 3600000),
        signedAt: new Date(),
        signedDocumentUrl: `https://example.com/signed/${envelopeId}.pdf`,
      };
    } else {
      return { status: 'declined', declinedAt: new Date(), declineReason: 'Terms not acceptable' };
    }
  },
  async voidEnvelope(envelopeId, reason) {
    console.log(`[MockEsign] Voided envelope ${envelopeId}: ${reason}`);
    return { success: true };
  },
};

registerEsignProvider(mockEsignProvider);

export function initializeDocuSignProvider(): void {
  const apiKey = process.env.DOCUSIGN_API_KEY;
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  
  if (!apiKey || !accountId) {
    console.log('[Esign] DocuSign not configured (DOCUSIGN_API_KEY or DOCUSIGN_ACCOUNT_ID not set)');
    return;
  }

  const docuSignProvider: EsignProvider = {
    name: 'docusign',
    async sendForSignature(request, documentHtml) {
      console.log('[DocuSign] API integration - implementation stub');
      return { 
        success: false, 
        error: 'DocuSign integration requires additional configuration. Contact support.' 
      };
    },
    async getStatus(envelopeId) {
      return { status: 'unknown' };
    },
    async voidEnvelope(envelopeId, reason) {
      return { success: false, error: 'Not implemented' };
    },
  };

  registerEsignProvider(docuSignProvider);
  console.log('[Esign] DocuSign provider initialized (stub)');
}

export function initializeSigneasyProvider(): void {
  const apiKey = process.env.SIGNEASY_API_KEY;
  
  if (!apiKey) {
    console.log('[Esign] Signeasy not configured (SIGNEASY_API_KEY not set)');
    return;
  }

  const signeasyProvider: EsignProvider = {
    name: 'signeasy',
    async sendForSignature(request, documentHtml) {
      console.log('[Signeasy] API integration - implementation stub');
      return { 
        success: false, 
        error: 'Signeasy integration requires additional configuration. Contact support.' 
      };
    },
    async getStatus(envelopeId) {
      return { status: 'unknown' };
    },
    async voidEnvelope(envelopeId, reason) {
      return { success: false, error: 'Not implemented' };
    },
  };

  registerEsignProvider(signeasyProvider);
  console.log('[Esign] Signeasy provider initialized (stub)');
}

initializeDocuSignProvider();
initializeSigneasyProvider();
