import { db } from '../db';
import { 
  recruitingDocumentTemplates, 
  recruitingDocuments,
  recruitingApplications,
  recruitingCandidates,
  recruitingRequisitions,
  recruitingAuditEvents,
  InsertRecruitingDocumentTemplate,
  InsertRecruitingDocument,
  RecruitingDocumentTemplate,
  RecruitingDocument,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export interface TemplateVariable {
  name: string;
  path: string;
  description: string;
  example: string;
}

export const AVAILABLE_VARIABLES: TemplateVariable[] = [
  { name: 'candidate.firstName', path: 'candidate.firstName', description: "Candidate's first name", example: 'John' },
  { name: 'candidate.lastName', path: 'candidate.lastName', description: "Candidate's last name", example: 'Doe' },
  { name: 'candidate.fullName', path: 'candidate.fullName', description: "Candidate's full name", example: 'John Doe' },
  { name: 'candidate.email', path: 'candidate.email', description: "Candidate's email", example: 'john.doe@example.com' },
  { name: 'candidate.phone', path: 'candidate.phone', description: "Candidate's phone", example: '555-123-4567' },
  { name: 'candidate.address', path: 'candidate.address', description: "Candidate's address", example: '123 Main St' },
  { name: 'candidate.city', path: 'candidate.city', description: "Candidate's city", example: 'Dallas' },
  { name: 'candidate.state', path: 'candidate.state', description: "Candidate's state", example: 'TX' },
  { name: 'candidate.zipCode', path: 'candidate.zipCode', description: "Candidate's zip code", example: '75201' },
  
  { name: 'requisition.title', path: 'requisition.title', description: 'Job title', example: 'Delivery Driver' },
  { name: 'requisition.location', path: 'requisition.location', description: 'Job location', example: 'Dallas, TX' },
  { name: 'requisition.department', path: 'requisition.department', description: 'Department', example: 'Operations' },
  { name: 'requisition.description', path: 'requisition.description', description: 'Job description', example: 'Full job description...' },
  
  { name: 'offer.salary', path: 'offer.salary', description: 'Offered salary', example: '$50,000' },
  { name: 'offer.hourlyRate', path: 'offer.hourlyRate', description: 'Hourly rate', example: '$25.00' },
  { name: 'offer.startDate', path: 'offer.startDate', description: 'Start date', example: 'March 15, 2026' },
  { name: 'offer.bonusAmount', path: 'offer.bonusAmount', description: 'Sign-on bonus', example: '$1,000' },
  { name: 'offer.benefits', path: 'offer.benefits', description: 'Benefits summary', example: 'Health, Dental, Vision' },
  
  { name: 'company.name', path: 'company.name', description: 'Company name', example: 'DriverHub 360' },
  { name: 'company.address', path: 'company.address', description: 'Company address', example: '100 Corporate Blvd' },
  { name: 'company.city', path: 'company.city', description: 'Company city', example: 'Dallas' },
  { name: 'company.state', path: 'company.state', description: 'Company state', example: 'TX' },
  { name: 'company.zipCode', path: 'company.zipCode', description: 'Company zip code', example: '75201' },
  
  { name: 'today', path: 'today', description: "Today's date", example: 'February 1, 2026' },
  { name: 'expirationDate', path: 'expirationDate', description: 'Offer expiration date', example: 'February 15, 2026' },
];

function getNestedValue(obj: any, path: string): string {
  const value = path.split('.').reduce((current, key) => current?.[key], obj);
  return value !== undefined && value !== null ? String(value) : '';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function formatCurrency(amount: number | string): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) {
    return '';
  }
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

export function substituteVariables(template: string, data: Record<string, any>): string {
  let result = template;
  
  const variablePattern = /\{\{([^}]+)\}\}/g;
  result = result.replace(variablePattern, (match, variableName) => {
    const trimmedName = variableName.trim();
    const value = getNestedValue(data, trimmedName);
    return value || match;
  });
  
  return result;
}

export function extractVariables(template: string): string[] {
  const variablePattern = /\{\{([^}]+)\}\}/g;
  const variables: string[] = [];
  let match;
  
  while ((match = variablePattern.exec(template)) !== null) {
    const variableName = match[1].trim();
    if (!variables.includes(variableName)) {
      variables.push(variableName);
    }
  }
  
  return variables;
}

