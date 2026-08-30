import type { SupportedLanguage } from "@shared/schema";
import { supportedLanguages, languageDisplayNames } from "@shared/schema";

type TranslationKey = string;
type TranslationContent = {
  subject?: string;
  body: string;
  smsBody?: string;
};

type LocalizedTemplates = {
  [key in TranslationKey]: {
    [lang in SupportedLanguage]?: TranslationContent;
  };
};

const templates: LocalizedTemplates = {
  "recruiting.application_received": {
    en: {
      subject: "Application Received - {{companyName}}",
      body: `Dear {{firstName}},

Thank you for your interest in joining {{companyName}}. We have received your application and our recruiting team will review it shortly.

If you have any questions, please don't hesitate to reach out.

Best regards,
{{companyName}} Recruiting Team`,
      smsBody: "Hi {{firstName}}, thank you for applying to {{companyName}}! We've received your application and will be in touch soon."
    },
    es: {
      subject: "Solicitud Recibida - {{companyName}}",
      body: `Estimado/a {{firstName}},

Gracias por su interés en unirse a {{companyName}}. Hemos recibido su solicitud y nuestro equipo de reclutamiento la revisará en breve.

Si tiene alguna pregunta, no dude en comunicarse con nosotros.

Atentamente,
Equipo de Reclutamiento de {{companyName}}`,
      smsBody: "Hola {{firstName}}, ¡gracias por aplicar a {{companyName}}! Hemos recibido tu solicitud y nos pondremos en contacto pronto."
    },
  },
  "recruiting.interview_scheduled": {
    en: {
      subject: "Interview Scheduled - {{companyName}}",
      body: `Dear {{firstName}},

Your interview has been scheduled for {{interviewDate}} at {{interviewTime}}.

Location: {{location}}

Please arrive 10 minutes early and bring a valid photo ID.

If you need to reschedule, please contact us as soon as possible.

Best regards,
{{companyName}} Recruiting Team`,
      smsBody: "Hi {{firstName}}, your interview with {{companyName}} is scheduled for {{interviewDate}} at {{interviewTime}}. Location: {{location}}. Reply HELP for assistance."
    },
    es: {
      subject: "Entrevista Programada - {{companyName}}",
      body: `Estimado/a {{firstName}},

Su entrevista ha sido programada para el {{interviewDate}} a las {{interviewTime}}.

Ubicación: {{location}}

Por favor llegue 10 minutos antes y traiga una identificación con foto válida.

Si necesita reprogramar, contáctenos lo antes posible.

Atentamente,
Equipo de Reclutamiento de {{companyName}}`,
      smsBody: "Hola {{firstName}}, tu entrevista con {{companyName}} está programada para el {{interviewDate}} a las {{interviewTime}}. Ubicación: {{location}}. Responde AYUDA para asistencia."
    },
  },
  "recruiting.stage_change": {
    en: {
      subject: "Application Update - {{companyName}}",
      body: `Dear {{firstName}},

Your application status has been updated to: {{newStage}}.

{{additionalInfo}}

If you have any questions, please don't hesitate to reach out.

Best regards,
{{companyName}} Recruiting Team`,
      smsBody: "Hi {{firstName}}, your {{companyName}} application status has been updated to: {{newStage}}. Check your email for details."
    },
    es: {
      subject: "Actualización de Solicitud - {{companyName}}",
      body: `Estimado/a {{firstName}},

El estado de su solicitud ha sido actualizado a: {{newStage}}.

{{additionalInfo}}

Si tiene alguna pregunta, no dude en comunicarse con nosotros.

Atentamente,
Equipo de Reclutamiento de {{companyName}}`,
      smsBody: "Hola {{firstName}}, el estado de tu solicitud en {{companyName}} ha sido actualizado a: {{newStage}}. Revisa tu correo para más detalles."
    },
  },
  "recruiting.offer_extended": {
    en: {
      subject: "Job Offer - {{companyName}}",
      body: `Dear {{firstName}},

Congratulations! We are pleased to extend an offer of employment with {{companyName}}.

Position: {{position}}
Start Date: {{startDate}}
Compensation: {{compensation}}

Please review the attached offer letter and respond by {{responseDeadline}}.

We look forward to welcoming you to our team!

Best regards,
{{companyName}} Recruiting Team`,
      smsBody: "Congratulations {{firstName}}! {{companyName}} has extended you a job offer. Please check your email for details and respond by {{responseDeadline}}."
    },
    es: {
      subject: "Oferta de Trabajo - {{companyName}}",
      body: `Estimado/a {{firstName}},

¡Felicidades! Nos complace extenderle una oferta de empleo con {{companyName}}.

Posición: {{position}}
Fecha de Inicio: {{startDate}}
Compensación: {{compensation}}

Por favor revise la carta de oferta adjunta y responda antes del {{responseDeadline}}.

¡Esperamos darle la bienvenida a nuestro equipo!

Atentamente,
Equipo de Reclutamiento de {{companyName}}`,
      smsBody: "¡Felicidades {{firstName}}! {{companyName}} te ha extendido una oferta de trabajo. Revisa tu correo para más detalles y responde antes del {{responseDeadline}}."
    },
  },
  "recruiting.reminder": {
    en: {
      subject: "Reminder - {{reminderType}} - {{companyName}}",
      body: `Dear {{firstName}},

This is a friendly reminder about: {{reminderDetails}}.

{{additionalInfo}}

If you have any questions, please contact us.

Best regards,
{{companyName}} Recruiting Team`,
      smsBody: "Hi {{firstName}}, reminder from {{companyName}}: {{reminderDetails}}. Reply HELP for assistance."
    },
    es: {
      subject: "Recordatorio - {{reminderType}} - {{companyName}}",
      body: `Estimado/a {{firstName}},

Este es un recordatorio amigable sobre: {{reminderDetails}}.

{{additionalInfo}}

Si tiene alguna pregunta, contáctenos.

Atentamente,
Equipo de Reclutamiento de {{companyName}}`,
      smsBody: "Hola {{firstName}}, recordatorio de {{companyName}}: {{reminderDetails}}. Responde AYUDA para asistencia."
    },
  },
  "recruiting.document_request": {
    en: {
      subject: "Document Request - {{companyName}}",
      body: `Dear {{firstName}},

As part of your application process, we need you to provide the following documents:

{{documentList}}

Please upload these documents by {{deadline}} through our candidate portal.

If you have any questions about the required documents, please contact us.

Best regards,
{{companyName}} Recruiting Team`,
      smsBody: "Hi {{firstName}}, {{companyName}} needs additional documents for your application. Please check your email for details. Documents due by {{deadline}}."
    },
    es: {
      subject: "Solicitud de Documentos - {{companyName}}",
      body: `Estimado/a {{firstName}},

Como parte de su proceso de solicitud, necesitamos que proporcione los siguientes documentos:

{{documentList}}

Por favor suba estos documentos antes del {{deadline}} a través de nuestro portal de candidatos.

Si tiene alguna pregunta sobre los documentos requeridos, contáctenos.

Atentamente,
Equipo de Reclutamiento de {{companyName}}`,
      smsBody: "Hola {{firstName}}, {{companyName}} necesita documentos adicionales para tu solicitud. Revisa tu correo para más detalles. Fecha límite: {{deadline}}."
    },
  },
};

