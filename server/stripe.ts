import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (!stripeSecretKey) {
    console.warn('STRIPE_SECRET_KEY not configured - Stripe payments disabled');
    return null;
  }
  
  if (!stripeClient) {
    stripeClient = new Stripe(stripeSecretKey);
  }
  
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!stripeSecretKey;
}

export interface CreatePaymentIntentParams {
  amount: number;
  currency?: string;
  customerId?: string;
  invoiceId?: string;
  description?: string;
  metadata?: Record<string, string>;
  allowedPaymentMethodTypes?: string[];
}

export interface CreatePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<CreatePaymentIntentResult> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  if (!params.amount || params.amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  const metadata: Record<string, string> = {};
  
  if (params.metadata) {
    Object.assign(metadata, params.metadata);
  }
  
  if (params.invoiceId) {
    metadata.invoiceId = params.invoiceId;
  }

  if (params.customerId) {
    metadata.customerId = params.customerId;
  }

  const amountInCents = Math.round(params.amount * 100);
  
  const intentConfig: any = {
    amount: amountInCents,
    currency: params.currency || 'usd',
    description: params.description,
    metadata,
  };

  if (params.allowedPaymentMethodTypes && params.allowedPaymentMethodTypes.length > 0) {
    intentConfig.payment_method_types = params.allowedPaymentMethodTypes;
  } else {
    intentConfig.automatic_payment_methods = { enabled: true };
  }

  const paymentIntent = await stripe.paymentIntents.create(intentConfig);

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

export interface CreateSetupIntentParams {
  customerId?: string;
  metadata?: Record<string, string>;
}

export interface CreateSetupIntentResult {
  clientSecret: string;
  setupIntentId: string;
}

export async function createSetupIntent(
  params: CreateSetupIntentParams
): Promise<CreateSetupIntentResult> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const setupIntent = await stripe.setupIntents.create({
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: params.metadata,
  });

  return {
    clientSecret: setupIntent.client_secret!,
    setupIntentId: setupIntent.id,
  };
}

export async function getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function confirmPaymentIntent(
  paymentIntentId: string,
  paymentMethodId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId,
  });
}

export async function cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return await stripe.paymentIntents.cancel(paymentIntentId);
}

export async function refundPayment(
  paymentIntentId: string,
  amount?: number,
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<Stripe.Refund> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
  };

  if (amount) {
    refundParams.amount = Math.round(amount * 100);
  }
  
  if (reason) {
    refundParams.reason = reason;
  }

  return await stripe.refunds.create(refundParams);
}

export interface WebhookEvent {
  type: string;
  data: {
    object: any;
  };
}

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): WebhookEvent {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret) as WebhookEvent;
}

export function getStripePublishableKey(): string | undefined {
  return process.env.STRIPE_PUBLISHABLE_KEY;
}
