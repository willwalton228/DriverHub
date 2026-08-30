/**
 * DriverConnect Integration API v1 — Financial Visibility Endpoints
 * GET /api/v1/financial/invoices
 * GET /api/v1/financial/invoices/:id
 * GET /api/v1/financial/payments
 * GET /api/v1/financial/payments/:id
 */
import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { invoices, payments, customers } from '@shared/schema';
import { eq, and, sql, desc, gte, lte, ilike, or } from 'drizzle-orm';
import { requireScope } from '../../middleware/v1ApiKeyAuth';

const router = Router();

function parsePagination(query: Record<string, any>) {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit as string) || 50));
  return { limit, offset: (page - 1) * limit, page };
}
function paginatedResponse(data: any[], total: number, page: number, limit: number) {
  return { success: true, data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

// ─── GET /api/v1/financial/invoices ───────────────────────────────────────
router.get('/financial/invoices', requireScope('read:invoices'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { status, customer_id, from_date, to_date, search } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (status) conditions.push(eq(invoices.status, status));
    if (customer_id) conditions.push(eq(invoices.customerId, customer_id));
    if (from_date) conditions.push(sql`${invoices.invoiceDate} >= ${from_date}::date`);
    if (to_date) conditions.push(sql`${invoices.invoiceDate} <= ${to_date}::date`);
    if (search) {
      conditions.push(
        or(
          ilike(invoices.invoiceNumber, `%${search}%`),
          ilike(invoices.customerName, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countRes] = await Promise.all([
      db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        customerName: invoices.customerName,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        paidAmount: invoices.paidAmount,
        balanceDue: invoices.balanceDue,
        currency: invoices.currency,
        status: invoices.status,
        paymentTerms: invoices.paymentTerms,
        poNumber: invoices.poNumber,
        sentAt: invoices.sentAt,
        createdAt: invoices.createdAt,
      }).from(invoices).where(whereClause).orderBy(desc(invoices.invoiceDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(invoices).where(whereClause),
    ]);

    res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /financial/invoices error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch invoices.' });
  }
});

// ─── GET /api/v1/financial/invoices/:id ───────────────────────────────────
router.get('/financial/invoices/:id', requireScope('read:invoices'), async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(invoices).where(eq(invoices.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found.' });
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch invoice.' });
  }
});

// ─── GET /api/v1/financial/payments ───────────────────────────────────────
router.get('/financial/payments', requireScope('read:payments'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { status, customer_id, from_date, to_date, payment_method } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (status) conditions.push(eq(payments.status, status));
    if (customer_id) conditions.push(eq(payments.customerId, customer_id));
    if (payment_method) conditions.push(eq(payments.paymentMethod, payment_method));
    if (from_date) conditions.push(sql`${payments.paymentDate} >= ${from_date}::date`);
    if (to_date) conditions.push(sql`${payments.paymentDate} <= ${to_date}::date`);

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countRes] = await Promise.all([
      db.select({
        id: payments.id,
        paymentNumber: payments.paymentNumber,
        customerId: payments.customerId,
        paymentDate: payments.paymentDate,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        status: payments.status,
        netAmount: payments.netAmount,
        appliedAmount: payments.appliedAmount,
        unappliedAmount: payments.unappliedAmount,
        referenceNumber: payments.referenceNumber,
        stripePaymentIntentId: payments.stripePaymentIntentId,
        createdAt: payments.createdAt,
      }).from(payments).where(whereClause).orderBy(desc(payments.paymentDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(payments).where(whereClause),
    ]);

    res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /financial/payments error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch payments.' });
  }
});

// ─── GET /api/v1/financial/payments/:id ───────────────────────────────────
router.get('/financial/payments/:id', requireScope('read:payments'), async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(payments).where(eq(payments.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payment not found.' });
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch payment.' });
  }
});

export default router;
