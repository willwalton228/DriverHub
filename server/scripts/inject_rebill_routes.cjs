
const fs = require('fs');
const routesPath = '/home/runner/workspace/server/routes.ts';
let content = fs.readFileSync(routesPath, 'utf8');

// 1. Add rebillableChargeAudit to schema imports
content = content.replace(
  ', apInboxMessages, payables, payableDocuments, payableAuditLog, vendorDefaultCoding, payableDuplicateChecks } from "@shared/schema";',
  ', apInboxMessages, payables, payableDocuments, payableAuditLog, vendorDefaultCoding, payableDuplicateChecks, rebillableChargeAudit } from "@shared/schema";'
);

const REBILL_ROUTES = `
  // ─────────────────────────────────────────────────────────────────────────────
  // REBILLABLE CHARGES — ACTION ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  app.post('/api/payables/:id/approve-for-billing', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const { notes } = req.body;
      const existing = await db.select().from(payables).where(eq(payables.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });
      if (!existing[0].customerId && !existing[0].accountId) {
        return res.status(400).json({ error: 'Charge must be linked to a customer or account before approving for billing.' });
      }
      const [row] = await db.update(payables).set({
        rebillStatus: 'approved_for_billing',
        rebillApprovedBy: userId,
        rebillApprovedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(payables.id, req.params.id)).returning();
      await db.insert(rebillableChargeAudit).values({ payableId: req.params.id, actionType: 'approved_for_billing', actionBy: userId, notes: notes || 'Approved for billing' });
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'rebill_approved_for_billing', actionBy: userId, notes: notes || 'Approved for billing' });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/payables/:id/queue-for-invoice', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const { notes } = req.body;
      const existing = await db.select().from(payables).where(eq(payables.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });
      if (existing[0].rebillStatus !== 'approved_for_billing') {
        return res.status(400).json({ error: 'Charge must be approved for billing before queuing for invoice.' });
      }
      const [row] = await db.update(payables).set({
        rebillStatus: 'queued_for_invoice',
        updatedAt: new Date(),
      }).where(eq(payables.id, req.params.id)).returning();
      await db.insert(rebillableChargeAudit).values({ payableId: req.params.id, actionType: 'queued_for_invoice', actionBy: userId, notes: notes || 'Queued for next invoice' });
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'rebill_queued_for_invoice', actionBy: userId, notes: notes || 'Queued for next invoice' });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/payables/:id/dispute', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const { reason } = req.body;
      const [row] = await db.update(payables).set({
        rebillStatus: 'disputed',
        updatedAt: new Date(),
      }).where(eq(payables.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: 'Not found' });
      await db.insert(rebillableChargeAudit).values({ payableId: req.params.id, actionType: 'disputed', actionBy: userId, notes: reason || 'Marked as disputed' });
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'rebill_disputed', actionBy: userId, notes: reason || 'Marked as disputed' });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/payables/:id/write-off', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const { reason } = req.body;
      const [row] = await db.update(payables).set({
        rebillStatus: 'written_off',
        updatedAt: new Date(),
      }).where(eq(payables.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: 'Not found' });
      await db.insert(rebillableChargeAudit).values({ payableId: req.params.id, actionType: 'written_off', actionBy: userId, notes: reason || 'Written off' });
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'rebill_written_off', actionBy: userId, notes: reason || 'Written off' });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Rebillable Charges Queue
  app.get('/api/rebillable-charges', requireAuth, async (req: any, res) => {
    try {
      const { customerId, status, vendorId, relatedRecordType, search } = req.query as any;
      const aliasRebillCustomer = aliasedTable(customers, 'rebill_customer');
      const aliasRebillVendor = aliasedTable(vendors, 'rebill_vendor');
      const aliasRebillInvoice = aliasedTable(invoices, 'rebill_linked_invoice');
      let rows = await db.select({
        p: payables,
        vendor: { id: aliasRebillVendor.id, name: aliasRebillVendor.name },
        customer: { id: aliasRebillCustomer.id, name: aliasRebillCustomer.customerName },
        linkedInvoice: { id: aliasRebillInvoice.id, invoiceNumber: aliasRebillInvoice.invoiceNumber },
      }).from(payables)
        .leftJoin(aliasRebillVendor, eq(payables.vendorId, aliasRebillVendor.id))
        .leftJoin(aliasRebillCustomer, eq(payables.customerId, aliasRebillCustomer.id))
        .leftJoin(aliasRebillInvoice, eq(payables.linkedCustomerInvoiceId, aliasRebillInvoice.id))
        .where(eq(payables.isRebillable, true))
        .orderBy(desc(payables.createdAt));
      if (customerId) rows = rows.filter((r: any) => r.p.customerId === customerId);
      if (vendorId) rows = rows.filter((r: any) => r.p.vendorId === vendorId);
      if (status) rows = rows.filter((r: any) => r.p.rebillStatus === status);
      if (relatedRecordType) rows = rows.filter((r: any) => r.p.relatedRecordType === relatedRecordType);
      if (search) {
        const q = (search as string).toLowerCase();
        rows = rows.filter((r: any) =>
          r.p.invoiceNumber?.toLowerCase().includes(q) ||
          r.vendor?.name?.toLowerCase().includes(q) ||
          r.customer?.name?.toLowerCase().includes(q) ||
          r.p.billingDescription?.toLowerCase().includes(q)
        );
      }
      res.json(rows.map((r: any) => ({
        ...r.p,
        vendorName: r.vendor?.name,
        customerName: r.customer?.name,
        linkedInvoiceNumber: r.linkedInvoice?.invoiceNumber,
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Rebillable Charge Audit Log
  app.get('/api/payables/:id/rebill-audit', requireAuth, async (req: any, res) => {
    try {
      const aliasRebillAuditUser = aliasedTable(users, 'rebill_audit_user');
      const rows = await db.select({
        log: rebillableChargeAudit,
        user: { firstName: aliasRebillAuditUser.firstName, lastName: aliasRebillAuditUser.lastName, email: aliasRebillAuditUser.email },
      }).from(rebillableChargeAudit)
        .leftJoin(aliasRebillAuditUser, eq(rebillableChargeAudit.actionBy, aliasRebillAuditUser.id))
        .where(eq(rebillableChargeAudit.payableId, req.params.id))
        .orderBy(desc(rebillableChargeAudit.actionAt));
      res.json(rows.map((r: any) => ({ ...r.log, actionByName: r.user ? ((r.user.firstName || '') + ' ' + (r.user.lastName || '')).trim() || r.user.email : 'System' })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Rebillable stats
  app.get('/api/rebillable-stats', requireAuth, async (req: any, res) => {
    try {
      const all = await db.select().from(payables).where(eq(payables.isRebillable, true));
      const unbilled = all.filter((p: any) => !['billed', 'written_off'].includes(p.rebillStatus || ''));
      const totalUnbilledAmount = unbilled.reduce((sum: number, p: any) => sum + parseFloat(String(p.rebillAmount || p.totalAmount || 0)), 0);
      res.json({
        totalRebillable: all.length,
        pendingReview: all.filter((p: any) => p.rebillStatus === 'pending_review').length,
        approvedForBilling: all.filter((p: any) => p.rebillStatus === 'approved_for_billing').length,
        queuedForInvoice: all.filter((p: any) => p.rebillStatus === 'queued_for_invoice').length,
        billed: all.filter((p: any) => p.rebillStatus === 'billed').length,
        disputed: all.filter((p: any) => p.rebillStatus === 'disputed').length,
        writtenOff: all.filter((p: any) => p.rebillStatus === 'written_off').length,
        totalUnbilledAmount: totalUnbilledAmount.toFixed(2),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Add queued rebillable charges to a customer invoice
  app.post('/api/invoices/:invoiceId/add-rebillable-charges', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const ctx = await getRequestContext(req);
      const { payableIds } = req.body as { payableIds: string[] };
      if (!payableIds?.length) return res.status(400).json({ error: 'payableIds required' });

      // Verify invoice exists
      const invRows = await db.select().from(invoices).where(eq(invoices.id, req.params.invoiceId));
      if (!invRows.length) return res.status(404).json({ error: 'Invoice not found' });

      const results = [];
      for (const payableId of payableIds) {
        const pRows = await db.select().from(payables).where(eq(payables.id, payableId));
        if (!pRows.length) continue;
        const p = pRows[0];

        // Prevent duplicate billing
        if (p.rebillStatus === 'billed' && p.linkedCustomerInvoiceId) {
          results.push({ payableId, status: 'skipped', reason: 'Already billed' });
          continue;
        }
        if (['disputed', 'written_off'].includes(p.rebillStatus || '')) {
          results.push({ payableId, status: 'skipped', reason: 'Cannot bill disputed or written-off charges' });
          continue;
        }

        // Calculate billed amount with markup
        let billedAmount = parseFloat(String(p.rebillAmount || p.totalAmount || 0));
        if (p.markupType === 'flat' && p.markupValue) {
          billedAmount += parseFloat(String(p.markupValue));
        } else if (p.markupType === 'percent' && p.markupValue) {
          billedAmount *= (1 + parseFloat(String(p.markupValue)) / 100);
        }

        // Add as invoice line
        const description = p.billingDescription ||
          ('Pass-through: ' + (p.invoiceNumber ? 'Inv #' + p.invoiceNumber : 'Vendor Charge'));
        const [line] = await db.insert(invoiceLines).values({
          invoiceId: req.params.invoiceId,
          tenantId: ctx.tenantId,
          description,
          quantity: '1',
          unitPrice: String(billedAmount.toFixed(2)),
          subtotal: String(billedAmount.toFixed(2)),
          totalAmount: String(billedAmount.toFixed(2)),
          lineType: 'pass_through',
          sourcePayableId: payableId,
          sourceVendorId: p.vendorId || null,
          createdBy: userId,
          updatedBy: userId,
        }).returning();

        // Update payable status
        await db.update(payables).set({
          rebillStatus: 'billed',
          linkedCustomerInvoiceId: req.params.invoiceId,
          updatedAt: new Date(),
        }).where(eq(payables.id, payableId));

        await db.insert(rebillableChargeAudit).values({ payableId, actionType: 'billed', actionBy: userId, notes: 'Added to invoice ' + invRows[0].invoiceNumber });
        await db.insert(payableAuditLog).values({ payableId, actionType: 'rebill_billed', actionBy: userId, notes: 'Added to invoice ' + invRows[0].invoiceNumber });

        results.push({ payableId, status: 'added', lineId: line.id, amount: billedAmount.toFixed(2) });
      }

      res.json({ results, addedCount: results.filter((r: any) => r.status === 'added').length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Get queued rebillable charges for a specific customer (for invoice generation)
  app.get('/api/customers/:customerId/rebillable-charges', requireAuth, async (req: any, res) => {
    try {
      const { status } = req.query as any;
      const conditions: any[] = [eq(payables.customerId, req.params.customerId), eq(payables.isRebillable, true)];
      if (status) conditions.push(eq(payables.rebillStatus, status as string));
      else conditions.push(eq(payables.rebillStatus, 'queued_for_invoice'));
      const aliasRebillCustVendor = aliasedTable(vendors, 'rebill_cust_vendor');
      const rows = await db.select({
        p: payables,
        vendor: { id: aliasRebillCustVendor.id, name: aliasRebillCustVendor.name },
      }).from(payables)
        .leftJoin(aliasRebillCustVendor, eq(payables.vendorId, aliasRebillCustVendor.id))
        .where(and(...conditions))
        .orderBy(desc(payables.createdAt));
      res.json(rows.map((r: any) => ({ ...r.p, vendorName: r.vendor?.name })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
`;

// Find the closing brace of the registerRoutes function
const registerClose = content.lastIndexOf('\n}');
if (registerClose > 0) {
  content = content.slice(0, registerClose) + '\n' + REBILL_ROUTES + '\n' + content.slice(registerClose);
}

fs.writeFileSync(routesPath, content, 'utf8');
console.log('Rebill routes injected, new length:', content.length);
