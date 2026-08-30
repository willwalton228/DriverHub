import { storage } from "./storage";

/**
 * AutoPay Service
 * Handles automated payment processing for customers with ACH autopay enabled
 */

interface AutopayResult {
  success: boolean;
  attemptId: string;
  paymentIntentId?: string;
  error?: string;
}

/**
 * Process autopay for a specific invoice
 */
export async function processInvoiceAutopay(
  invoiceId: string,
  trigger: 'on_send' | 'on_due_date' | 'manual'
): Promise<AutopayResult> {
  try {
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Check customerId exists
    if (!invoice.customerId) {
      throw new Error('Invoice has no associated customer');
    }

    // Get customer billing profile
    const billingProfile = await storage.getCustomerBillingProfile(invoice.customerId);
    if (!billingProfile || !billingProfile.autopayEnabled) {
      throw new Error('Autopay not enabled for this customer');
    }

    if (!billingProfile.autopayPaymentMethodId) {
      throw new Error('No autopay payment method configured');
    }

    // Check trigger matches - skip silently if mismatch (not an error)
    if (trigger !== 'manual' && billingProfile.autopayTrigger !== trigger) {
      console.log(`[Autopay] Skipping invoice ${invoiceId}: trigger mismatch (customer has ${billingProfile.autopayTrigger}, called with ${trigger})`);
      return {
        success: false,
        attemptId: '',
        error: 'Trigger mismatch - skipped',
      };
    }

    // Get payment method
    const paymentMethod = await storage.getCustomerPaymentMethod(billingProfile.autopayPaymentMethodId);
    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    if (!paymentMethod.isActive) {
      throw new Error('Payment method is not active');
    }

    if (!paymentMethod.isVerified) {
      throw new Error('Payment method is not verified');
    }

    // Create autopay attempt record
    const attempt = await storage.createAutopayAttempt({
      invoiceId,
      customerId: invoice.customerId,
      paymentMethodId: paymentMethod.id,
      trigger,
      amount: invoice.totalAmount,
      status: 'processing',
    });

    // Log to invoice timeline
    await storage.createInvoiceActivity({
      invoiceId,
      activityType: 'autopay_initiated',
      description: `Autopay attempt initiated via ${trigger} trigger`,
      metadata: {
        attemptId: attempt.id,
        paymentMethodId: paymentMethod.id,
        amount: invoice.totalAmount,
        last4: paymentMethod.last4,
        bankName: paymentMethod.bankName,
      },
    });

    // In production, this would call Stripe API to process payment
    // For now, we simulate the payment processing
    const paymentResult = await simulateStripePayment(
      paymentMethod.stripePaymentMethodId || paymentMethod.vaultToken,
      invoice.totalAmount,
      invoice.invoiceNumber
    );

    if (paymentResult.success) {
      // Update attempt as successful
      await storage.updateAutopayAttempt(attempt.id, {
        status: 'completed',
        stripePaymentIntentId: paymentResult.paymentIntentId,
        processedAt: new Date(),
        completedAt: new Date(),
      });

      // Log success to timeline
      await storage.createInvoiceActivity({
        invoiceId,
        activityType: 'autopay_completed',
        description: `Autopay payment of $${invoice.totalAmount} completed successfully`,
        metadata: {
          attemptId: attempt.id,
          paymentIntentId: paymentResult.paymentIntentId,
        },
      });

      // Update invoice status
      await storage.updateInvoice(invoiceId, {
        status: 'paid',
        paidAmount: invoice.totalAmount,
      });

      return {
        success: true,
        attemptId: attempt.id,
        paymentIntentId: paymentResult.paymentIntentId,
      };
    } else {
      // Update attempt as failed
      await storage.updateAutopayAttempt(attempt.id, {
        status: 'failed',
        failureCode: paymentResult.failureCode,
        failureMessage: paymentResult.failureMessage,
        processedAt: new Date(),
      });

      // Log failure to timeline
      await storage.createInvoiceActivity({
        invoiceId,
        activityType: 'autopay_failed',
        description: `Autopay payment failed: ${paymentResult.failureMessage}`,
        metadata: {
          attemptId: attempt.id,
          failureCode: paymentResult.failureCode,
          failureMessage: paymentResult.failureMessage,
        },
      });

      // Check if we should disable autopay after 3 consecutive failures per customer
      // Get all recent autopay attempts for this customer (across all invoices)
      const consecutiveFailures = await getConsecutiveFailureCount(invoice.customerId);
      
      if (consecutiveFailures >= 3) {
        // Disable autopay after 3 consecutive failures
        await storage.disableCustomerAutopay(
          invoice.customerId,
          'system',
          'Disabled after 3 consecutive payment failures'
        );

        await storage.createInvoiceActivity({
          invoiceId,
          activityType: 'autopay_disabled',
          description: 'Autopay disabled after 3 consecutive payment failures',
          metadata: { consecutiveFailures },
        });
      }

      return {
        success: false,
        attemptId: attempt.id,
        error: paymentResult.failureMessage,
      };
    }
  } catch (error: any) {
    console.error(`Autopay processing error for invoice ${invoiceId}:`, error);
    return {
      success: false,
      attemptId: '',
      error: error.message,
    };
  }
}

