import { Router } from "express";
import multer from "multer";
import { db } from "../db";
import { leaveCases, leaveCaseDocuments, leaveCaseEvents, leaveNotifications, employees, users } from "../../shared/schema";
import { eq, desc, and, or, sql, isNull, not } from "drizzle-orm";
import { isAuthenticated } from "../replitAuth";
import { ObjectStorageService, signObjectURL } from "../objectStorage";
import {
  scanAndCreateLeaveAlerts,
  createReturnToWorkNotification,
} from "../services/leaveAlertService";

const objectStorage = new ObjectStorageService();
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const router = Router();
router.use(isAuthenticated as any);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateCaseNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await db
    .select({ caseNumber: leaveCases.caseNumber })
    .from(leaveCases)
    .where(and(eq(leaveCases.orgId, orgId), sql`EXTRACT(YEAR FROM created_at) = ${year}`))
    .orderBy(desc(leaveCases.createdAt))
    .limit(1);

  let seq = 1;
  if (existing.length > 0) {
    const last = existing[0].caseNumber;
    const parts = last.split("-");
    if (parts.length === 3) seq = parseInt(parts[2], 10) + 1;
  }
  return `LC-${year}-${String(seq).padStart(4, "0")}`;
}

async function logEvent(
  leaveCaseId: string,
  eventType: string,
  description: string,
  performedBy: string | undefined,
  performedByName: string | undefined,
  metadata?: Record<string, unknown>
) {
  await db.insert(leaveCaseEvents).values({
    leaveCaseId,
    eventType,
    description,
    performedBy,
    performedByName,
    metadata: metadata ?? null,
  });
}

// ── GET /api/corporate/employees/:employeeId/leave-cases ──────────────────────
router.get("/employees/:employeeId/leave-cases", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const cases = await db
      .select()
      .from(leaveCases)
      .where(eq(leaveCases.employeeId, employeeId))
      .orderBy(desc(leaveCases.createdAt));
    res.json(cases);
  } catch (err) {
    console.error("[LeaveCases] list error:", err);
    res.status(500).json({ error: "Failed to load leave cases" });
  }
});

// ── POST /api/corporate/employees/:employeeId/leave-cases ─────────────────────
router.post("/employees/:employeeId/leave-cases", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const user = (req as any).user;
    const orgId = user?.orgId ?? req.body.orgId;

    const caseNumber = await generateCaseNumber(orgId);

    const [newCase] = await db
      .insert(leaveCases)
      .values({
        ...req.body,
        orgId,
        employeeId,
        caseNumber,
        createdBy: user?.id,
        updatedBy: user?.id,
      })
      .returning();

    await logEvent(
      newCase.id,
      "created",
      `Leave case ${caseNumber} opened — type: ${newCase.leaveType}, status: pending_approval`,
      user?.id,
      user?.name ?? user?.email
    );

    res.status(201).json(newCase);
  } catch (err) {
    console.error("[LeaveCases] create error:", err);
    res.status(500).json({ error: "Failed to create leave case" });
  }
});