export function validateTemplate(template: string): { valid: boolean; missingVariables: string[] } {
  const usedVariables = extractVariables(template);
  const availableNames = AVAILABLE_VARIABLES.map(v => v.name);
  const missingVariables = usedVariables.filter(v => !availableNames.includes(v));
  
  return {
    valid: missingVariables.length === 0,
    missingVariables,
  };
}

async function buildTemplateData(
  applicationId: string,
  customData?: Record<string, any>
): Promise<Record<string, any>> {
  const application = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, applicationId),
  });
  
  if (!application) {
    throw new Error('Application not found');
  }
  
  const candidate = await db.query.recruitingCandidates.findFirst({
    where: eq(recruitingCandidates.id, application.candidateId),
  });
  
  const requisition = await db.query.recruitingRequisitions.findFirst({
    where: eq(recruitingRequisitions.id, application.requisitionId),
  });
  
  const today = new Date();
  const expirationDate = new Date(today);
  expirationDate.setDate(expirationDate.getDate() + 14);
  
  const data: Record<string, any> = {
    candidate: {
      firstName: candidate?.firstName || '',
      lastName: candidate?.lastName || '',
      fullName: candidate ? `${candidate.firstName} ${candidate.lastName}` : '',
      email: candidate?.email || '',
      phone: candidate?.phone || '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
    },
    requisition: {
      title: requisition?.title || '',
      location: requisition?.market || '',
      department: requisition?.region || 'Operations',
      description: requisition?.description || '',
    },
    offer: {
      salary: customData?.salary ? formatCurrency(customData.salary) : '',
      hourlyRate: customData?.hourlyRate ? formatCurrency(customData.hourlyRate) : '',
      startDate: customData?.startDate ? formatDate(new Date(customData.startDate)) : '',
      bonusAmount: customData?.bonusAmount ? formatCurrency(customData.bonusAmount) : '',
      benefits: customData?.benefits || 'Standard benefits package',
    },
    company: {
      name: 'DriverHub 360',
      address: '100 Corporate Blvd',
      city: 'Dallas',
      state: 'TX',
      zipCode: '75201',
    },
    today: formatDate(today),
    expirationDate: formatDate(expirationDate),
    ...customData,
  };
  
  return data;
}

export async function createTemplate(
  data: Omit<InsertRecruitingDocumentTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  userId: string
): Promise<RecruitingDocumentTemplate> {
  const variables = extractVariables(data.bodyHtml);
  
  const [template] = await db.insert(recruitingDocumentTemplates).values({
    ...data,
    variables,
    createdBy: userId,
    updatedBy: userId,
  }).returning();
  
  await logAudit('TEMPLATE_CREATED', 'template', template.id, userId, {
    name: template.name,
    type: template.type,
  });
  
  console.log(`[Documents] Template created: ${template.name}`);
  return template;
}

export async function updateTemplate(
  id: string,
  data: Partial<InsertRecruitingDocumentTemplate>,
  userId: string
): Promise<RecruitingDocumentTemplate | null> {
  const existing = await db.query.recruitingDocumentTemplates.findFirst({
    where: eq(recruitingDocumentTemplates.id, id),
  });
  
  if (!existing) return null;
  
  const updateData: any = { ...data, updatedAt: new Date(), updatedBy: userId };
  
  if (data.bodyHtml) {
    updateData.variables = extractVariables(data.bodyHtml);
    updateData.version = existing.version + 1;
  }
  
  const [updated] = await db.update(recruitingDocumentTemplates)
    .set(updateData)
    .where(eq(recruitingDocumentTemplates.id, id))
    .returning();
  
  await logAudit('TEMPLATE_UPDATED', 'template', id, userId, {
    changes: Object.keys(data),
    newVersion: updated.version,
  });
  
  return updated;
}