/**
 * Process all eligible invoices for a given trigger
 */
export async function processBatchAutopay(
  trigger: 'on_send' | 'on_due_date'
): Promise<{ processed: number; successful: number; failed: number }> {
  const eligibleInvoices = await storage.getAutopayEligibleInvoices(trigger);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const item of eligibleInvoices) {
    const result = await processInvoiceAutopay(item.invoice.id, trigger);
    processed++;
    
    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  console.log(`[Autopay] Batch processing complete: ${processed} processed, ${successful} successful, ${failed} failed`);
  
  return { processed, successful, failed };
}

/**
 * Get count of consecutive failed autopay attempts for a customer
 * Checks all autopay attempts across all invoices, ordered by creation date
 */
async function getConsecutiveFailureCount(customerId: string): Promise<number> {
  try {
    // Get all autopay attempts for this customer, ordered by most recent first
    const allAttempts = await storage.getAutopayAttemptsByCustomer(customerId);
    
    let consecutiveFailures = 0;
    for (const attempt of allAttempts) {
      if (attempt.status === 'failed') {
        consecutiveFailures++;
      } else if (attempt.status === 'completed') {
        // A successful payment breaks the streak
        break;
      }
      // Skip 'processing' attempts as they are still in progress
    }
    
    return consecutiveFailures;
  } catch (error) {
    console.error(`Error getting consecutive failure count for customer ${customerId}:`, error);
    return 0;
  }
}

/**
 * Simulate Stripe payment processing
 * In production, this would use the Stripe API
 */
async function simulateStripePayment(
  paymentMethodToken: string | undefined,
  amount: number | string,
  invoiceNumber: string
): Promise<{
  success: boolean;
  paymentIntentId?: string;
  failureCode?: string;
  failureMessage?: string;
}> {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 100));

  // For simulation, randomly succeed or fail (90% success rate)
  // In production, this would call Stripe API
  const shouldSucceed = Math.random() > 0.1;

  if (shouldSucceed) {
    return {
      success: true,
      paymentIntentId: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  } else {
    const failureCodes = [
      { code: 'insufficient_funds', message: 'The bank account has insufficient funds' },
      { code: 'account_closed', message: 'The bank account has been closed' },
      { code: 'invalid_account', message: 'The bank account is invalid' },
      { code: 'bank_error', message: 'A temporary bank error occurred' },
    ];
    const failure = failureCodes[Math.floor(Math.random() * failureCodes.length)];
    return {
      success: false,
      failureCode: failure.code,
      failureMessage: failure.message,
    };
  }
}

export default {
  processInvoiceAutopay,
  processBatchAutopay,
};