// ── GET /api/corporate/leave-cases/widget-data ───────────────────────────────
// Returns all 7 widget datasets in one call for the Leave Dashboard.
router.get("/leave-cases/widget-data", async (req, res) => {
  try {
    const user = (req as any).user;
    const orgId = user?.orgId;

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const addDaysStr = (n: number) => {
      const d = new Date(today); d.setDate(d.getDate() + n);
      return d.toISOString().split("T")[0];
    };

    // ── 1. Fetch all active cases with employee info ────────────────────────
    const activeCases = await db
      .select({
        id:                       leaveCases.id,
        caseNumber:               leaveCases.caseNumber,
        employeeId:               leaveCases.employeeId,
        leaveType:                leaveCases.leaveType,
        status:                   leaveCases.status,
        startDate:                leaveCases.startDate,
        triggerDate:              leaveCases.triggerDate,
        expectedReturnDate:       leaveCases.expectedReturnDate,
        certificationDueDate:     leaveCases.certificationDueDate,
        certificationReceivedDate:leaveCases.certificationReceivedDate,
        designationNoticeSentDate:leaveCases.designationNoticeSentDate,
        hrContactId:              leaveCases.hrContactId,
        firstName:                employees.firstName,
        lastName:                 employees.lastName,
        department:               employees.department,
        title:                    employees.title,
      })
      .from(leaveCases)
      .innerJoin(employees, eq(leaveCases.employeeId, employees.id))
      .where(
        and(
          eq(leaveCases.orgId, orgId),
          or(eq(leaveCases.status, "open"), eq(leaveCases.status, "extended"))
        )
      )
      .orderBy(desc(leaveCases.startDate));

    // ── 2. Fetch docs for active cases to check missing primary docs ────────
    const PRIMARY_TYPES = ["notice_of_rights", "medical_certification", "designation_notice"];
    const caseIds = activeCases.map((c) => c.id);
    let uploadedDocTypes: Record<string, Set<string>> = {};

    if (caseIds.length > 0) {
      const docs = await db.execute<{ leave_case_id: string; document_type: string }>(sql`
        SELECT leave_case_id, document_type
        FROM leave_case_documents
        WHERE leave_case_id = ANY(${caseIds}::text[])
          AND storage_key IS NOT NULL
          AND document_type = ANY(${PRIMARY_TYPES}::text[])
      `);
      for (const row of docs.rows) {
        if (!uploadedDocTypes[row.leave_case_id]) uploadedDocTypes[row.leave_case_id] = new Set();
        uploadedDocTypes[row.leave_case_id].add(row.document_type);
      }
    }

    // ── 3. Classify cases into widget groups ───────────────────────────────
    const CFRA_TYPES = ["cfra", "fmla", "cfra_fmla", "cfra_pregnancy"];

    const classify = (c: typeof activeCases[0]) => {
      const certDue  = c.certificationDueDate as string | null;
      const ret      = c.expectedReturnDate as string | null;
      const trigger  = c.triggerDate as string | null;
      const uploaded = uploadedDocTypes[c.id] ?? new Set();
      const missingPrimary = PRIMARY_TYPES.some((t) => !uploaded.has(t));

      let exhaustionDate: string | null = null;
      if (CFRA_TYPES.includes((c.leaveType ?? "").toLowerCase()) && trigger) {
        const d = new Date(trigger); d.setDate(d.getDate() + 84);
        exhaustionDate = d.toISOString().split("T")[0];
      }

      return {
        isCfra:     CFRA_TYPES.includes((c.leaveType ?? "").toLowerCase()),
        certOverdue:   !!certDue && !c.certificationReceivedDate && certDue < todayStr,
        certDueSoon:   !!certDue && !c.certificationReceivedDate && certDue >= todayStr && certDue <= addDaysStr(14),
        retIn7:     !!ret && ret >= todayStr && ret <= addDaysStr(7),
        retIn14:    !!ret && ret >= todayStr && ret <= addDaysStr(14),
        retIn30:    !!ret && ret >= todayStr && ret <= addDaysStr(30),
        missingDocs: missingPrimary,
        exhaustionApproaching: !!exhaustionDate && exhaustionDate >= todayStr && exhaustionDate <= addDaysStr(14),
        exhaustionDate,
        certDueDate: certDue,
        returnDate: ret,
      };
    };

    const annotated = activeCases.map((c) => ({
      ...c,
      employeeName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
      ...classify(c),
    }));

    res.json({
      onAnyLeave:           annotated,
      onCfraLeave:          annotated.filter((c) => c.isCfra),
      certOverdue:          annotated.filter((c) => c.certOverdue),
      certDueSoon:          annotated.filter((c) => c.certDueSoon),
      upcomingReleases7:    annotated.filter((c) => c.retIn7),
      upcomingReleases14:   annotated.filter((c) => c.retIn14),
      upcomingReleases30:   annotated.filter((c) => c.retIn30),
      missingDocs:          annotated.filter((c) => c.missingDocs),
      exhaustionApproaching:annotated.filter((c) => c.exhaustionApproaching),
    });
  } catch (err) {
    console.error("[LeaveWidgets] widget-data error:", err);
    res.status(500).json({ error: "Failed to load leave widget data" });
  }
});

