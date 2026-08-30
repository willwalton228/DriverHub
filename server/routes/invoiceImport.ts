import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  importBatches,
  importStagingRows,
  invoiceImportProfiles,
  invoices,
  customers,
} from "@shared/schema";
import { storage } from "../storage";

const router = Router();

// ─── Invoice target fields ────────────────────────────────────────────────────
export const INVOICE_TARGET_FIELDS = [
  { key: "customerName",       label: "Customer Name",        required: true,  type: "string"  },
  { key: "invoiceDate",        label: "Invoice Date",         required: true,  type: "date"    },
  { key: "dueDate",            label: "Due Date",             required: true,  type: "date"    },
  { key: "totalAmount",        label: "Total Amount",         required: true,  type: "decimal" },
  { key: "invoiceNumber",      label: "Invoice Number",       required: false, type: "string"  },
  { key: "referenceNumber",    label: "Reference / Job #",    required: false, type: "string"  },
  { key: "poNumber",           label: "PO Number",            required: false, type: "string"  },
  { key: "paymentTerms",       label: "Payment Terms",        required: false, type: "string"  },
  { key: "billingPeriodStart", label: "Billing Period Start", required: false, type: "date"    },
  { key: "billingPeriodEnd",   label: "Billing Period End",   required: false, type: "date"    },
  { key: "subtotalAmount",     label: "Subtotal Amount",      required: false, type: "decimal" },
  { key: "taxAmount",          label: "Tax Amount",           required: false, type: "decimal" },
  { key: "customerMemo",       label: "Customer Memo",        required: false, type: "string"  },
  { key: "internalNotes",      label: "Internal Notes",       required: false, type: "string"  },
] as const;

const VALID_PAYMENT_TERMS = ["net_15", "net_30", "net_45", "net_60", "net_90", "due_on_receipt", "custom"];

