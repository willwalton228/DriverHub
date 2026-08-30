import { db } from "./db";
import { invoices, reminderSchedules, customers, customerBillingProfiles, invoiceActivities } from "@shared/schema";
import { eq, and, lte, gte, sql, inArray, isNull } from "drizzle-orm";
import { sendInvoiceReminderEmail, InvoiceReminderEmailData } from "./emailService";
import { storage } from "./storage";

interface ReminderProcessingResult {
  processed: number;
  remindersSent: number;
  errors: number;
  details: Array<{
    invoiceId: string;
    invoiceNumber: string;
    reminderType: string;
    success: boolean;
    error?: string;
  }>;
}

export async function processInvoiceReminders(): Promise<ReminderProcessingResult> {
  const result: ReminderProcessingResult = {
    processed: 0,
    remindersSent: 0,
    errors: 0,
    details: [],
  };

  try {
    const activeSchedules = await db.select()
      .from(reminderSchedules)
      .where(eq(reminderSchedules.isActive, true))
      .orderBy(reminderSchedules.dayOffset);

    if (activeSchedules.length === 0) {
      console.log("[InvoiceReminder] No active reminder schedules found");
      return result;
    }

    const unpaidInvoices = await db.select({
      invoice: invoices,
      customer: customers,
    })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(
      inArray(invoices.status, ['sent', 'overdue', 'partially_paid']),
      eq(invoices.isDisputed, false),
      isNull(invoices.voidedAt),
    ));

    console.log(`[InvoiceReminder] Processing ${unpaidInvoices.length} unpaid invoices against ${activeSchedules.length} schedules`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const { invoice, customer } of unpaidInvoices) {
      result.processed++;

      if (!invoice.dueDate) {
        continue;
      }

      if (invoice.customerId) {
        const [profile] = await db.select()
          .from(customerBillingProfiles)
          .where(eq(customerBillingProfiles.customerId, invoice.customerId));
        
        if (profile?.reminderOptOut) {
          console.log(`[InvoiceReminder] Skipping ${invoice.invoiceNumber} - customer opted out of reminders`);
          continue;
        }
      }

      const dueDate = new Date(invoice.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      for (const schedule of activeSchedules) {
        const shouldSend = checkIfReminderShouldSend(daysDiff, schedule.dayOffset);
        
        if (!shouldSend) {
          continue;
        }

        const alreadySent = await checkIfReminderAlreadySent(invoice.id, schedule.id, schedule.dayOffset, today);
        if (alreadySent) {
          continue;
        }

        const customerEmail = customer?.billingContactEmail || customer?.primaryContactEmail;
        if (!customerEmail) {
          console.log(`[InvoiceReminder] Skipping ${invoice.invoiceNumber} - no email address`);
          continue;
        }

        const reminderType: 'pre_due' | 'on_due' | 'overdue' = 
          schedule.dayOffset > 0 ? 'pre_due' : 
          schedule.dayOffset === 0 ? 'on_due' : 'overdue';

        const emailData: InvoiceReminderEmailData = {
          to: customerEmail,
          customerName: customer?.customerName || invoice.customerName || 'Customer',
          invoiceNumber: invoice.invoiceNumber,
          dueDate: new Date(invoice.dueDate).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          }),
          totalAmount: invoice.totalAmount?.toString() || '0',
          balanceDue: invoice.balanceDue?.toString() || invoice.totalAmount?.toString() || '0',
          paymentLink: `${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.app` : 'http://localhost:5000'}/pay/${invoice.id}`,
          reminderType,
          daysUntilDue: daysDiff,
        };

        try {
          const sendResult = await sendInvoiceReminderEmail(emailData);
          
          if (sendResult.success) {
            await storage.createInvoiceActivity({
              invoiceId: invoice.id,
              activityType: 'reminder_sent',
              description: `Payment reminder sent (${schedule.name})`,
              metadata: {
                scheduleId: schedule.id,
                scheduleName: schedule.name,
                dayOffset: schedule.dayOffset,
                sentTo: customerEmail,
                reminderType,
              },
            });

            result.remindersSent++;
            result.details.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              reminderType: schedule.name,
              success: true,
            });
          } else {
            result.errors++;
            result.details.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              reminderType: schedule.name,
              success: false,
              error: sendResult.error,
            });
          }
        } catch (error: any) {
          result.errors++;
          result.details.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            reminderType: schedule.name,
            success: false,
            error: error.message,
          });
        }
      }
    }

    return result;
  } catch (error: any) {
    console.error("[InvoiceReminder] Error processing reminders:", error);
    result.errors++;
    return result;
  }
}

function checkIfReminderShouldSend(daysDiff: number, scheduleOffset: number): boolean {
  if (scheduleOffset > 0) {
    return daysDiff === scheduleOffset;
  }
  
  if (scheduleOffset === 0) {
    return daysDiff === 0;
  }
  
  return daysDiff === scheduleOffset;
}

async function checkIfReminderAlreadySent(invoiceId: string, scheduleId: string, dayOffset: number, today: Date): Promise<boolean> {
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const [existingActivity] = await db.select()
    .from(invoiceActivities)
    .where(and(
      eq(invoiceActivities.invoiceId, invoiceId),
      eq(invoiceActivities.activityType, 'reminder_sent'),
      gte(invoiceActivities.createdAt, startOfDay),
      lte(invoiceActivities.createdAt, endOfDay),
      sql`${invoiceActivities.metadata}->>'scheduleId' = ${scheduleId}`,
      sql`(${invoiceActivities.metadata}->>'dayOffset')::int = ${dayOffset}`
    ))
    .limit(1);

  return !!existingActivity;
}

export async function sendManualReminder(invoiceId: string, userId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const [invoiceData] = await db.select({
      invoice: invoices,
      customer: customers,
    })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);

    if (!invoiceData) {
      return { success: false, error: "Invoice not found" };
    }

    const { invoice, customer } = invoiceData;
    const customerEmail = customer?.billingContactEmail || customer?.primaryContactEmail;

    if (!customerEmail) {
      return { success: false, error: "No email address available" };
    }

    if (!invoice.dueDate) {
      return { success: false, error: "Invoice has no due date" };
    }

    const today = new Date();
    const dueDate = new Date(invoice.dueDate);
    const daysDiff = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const reminderType: 'pre_due' | 'on_due' | 'overdue' = 
      daysDiff > 0 ? 'pre_due' : 
      daysDiff === 0 ? 'on_due' : 'overdue';

    const emailData: InvoiceReminderEmailData = {
      to: customerEmail,
      customerName: customer?.customerName || invoice.customerName || 'Customer',
      invoiceNumber: invoice.invoiceNumber,
      dueDate: dueDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      totalAmount: invoice.totalAmount?.toString() || '0',
      balanceDue: invoice.balanceDue?.toString() || invoice.totalAmount?.toString() || '0',
      paymentLink: `${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.app` : 'http://localhost:5000'}/pay/${invoice.id}`,
      reminderType,
      daysUntilDue: daysDiff,
    };

    const sendResult = await sendInvoiceReminderEmail(emailData);

    if (sendResult.success) {
      await storage.createInvoiceActivity({
        invoiceId: invoice.id,
        activityType: 'reminder_sent',
        description: 'Manual payment reminder sent',
        metadata: {
          manual: true,
          sentTo: customerEmail,
          reminderType,
          sentBy: userId,
        },
        performedBy: userId,
      });
    }

    return sendResult;
  } catch (error: any) {
    console.error("[InvoiceReminder] Error sending manual reminder:", error);
    return { success: false, error: error.message };
  }
}
