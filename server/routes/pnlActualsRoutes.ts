/**
 * P&L Actuals — Upload, Mapping & Variance Analysis
 * Supports CSV and XLSX file upload.
 * Maps chart-of-accounts rows to forecast categories.
 * Computes variance against forecast snapshots.
 * Generates AI explanation for major variances.
 */

import { Router } from "express";
import multer from "multer";
import { db } from "../db";
import { sql, eq, and } from "drizzle-orm";
import { financialActuals, financialActualLines, financialActualMapping } from "@shared/schema";
import OpenAI from "openai";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only CSV and XLSX files are supported"), ok);
  },
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ── Helper: org + user from request ─────────────────────────────────────────
function getOrgId(req: any): string | null {
  return req.user?.orgId ?? null;
}
function getUserId(req: any): string {
  return req.user?.claims?.sub ?? (req.session as any)?.userId ?? "";
}

// ── Forecast categories ──────────────────────────────────────────────────────
const FORECAST_CATEGORIES = ["revenue", "labor", "contractor", "vendor", "claims", "overhead", "exclude"] as const;
type ForecastCategory = typeof FORECAST_CATEGORIES[number];

// Default keyword-to-category mapping for auto-detection
const KEYWORD_MAP: { keywords: string[]; category: ForecastCategory; isRevenue: boolean }[] = [
  { keywords: ["revenue", "sales", "service fee", "billing", "invoice", "income", "receipts"], category: "revenue", isRevenue: true },
  { keywords: ["employee", "payroll", "salary", "salaries", "wages", "benefits", "401k", "health insurance", "w2", "fica", "futa", "suta", "workers comp"], category: "labor", isRevenue: false },
  { keywords: ["contractor", "independent", "1099", "driver pay", "driver payment", "ic pay", "subcontractor"], category: "contractor", isRevenue: false },
  { keywords: ["vendor", "software", "subscription", "license", "saas", "maintenance", "supplies", "utilities", "rent", "lease"], category: "vendor", isRevenue: false },
  { keywords: ["claim", "accident", "insurance", "reserve", "settlement", "liability", "deductible", "premium"], category: "claims", isRevenue: false },
  { keywords: ["overhead", "admin", "administrative", "office", "marketing", "travel", "meals", "depreciation", "amortization", "professional", "legal", "audit"], category: "overhead", isRevenue: false },
];

function autoDetectCategory(accountName: string): { category: ForecastCategory | null; isRevenue: boolean } {
  const lower = accountName.toLowerCase();
  for (const rule of KEYWORD_MAP) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return { category: rule.category, isRevenue: rule.isRevenue };
    }
  }
  return { category: null, isRevenue: false };
}

// ── Parse CSV ────────────────────────────────────────────────────────────────
interface ParsedLine {
  rawAccountName: string;
  rawAccountCode: string | null;
  rawAmount: number;
}

async function parseCsv(buffer: Buffer): Promise<ParsedLine[]> {
  const Papa = (await import("papaparse")).default;
  const text = buffer.toString("utf-8");
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true, trimHeaders: true });
  const rows = result.data as string[][];
  const lines: ParsedLine[] = [];

  for (const row of rows) {
    if (row.length < 2) continue;
    // Try [code, name, amount] or [name, amount]
    let code: string | null = null;
    let name: string;
    let amtStr: string;

    if (row.length >= 3 && !isNaN(parseFloat(row[2].replace(/[,$()]/g, "")))) {
      code = row[0].trim();
      name = row[1].trim();
      amtStr = row[2];
    } else {
      name = row[0].trim();
      amtStr = row[1];
    }

    if (!name || name.toLowerCase() === "account" || name.toLowerCase() === "description") continue;
    const clean = amtStr?.toString().replace(/[,$\s]/g, "").replace(/\(([0-9.]+)\)/, "-$1") ?? "0";
    const amount = parseFloat(clean);
    if (isNaN(amount)) continue;

    lines.push({ rawAccountName: name, rawAccountCode: code, rawAmount: amount });
  }
  return lines;
}