// ── GET /api/corporate/leave-cases/active ─────────────────────────────────────
router.get("/leave-cases/active", async (req, res) => {
  try {
    const user = (req as any).user;
    const orgId = user?.orgId;

    const activeCases = await db
      .select({
        id:                 leaveCases.id,
        caseNumber:         leaveCases.caseNumber,
        employeeId:         leaveCases.employeeId,
        leaveType:          leaveCases.leaveType,
        status:             leaveCases.status,
        startDate:          leaveCases.startDate,
        expectedReturnDate: leaveCases.expectedReturnDate,
        certificationDueDate: leaveCases.certificationDueDate,
        certificationReceivedDate: leaveCases.certificationReceivedDate,
        firstName:          employees.firstName,
        lastName:           employees.lastName,
        department:         employees.department,
      })
      .from(leaveCases)
      .innerJoin(employees, eq(leaveCases.employeeId, employees.id))
      .where(
        and(
          eq(leaveCases.orgId, orgId),
          or(
            eq(leaveCases.status, "open"),
            eq(leaveCases.status, "extended")
          )
        )
      )
      .orderBy(desc(leaveCases.startDate));

    res.json(activeCases);
  } catch (err) {
    console.error("[LeaveCases] active list error:", err);
    res.status(500).json({ error: "Failed to load active leave cases" });
  }
});

// ── GET /api/corporate/leave-cases/alerts ─────────────────────────────────────
// Computed (not persisted) — covers all 6 alert types for the dashboard widget.
router.get("/leave-cases/alerts", async (req, res) => {
  try {
    const user = (req as any).user;
    const orgId = user?.orgId;
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const addDaysStr = (n: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return d.toISOString().split("T")[0];
    };

    const alertCases = await db
      .select({
        id:                       leaveCases.id,
        caseNumber:               leaveCases.caseNumber,
        employeeId:               leaveCases.employeeId,
        leaveType:                leaveCases.leaveType,
        status:                   leaveCases.status,
        triggerDate:              leaveCases.triggerDate,
        expectedReturnDate:       leaveCases.expectedReturnDate,
        certificationDueDate:     leaveCases.certificationDueDate,
        certificationReceivedDate:leaveCases.certificationReceivedDate,
        designationNoticeSentDate:leaveCases.designationNoticeSentDate,
        hrContactId:              leaveCases.hrContactId,
        firstName:                employees.firstName,
        lastName:                 employees.lastName,
      })
      .from(leaveCases)
      .innerJoin(employees, eq(leaveCases.employeeId, employees.id))
      .where(
        and(
          eq(leaveCases.orgId, orgId),
          or(eq(leaveCases.status, "open"), eq(leaveCases.status, "extended"))
        )
      );

    type AlertItem = {
      caseId: string; caseNumber: string; employeeName: string; employeeId: string;
      alertType: string; message: string; severity: string; dueDate: string | null;
    };

    const alerts = alertCases.flatMap((c): AlertItem[] => {
      const items: AlertItem[] = [];
      const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
      const base = { caseId: c.id, caseNumber: c.caseNumber, employeeName: name, employeeId: c.employeeId };

      // ── 1. Cert overdue
      if (c.certificationDueDate && !c.certificationReceivedDate) {
        const due = c.certificationDueDate as string;
        if (due < todayStr) {
          items.push({ ...base, alertType: "cert_overdue",
            message: `Medical certification overdue for ${name} (was due ${due})`,
            severity: "critical", dueDate: due });
        }
      }

      // ── 2. Cert due in 5 days
      if (c.certificationDueDate && !c.certificationReceivedDate) {
        const due = c.certificationDueDate as string;
        if (due >= todayStr && due <= addDaysStr(5)) {
          const days = Math.round((new Date(due).getTime() - today.getTime()) / 86400000);
          items.push({ ...base, alertType: "cert_due_soon",
            message: `Medical certification due in ${days} day(s) for ${name}`,
            severity: "warning", dueDate: due });
        }
      }

      // ── 3. Release in 7 days
      if (c.expectedReturnDate) {
        const ret = c.expectedReturnDate as string;
        if (ret >= addDaysStr(6) && ret <= addDaysStr(7)) {
          items.push({ ...base, alertType: "release_in_7_days",
            message: `${name} is expected to return in 7 days (${ret})`,
            severity: "info", dueDate: ret });
        }
      }

      // ── 4. Release in 3 days
      if (c.expectedReturnDate) {
        const ret = c.expectedReturnDate as string;
        if (ret >= addDaysStr(2) && ret <= addDaysStr(3)) {
          items.push({ ...base, alertType: "release_in_3_days",
            message: `${name} returns in 3 days (${ret}) — confirm RTW plan`,
            severity: "warning", dueDate: ret });
        }
      }

      // ── 5. Leave exhaustion approaching (CFRA/FMLA 84-day max)
      const exhaustionTypes = ["cfra", "fmla", "cfra_pregnancy"];
      if (exhaustionTypes.includes((c.leaveType ?? "").toLowerCase()) && c.triggerDate) {
        const trigger = new Date(c.triggerDate as string);
        const exhaustionDate = new Date(trigger);
        exhaustionDate.setDate(exhaustionDate.getDate() + 84);
        const exStr = exhaustionDate.toISOString().split("T")[0];
        if (exStr >= todayStr && exStr <= addDaysStr(14)) {
          const daysLeft = Math.round((exhaustionDate.getTime() - today.getTime()) / 86400000);
          items.push({ ...base, alertType: "leave_exhaustion_approaching",
            message: `${name}'s ${c.leaveType.toUpperCase()} entitlement exhausts in ${daysLeft} day(s) (${exStr})`,
            severity: daysLeft <= 3 ? "critical" : "warning", dueDate: exStr });
        }
      }

      // ── 6. Designation notice not sent (compliance gap)
      if (!c.designationNoticeSentDate && c.status !== "pending_approval") {
        items.push({ ...base, alertType: "designation_not_sent",
          message: `Designation notice not yet sent for ${name}`,
          severity: "warning", dueDate: null });
      }

      return items;
    });

    res.json(alerts);
  } catch (err) {
    console.error("[LeaveCases] alerts error:", err);
    res.status(500).json({ error: "Failed to load leave alerts" });
  }
});