const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export function getLocalizedTemplate(
  templateKey: TranslationKey,
  language: SupportedLanguage | string,
  variables: Record<string, string> = {}
): { subject?: string; body: string; smsBody?: string; usedFallback: boolean; actualLanguage: SupportedLanguage } {
  const template = templates[templateKey];
  
  if (!template) {
    console.warn(`[Localization] Template not found: ${templateKey}, using empty template`);
    return {
      subject: "",
      body: "",
      smsBody: "",
      usedFallback: true,
      actualLanguage: DEFAULT_LANGUAGE,
    };
  }

  const normalizedLang = (supportedLanguages as readonly string[]).includes(language) 
    ? (language as SupportedLanguage) 
    : DEFAULT_LANGUAGE;

  let content = template[normalizedLang];
  let usedFallback = false;
  let actualLanguage = normalizedLang;

  if (!content) {
    content = template[DEFAULT_LANGUAGE];
    usedFallback = true;
    actualLanguage = DEFAULT_LANGUAGE;
    console.info(`[Localization] No ${normalizedLang} translation for ${templateKey}, using ${DEFAULT_LANGUAGE} fallback`);
  }

  if (!content) {
    console.warn(`[Localization] No content available for template: ${templateKey}`);
    return {
      subject: "",
      body: "",
      smsBody: "",
      usedFallback: true,
      actualLanguage: DEFAULT_LANGUAGE,
    };
  }

  const replaceVariables = (text: string | undefined): string => {
    if (!text) return "";
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  };

  return {
    subject: replaceVariables(content.subject),
    body: replaceVariables(content.body),
    smsBody: replaceVariables(content.smsBody),
    usedFallback,
    actualLanguage,
  };
}

export function isValidLanguage(language: string): language is SupportedLanguage {
  return (supportedLanguages as readonly string[]).includes(language);
}

export function getLanguageDisplayName(language: SupportedLanguage | string): string {
  if (isValidLanguage(language)) {
    return languageDisplayNames[language];
  }
  return languageDisplayNames[DEFAULT_LANGUAGE];
}

export function getSupportedLanguages(): Array<{ code: SupportedLanguage; name: string }> {
  return supportedLanguages.map(code => ({
    code,
    name: languageDisplayNames[code],
  }));
}

export function getAvailableTemplates(): string[] {
  return Object.keys(templates);
}

export function getTemplateLanguages(templateKey: TranslationKey): SupportedLanguage[] {
  const template = templates[templateKey];
  if (!template) return [];
  return Object.keys(template) as SupportedLanguage[];
}

export { SupportedLanguage, DEFAULT_LANGUAGE };
