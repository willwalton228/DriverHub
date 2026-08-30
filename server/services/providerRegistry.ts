import { isStripeConfigured } from '../stripe';
import { isTwilioConfigured } from './twilioSmsService';
import { isSendGridConfigured } from './sendgridEmailService';

export type ProviderCategory = 'email' | 'sms' | 'payments' | 'background_check' | 'storage' | 'crm' | 'auth' | 'api_key';

export type ProviderStatus = 'connected' | 'not_configured' | 'error';

export interface ProviderDefinition {
  id: string;
  name: string;
  category: ProviderCategory;
  description: string;
  requiredSecrets: string[];
  optionalSecrets: string[];
  featureFlag?: string;
  isRequired: boolean;
  checkHealth: () => ProviderHealthResult;
}

export interface ProviderHealthResult {
  status: ProviderStatus;
  configured: boolean;
  message: string;
  secretsPresent: Record<string, boolean>;
  lastCheckedAt: string;
}

export interface ProviderHealthSummary {
  providerId: string;
  name: string;
  category: ProviderCategory;
  description: string;
  status: ProviderStatus;
  configured: boolean;
  message: string;
  isRequired: boolean;
  featureFlag?: string;
  secretsMask: Record<string, boolean>;
  lastCheckedAt: string;
}

function checkSecretPresent(key: string): boolean {
  const val = process.env[key];
  return val !== undefined && val !== null && val.trim().length > 0;
}

function buildSecretsMask(keys: string[]): Record<string, boolean> {
  const mask: Record<string, boolean> = {};
  for (const key of keys) {
    mask[key] = checkSecretPresent(key);
  }
  return mask;
}