async function parseXlsx(buffer: Buffer): Promise<ParsedLine[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const lines: ParsedLine[] = [];

  for (const row of rows) {
    if (!row || row.length < 2) continue;
    let code: string | null = null;
    let name: string;
    let rawAmt: any;

    if (row.length >= 3 && typeof row[2] === "number") {
      code = String(row[0]).trim();
      name = String(row[1]).trim();
      rawAmt = row[2];
    } else if (row.length >= 3 && !isNaN(parseFloat(String(row[2]).replace(/[,$() ]/g, "")))) {
      code = String(row[0]).trim();
      name = String(row[1]).trim();
      rawAmt = row[2];
    } else {
      name = String(row[0]).trim();
      rawAmt = row[1];
    }

    if (!name || /^(account|description|label|category|name)$/i.test(name)) continue;
    const amtStr = typeof rawAmt === "number" ? String(rawAmt) : String(rawAmt).replace(/[,$\s]/g, "").replace(/\(([0-9.]+)\)/, "-$1");
    const amount = parseFloat(amtStr);
    if (isNaN(amount)) continue;

    lines.push({ rawAccountName: name, rawAccountCode: code, rawAmount: amount });
  }
  return lines;
}

// ── POST /upload ─────────────────────────────────────────────────────────────
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { periodYear, periodMonth } = req.body;

    if (!periodYear || !periodMonth) {
      return res.status(400).json({ message: "periodYear and periodMonth are required" });
    }

    const ext = req.file.originalname.split(".").pop()?.toLowerCase();
    const source = ext === "xlsx" || ext === "xls" ? "xlsx" : "csv";
    const parsedLines = source === "xlsx"
      ? await parseXlsx(req.file.buffer)
      : await parseCsv(req.file.buffer);

    if (parsedLines.length === 0) {
      return res.status(400).json({ message: "No valid rows found in the file. Ensure columns are: [Account Name, Amount] or [Code, Account Name, Amount]." });
    }

    // Load existing org mapping rules for auto-map
    const orgMappings = orgId
      ? await db.select().from(financialActualMapping).where(eq(financialActualMapping.orgId, orgId))
      : [];
    const mappingLookup = new Map(orgMappings.map(m => [m.rawAccountName.toLowerCase(), m]));

    // Create the actuals header
    const [actual] = await db.insert(financialActuals).values({
      orgId,
      periodYear: parseInt(periodYear, 10),
      periodMonth: parseInt(periodMonth, 10),
      uploadSource: source,
      fileName: req.file.originalname,
      uploadedBy: userId || undefined,
      status: "pending_mapping",
    }).returning();

    // Auto-map and insert lines
    const lineRows = parsedLines.map(pl => {
      const normKey = pl.rawAccountName.toLowerCase().trim();
      const savedMapping = mappingLookup.get(normKey);
      let forecastCategory: string | null = savedMapping?.forecastCategory ?? null;
      let isRevenue = savedMapping?.isRevenue ?? false;

      if (!forecastCategory) {
        const detected = autoDetectCategory(pl.rawAccountName);
        forecastCategory = detected.category;
        isRevenue = detected.isRevenue;
      }

      return {
        actualId: actual.id,
        rawAccountName: pl.rawAccountName,
        rawAccountCode: pl.rawAccountCode ?? undefined,
        rawAmount: String(pl.rawAmount),
        isRevenue,
        forecastCategory: forecastCategory ?? undefined,
      };
    });

    await db.insert(financialActualLines).values(lineRows);

    // Compute initial totals
    const revenue = lineRows.filter(l => l.isRevenue).reduce((s, l) => s + parseFloat(l.rawAmount), 0);
    const expenses = lineRows.filter(l => !l.isRevenue && l.forecastCategory !== "exclude").reduce((s, l) => s + Math.abs(parseFloat(l.rawAmount)), 0);

    await db.update(financialActuals)
      .set({ totalRevenue: String(revenue), totalExpenses: String(expenses), netIncome: String(revenue - expenses) })
      .where(eq(financialActuals.id, actual.id));

    res.json({ id: actual.id, lineCount: lineRows.length, autoMapped: lineRows.filter(l => l.forecastCategory).length });
  } catch (err: any) {
    console.error("[pnl-actuals/upload]", err);
    res.status(500).json({ message: err.message || "Upload failed" });
  }
});

