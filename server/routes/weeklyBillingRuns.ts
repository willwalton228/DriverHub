/**
 * Weekly Billing Control Panel — Backend Routes
 *
 * POST /api/billing/weekly-runs/preview     — dry run (creates or updates a "previewing" record)
 * POST /api/billing/weekly-runs/:id/execute — commit a previously previewed run
 * PATCH /api/billing/weekly-runs/:id        — update notes / overrideAccounts on a run
 * GET  /api/billing/weekly-runs             — list runs (most recent first)
 * GET  /api/billing/weekly-runs/:id         — get one run with full result JSON
 * DELETE /api/billing/weekly-runs/:id       — soft-cancel a previewing run (set status=cancelled)
 */

import { Router, Response } from "express";
import { db } from "../db";
import { weeklyBillingRuns } from "../../shared/schema";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

function hasBillingAccess(role: string): boolean {
  return ["super_user","root_super_admin","super_admin","admin","finance","corporate_admin"].includes(role);
}

async function getUser(req: any) {
  const { storage } = await import("../storage");
  return storage.getUser(req.user?.claims?.sub);
}

// ─── POST /preview ────────────────────────────────────────────────────────────
router.post("/preview", async (req: any, res: Response) => {
  try {
    const user = await getUser(req);
    if (!user || !hasBillingAccess(user.role ?? "")) {
      return res.status(403).json({ error: "Permission denied" });
    }

    const { cycleStart, cycleEnd, customerIds, paymentTermsDays } = req.body as {
      cycleStart: string;
      cycleEnd:   string;
      customerIds?: string[];
      paymentTermsDays?: number;
    };

    if (!cycleStart || !cycleEnd) {
      return res.status(400).json({ error: "cycleStart and cycleEnd are required" });
    }

    const { runAssembly } = await import("../services/invoiceAssemblyEngine");
    const engineResult = await runAssembly({
      cycleStart,
      cycleEnd,
      dryRun: true,
      createdBy: user.id,
      customerIds,
      tenantId: (req as any).tenantId ?? undefined,
      paymentTermsDays: paymentTermsDays ?? 30,
    });

    // Classify accounts
    const readyIds:   string[] = [];
    const warningIds: string[] = [];
    const errorIds:   string[] = [];
    const skippedIds: string[] = [];

    for (const r of engineResult.results) {
      if (r.status === "skipped") { skippedIds.push(r.customerId); continue; }
      if (r.validationErrors.length > 0) { errorIds.push(r.customerId); continue; }
      if (r.exclusions.length > 0)        { warningIds.push(r.customerId); continue; }
      readyIds.push(r.customerId);
    }

    // Persist the preview record
    const [run] = await db.insert(weeklyBillingRuns).values({
      tenantId:         (req as any).tenantId ?? null,
      cycleStart,
      cycleEnd,
      status:           "previewing",
      sendMode:         "draft",
      createdByUserId:  user.id,
      accountsTotal:    engineResult.accountsProcessed,
      accountsReady:    readyIds.length,
      accountsWarning:  warningIds.length,
      accountsError:    errorIds.length,
      accountsSkipped:  skippedIds.length,
      invoicesCreated:  0,
      invoicesAppended: 0,
      totalAmount:      String(engineResult.totalAmount),
      resultJson:       engineResult as any,
    } as any).returning();

    res.json({ run, engineResult });
  } catch (err: any) {
    console.error("[WeeklyBillingRun] preview error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/execute ────────────────────────────────────────────────────────
router.post("/:id/execute", async (req: any, res: Response) => {
  try {
    const user = await getUser(req);
    if (!user || !hasBillingAccess(user.role ?? "")) {
      return res.status(403).json({ error: "Permission denied" });
    }

    const [run] = await db.select().from(weeklyBillingRuns).where(eq(weeklyBillingRuns.id, req.params.id));
    if (!run) return res.status(404).json({ error: "Run not found" });
    if (run.status === "executed") return res.status(409).json({ error: "Run already executed" });

    const { sendMode, overriddenAccounts, paymentTermsDays, notes } = req.body as {
      sendMode?: string;
      overriddenAccounts?: string[];
      paymentTermsDays?: number;
      notes?: string;
    };

    const { runAssembly } = await import("../services/invoiceAssemblyEngine");
    const engineResult = await runAssembly({
      cycleStart:       run.cycleStart,
      cycleEnd:         run.cycleEnd,
      dryRun:           false,
      createdBy:        user.id,
      tenantId:         run.tenantId ?? undefined,
      paymentTermsDays: paymentTermsDays ?? 30,
      overriddenAccounts: overriddenAccounts ?? [],
    });

    // Re-classify after live run
    const readyIds:   string[] = [];
    const warningIds: string[] = [];
    const errorIds:   string[] = [];
    const skippedIds: string[] = [];
    for (const r of engineResult.results) {
      if (r.status === "skipped") { skippedIds.push(r.customerId); continue; }
      if (r.validationErrors.length > 0) { errorIds.push(r.customerId); continue; }
      if (r.exclusions.length > 0)        { warningIds.push(r.customerId); continue; }
      readyIds.push(r.customerId);
    }

    // Handle send mode: if send_now, trigger delivery for the billing cycle
    const resolvedSendMode = sendMode ?? run.sendMode;
    if (resolvedSendMode === "send_now") {
      try {
        const { runDeliveryBatch } = await import("../services/weeklyDeliveryService");
        await runDeliveryBatch({
          weekStart: run.cycleStart,
          weekEnd:   run.cycleEnd,
          forceSend: false,
          dryRun:    false,
        });
      } catch (deliveryErr) {
        console.error("[WeeklyBillingRun] delivery error (non-fatal):", deliveryErr);
      }
    }

    const [updated] = await db
      .update(weeklyBillingRuns)
      .set({
        status:             "executed",
        sendMode:           sendMode ?? run.sendMode,
        overriddenAccounts: overriddenAccounts as any ?? run.overriddenAccounts,
        accountsTotal:      engineResult.accountsProcessed,
        accountsReady:      readyIds.length,
        accountsWarning:    warningIds.length,
        accountsError:      errorIds.length,
        accountsSkipped:    skippedIds.length,
        invoicesCreated:    engineResult.invoicesCreated,
        invoicesAppended:   engineResult.invoicesAppended,
        totalAmount:        String(engineResult.totalAmount),
        notes:              notes ?? run.notes,
        resultJson:         engineResult as any,
        completedAt:        new Date(),
      })
      .where(eq(weeklyBillingRuns.id, run.id))
      .returning();

    res.json({ run: updated, engineResult });
  } catch (err: any) {
    console.error("[WeeklyBillingRun] execute error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────
router.patch("/:id", async (req: any, res: Response) => {
  try {
    const user = await getUser(req);
    if (!user || !hasBillingAccess(user.role ?? "")) {
      return res.status(403).json({ error: "Permission denied" });
    }
    const { notes, sendMode, scheduledSendAt, status } = req.body;
    const patch: Record<string, any> = {};
    if (notes       !== undefined) patch.notes = notes;
    if (sendMode    !== undefined) patch.sendMode = sendMode;
    if (scheduledSendAt !== undefined) patch.scheduledSendAt = scheduledSendAt ? new Date(scheduledSendAt) : null;
    if (status      !== undefined) patch.status = status;

    const [updated] = await db.update(weeklyBillingRuns).set(patch).where(eq(weeklyBillingRuns.id, req.params.id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET / (list) ─────────────────────────────────────────────────────────────
router.get("/", async (req: any, res: Response) => {
  try {
    const user = await getUser(req);
    if (!user || !hasBillingAccess(user.role ?? "")) {
      return res.status(403).json({ error: "Permission denied" });
    }
    const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
    const runs = await db
      .select({
        id:               weeklyBillingRuns.id,
        cycleStart:       weeklyBillingRuns.cycleStart,
        cycleEnd:         weeklyBillingRuns.cycleEnd,
        runDate:          weeklyBillingRuns.runDate,
        status:           weeklyBillingRuns.status,
        sendMode:         weeklyBillingRuns.sendMode,
        accountsTotal:    weeklyBillingRuns.accountsTotal,
        accountsReady:    weeklyBillingRuns.accountsReady,
        accountsWarning:  weeklyBillingRuns.accountsWarning,
        accountsError:    weeklyBillingRuns.accountsError,
        accountsSkipped:  weeklyBillingRuns.accountsSkipped,
        invoicesCreated:  weeklyBillingRuns.invoicesCreated,
        invoicesAppended: weeklyBillingRuns.invoicesAppended,
        totalAmount:      weeklyBillingRuns.totalAmount,
        notes:            weeklyBillingRuns.notes,
        createdAt:        weeklyBillingRuns.createdAt,
        completedAt:      weeklyBillingRuns.completedAt,
      })
      .from(weeklyBillingRuns)
      .orderBy(desc(weeklyBillingRuns.createdAt))
      .limit(limit);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get("/:id", async (req: any, res: Response) => {
  try {
    const user = await getUser(req);
    if (!user || !hasBillingAccess(user.role ?? "")) {
      return res.status(403).json({ error: "Permission denied" });
    }
    const [run] = await db.select().from(weeklyBillingRuns).where(eq(weeklyBillingRuns.id, req.params.id));
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json(run);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id (cancel) ─────────────────────────────────────────────────────
router.delete("/:id", async (req: any, res: Response) => {
  try {
    const user = await getUser(req);
    if (!user || !hasBillingAccess(user.role ?? "")) {
      return res.status(403).json({ error: "Permission denied" });
    }
    await db.update(weeklyBillingRuns)
      .set({ status: "cancelled" })
      .where(and(eq(weeklyBillingRuns.id, req.params.id), eq(weeklyBillingRuns.status, "previewing")));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