export async function getTemplates(type?: string): Promise<RecruitingDocumentTemplate[]> {
  if (type) {
    return db.query.recruitingDocumentTemplates.findMany({
      where: and(
        eq(recruitingDocumentTemplates.type, type as any),
        eq(recruitingDocumentTemplates.isActive, true)
      ),
      orderBy: [desc(recruitingDocumentTemplates.createdAt)],
    });
  }
  
  return db.query.recruitingDocumentTemplates.findMany({
    where: eq(recruitingDocumentTemplates.isActive, true),
    orderBy: [desc(recruitingDocumentTemplates.createdAt)],
  });
}

export async function getTemplate(id: string): Promise<RecruitingDocumentTemplate | null> {
  const template = await db.query.recruitingDocumentTemplates.findFirst({
    where: eq(recruitingDocumentTemplates.id, id),
  });
  return template || null;
}

export async function previewDocument(
  templateId: string,
  applicationId: string,
  customData?: Record<string, any>
): Promise<{ html: string; plainText?: string; data: Record<string, any> }> {
  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error('Template not found');
  }
  
  const data = await buildTemplateData(applicationId, customData);
  const html = substituteVariables(template.bodyHtml, data);
  const plainText = template.bodyPlainText 
    ? substituteVariables(template.bodyPlainText, data) 
    : undefined;
  
  return { html, plainText, data };
}

export async function generateDocument(
  templateId: string,
  applicationId: string,
  customData: Record<string, any> | undefined,
  userId: string
): Promise<RecruitingDocument> {
  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error('Template not found');
  }
  
  const application = await db.query.recruitingApplications.findFirst({
    where: eq(recruitingApplications.id, applicationId),
  });
  if (!application) {
    throw new Error('Application not found');
  }
  
  const data = await buildTemplateData(applicationId, customData);
  const html = substituteVariables(template.bodyHtml, data);
  const plainText = template.bodyPlainText 
    ? substituteVariables(template.bodyPlainText, data) 
    : undefined;
  
  const [document] = await db.insert(recruitingDocuments).values({
    applicationId,
    templateId,
    type: template.type,
    name: `${template.name} - ${new Date().toLocaleDateString()}`,
    bodyHtml: html,
    bodyPlainText: plainText,
    status: 'draft',
    generatedData: JSON.stringify(data),
    createdBy: userId,
    updatedBy: userId,
  }).returning();
  
  await logAudit('DOCUMENT_GENERATED', 'document', document.id, userId, {
    templateId,
    templateName: template.name,
    applicationId,
    type: template.type,
  });
  
  console.log(`[Documents] Document generated: ${document.name} for application ${applicationId}`);
  return document;
}