// Maximum lengths for string fields
const MAX_LENGTHS: Record<string, number> = {
  customerName:    255,
  invoiceNumber:   100,
  referenceNumber: 100,
  poNumber:        100,
  paymentTerms:    50,
  customerMemo:    2000,
  internalNotes:   2000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDate(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") {
    // Excel serial date (1900-based, with the leap-year bug)
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + val * 86_400_000);
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function parseDecimal(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function applyMapping(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [sourceCol, targetField] of Object.entries(columnMapping)) {
    if (targetField && targetField !== "__skip__") {
      mapped[targetField] = rawRow[sourceCol];
    }
  }
  return mapped;
}

// Enhanced validation — returns field-level error metadata alongside messages
function validateRow(mapped: Record<string, unknown>): {
  errors: string[];
  warnings: string[];
  errorFields: string[];
  warningFields: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const errorFields: string[] = [];
  const warningFields: string[] = [];

  const addError = (field: string, msg: string) => { errors.push(msg); errorFields.push(field); };
  const addWarning = (field: string, msg: string) => { warnings.push(msg); warningFields.push(field); };

  // ── customerName ──────────────────────────────────────────────────────────
  const custName = mapped.customerName ? String(mapped.customerName).trim() : "";
  if (!custName) {
    addError("customerName", "Customer Name is required");
  } else if (custName.length > MAX_LENGTHS.customerName) {
    addError("customerName", `Customer Name exceeds ${MAX_LENGTHS.customerName} characters`);
  }

  // ── invoiceDate ───────────────────────────────────────────────────────────
  let parsedInvoiceDate: string | null = null;
  if (!mapped.invoiceDate && mapped.invoiceDate !== 0) {
    addError("invoiceDate", "Invoice Date is required");
  } else {
    parsedInvoiceDate = parseDate(mapped.invoiceDate);
    if (!parsedInvoiceDate) {
      addError("invoiceDate", `Invoice Date "${mapped.invoiceDate}" is not a valid date`);
    } else {
      // Warn if invoice date is more than 1 year in the future
      const today = new Date();
      const oneYearOut = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
      if (new Date(parsedInvoiceDate) > oneYearOut) {
        addWarning("invoiceDate", `Invoice Date "${parsedInvoiceDate}" is more than 1 year in the future`);
      }
    }
  }

  // ── dueDate ───────────────────────────────────────────────────────────────
  let parsedDueDate: string | null = null;
  if (!mapped.dueDate && mapped.dueDate !== 0) {
    addError("dueDate", "Due Date is required");
  } else {
    parsedDueDate = parseDate(mapped.dueDate);
    if (!parsedDueDate) {
      addError("dueDate", `Due Date "${mapped.dueDate}" is not a valid date`);
    }
  }

  // ── date order check ──────────────────────────────────────────────────────
  if (parsedInvoiceDate && parsedDueDate) {
    if (parsedDueDate < parsedInvoiceDate) {
      addWarning("dueDate", "Due Date is before Invoice Date");
    }
  }

  // ── totalAmount ───────────────────────────────────────────────────────────
  if (mapped.totalAmount === undefined || mapped.totalAmount === null || mapped.totalAmount === "") {
    addError("totalAmount", "Total Amount is required");
  } else {
    const n = parseDecimal(mapped.totalAmount);
    if (n === null) {
      addError("totalAmount", `Total Amount "${mapped.totalAmount}" is not a valid number`);
    } else if (n <= 0) {
      addError("totalAmount", "Total Amount must be greater than 0");
    } else if (n > 10_000_000) {
      addWarning("totalAmount", `Total Amount $${n.toLocaleString()} is unusually large — please verify`);
    }
  }

  // ── subtotalAmount ────────────────────────────────────────────────────────
  if (mapped.subtotalAmount !== undefined && mapped.subtotalAmount !== "") {
    if (parseDecimal(mapped.subtotalAmount) === null) {
      addWarning("subtotalAmount", `Subtotal Amount "${mapped.subtotalAmount}" is not a valid number — will be ignored`);
    }
  }

  // ── taxAmount ─────────────────────────────────────────────────────────────
  if (mapped.taxAmount !== undefined && mapped.taxAmount !== "") {
    const tax = parseDecimal(mapped.taxAmount);
    if (tax === null) {
      addWarning("taxAmount", `Tax Amount "${mapped.taxAmount}" is not a valid number — will be ignored`);
    } else if (tax < 0) {
      addWarning("taxAmount", "Tax Amount is negative — please verify");
    }
  }

  // ── paymentTerms ──────────────────────────────────────────────────────────
  if (mapped.paymentTerms && mapped.paymentTerms !== "") {
    const norm = String(mapped.paymentTerms).toLowerCase().replace(/\s+/g, "_");
    if (!VALID_PAYMENT_TERMS.includes(norm)) {
      addWarning(
        "paymentTerms",
        `Payment Terms "${mapped.paymentTerms}" not recognized — will default to "net_30". Valid values: ${VALID_PAYMENT_TERMS.join(", ")}`
      );
    }
  }

  // ── invoiceNumber length ──────────────────────────────────────────────────
  if (mapped.invoiceNumber && String(mapped.invoiceNumber).trim().length > MAX_LENGTHS.invoiceNumber) {
    addError("invoiceNumber", `Invoice Number exceeds ${MAX_LENGTHS.invoiceNumber} characters`);
  }

  // ── referenceNumber length ────────────────────────────────────────────────
  if (mapped.referenceNumber && String(mapped.referenceNumber).trim().length > MAX_LENGTHS.referenceNumber) {
    addError("referenceNumber", `Reference Number exceeds ${MAX_LENGTHS.referenceNumber} characters`);
  }

  // ── billingPeriod ─────────────────────────────────────────────────────────
  let parsedPeriodStart: string | null = null;
  let parsedPeriodEnd: string | null = null;
  if (mapped.billingPeriodStart && mapped.billingPeriodStart !== "") {
    parsedPeriodStart = parseDate(mapped.billingPeriodStart);
    if (!parsedPeriodStart) {
      addWarning("billingPeriodStart", `Billing Period Start "${mapped.billingPeriodStart}" is not a valid date — will be ignored`);
    }
  }
  if (mapped.billingPeriodEnd && mapped.billingPeriodEnd !== "") {
    parsedPeriodEnd = parseDate(mapped.billingPeriodEnd);
    if (!parsedPeriodEnd) {
      addWarning("billingPeriodEnd", `Billing Period End "${mapped.billingPeriodEnd}" is not a valid date — will be ignored`);
    }
  }
  if (parsedPeriodStart && parsedPeriodEnd && parsedPeriodEnd < parsedPeriodStart) {
    addWarning("billingPeriodEnd", "Billing Period End is before Billing Period Start");
  }

  return { errors, warnings, errorFields, warningFields };
}

// Partial validation for update mode — only validates fields that are present in mapped,
// skips the "required" checks for unmapped fields.
function validateRowPartial(mapped: Record<string, unknown>): {
  errors: string[];
  warnings: string[];
  errorFields: string[];
  warningFields: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const errorFields: string[] = [];
  const warningFields: string[] = [];

  const addError   = (f: string, m: string) => { errors.push(m);   errorFields.push(f); };
  const addWarning = (f: string, m: string) => { warnings.push(m); warningFields.push(f); };

  if ("invoiceDate" in mapped && mapped.invoiceDate !== "" && mapped.invoiceDate != null) {
    const parsed = parseDate(mapped.invoiceDate);
    if (!parsed) {
      addError("invoiceDate", `Invoice Date "${mapped.invoiceDate}" is not a valid date`);
    } else {
      const oneYearOut = new Date(); oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
      if (new Date(parsed) > oneYearOut) addWarning("invoiceDate", `Invoice Date "${parsed}" is more than 1 year in the future`);
    }
  }
  if ("dueDate" in mapped && mapped.dueDate !== "" && mapped.dueDate != null) {
    const parsed = parseDate(mapped.dueDate);
    if (!parsed) addError("dueDate", `Due Date "${mapped.dueDate}" is not a valid date`);
  }
  if ("totalAmount" in mapped && mapped.totalAmount !== "" && mapped.totalAmount != null) {
    const n = parseDecimal(mapped.totalAmount);
    if (n === null) addError("totalAmount", `Total Amount "${mapped.totalAmount}" is not a valid number`);
    else if (n <= 0) addError("totalAmount", "Total Amount must be greater than 0");
    else if (n > 10_000_000) addWarning("totalAmount", `Total Amount $${n.toLocaleString()} is unusually large — please verify`);
  }
  if ("subtotalAmount" in mapped && mapped.subtotalAmount !== "" && mapped.subtotalAmount != null) {
    if (parseDecimal(mapped.subtotalAmount) === null)
      addWarning("subtotalAmount", `Subtotal Amount "${mapped.subtotalAmount}" is not a valid number — will be ignored`);
  }
  if ("taxAmount" in mapped && mapped.taxAmount !== "" && mapped.taxAmount != null) {
    const t = parseDecimal(mapped.taxAmount);
    if (t === null) addWarning("taxAmount", `Tax Amount "${mapped.taxAmount}" is not a valid number — will be ignored`);
    else if (t < 0) addWarning("taxAmount", "Tax Amount is negative — please verify");
  }
  if ("paymentTerms" in mapped && mapped.paymentTerms !== "" && mapped.paymentTerms != null) {
    const norm = String(mapped.paymentTerms).toLowerCase().replace(/\s+/g, "_");
    if (!VALID_PAYMENT_TERMS.includes(norm))
      addWarning("paymentTerms", `Payment Terms "${mapped.paymentTerms}" not recognized — will default to "net_30"`);
  }
  if ("invoiceNumber" in mapped && String(mapped.invoiceNumber ?? "").trim().length > MAX_LENGTHS.invoiceNumber)
    addError("invoiceNumber", `Invoice Number exceeds ${MAX_LENGTHS.invoiceNumber} characters`);
  if ("referenceNumber" in mapped && String(mapped.referenceNumber ?? "").trim().length > MAX_LENGTHS.referenceNumber)
    addError("referenceNumber", `Reference Number exceeds ${MAX_LENGTHS.referenceNumber} characters`);
  if ("customerName" in mapped && mapped.customerName && String(mapped.customerName).length > MAX_LENGTHS.customerName)
    addError("customerName", `Customer Name exceeds ${MAX_LENGTHS.customerName} characters`);

  return { errors, warnings, errorFields, warningFields };
}

function normalizeRow(mapped: Record<string, unknown>): Record<string, unknown> {
  const out = { ...mapped };
  if (out.invoiceDate) out.invoiceDate = parseDate(out.invoiceDate) ?? out.invoiceDate;
  if (out.dueDate) out.dueDate = parseDate(out.dueDate) ?? out.dueDate;
  if (out.billingPeriodStart) out.billingPeriodStart = parseDate(out.billingPeriodStart) ?? out.billingPeriodStart;
  if (out.billingPeriodEnd) out.billingPeriodEnd = parseDate(out.billingPeriodEnd) ?? out.billingPeriodEnd;
  const total = parseDecimal(out.totalAmount);
  if (total !== null) out.totalAmount = total;
  const sub = parseDecimal(out.subtotalAmount);
  if (sub !== null) out.subtotalAmount = sub;
  const tax = parseDecimal(out.taxAmount);
  if (tax !== null) out.taxAmount = tax;
  if (out.paymentTerms) {
    const norm = String(out.paymentTerms).toLowerCase().replace(/\s+/g, "_");
    out.paymentTerms = VALID_PAYMENT_TERMS.includes(norm) ? norm : "net_30";
  }
  return out;
}

// ─── GET /fields ──────────────────────────────────────────────────────────────
router.get("/fields", (_req: Request, res: Response) => {
  res.json({ fields: INVOICE_TARGET_FIELDS });
});

// ─── GET /profiles ────────────────────────────────────────────────────────────
router.get("/profiles", async (_req: Request, res: Response) => {
  try {
    const profiles = await db
      .select()
      .from(invoiceImportProfiles)
      .orderBy(desc(invoiceImportProfiles.createdAt));
    res.json(profiles);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /profiles ───────────────────────────────────────────────────────────
router.post("/profiles", async (req: any, res: Response) => {
  try {
    const { name, columnMapping } = req.body;
    if (!name || !columnMapping) {
      return res.status(400).json({ error: "name and columnMapping are required" });
    }
    const [profile] = await db
      .insert(invoiceImportProfiles)
      .values({ name, columnMapping, createdByUserId: req.user?.claims?.sub ?? null })
      .returning();
    res.status(201).json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /profiles/:id ─────────────────────────────────────────────────────
router.delete("/profiles/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(invoiceImportProfiles).where(eq(invoiceImportProfiles.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /batches ─────────────────────────────────────────────────────────────
router.get("/batches", async (_req: Request, res: Response) => {
  try {
    const batches = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.moduleType, "invoices"))
      .orderBy(desc(importBatches.createdAt))
      .limit(100);
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:batchId ────────────────────────────────────────────────────────────
router.get("/:batchId", async (req: Request, res: Response) => {
  try {
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "invoices")));
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    const rows = await db
      .select()
      .from(importStagingRows)
      .where(eq(importStagingRows.batchId, batch.id))
      .orderBy(importStagingRows.rowIndex);

    res.json({ batch, rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /upload ─────────────────────────────────────────────────────────────
router.post("/upload", async (req: any, res: Response) => {
  try {
    const multer = (await import("multer")).default;
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    });

    upload.single("file")(req, res as any, async (uploadErr: any) => {
      if (uploadErr) return res.status(400).json({ error: uploadErr.message });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });

        const sheetName: string = req.body?.sheetName || workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          return res.status(400).json({ error: `Sheet "${sheetName}" not found in workbook` });
        }

        const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rawRows.length === 0) {
          return res.status(400).json({ error: "File contains no data rows" });
        }
        if (rawRows.length > 5000) {
          return res.status(400).json({ error: "File exceeds the 5,000-row limit per import" });
        }

        const fileHeaders = Object.keys(rawRows[0]);
        const userId: string = req.user?.claims?.sub ?? "system";
        const userEmail: string = req.currentUser?.email ?? userId;

        const [batch] = await db
          .insert(importBatches)
          .values({
            sourceFileName: req.file.originalname,
            status: "uploaded",
            totalRows: rawRows.length,
            moduleType: "invoices",
            fileHeaders: fileHeaders as any,
            sheetName,
            createdByUserId: userId,
            createdByUsername: userEmail,
          })
          .returning();

        await db.insert(importStagingRows).values(
          rawRows.map((row, idx) => ({
            batchId: batch.id,
            rowIndex: idx + 1,
            rawJson: row as any,
            status: "pending" as const,
          }))
        );

        res.status(201).json({
          batchId: batch.id,
          fileName: req.file.originalname,
          sheetNames: workbook.SheetNames,
          currentSheet: sheetName,
          headers: fileHeaders,
          totalRows: rawRows.length,
          previewRows: rawRows.slice(0, 5),
        });
      } catch (parseErr: any) {
        console.error("[InvoiceImport] parse error:", parseErr);
        res.status(422).json({ error: `Could not parse file: ${parseErr.message}` });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:batchId/validate ──────────────────────────────────────────────────
router.post("/:batchId/validate", async (req: any, res: Response) => {
  try {
    const {
      columnMapping,
      importMode = "create",   // "create" | "update" | "upsert"
      matchKey   = "invoiceNumber", // "invoiceNumber" | "referenceNumber"
    } = req.body as {
      columnMapping: Record<string, string>;
      importMode?: string;
      matchKey?: string;
    };

    if (!columnMapping || typeof columnMapping !== "object") {
      return res.status(400).json({ error: "columnMapping is required" });
    }
    if (!["create", "update", "upsert"].includes(importMode)) {
      return res.status(400).json({ error: "importMode must be 'create', 'update', or 'upsert'" });
    }
    if (!["invoiceNumber", "referenceNumber"].includes(matchKey)) {
      return res.status(400).json({ error: "matchKey must be 'invoiceNumber' or 'referenceNumber'" });
    }

    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "invoices")));
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.status === "committed") return res.status(400).json({ error: "Batch already committed" });

    const stagingRows = await db
      .select()
      .from(importStagingRows)
      .where(eq(importStagingRows.batchId, batch.id))
      .orderBy(importStagingRows.rowIndex);

    // ── Pre-fetch existing invoices by match key (for update/upsert modes) ─────
    const proposedMatchVals: string[] = [];
    const proposedInvNums: string[] = [];
    const proposedRefNums: string[] = [];

    for (const row of stagingRows) {
      const mapped = applyMapping(row.rawJson as Record<string, unknown>, columnMapping);
      const mv = mapped[matchKey] ? String(mapped[matchKey]).trim() : "";
      if (mv) proposedMatchVals.push(mv);
      if (mapped.invoiceNumber) proposedInvNums.push(String(mapped.invoiceNumber).trim());
      if (mapped.referenceNumber) proposedRefNums.push(String(mapped.referenceNumber).trim());
    }

    // matchMap: matchValue → { id, invoiceNumber, referenceNumber }
    const matchMap = new Map<string, { id: string; invoiceNumber: string | null; referenceNumber: string | null }>();

    if (importMode !== "create" && proposedMatchVals.length > 0) {
      const existingInvs = await db
        .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, referenceNumber: invoices.referenceNumber })
        .from(invoices)
        .where(
          matchKey === "invoiceNumber"
            ? inArray(invoices.invoiceNumber, proposedMatchVals)
            : inArray(invoices.referenceNumber as any, proposedMatchVals)
        );
      for (const inv of existingInvs) {
        const key = matchKey === "invoiceNumber" ? inv.invoiceNumber ?? "" : (inv as any).referenceNumber ?? "";
        if (key) matchMap.set(key, { id: inv.id, invoiceNumber: inv.invoiceNumber ?? null, referenceNumber: (inv as any).referenceNumber ?? null });
      }
    }

    // ── For create-mode dedup (existing invoice number / reference collision) ──
    const existingInvNumSet = new Set<string | null>();
    const existingRefNumSet = new Set<string | null>();
    if (importMode === "create") {
      const [byInv, byRef] = await Promise.all([
        proposedInvNums.length > 0
          ? db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(inArray(invoices.invoiceNumber, proposedInvNums))
          : Promise.resolve([]),
        proposedRefNums.length > 0
          ? db.select({ referenceNumber: invoices.referenceNumber }).from(invoices).where(inArray(invoices.referenceNumber as any, proposedRefNums))
          : Promise.resolve([]),
      ]);
      byInv.forEach((r) => existingInvNumSet.add(r.invoiceNumber));
      byRef.forEach((r) => existingRefNumSet.add((r as any).referenceNumber));
    }

    const batchMatchVals = new Set<string>();
    const batchInvNums   = new Set<string>();
    const batchRefNums   = new Set<string>();

    let validCount = 0, errorCount = 0, warningCount = 0, skipCount = 0, dupWarnings = 0;
    const errorCategories: Record<string, number> = {};

    for (const row of stagingRows) {
      const rawRow = row.rawJson as Record<string, unknown>;
      const mapped = applyMapping(rawRow, columnMapping);

      const matchVal = mapped[matchKey] ? String(mapped[matchKey]).trim() : "";
      const matchedInv = matchVal ? matchMap.get(matchVal) : undefined;

      // ── Determine match action ──────────────────────────────────────────────
      let rowMatchAction: "create" | "update" | "skip";
      if (importMode === "update") {
        rowMatchAction = matchedInv ? "update" : "skip";
      } else if (importMode === "upsert") {
        rowMatchAction = matchedInv ? "update" : "create";
      } else {
        rowMatchAction = "create";
      }

      // ── Validate ────────────────────────────────────────────────────────────
      const errors: string[]   = [];
      const warnings: string[] = [];
      const errorFields: string[]   = [];
      const warningFields: string[] = [];

      const addError   = (f: string, m: string) => { errors.push(m);   errorFields.push(f); };
      const addWarning = (f: string, m: string) => { warnings.push(m); warningFields.push(f); };

      if (rowMatchAction === "skip") {
        // Skipped rows need no validation
        addWarning("_match", `No existing invoice found with ${matchKey} "${matchVal ?? "(empty)"}" — row will be skipped`);
      } else if (rowMatchAction === "update") {
        // Update: only the match key itself must be present and unique within batch
        if (!matchVal) {
          addError(matchKey, `Match key "${matchKey}" is empty — cannot identify which invoice to update`);
        } else if (batchMatchVals.has(matchVal)) {
          addError(matchKey, `Match value "${matchVal}" appears more than once in this file`);
        }
        // Run full field validation only for fields that are actually mapped
        const mappedTargets = new Set(Object.values(columnMapping).filter((v) => v && v !== "__skip__"));
        const partialMapped = Object.fromEntries(
          Object.entries(mapped).filter(([k]) => mappedTargets.has(k))
        );
        const partialResult = validateRowPartial(partialMapped);
        errors.push(...partialResult.errors);
        errorFields.push(...partialResult.errorFields);
        warnings.push(...partialResult.warnings);
        warningFields.push(...partialResult.warningFields);
      } else {
        // Create: full validation
        const result = validateRow(mapped);
        errors.push(...result.errors);
        errorFields.push(...result.errorFields);
        warnings.push(...result.warnings);
        warningFields.push(...result.warningFields);

        const invNum = mapped.invoiceNumber ? String(mapped.invoiceNumber).trim() : "";
        const refNum = mapped.referenceNumber ? String(mapped.referenceNumber).trim() : "";

        if (invNum) {
          if (existingInvNumSet.has(invNum)) {
            addError("invoiceNumber", `Invoice Number "${invNum}" already exists in the system`);
          } else if (batchInvNums.has(invNum)) {
            addError("invoiceNumber", `Invoice Number "${invNum}" appears more than once in this file`);
          }
          batchInvNums.add(invNum);
        }
        if (refNum) {
          if (existingRefNumSet.has(refNum)) {
            addWarning("referenceNumber", `Reference "${refNum}" matches an existing invoice — possible duplicate`);
            dupWarnings++;
          } else if (batchRefNums.has(refNum)) {
            addWarning("referenceNumber", `Reference "${refNum}" appears multiple times in this file`);
          }
          batchRefNums.add(refNum);
        }
      }

      if (matchVal) batchMatchVals.add(matchVal);

      // Tally error categories
      errors.forEach((e) => {
        const cat = e.replace(/"[^"]*"/g, "«value»").replace(/\s+\d+\s+/g, " N ").split(/\s/).slice(0, 6).join(" ");
        errorCategories[cat] = (errorCategories[cat] ?? 0) + 1;
      });

      const normalized = normalizeRow(mapped);
      const hasErrors   = errors.length > 0;
      const hasWarnings = warnings.length > 0;

      let rowStatus: "valid" | "warning" | "error" | "skipped";
      if (rowMatchAction === "skip") {
        rowStatus = "skipped";
        skipCount++;
      } else if (hasErrors) {
        rowStatus = "error";
        errorCount++;
      } else if (hasWarnings) {
        rowStatus = "warning";
        warningCount++;
      } else {
        rowStatus = "valid";
        validCount++;
      }

      const fieldMeta: Record<string, string> = {};
      errorFields.forEach((f) => { fieldMeta[f] = "error"; });
      warningFields.forEach((f) => { if (!fieldMeta[f]) fieldMeta[f] = "warning"; });

      await db
        .update(importStagingRows)
        .set({
          mappedJson: normalized as any,
          validationErrors: errors.length > 0 ? (errors as any) : null,
          validationWarnings: warnings.length > 0 ? (warnings as any) : null,
          validationWarningFields: Object.keys(fieldMeta).length > 0 ? (fieldMeta as any) : null,
          matchAction: rowMatchAction as any,
          existingClaimId: matchedInv?.id ?? null,
          status: rowStatus as any,
        })
        .where(eq(importStagingRows.id, row.id));
    }

    await db
      .update(importBatches)
      .set({
        status: "validated",
        columnMapping: columnMapping as any,
        matchKey,
        updateMode: importMode,
        validRows: validCount,
        errorRows: errorCount,
        warningRows: warningCount,
        skippedRows: skipCount,
        validatedAt: new Date(),
        errorSummary: { duplicateWarnings: dupWarnings, errorCategories } as any,
      })
      .where(eq(importBatches.id, batch.id));

    res.json({
      batchId: batch.id,
      importMode,
      matchKey,
      totalRows: stagingRows.length,
      validRows: validCount,
      errorRows: errorCount,
      warningRows: warningCount,
      skippedRows: skipCount,
      duplicateWarnings: dupWarnings,
      errorCategories,
      readyToCommit: validCount + warningCount > 0,
    });
  } catch (err: any) {
    console.error("[InvoiceImport] validate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:batchId/commit ────────────────────────────────────────────────────
router.post("/:batchId/commit", async (req: any, res: Response) => {
  try {
    const { includeWarnings = true } = req.body as { includeWarnings?: boolean };

    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "invoices")));
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.status === "committed") return res.status(400).json({ error: "Batch already committed" });
    if (batch.status !== "validated") {
      return res.status(400).json({ error: "Batch must be validated before committing" });
    }

    const commitStatuses = includeWarnings ? ["valid", "warning"] : ["valid"];
    const stagingRows = await db
      .select()
      .from(importStagingRows)
      .where(
        and(
          eq(importStagingRows.batchId, batch.id),
          inArray(importStagingRows.status, commitStatuses)
        )
      )
      .orderBy(importStagingRows.rowIndex);

    if (stagingRows.length === 0) {
      return res.status(400).json({ error: "No valid rows to commit — all rows have errors" });
    }

    const userId: string = req.user?.claims?.sub ?? "system";
    const importMode  = batch.updateMode ?? "create";
    const batchColMap = (batch.columnMapping ?? {}) as Record<string, string>;

    // Set of target fields that were actually mapped (used for partial-update scoping)
    const mappedTargets = new Set(
      Object.values(batchColMap).filter((v) => v && v !== "__skip__")
    );

    let created = 0, updated = 0, failed = 0, totalValueImported = 0;
    const commitErrors: Array<{ rowIndex: number; error: string }> = [];

    for (const row of stagingRows) {
      try {
        const mapped = (row.mappedJson ?? row.rawJson) as Record<string, unknown>;
        const rowAction = row.matchAction ?? "create"; // "create" | "update"

        if (rowAction === "update" && row.existingClaimId) {
          // ── Partial UPDATE — only touch mapped fields ──────────────────────
          const patch: Record<string, unknown> = {};

          if (mappedTargets.has("customerName") && mapped.customerName != null) {
            const name = String(mapped.customerName).trim();
            if (name) {
              patch.customerName = name;
              // Re-link customer if name changed
              const [cust] = await db
                .select({ id: customers.id })
                .from(customers)
                .where(eq(customers.customerName, name))
                .limit(1);
              if (cust) patch.customerId = cust.id;
            }
          }
          if (mappedTargets.has("invoiceDate")        && mapped.invoiceDate != null)        patch.invoiceDate        = String(mapped.invoiceDate);
          if (mappedTargets.has("dueDate")            && mapped.dueDate != null)            patch.dueDate            = String(mapped.dueDate);
          if (mappedTargets.has("totalAmount")        && mapped.totalAmount != null)        patch.totalAmount        = String(Number(mapped.totalAmount));
          if (mappedTargets.has("subtotalAmount")     && mapped.subtotalAmount != null)     patch.subtotalAmount     = String(Number(mapped.subtotalAmount));
          if (mappedTargets.has("taxAmount")          && mapped.taxAmount != null)          patch.taxAmount          = String(Number(mapped.taxAmount));
          if (mappedTargets.has("referenceNumber")    && mapped.referenceNumber != null)    patch.referenceNumber    = String(mapped.referenceNumber);
          if (mappedTargets.has("poNumber")           && mapped.poNumber != null)           patch.poNumber           = String(mapped.poNumber);
          if (mappedTargets.has("paymentTerms")       && mapped.paymentTerms != null)       patch.paymentTerms       = String(mapped.paymentTerms);
          if (mappedTargets.has("billingPeriodStart") && mapped.billingPeriodStart != null) patch.billingPeriodStart = String(mapped.billingPeriodStart);
          if (mappedTargets.has("billingPeriodEnd")   && mapped.billingPeriodEnd != null)   patch.billingPeriodEnd   = String(mapped.billingPeriodEnd);
          if (mappedTargets.has("customerMemo")       && mapped.customerMemo != null)       patch.customerMemo       = String(mapped.customerMemo);
          if (mappedTargets.has("internalNotes")      && mapped.internalNotes != null)      patch.internalNotes      = String(mapped.internalNotes);

          if (Object.keys(patch).length > 0) {
            await storage.updateInvoice(row.existingClaimId, patch as any);
          }

          if (mappedTargets.has("totalAmount") && mapped.totalAmount != null) {
            totalValueImported += Number(mapped.totalAmount) || 0;
          }

          await db
            .update(importStagingRows)
            .set({ status: "committed" })
            .where(eq(importStagingRows.id, row.id));

          updated++;
        } else {
          // ── CREATE new invoice ─────────────────────────────────────────────
          let customerId: string | null = null;
          const custName = String(mapped.customerName || "").trim();
          if (custName) {
            const [cust] = await db
              .select({ id: customers.id })
              .from(customers)
              .where(eq(customers.customerName, custName))
              .limit(1);
            if (cust) customerId = cust.id;
          }

          const { invoiceNumber: draftNum, draftSequence } = await storage.generateDraftInvoiceNumber();
          const suppliedNum = mapped.invoiceNumber ? String(mapped.invoiceNumber).trim() : "";
          const finalInvoiceNumber = suppliedNum || draftNum;

          const totalAmt = Number(mapped.totalAmount) || 0;
          const subAmt   = mapped.subtotalAmount != null ? Number(mapped.subtotalAmount) : totalAmt;
          const taxAmt   = mapped.taxAmount != null ? Number(mapped.taxAmount) : 0;

          const invoice = await storage.createInvoiceWithLineItems(
            {
              invoiceNumber: finalInvoiceNumber,
              draftSequence: suppliedNum ? undefined : draftSequence,
              invoiceNumberFinalized: !!suppliedNum,
              customerId,
              customerName: custName,
              invoiceDate: String(mapped.invoiceDate ?? ""),
              dueDate: String(mapped.dueDate ?? ""),
              totalAmount: String(totalAmt),
              subtotalAmount: String(subAmt),
              taxAmount: String(taxAmt),
              referenceNumber: mapped.referenceNumber ? String(mapped.referenceNumber) : null,
              poNumber: mapped.poNumber ? String(mapped.poNumber) : null,
              paymentTerms: (mapped.paymentTerms as string) || "net_30",
              billingPeriodStart: mapped.billingPeriodStart ? String(mapped.billingPeriodStart) : null,
              billingPeriodEnd: mapped.billingPeriodEnd ? String(mapped.billingPeriodEnd) : null,
              customerMemo: mapped.customerMemo ? String(mapped.customerMemo) : null,
              internalNotes: mapped.internalNotes ? String(mapped.internalNotes) : null,
              status: "draft",
              createdBy: userId,
            },
            []
          );

          await db
            .update(importStagingRows)
            .set({ status: "committed", createdClaimId: invoice.id })
            .where(eq(importStagingRows.id, row.id));

          totalValueImported += totalAmt;
          created++;
        }
      } catch (rowErr: any) {
        await db
          .update(importStagingRows)
          .set({ status: "error", validationErrors: [rowErr.message] as any })
          .where(eq(importStagingRows.id, row.id));
        commitErrors.push({ rowIndex: row.rowIndex ?? 0, error: rowErr.message });
        failed++;
      }
    }

    await db
      .update(importBatches)
      .set({
        status: "committed",
        committedAt: new Date(),
        createdRows: created,
        updatedRows: updated,
        failedRows: failed,
        committedByUserId: userId,
      })
      .where(eq(importBatches.id, batch.id));

    res.json({
      success: true,
      batchId: batch.id,
      importMode,
      created,
      updated,
      failed,
      skipped: (batch.totalRows ?? 0) - stagingRows.length - (batch.skippedRows ?? 0),
      totalValueImported: Math.round(totalValueImported * 100) / 100,
      errors: commitErrors,
    });
  } catch (err: any) {
    console.error("[InvoiceImport] commit error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
