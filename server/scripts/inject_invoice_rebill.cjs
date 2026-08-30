
const fs = require('fs');
const routesPath = '/home/runner/workspace/server/routes.ts';
let content = fs.readFileSync(routesPath, 'utf8');

// Inject after the corporate invoicing delete line-item endpoint
const ANCHOR = `  app.delete("/api/corporate/invoicing/line-items/:id", isAuthenticated, async (req: any, res: Response) => {`;

const AFTER_DELETE_ENDPOINT = `
  // Add queued AP rebillable charges to a draft invoice
  app.post("/api/corporate/invoicing/invoices/:invoiceId/add-rebillable-charges", isAuthenticated, async (req: any, res: Response) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!hasCorporateAccess(user?.role)) {
        return res.status(403).json({ message: "Forbidden: Corporate access only" });
      }
      const { payableIds } = req.body as { payableIds: string[] };
      if (!payableIds?.length) return res.status(400).json({ message: "payableIds required" });

      const invoice = await storage.getInvoice(req.params.invoiceId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      if (invoice.status !== 'draft') return res.status(400).json({ message: "Only draft invoices can accept pass-through charges" });

      const results: any[] = [];
      for (const payableId of payableIds) {
        const [p] = await db.select().from(payables).where(eq(payables.id, payableId));
        if (!p) { results.push({ payableId, status: 'not_found' }); continue; }
        if (p.rebillStatus === 'billed') { results.push({ payableId, status: 'skipped', reason: 'Already billed' }); continue; }
        if (['disputed', 'written_off'].includes(p.rebillStatus || '')) { results.push({ payableId, status: 'skipped', reason: 'Cannot bill disputed or written-off charge' }); continue; }

        let billedAmount = parseFloat(String(p.rebillAmount || p.totalAmount || 0));
        if (p.markupType === 'flat' && p.markupValue) billedAmount += parseFloat(String(p.markupValue));
        else if (p.markupType === 'percent' && p.markupValue) billedAmount *= (1 + parseFloat(String(p.markupValue)) / 100);

        const desc = p.billingDescription || ('Pass-Through: ' + (p.invoiceNumber ? 'Vendor Inv #' + p.invoiceNumber : 'Vendor Charge'));
        const lineItem = await storage.createInvoiceLineItem({
          invoiceId: req.params.invoiceId,
          lineItemType: 'pass_through',
          category: 'fee',
          serviceType: 'expense_passthrough',
          description: desc,
          quantity: '1',
          unitPrice: String(billedAmount.toFixed(2)),
          totalPrice: String(billedAmount.toFixed(2)),
          sourceType: 'ap_payable',
          sourceId: payableId,
        });

        await db.update(payables).set({
          rebillStatus: 'billed',
          linkedCustomerInvoiceId: req.params.invoiceId,
          updatedAt: new Date(),
        }).where(eq(payables.id, payableId));

        await db.insert(rebillableChargeAudit).values({ payableId, actionType: 'billed', actionBy: (req.user as any)?.id, notes: 'Added to invoice ' + invoice.invoiceNumber });
        await db.insert(payableAuditLog).values({ payableId, actionType: 'rebill_billed', actionBy: (req.user as any)?.id, notes: 'Added to invoice ' + invoice.invoiceNumber });

        results.push({ payableId, status: 'added', lineItemId: lineItem.id, amount: billedAmount.toFixed(2) });
      }

      // Recalculate invoice total
      const allLineItems = await storage.getInvoiceLineItems(req.params.invoiceId);
      const newTotal = allLineItems.reduce((sum: number, item: any) => sum + parseFloat(item.totalPrice || '0'), 0);
      await storage.updateInvoice(req.params.invoiceId, {
        subtotalAmount: newTotal.toFixed(2),
        totalAmount: newTotal.toFixed(2),
        balanceDue: newTotal.toFixed(2),
      });

      res.json({ results, addedCount: results.filter((r: any) => r.status === 'added').length, invoiceTotal: newTotal.toFixed(2) });
    } catch (error: any) {
      console.error("Error adding rebillable charges to invoice:", error);
      res.status(500).json({ message: "Failed to add rebillable charges", error: error.message });
    }
  });

`;

const idx = content.indexOf(ANCHOR);
if (idx < 0) {
  console.error('ANCHOR NOT FOUND');
  process.exit(1);
}
content = content.slice(0, idx) + AFTER_DELETE_ENDPOINT + content.slice(idx);
fs.writeFileSync(routesPath, content, 'utf8');
console.log('Invoice rebill endpoint injected, new length:', content.length);