// ── GET / — list all actuals ─────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db.execute(sql`
      SELECT id, org_id, period_year, period_month, upload_source, file_name,
             status, total_revenue::float, total_expenses::float, net_income::float,
             ai_variance_notes, created_at
      FROM financial_actuals
      WHERE ${orgId ? sql`org_id = ${orgId}` : sql`1=1`}
      ORDER BY period_year DESC, period_month DESC
    `);
    res.json(rows.rows);
  } catch (err) {
    console.error("[pnl-actuals/list]", err);
    res.status(500).json({ message: "Failed to list actuals" });
  }
});

// ── GET /:id — single actual with lines ─────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [actual] = await db.select().from(financialActuals).where(eq(financialActuals.id, id));
    if (!actual) return res.status(404).json({ message: "Not found" });

    const lines = await db.select().from(financialActualLines)
      .where(eq(financialActualLines.actualId, id));

    res.json({ actual, lines });
  } catch (err) {
    console.error("[pnl-actuals/get]", err);
    res.status(500).json({ message: "Failed to load actual" });
  }
});

// ── PUT /:id/lines/:lineId — update line category ────────────────────────────
router.put("/:id/lines/:lineId", async (req, res) => {
  try {
    const { lineId } = req.params;
    const { forecastCategory, isRevenue } = req.body;
    await db.update(financialActualLines)
      .set({ forecastCategory, isRevenue })
      .where(eq(financialActualLines.id, lineId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[pnl-actuals/update-line]", err);
    res.status(500).json({ message: "Failed to update line" });
  }
});

// ── POST /:id/finalize — save mappings globally + mark finalized ─────────────
router.post("/:id/finalize", async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    const [actual] = await db.select().from(financialActuals).where(eq(financialActuals.id, id));
    if (!actual) return res.status(404).json({ message: "Not found" });

    const lines = await db.select().from(financialActualLines)
      .where(eq(financialActualLines.actualId, id));

    // Persist mapping rules for future uploads
    for (const line of lines) {
      if (!line.forecastCategory) continue;
      const normKey = line.rawAccountName.toLowerCase().trim();
      try {
        await db.execute(sql`
          INSERT INTO financial_actual_mapping (id, org_id, raw_account_name, forecast_category, is_revenue)
          VALUES (gen_random_uuid(), ${orgId}, ${normKey}, ${line.forecastCategory}, ${line.isRevenue})
          ON CONFLICT (org_id, raw_account_name)
          DO UPDATE SET forecast_category = EXCLUDED.forecast_category, is_revenue = EXCLUDED.is_revenue, updated_at = NOW()
        `);
      } catch (_) { /* skip constraint errors */ }
    }

    // Recompute totals
    const revenue = lines.filter(l => l.isRevenue).reduce((s, l) => s + parseFloat(String(l.rawAmount)), 0);
    const expenses = lines
      .filter(l => !l.isRevenue && l.forecastCategory !== "exclude" && l.forecastCategory != null)
      .reduce((s, l) => s + Math.abs(parseFloat(String(l.rawAmount))), 0);

    await db.update(financialActuals).set({
      status: "finalized",
      totalRevenue: String(revenue),
      totalExpenses: String(expenses),
      netIncome: String(revenue - expenses),
      updatedAt: new Date(),
    }).where(eq(financialActuals.id, id));

    res.json({ ok: true, totalRevenue: revenue, totalExpenses: expenses, netIncome: revenue - expenses });
  } catch (err) {
    console.error("[pnl-actuals/finalize]", err);
    res.status(500).json({ message: "Failed to finalize" });
  }
});

// ── GET /:id/variance — compare actuals vs forecast snapshot ─────────────────
router.get("/:id/variance", async (req, res) => {
  try {
    const { id } = req.params;
    const [actual] = await db.select().from(financialActuals).where(eq(financialActuals.id, id));
    if (!actual) return res.status(404).json({ message: "Not found" });

    const lines = await db.select().from(financialActualLines)
      .where(eq(financialActualLines.actualId, id));

    // Find the closest forecast snapshot for the same month
    const periodDate = `${actual.periodYear}-${String(actual.periodMonth).padStart(2, "0")}-01`;
    const snapRows = await db.execute(sql`
      SELECT
        revenue_forecast::float       AS revenue,
        labor_cost_forecast::float    AS labor,
        contractor_cost_forecast::float AS contractor,
        vendor_cost_forecast::float   AS vendor,
        claims_cost_forecast::float   AS claims,
        overhead_forecast::float      AS overhead,
        net_profit_forecast::float    AS net_profit,
        forecast_confidence,
        snapshot_date
      FROM forecast_snapshots
      WHERE period_month = ${periodDate}::date
      ORDER BY snapshot_date DESC
      LIMIT 1
    `);

    const snap = (snapRows.rows[0] as any) ?? null;

    // Aggregate actuals by forecast category
    const actualsByCategory: Record<string, number> = {};
    for (const line of lines) {
      if (!line.forecastCategory || line.forecastCategory === "exclude") continue;
      const key = line.forecastCategory;
      const amt = parseFloat(String(line.rawAmount));
      actualsByCategory[key] = (actualsByCategory[key] ?? 0) + (line.isRevenue ? amt : -Math.abs(amt));
    }

    const categories = [
      { key: "revenue", label: "Revenue", isRevenue: true },
      { key: "labor", label: "Labor (Employees)", isRevenue: false },
      { key: "contractor", label: "Contractor (IC Drivers)", isRevenue: false },
      { key: "vendor", label: "Vendor Costs", isRevenue: false },
      { key: "claims", label: "Claims Exposure", isRevenue: false },
      { key: "overhead", label: "Overhead", isRevenue: false },
    ];

    const rows = categories.map(cat => {
      const forecast = snap ? parseFloat(String((snap as any)[cat.key] ?? "0")) : null;
      const actual_amt = actualsByCategory[cat.key] ?? null;
      const variance = (forecast != null && actual_amt != null) ? actual_amt - forecast : null;
      const variancePct = (forecast != null && actual_amt != null && forecast !== 0)
        ? (variance! / Math.abs(forecast)) * 100
        : null;
      return { category: cat.key, label: cat.label, isRevenue: cat.isRevenue, forecast, actual: actual_amt, variance, variancePct };
    });

    const netForecast = snap?.net_profit ?? null;
    const netActual = (actualsByCategory["revenue"] ?? 0) +
      Object.entries(actualsByCategory).filter(([k]) => k !== "revenue").reduce((s, [, v]) => s + v, 0);
    const netVariance = netForecast != null ? netActual - parseFloat(String(netForecast)) : null;

    res.json({
      actual,
      snapshot: snap,
      rows,
      net: { forecast: netForecast, actual: netActual, variance: netVariance },
      unmappedLines: lines.filter(l => !l.forecastCategory || l.forecastCategory === "exclude").length,
    });
  } catch (err) {
    console.error("[pnl-actuals/variance]", err);
    res.status(500).json({ message: "Failed to compute variance" });
  }
});

// ── Helper: compute variance data for a given actual ────────────────────────
async function computeVariance(actualId: string, orgId: string | null) {
  const [actual] = await db.select().from(financialActuals).where(eq(financialActuals.id, actualId));
  if (!actual) return null;

  const lines = await db.select().from(financialActualLines)
    .where(eq(financialActualLines.actualId, actualId));

  const periodDate = `${actual.periodYear}-${String(actual.periodMonth).padStart(2, "0")}-01`;
  const snapRows = await db.execute(sql`
    SELECT revenue_forecast::float AS revenue, labor_cost_forecast::float AS labor,
           contractor_cost_forecast::float AS contractor, vendor_cost_forecast::float AS vendor,
           claims_cost_forecast::float AS claims, overhead_forecast::float AS overhead,
           net_profit_forecast::float AS net_profit, forecast_confidence, snapshot_date
    FROM forecast_snapshots WHERE period_month = ${periodDate}::date
    ORDER BY snapshot_date DESC LIMIT 1
  `);
  const snap = (snapRows.rows[0] as any) ?? null;

  const actualsByCategory: Record<string, number> = {};
  for (const line of lines) {
    if (!line.forecastCategory || line.forecastCategory === "exclude") continue;
    const amt = parseFloat(String(line.rawAmount));
    actualsByCategory[line.forecastCategory] = (actualsByCategory[line.forecastCategory] ?? 0) + (line.isRevenue ? amt : -Math.abs(amt));
  }

  const categories = [
    { key: "revenue", label: "Revenue", isRevenue: true },
    { key: "labor", label: "Labor", isRevenue: false },
    { key: "contractor", label: "Contractor", isRevenue: false },
    { key: "vendor", label: "Vendor", isRevenue: false },
    { key: "claims", label: "Claims", isRevenue: false },
    { key: "overhead", label: "Overhead", isRevenue: false },
  ];

  const rows = categories.map(cat => {
    const forecast = snap ? parseFloat(String((snap as any)[cat.key] ?? "0")) : null;
    const actual_amt = actualsByCategory[cat.key] ?? null;
    const variance = (forecast != null && actual_amt != null) ? actual_amt - forecast : null;
    const variancePct = (forecast != null && actual_amt != null && forecast !== 0)
      ? (variance! / Math.abs(forecast)) * 100 : null;
    return { category: cat.key, label: cat.label, isRevenue: cat.isRevenue, forecast, actual: actual_amt, variance, variancePct };
  });

  const netForecast = snap?.net_profit ?? null;
  const netActual = Object.values(actualsByCategory).reduce((s, v) => s + v, 0);
  const netVariance = netForecast != null ? netActual - parseFloat(String(netForecast)) : null;

  return { actual, snapshot: snap, rows, net: { forecast: netForecast, actual: netActual, variance: netVariance }, unmappedLines: lines.filter(l => !l.forecastCategory || l.forecastCategory === "exclude").length };
}

// ── POST /:id/ai-explain — AI explanation for major variances ────────────────
router.post("/:id/ai-explain", async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    const varianceData = await computeVariance(id, orgId);
    if (!varianceData?.rows) return res.status(400).json({ message: "No variance data available" });

    const period = `${varianceData.actual?.periodYear}-${String(varianceData.actual?.periodMonth).padStart(2, "0")}`;

    const majorVariances = varianceData.rows
      .filter((r: any) => r.variance != null && Math.abs(r.variancePct ?? 0) > 5)
      .map((r: any) => `- ${r.label}: Forecast $${Math.round(r.forecast ?? 0).toLocaleString()}, Actual $${Math.round(r.actual ?? 0).toLocaleString()}, Variance ${r.variancePct?.toFixed(1)}%`)
      .join("\n");

    if (!majorVariances) {
      const notes = "All categories are within 5% of forecast. Performance is tracking closely to plan.";
      await db.update(financialActuals).set({ aiVarianceNotes: notes, updatedAt: new Date() }).where(eq(financialActuals.id, id));
      return res.json({ notes });
    }

    const prompt = `You are a financial analyst reviewing a monthly P&L variance report for a transportation/logistics company.