export async function finalizeDocument(
  documentId: string,
  userId: string
): Promise<RecruitingDocument> {
  const [document] = await db.update(recruitingDocuments)
    .set({
      status: 'finalized',
      finalizedAt: new Date(),
      finalizedBy: userId,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(recruitingDocuments.id, documentId))
    .returning();
  
  if (!document) {
    throw new Error('Document not found');
  }
  
  await logAudit('DOCUMENT_FINALIZED', 'document', documentId, userId, {
    name: document.name,
    type: document.type,
  });
  
  return document;
}

export async function getDocument(id: string): Promise<RecruitingDocument | null> {
  const document = await db.query.recruitingDocuments.findFirst({
    where: eq(recruitingDocuments.id, id),
  });
  return document || null;
}

export async function getDocuments(applicationId: string): Promise<RecruitingDocument[]> {
  return db.query.recruitingDocuments.findMany({
    where: eq(recruitingDocuments.applicationId, applicationId),
    orderBy: [desc(recruitingDocuments.createdAt)],
  });
}

export async function updateDocumentEsignStatus(
  documentId: string,
  status: string,
  data?: {
    viewedAt?: Date;
    signedAt?: Date;
    declinedAt?: Date;
    declineReason?: string;
    signedDocumentUrl?: string;
  }
): Promise<RecruitingDocument> {
  const statusMap: Record<string, string> = {
    'sent': 'sent_for_signature',
    'viewed': 'viewed',
    'signed': 'signed',
    'declined': 'declined',
  };
  
  const updateData: any = {
    esignStatus: status,
    status: statusMap[status] || status,
    updatedAt: new Date(),
  };
  
  if (data?.viewedAt) updateData.esignViewedAt = data.viewedAt;
  if (data?.signedAt) updateData.esignSignedAt = data.signedAt;
  if (data?.declinedAt) updateData.esignDeclinedAt = data.declinedAt;
  if (data?.declineReason) updateData.esignDeclineReason = data.declineReason;
  if (data?.signedDocumentUrl) updateData.signedDocumentUrl = data.signedDocumentUrl;
  
  const [document] = await db.update(recruitingDocuments)
    .set(updateData)
    .where(eq(recruitingDocuments.id, documentId))
    .returning();
  
  if (!document) {
    throw new Error('Document not found');
  }
  
  await logAudit('DOCUMENT_ESIGN_STATUS_UPDATED', 'document', documentId, 'system', {
    status,
    ...data,
  });
  
  return document;
}

async function logAudit(
  action: string,
  entityType: string,
  entityId: string,
  userId: string,
  details: Record<string, any>
): Promise<void> {
  await db.insert(recruitingAuditEvents).values({
    entityType,
    entityId,
    actionType: action,
    userId: userId === 'system' ? null : userId,
    newValue: JSON.stringify(details),
    reason: `Document action: ${action}`,
  });
}

export async function seedDefaultTemplates(userId: string): Promise<void> {
  const existingTemplates = await db.query.recruitingDocumentTemplates.findMany();
  if (existingTemplates.length > 0) {
    console.log('[Documents] Templates already exist, skipping seed');
    return;
  }
  
  const defaultOfferLetter = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 24px; font-weight: bold; color: #FF6B35; }
    .date { text-align: right; margin-bottom: 20px; }
    .recipient { margin-bottom: 20px; }
    .content { margin-bottom: 30px; }
    .signature { margin-top: 50px; }
    .signature-line { border-top: 1px solid #333; width: 300px; margin-top: 50px; padding-top: 5px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">{{company.name}}</div>
    <div>{{company.address}}, {{company.city}}, {{company.state}} {{company.zipCode}}</div>
  </div>
  
  <div class="date">{{today}}</div>
  
  <div class="recipient">
    <p>{{candidate.fullName}}<br>
    {{candidate.email}}</p>
  </div>
  
  <div class="content">
    <p>Dear {{candidate.firstName}},</p>
    
    <p>We are pleased to extend an offer of employment for the position of <strong>{{requisition.title}}</strong> at {{company.name}}. We were impressed with your qualifications and believe you will be a valuable addition to our team.</p>
    
    <p><strong>Position Details:</strong></p>
    <ul>
      <li><strong>Position:</strong> {{requisition.title}}</li>
      <li><strong>Location:</strong> {{requisition.location}}</li>
      <li><strong>Department:</strong> {{requisition.department}}</li>
      <li><strong>Start Date:</strong> {{offer.startDate}}</li>
      <li><strong>Compensation:</strong> {{offer.salary}} annually / {{offer.hourlyRate}} per hour</li>
      <li><strong>Sign-on Bonus:</strong> {{offer.bonusAmount}}</li>
      <li><strong>Benefits:</strong> {{offer.benefits}}</li>
    </ul>
    
    <p>This offer is contingent upon the successful completion of a background check and verification of your eligibility to work in the United States.</p>
    
    <p>Please indicate your acceptance of this offer by signing below and returning this letter by <strong>{{expirationDate}}</strong>.</p>
    
    <p>We are excited about the possibility of you joining our team and look forward to your favorable response.</p>
    
    <p>Sincerely,</p>
    
    <div class="signature">
      <p>Human Resources<br>{{company.name}}</p>
    </div>
    
    <div class="signature-line">
      <p>Candidate Signature</p>
    </div>
    
    <div class="signature-line">
      <p>Date</p>
    </div>
  </div>
</body>
</html>
`;

  await createTemplate({
    name: 'Standard Offer Letter',
    type: 'offer_letter',
    description: 'Default offer letter template for driver positions',
    bodyHtml: defaultOfferLetter.trim(),
    isActive: true,
    isDefault: true,
  }, userId);
  
  console.log('[Documents] Default templates seeded');
}
