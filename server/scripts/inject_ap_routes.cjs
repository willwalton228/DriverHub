
const fs = require('fs');
const path = '/home/runner/workspace/server/routes.ts';
let content = fs.readFileSync(path, 'utf8');

const AP_ROUTES = `
  // ─────────────────────────────────────────────────────────────────────────────
  // AP PAYABLES MODULE
  // ─────────────────────────────────────────────────────────────────────────────

  // AP Inbox Messages
  app.get('/api/ap-inbox', requireAuth, async (req: any, res) => {
    try {
      const { status, vendorId, search } = req.query as any;
      let rows = await db.select({
        msg: apInboxMessages,
        vendor: { id: vendors.id, name: vendors.name },
      }).from(apInboxMessages)
        .leftJoin(vendors, eq(apInboxMessages.relatedVendorId, vendors.id))
        .orderBy(desc(apInboxMessages.receivedAt));
      if (status) rows = rows.filter((r: any) => r.msg.processedStatus === status);
      if (vendorId) rows = rows.filter((r: any) => r.msg.relatedVendorId === vendorId);
      if (search) {
        const q = (search as string).toLowerCase();
        rows = rows.filter((r: any) => r.msg.fromEmail?.toLowerCase().includes(q) || r.msg.subject?.toLowerCase().includes(q));
      }
      res.json(rows.map((r: any) => ({ ...r.msg, vendorName: r.vendor?.name })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/ap-inbox/:id', requireAuth, async (req: any, res) => {
    try {
      const rows = await db.select({
        msg: apInboxMessages,
        vendor: { id: vendors.id, name: vendors.name },
      }).from(apInboxMessages)
        .leftJoin(vendors, eq(apInboxMessages.relatedVendorId, vendors.id))
        .where(eq(apInboxMessages.id, req.params.id));
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ ...rows[0].msg, vendorName: rows[0].vendor?.name });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/ap-inbox', requireAuth, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.receivedAt) body.receivedAt = new Date(body.receivedAt);
      const [row] = await db.insert(apInboxMessages).values(body).returning();
      res.status(201).json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/ap-inbox/:id', requireAuth, async (req: any, res) => {
    try {
      const [row] = await db.update(apInboxMessages).set(req.body).where(eq(apInboxMessages.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/ap-inbox/:id', requireAuth, async (req: any, res) => {
    try {
      await db.delete(apInboxMessages).where(eq(apInboxMessages.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Payables
  app.get('/api/payables', requireAuth, async (req: any, res) => {
    try {
      const { status, vendorId, approvalStatus, duplicateStatus, qbSyncStatus, isRebillable, search } = req.query as any;
      const aliasApprover = aliasedTable(users, 'payable_approver');
      let rows = await db.select({
        p: payables,
        vendor: { id: vendors.id, name: vendors.name },
        customer: { id: customers.id, name: customers.customerName },
        approver: { id: aliasApprover.id, firstName: aliasApprover.firstName, lastName: aliasApprover.lastName, email: aliasApprover.email },
      }).from(payables)
        .leftJoin(vendors, eq(payables.vendorId, vendors.id))
        .leftJoin(customers, eq(payables.customerId, customers.id))
        .leftJoin(aliasApprover, eq(payables.approvedBy, aliasApprover.id))
        .orderBy(desc(payables.createdAt));
      if (status) rows = rows.filter((r: any) => r.p.status === status);
      if (vendorId) rows = rows.filter((r: any) => r.p.vendorId === vendorId);
      if (approvalStatus) rows = rows.filter((r: any) => r.p.approvalStatus === approvalStatus);
      if (duplicateStatus) rows = rows.filter((r: any) => r.p.duplicateStatus === duplicateStatus);
      if (qbSyncStatus) rows = rows.filter((r: any) => r.p.qbSyncStatus === qbSyncStatus);
      if (isRebillable !== undefined) rows = rows.filter((r: any) => String(r.p.isRebillable) === isRebillable);
      if (search) {
        const q = (search as string).toLowerCase();
        rows = rows.filter((r: any) =>
          r.p.invoiceNumber?.toLowerCase().includes(q) ||
          r.vendor?.name?.toLowerCase().includes(q) ||
          r.p.extractedVendorName?.toLowerCase().includes(q)
        );
      }
      res.json(rows.map((r: any) => ({
        ...r.p,
        vendorName: r.vendor?.name,
        customerName: r.customer?.name,
        approverName: r.approver ? (r.approver.firstName || '' + ' ' + (r.approver.lastName || '')).trim() || r.approver.email : null,
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/payables', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const body = { ...req.body };
      delete body.createdAt; delete body.updatedAt;
      const [row] = await db.insert(payables).values(body).returning();
      await db.insert(payableAuditLog).values({ payableId: row.id, actionType: 'created', actionBy: userId, notes: 'Payable created manually' });
      res.status(201).json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/payables/:id', requireAuth, async (req: any, res) => {
    try {
      const aliasApprover = aliasedTable(users, 'payable_approver_detail');
      const rows = await db.select({
        p: payables,
        vendor: { id: vendors.id, name: vendors.name },
        customer: { id: customers.id, name: customers.customerName },
        approver: { id: aliasApprover.id, firstName: aliasApprover.firstName, lastName: aliasApprover.lastName, email: aliasApprover.email },
      }).from(payables)
        .leftJoin(vendors, eq(payables.vendorId, vendors.id))
        .leftJoin(customers, eq(payables.customerId, customers.id))
        .leftJoin(aliasApprover, eq(payables.approvedBy, aliasApprover.id))
        .where(eq(payables.id, req.params.id));
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      const docs = await db.select().from(payableDocuments).where(eq(payableDocuments.payableId, req.params.id)).orderBy(desc(payableDocuments.uploadedAt));
      const dupes = await db.select().from(payableDuplicateChecks).where(eq(payableDuplicateChecks.payableId, req.params.id));
      const aliasAuditUser = aliasedTable(users, 'payable_audit_user');
      const audit = await db.select({
        log: payableAuditLog,
        user: { firstName: aliasAuditUser.firstName, lastName: aliasAuditUser.lastName, email: aliasAuditUser.email },
      }).from(payableAuditLog)
        .leftJoin(aliasAuditUser, eq(payableAuditLog.actionBy, aliasAuditUser.id))
        .where(eq(payableAuditLog.payableId, req.params.id))
        .orderBy(desc(payableAuditLog.actionAt));
      const r = rows[0];
      const safeDocuments = docs.map((d: any) => {
        const { fileDataBase64, ...rest } = d;
        return { ...rest, hasFile: !!fileDataBase64 };
      });
      res.json({
        ...r.p,
        vendorName: r.vendor?.name,
        customerName: r.customer?.name,
        approverName: r.approver ? (r.approver.firstName || '').trim() + ' ' + (r.approver.lastName || '').trim() || r.approver.email : null,
        documents: safeDocuments,
        duplicateChecks: dupes,
        auditLog: audit.map((a: any) => ({ ...a.log, actionByName: a.user ? ((a.user.firstName || '') + ' ' + (a.user.lastName || '')).trim() || a.user.email : 'System' })),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/payables/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const body = { ...req.body, updatedAt: new Date() };
      delete body.createdAt;
      const [row] = await db.update(payables).set(body).where(eq(payables.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: 'Not found' });
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'updated', actionBy: userId, notes: 'Payable updated' });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/payables/:id', requireAuth, async (req: any, res) => {
    try {
      await db.delete(payables).where(eq(payables.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/payables/:id/approve', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const { notes } = req.body;
      const existing = await db.select().from(payables).where(eq(payables.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });
      if (existing[0].duplicateStatus === 'probable_duplicate' && !existing[0].duplicateOverriddenBy) {
        return res.status(400).json({ error: 'Probable duplicate detected. Override required before approval.' });
      }
      const [row] = await db.update(payables).set({
        approvalStatus: 'approved', status: 'approved', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date(),
      }).where(eq(payables.id, req.params.id)).returning();
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'approved', actionBy: userId, notes: notes || 'Payable approved' });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/payables/:id/reject', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const { reason } = req.body;
      const [row] = await db.update(payables).set({
        approvalStatus: 'rejected', status: 'rejected', rejectionReason: reason || null, updatedAt: new Date(),
      }).where(eq(payables.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: 'Not found' });
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'rejected', actionBy: userId, notes: reason || 'Payable rejected' });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/payables/:id/override-duplicate', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const { reason } = req.body;
      const [row] = await db.update(payables).set({
        duplicateOverriddenBy: userId, duplicateOverrideReason: reason || 'Override approved', updatedAt: new Date(),
      }).where(eq(payables.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: 'Not found' });
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'duplicate_override', actionBy: userId, notes: reason || 'Duplicate override approved' });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/payables/:id/qb-sync', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const existing = await db.select().from(payables).where(eq(payables.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });
      if (existing[0].approvalStatus !== 'approved') return res.status(400).json({ error: 'Payable must be approved before syncing to QuickBooks.' });
      const mockQbId = 'QB-' + Date.now();
      const [row] = await db.update(payables).set({
        qbSyncStatus: 'synced', qbReferenceId: mockQbId, qbSyncAt: new Date(), qbSyncError: null, updatedAt: new Date(),
      }).where(eq(payables.id, req.params.id)).returning();
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'qb_synced', actionBy: userId, notes: 'Synced to QuickBooks. Ref: ' + mockQbId });
      res.json(row);
    } catch (e: any) {
      await db.update(payables).set({ qbSyncStatus: 'failed', qbSyncError: e.message, updatedAt: new Date() }).where(eq(payables.id, req.params.id));
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/payables/:id/run-duplicate-check', requireAuth, async (req: any, res) => {
    try {
      const existing = await db.select().from(payables).where(eq(payables.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });
      const p = existing[0];
      const conditions: any[] = [ne(payables.id, req.params.id)];
      if (p.vendorId) conditions.push(eq(payables.vendorId, p.vendorId));
      const candidates = await db.select().from(payables).where(and(...conditions));
      const matches: Array<{ matchedId: string; matchType: string; reason: string }> = [];
      for (const c of candidates) {
        const reasons: string[] = [];
        if (p.invoiceNumber && c.invoiceNumber && p.invoiceNumber === c.invoiceNumber) reasons.push('same invoice number');
        if (p.totalAmount && c.totalAmount && String(p.totalAmount) === String(c.totalAmount)) reasons.push('same amount');
        if (p.invoiceDate && c.invoiceDate && p.invoiceDate === c.invoiceDate) reasons.push('same invoice date');
        if (reasons.length >= 3) matches.push({ matchedId: c.id, matchType: 'exact', reason: reasons.join(', ') });
        else if (reasons.length === 2) matches.push({ matchedId: c.id, matchType: 'likely', reason: reasons.join(', ') });
        else if (reasons.length === 1 && reasons[0] === 'same invoice number') matches.push({ matchedId: c.id, matchType: 'possible', reason: reasons.join(', ') });
      }
      await db.delete(payableDuplicateChecks).where(eq(payableDuplicateChecks.payableId, req.params.id));
      let newDupeStatus = 'clear';
      if (matches.length > 0) {
        await db.insert(payableDuplicateChecks).values(matches.map((m: any) => ({
          payableId: req.params.id, matchedPayableId: m.matchedId, matchType: m.matchType, matchReason: m.reason,
        })));
        newDupeStatus = matches.some((m: any) => m.matchType === 'exact') ? 'probable_duplicate' : 'warning';
        await db.update(payables).set({ duplicateStatus: newDupeStatus, updatedAt: new Date() }).where(eq(payables.id, req.params.id));
      } else {
        await db.update(payables).set({ duplicateStatus: 'clear', updatedAt: new Date() }).where(eq(payables.id, req.params.id));
      }
      res.json({ matches, duplicateStatus: newDupeStatus });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Payable Documents
  app.get('/api/payables/:id/documents', requireAuth, async (req: any, res) => {
    try {
      const docs = await db.select().from(payableDocuments).where(eq(payableDocuments.payableId, req.params.id)).orderBy(desc(payableDocuments.uploadedAt));
      res.json(docs.map((d: any) => { const { fileDataBase64, ...rest } = d; return { ...rest, hasFile: !!fileDataBase64 }; }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/payable-documents/:id/download', requireAuth, async (req: any, res) => {
    try {
      const docs = await db.select().from(payableDocuments).where(eq(payableDocuments.id, req.params.id));
      if (!docs.length) return res.status(404).json({ error: 'Not found' });
      const doc = docs[0];
      if (!doc.fileDataBase64) return res.status(404).json({ error: 'No file data stored' });
      const buf = Buffer.from(doc.fileDataBase64, 'base64');
      res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + (doc.originalFileName || doc.fileName) + '"');
      res.send(buf);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/payables/:id/documents', requireAuth, multerInstance.single('file'), async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      let fileDataBase64: string | null = null;
      let fileName = req.body.fileName || 'document';
      let fileType = req.body.fileType || 'application/octet-stream';
      let fileSize = null;
      if (req.file) {
        fileDataBase64 = req.file.buffer.toString('base64');
        fileName = req.file.originalname || fileName;
        fileType = req.file.mimetype || fileType;
        fileSize = req.file.size;
      } else if (req.body.fileDataBase64) {
        fileDataBase64 = req.body.fileDataBase64;
        fileSize = Buffer.from(fileDataBase64, 'base64').length;
      }
      const existing = await db.select().from(payables).where(eq(payables.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Payable not found' });
      const [doc] = await db.insert(payableDocuments).values({
        payableId: req.params.id,
        vendorId: existing[0].vendorId || null,
        fileName, originalFileName: fileName, fileType, fileSize, fileDataBase64,
        uploadedFrom: req.body.uploadedFrom || 'manual',
      }).returning();
      await db.insert(payableAuditLog).values({ payableId: req.params.id, actionType: 'document_uploaded', actionBy: userId, notes: 'Document uploaded: ' + fileName });
      const { fileDataBase64: _fd, ...docOut } = doc as any;
      res.status(201).json({ ...docOut, hasFile: !!fileDataBase64 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/payable-documents/:id', requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const docs = await db.select().from(payableDocuments).where(eq(payableDocuments.id, req.params.id));
      if (!docs.length) return res.status(404).json({ error: 'Not found' });
      await db.delete(payableDocuments).where(eq(payableDocuments.id, req.params.id));
      await db.insert(payableAuditLog).values({ payableId: docs[0].payableId, actionType: 'document_deleted', actionBy: userId, notes: 'Document deleted: ' + docs[0].fileName });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Payable Audit Log
  app.get('/api/payables/:id/audit-log', requireAuth, async (req: any, res) => {
    try {
      const aliasAuditUser2 = aliasedTable(users, 'payable_al_user');
      const rows = await db.select({
        log: payableAuditLog,
        user: { firstName: aliasAuditUser2.firstName, lastName: aliasAuditUser2.lastName, email: aliasAuditUser2.email },
      }).from(payableAuditLog)
        .leftJoin(aliasAuditUser2, eq(payableAuditLog.actionBy, aliasAuditUser2.id))
        .where(eq(payableAuditLog.payableId, req.params.id))
        .orderBy(desc(payableAuditLog.actionAt));
      res.json(rows.map((r: any) => ({ ...r.log, actionByName: r.user ? ((r.user.firstName || '') + ' ' + (r.user.lastName || '')).trim() || r.user.email : 'System' })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Vendor Default Coding
  app.get('/api/vendors/:id/default-coding', requireAuth, async (req: any, res) => {
    try {
      const rows = await db.select().from(vendorDefaultCoding).where(eq(vendorDefaultCoding.vendorId, req.params.id));
      res.json(rows[0] || null);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/vendors/:id/default-coding', requireAuth, async (req: any, res) => {
    try {
      const body = { ...req.body, vendorId: req.params.id, updatedAt: new Date() };
      delete body.id;
      const existing = await db.select().from(vendorDefaultCoding).where(eq(vendorDefaultCoding.vendorId, req.params.id));
      let row;
      if (existing.length) {
        [row] = await db.update(vendorDefaultCoding).set(body).where(eq(vendorDefaultCoding.vendorId, req.params.id)).returning();
      } else {
        [row] = await db.insert(vendorDefaultCoding).values(body).returning();
      }
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // AP Stats summary
  app.get('/api/ap-stats', requireAuth, async (req: any, res) => {
    try {
      const all = await db.select().from(payables);
      const inbox = await db.select().from(apInboxMessages);
      res.json({
        totalPayables: all.length,
        pendingReview: all.filter((p: any) => p.status === 'pending_review').length,
        approved: all.filter((p: any) => p.approvalStatus === 'approved').length,
        exceptions: all.filter((p: any) => p.status === 'exception').length,
        probableDuplicates: all.filter((p: any) => p.duplicateStatus === 'probable_duplicate').length,
        notSynced: all.filter((p: any) => p.approvalStatus === 'approved' && p.qbSyncStatus === 'not_synced').length,
        syncFailed: all.filter((p: any) => p.qbSyncStatus === 'failed').length,
        inboxNew: inbox.filter((m: any) => m.processedStatus === 'new').length,
        inboxExceptions: inbox.filter((m: any) => m.processedStatus === 'exception').length,
        rebillableQueued: all.filter((p: any) => p.rebillStatus === 'queued_for_invoice').length,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
`;

// Find the closing brace of the registerRoutes function (last one)
const registerClose = content.lastIndexOf('\n}');
if (registerClose > 0) {
  content = content.slice(0, registerClose) + '\n' + AP_ROUTES + '\n' + content.slice(registerClose);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Routes injected, new length:', content.length);