Period: ${period}
Major Variances (>5% from forecast):
${majorVariances}

Net: Forecast $${Math.round(parseFloat(String(varianceData.net?.forecast ?? 0))).toLocaleString()}, Actual $${Math.round(varianceData.net?.actual ?? 0).toLocaleString()}, Variance $${Math.round(varianceData.net?.variance ?? 0).toLocaleString()}

Provide a concise (3-4 sentences) executive summary explaining:
1. Which variances are most significant and why they likely occurred in the transportation/logistics context
2. Whether overall performance is favorable or unfavorable vs plan
3. One actionable recommendation for the next period

Be direct and specific. No bullet points. Plain paragraph.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.4,
    });

    const notes = completion.choices[0]?.message?.content?.trim() ?? "Analysis unavailable.";
    await db.update(financialActuals).set({ aiVarianceNotes: notes, updatedAt: new Date() }).where(eq(financialActuals.id, id));
    res.json({ notes });
  } catch (err: any) {
    console.error("[pnl-actuals/ai-explain]", err);
    res.status(500).json({ message: err.message || "AI analysis failed" });
  }
});

// ── GET /mappings — list all global mapping rules ─────────────────────────────
router.get("/mappings/list", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db.select().from(financialActualMapping)
      .where(orgId ? eq(financialActualMapping.orgId, orgId) : sql`1=1`);
    res.json(rows);
  } catch (err) {
    console.error("[pnl-actuals/mappings]", err);
    res.status(500).json({ message: "Failed to load mappings" });
  }
});

export default router;