// ── GET /api/corporate/leave-cases/notifications ──────────────────────────────
// Returns persistent notifications for the current user.
// Admins + super_user see all; others see only cases where they are hrContactId.
router.get("/leave-cases/notifications", async (req, res) => {
  try {
    const user = (req as any).user;
    const orgId = user?.orgId;
    const isAdmin = user?.role === "admin" || user?.role === "super_user" || user?.isRootSuperAdmin;

    let rows;
    if (isAdmin) {
      rows = await db
        .select()
        .from(leaveNotifications)
        .where(eq(leaveNotifications.orgId, orgId))
        .orderBy(desc(leaveNotifications.createdAt))
        .limit(100);
    } else {
      // Non-admins see only cases where they are the hrContactId
      const myCases = await db
        .select({ id: leaveCases.id })
        .from(leaveCases)
        .where(and(eq(leaveCases.orgId, orgId), eq(leaveCases.hrContactId, user.id)));
      const myCaseIds = myCases.map((c) => c.id);
      if (myCaseIds.length === 0) return res.json([]);
      rows = await db
        .select()
        .from(leaveNotifications)
        .where(
          and(
            eq(leaveNotifications.orgId, orgId),
            sql`leave_case_id = ANY(ARRAY[${sql.raw(myCaseIds.map((id) => `'${id}'`).join(","))}]::text[])`
          )
        )
        .orderBy(desc(leaveNotifications.createdAt))
        .limit(100);
    }

    res.json(rows);
  } catch (err) {
    console.error("[LeaveNotifs] fetch error:", err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

// ── POST /api/corporate/leave-cases/notifications/:id/acknowledge ─────────────
router.post("/leave-cases/notifications/:id/acknowledge", async (req, res) => {
  try {
    const user = (req as any).user;
    const [updated] = await db
      .update(leaveNotifications)
      .set({ isAcknowledged: true, acknowledgedBy: user?.id, acknowledgedAt: new Date() })
      .where(eq(leaveNotifications.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Notification not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to acknowledge notification" });
  }
});

// ── POST /api/corporate/leave-cases/scan-alerts (admin trigger) ───────────────
router.post("/leave-cases/scan-alerts", async (req, res) => {
  try {
    const user = (req as any).user;
    const isAdmin = user?.role === "admin" || user?.role === "super_user" || user?.isRootSuperAdmin;
    if (!isAdmin) return res.status(403).json({ error: "Admin access required" });

    const orgId = user?.orgId;
    console.log(`[LeaveAlerts] Manual scan triggered by ${user?.email} for org ${orgId}`);
    const summary = await scanAndCreateLeaveAlerts(orgId);
    console.log(`[LeaveAlerts] Scan complete:`, summary);
    res.json({ ...summary, message: `Scanned ${summary.scanned} cases, created ${summary.created} notification(s)` });
  } catch (err) {
    console.error("[LeaveAlerts] scan error:", err);
    res.status(500).json({ error: "Scan failed" });
  }
});

// ── GET /api/corporate/leave-cases/:id ───────────────────────────────────────
router.get("/leave-cases/:id", async (req, res) => {
  try {
    const [lc] = await db
      .select()
      .from(leaveCases)
      .where(eq(leaveCases.id, req.params.id));
    if (!lc) return res.status(404).json({ error: "Leave case not found" });
    res.json(lc);
  } catch (err) {
    res.status(500).json({ error: "Failed to load leave case" });
  }
});

// ── PATCH /api/corporate/leave-cases/:id ─────────────────────────────────────
router.patch("/leave-cases/:id", async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const [before] = await db.select().from(leaveCases).where(eq(leaveCases.id, id));
    if (!before) return res.status(404).json({ error: "Leave case not found" });

    const [updated] = await db
      .update(leaveCases)
      .set({ ...req.body, updatedBy: user?.id, updatedAt: new Date() })
      .where(eq(leaveCases.id, id))
      .returning();

    const changes: string[] = [];
    if (req.body.status && req.body.status !== before.status) {
      changes.push(`status changed from ${before.status} to ${req.body.status}`);
    }
    if (req.body.startDate && req.body.startDate !== before.startDate) {
      changes.push(`start date set to ${req.body.startDate}`);
    }
    if (req.body.expectedReturnDate && req.body.expectedReturnDate !== before.expectedReturnDate) {
      changes.push(`expected return date set to ${req.body.expectedReturnDate}`);
    }
    if (req.body.noticeOfRightsSentDate && !before.noticeOfRightsSentDate) {
      changes.push(`notice of rights sent on ${req.body.noticeOfRightsSentDate}`);
    }
    if (req.body.medicalCertRequestedDate && !before.medicalCertRequestedDate) {
      changes.push(`medical certification requested on ${req.body.medicalCertRequestedDate}`);
    }
    if (req.body.certificationDueDate && req.body.certificationDueDate !== before.certificationDueDate) {
      changes.push(`certification due date set to ${req.body.certificationDueDate}`);
    }
    if (req.body.certificationReceivedDate && !before.certificationReceivedDate) {
      changes.push("medical certification received");
    }
    if (req.body.designationNoticeSentDate && !before.designationNoticeSentDate) {
      changes.push("designation notice sent");
    }
    if (changes.length === 0) changes.push("record updated");

    await logEvent(
      id,
      req.body.status && req.body.status !== before.status ? "status_changed" : "date_updated",
      changes.join("; "),
      user?.id,
      user?.name ?? user?.email
    );

    // ── Return-to-work alert (event-driven) ──────────────────────────────────
    if (req.body.status === "returned" && before.status !== "returned") {
      try {
        const [emp] = await db
          .select({ firstName: employees.firstName, lastName: employees.lastName })
          .from(employees)
          .where(eq(employees.id, before.employeeId));
        const empName = emp ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() : "Employee";
        const returnDate = req.body.actualReturnDate ?? new Date().toISOString().split("T")[0];
        await createReturnToWorkNotification(
          before.orgId,
          id,
          before.employeeId,
          before.caseNumber,
          empName,
          returnDate
        );
      } catch (alertErr) {
        console.error("[LeaveAlerts] return-to-work notification error:", alertErr);
      }
    }

    res.json(updated);
  } catch (err) {
    console.error("[LeaveCases] update error:", err);
    res.status(500).json({ error: "Failed to update leave case" });
  }
});

// ── DELETE /api/corporate/leave-cases/:id ────────────────────────────────────
router.delete("/leave-cases/:id", async (req, res) => {
  try {
    await db.delete(leaveCases).where(eq(leaveCases.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete leave case" });
  }
});

// ── Documents ─────────────────────────────────────────────────────────────────

router.get("/leave-cases/:id/documents", async (req, res) => {
  try {
    const docs = await db
      .select()
      .from(leaveCaseDocuments)
      .where(eq(leaveCaseDocuments.leaveCaseId, req.params.id))
      .orderBy(desc(leaveCaseDocuments.createdAt));
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: "Failed to load documents" });
  }
});

router.post("/leave-cases/:id/documents", async (req, res) => {
  try {
    const user = (req as any).user;
    const [doc] = await db
      .insert(leaveCaseDocuments)
      .values({ ...req.body, leaveCaseId: req.params.id, uploadedBy: user?.id })
      .returning();

    await logEvent(
      req.params.id,
      "document_added",
      `Document added: ${doc.documentName} (${doc.documentType.replace(/_/g, " ")})`,
      user?.id,
      user?.name ?? user?.email
    );

    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: "Failed to add document" });
  }
});

router.delete("/leave-cases/:id/documents/:docId", async (req, res) => {
  try {
    const user = (req as any).user;
    const [doc] = await db
      .select()
      .from(leaveCaseDocuments)
      .where(eq(leaveCaseDocuments.id, req.params.docId));

    await db.delete(leaveCaseDocuments).where(eq(leaveCaseDocuments.id, req.params.docId));

    if (doc) {
      await logEvent(
        req.params.id,
        "document_removed",
        `Document removed: ${doc.documentName}`,
        user?.id,
        user?.name ?? user?.email
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove document" });
  }
});

// ── POST /api/corporate/leave-cases/:id/documents/upload ─────────────────────
router.post(
  "/leave-cases/:id/documents/upload",
  fileUpload.single("file"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const multerFile = (req as any).file as Express.Multer.File | undefined;
      if (!multerFile) return res.status(400).json({ error: "No file provided" });

      const { documentType, documentName, notes, dueDate, employeeId } = req.body;
      if (!documentType || !documentName) {
        return res.status(400).json({ error: "documentType and documentName are required" });
      }

      const ext = multerFile.originalname.split(".").pop() ?? "";
      const storageKey = `.private/leave-cases/${req.params.id}/${Date.now()}-${documentName.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`;

      await objectStorage.uploadFileWithKey(multerFile.buffer, storageKey, multerFile.mimetype);

      const [doc] = await db
        .insert(leaveCaseDocuments)
        .values({
          leaveCaseId:   req.params.id,
          employeeId:    employeeId ?? "",
          documentType,
          documentName,
          storageKey,
          fileUrl:       storageKey,
          mimeType:      multerFile.mimetype,
          fileSizeBytes: multerFile.size,
          notes:         notes ?? null,
          dueDate:       dueDate ?? null,
          isMissing:     false,
          uploadedBy:    user?.id,
          uploadedAt:    new Date(),
        })
        .returning();

      await logEvent(
        req.params.id,
        "document_added",
        `File uploaded: ${documentName} (${DOC_TYPE_DISPLAY[documentType] ?? documentType}) — ${formatFileSize(multerFile.size)}`,
        user?.id,
        user?.name ?? user?.email
      );

      res.status(201).json(doc);
    } catch (err) {
      console.error("[LeaveCases] upload error:", err);
      res.status(500).json({ error: "Failed to upload document" });
    }
  }
);

// ── GET /api/corporate/leave-cases/:id/documents/:docId/url ──────────────────
router.get("/leave-cases/:id/documents/:docId/url", async (req, res) => {
  try {
    const [doc] = await db
      .select()
      .from(leaveCaseDocuments)
      .where(eq(leaveCaseDocuments.id, req.params.docId));

    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (!doc.storageKey) return res.status(404).json({ error: "No file attached to this document record" });

    const url = await signObjectURL({ objectPath: doc.storageKey, expirationSeconds: 900 });
    res.json({ url, expiresInSeconds: 900 });
  } catch (err) {
    console.error("[LeaveCases] signed URL error:", err);
    res.status(500).json({ error: "Failed to generate download link" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const DOC_TYPE_DISPLAY: Record<string, string> = {
  notice_of_rights:           "Notice of Rights",
  designation_notice:         "Designation Notice",
  medical_certification:      "Medical Certification",
  continuation_certification: "Continuation Certification",
  return_to_work_clearance:   "Return-to-Work Clearance",
  hr_correspondence:          "HR Correspondence",
  other:                      "Other",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Events (audit log) ────────────────────────────────────────────────────────

router.get("/leave-cases/:id/events", async (req, res) => {
  try {
    const events = await db
      .select()
      .from(leaveCaseEvents)
      .where(eq(leaveCaseEvents.leaveCaseId, req.params.id))
      .orderBy(desc(leaveCaseEvents.createdAt));
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Failed to load events" });
  }
});

// ── POST /api/corporate/leave-cases/:id/note ─────────────────────────────────
router.post("/leave-cases/:id/note", async (req, res) => {
  try {
    const user = (req as any).user;
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: "Note is required" });

    await logEvent(req.params.id, "note_added", note.trim(), user?.id, user?.name ?? user?.email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to add note" });
  }
});

export default router;