const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'resend',
    name: 'Resend',
    category: 'email',
    description: 'Transactional email delivery for notifications, invitations, and invoices',
    requiredSecrets: ['RESEND_API_KEY'],
    optionalSecrets: ['RESEND_FROM_EMAIL'],
    isRequired: false,
    checkHealth() {
      const mask = buildSecretsMask([...this.requiredSecrets, ...this.optionalSecrets]);
      const configured = this.requiredSecrets.every(k => checkSecretPresent(k));
      return {
        status: configured ? 'connected' : 'not_configured',
        configured,
        message: configured ? 'Resend email service is configured and ready' : 'RESEND_API_KEY is not set. Email delivery is disabled.',
        secretsPresent: mask,
        lastCheckedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    category: 'email',
    description: 'Recruiting email delivery via SendGrid',
    requiredSecrets: ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'],
    optionalSecrets: ['SENDGRID_FROM_NAME'],
    isRequired: false,
    checkHealth() {
      const mask = buildSecretsMask([...this.requiredSecrets, ...this.optionalSecrets]);
      const configured = isSendGridConfigured();
      return {
        status: configured ? 'connected' : 'not_configured',
        configured,
        message: configured ? 'SendGrid is configured and ready' : 'SendGrid requires SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.',
        secretsPresent: mask,
        lastCheckedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'twilio',
    name: 'Twilio',
    category: 'sms',
    description: 'SMS messaging for recruiting candidate communications',
    requiredSecrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    optionalSecrets: [],
    isRequired: false,
    checkHealth() {
      const mask = buildSecretsMask([...this.requiredSecrets, ...this.optionalSecrets]);
      const configured = isTwilioConfigured();
      return {
        status: configured ? 'connected' : 'not_configured',
        configured,
        message: configured ? 'Twilio SMS is configured and ready' : 'Twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.',
        secretsPresent: mask,
        lastCheckedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'payments',
    description: 'Payment processing for invoicing and billing',
    requiredSecrets: ['STRIPE_SECRET_KEY'],
    optionalSecrets: ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    isRequired: false,
    checkHealth() {
      const mask = buildSecretsMask([...this.requiredSecrets, ...this.optionalSecrets]);
      const configured = isStripeConfigured();
      return {
        status: configured ? 'connected' : 'not_configured',
        configured,
        message: configured ? 'Stripe payment processing is configured' : 'STRIPE_SECRET_KEY is not set. Payment processing is disabled.',
        secretsPresent: mask,
        lastCheckedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'crm',
    description: 'CRM integration for customer data synchronization',
    requiredSecrets: ['HUBSPOT_ACCESS_TOKEN'],
    optionalSecrets: [],
    isRequired: false,
    checkHealth() {
      const mask = buildSecretsMask([...this.requiredSecrets, ...this.optionalSecrets]);
      const configured = checkSecretPresent('HUBSPOT_ACCESS_TOKEN');
      return {
        status: configured ? 'connected' : 'not_configured',
        configured,
        message: configured ? 'HubSpot CRM integration is configured' : 'HUBSPOT_ACCESS_TOKEN is not set. CRM sync is disabled.',
        secretsPresent: mask,
        lastCheckedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'object_storage',
    name: 'Object Storage',
    category: 'storage',
    description: 'File storage for documents, photos, and recruiting files',
    requiredSecrets: ['DEFAULT_OBJECT_STORAGE_BUCKET_ID'],
    optionalSecrets: ['PUBLIC_OBJECT_SEARCH_PATHS', 'PRIVATE_OBJECT_DIR'],
    isRequired: true,
    checkHealth() {
      const mask = buildSecretsMask([...this.requiredSecrets, ...this.optionalSecrets]);
      const configured = checkSecretPresent('DEFAULT_OBJECT_STORAGE_BUCKET_ID');
      return {
        status: configured ? 'connected' : 'not_configured',
        configured,
        message: configured ? 'Object Storage is configured' : 'DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set. File storage is unavailable.',
        secretsPresent: mask,
        lastCheckedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'replit_auth',
    name: 'Replit Auth',
    category: 'auth',
    description: 'User authentication via Replit OpenID Connect',
    requiredSecrets: ['REPL_ID', 'SESSION_SECRET'],
    optionalSecrets: [],
    isRequired: true,
    checkHealth() {
      const mask = buildSecretsMask([...this.requiredSecrets, ...this.optionalSecrets]);
      const configured = this.requiredSecrets.every(k => checkSecretPresent(k));
      return {
        status: configured ? 'connected' : 'not_configured',
        configured,
        message: configured ? 'Authentication is configured' : 'REPL_ID or SESSION_SECRET is missing. Authentication will not work.',
        secretsPresent: mask,
        lastCheckedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'driverhub_api',
    name: 'DriverHub API Key',
    category: 'api_key',
    description: 'API key for DriverConnect mobile app and system-to-system authentication',
    requiredSecrets: ['DRIVERHUB_API_KEY'],
    optionalSecrets: [],
    isRequired: false,
    checkHealth() {
      const mask = buildSecretsMask([...this.requiredSecrets, ...this.optionalSecrets]);
      const configured = checkSecretPresent('DRIVERHUB_API_KEY');
      return {
        status: configured ? 'connected' : 'not_configured',
        configured,
        message: configured ? 'DriverHub API key is configured' : 'DRIVERHUB_API_KEY is not set. Mobile app and system integrations are disabled.',
        secretsPresent: mask,
        lastCheckedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'background_check',
    name: 'Background Check Provider',
    category: 'background_check',
    description: 'Background screening for recruiting candidates',
    requiredSecrets: ['BACKGROUND_CHECK_API_KEY'],
    optionalSecrets: ['BACKGROUND_CHECK_WEBHOOK_SECRET'],
    featureFlag: 'ENABLE_BACKGROUND_CHECKS',
    isRequired: false,
    checkHealth() {
      const mask = buildSecretsMask([...this.requiredSecrets, ...this.optionalSecrets]);
      const configured = checkSecretPresent('BACKGROUND_CHECK_API_KEY');
      const featureEnabled = process.env.ENABLE_BACKGROUND_CHECKS === 'true';
      if (!featureEnabled) {
        return {
          status: 'not_configured',
          configured: false,
          message: 'Background check feature is disabled (ENABLE_BACKGROUND_CHECKS is not true).',
          secretsPresent: mask,
          lastCheckedAt: new Date().toISOString(),
        };
      }
      return {
        status: configured ? 'connected' : 'not_configured',
        configured,
        message: configured ? 'Background check provider is configured' : 'BACKGROUND_CHECK_API_KEY is not set but feature is enabled.',
        secretsPresent: mask,
        lastCheckedAt: new Date().toISOString(),
      };
    },
  },
];

export function getAllProviders(): ProviderDefinition[] {
  return PROVIDER_DEFINITIONS;
}

export function getProviderById(id: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find(p => p.id === id);
}

export function getProvidersByCategory(category: ProviderCategory): ProviderDefinition[] {
  return PROVIDER_DEFINITIONS.filter(p => p.category === category);
}

export function checkAllProviderHealth(): ProviderHealthSummary[] {
  return PROVIDER_DEFINITIONS.map(provider => {
    const health = provider.checkHealth();
    return {
      providerId: provider.id,
      name: provider.name,
      category: provider.category,
      description: provider.description,
      status: health.status,
      configured: health.configured,
      message: health.message,
      isRequired: provider.isRequired,
      featureFlag: provider.featureFlag,
      secretsMask: health.secretsPresent,
      lastCheckedAt: health.lastCheckedAt,
    };
  });
}

export function checkSingleProviderHealth(id: string): ProviderHealthSummary | null {
  const provider = getProviderById(id);
  if (!provider) return null;
  const health = provider.checkHealth();
  return {
    providerId: provider.id,
    name: provider.name,
    category: provider.category,
    description: provider.description,
    status: health.status,
    configured: health.configured,
    message: health.message,
    isRequired: provider.isRequired,
    featureFlag: provider.featureFlag,
    secretsMask: health.secretsPresent,
    lastCheckedAt: health.lastCheckedAt,
  };
}

export interface StartupValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateRequiredSecretsAtStartup(): StartupValidationResult {
  const failFast = process.env.PROVIDER_FAIL_FAST === 'true';
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const provider of PROVIDER_DEFINITIONS) {
    const health = provider.checkHealth();

    if (provider.isRequired && !health.configured) {
      const msg = `[REQUIRED] ${provider.name}: ${health.message}`;
      errors.push(msg);
    } else if (!health.configured) {
      if (provider.featureFlag && process.env[provider.featureFlag] === 'true') {
        const msg = `[FEATURE ENABLED BUT MISSING] ${provider.name}: ${health.message}`;
        if (failFast) {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      } else {
        warnings.push(`[OPTIONAL] ${provider.name}: ${health.message}`);
      }
    }
  }

  return {
    valid: failFast ? errors.length === 0 : true,
    errors,
    warnings,
  };
}

export function getDocumentedSecretsList(): Array<{
  key: string;
  provider: string;
  category: ProviderCategory;
  required: boolean;
  description: string;
}> {
  const secrets: Array<{
    key: string;
    provider: string;
    category: ProviderCategory;
    required: boolean;
    description: string;
  }> = [];

  for (const provider of PROVIDER_DEFINITIONS) {
    for (const key of provider.requiredSecrets) {
      secrets.push({
        key,
        provider: provider.name,
        category: provider.category,
        required: true,
        description: `Required for ${provider.description}`,
      });
    }
    for (const key of provider.optionalSecrets) {
      secrets.push({
        key,
        provider: provider.name,
        category: provider.category,
        required: false,
        description: `Optional for ${provider.description}`,
      });
    }
  }

  return secrets;
}
