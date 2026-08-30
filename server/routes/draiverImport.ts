import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import { db } from "../db";
import { sql, eq, desc, and, inArray } from "drizzle-orm";
import {
  draiverImportBatches,
  partnerDailyReportRaw,
  partnerMoveStaging,
  importExclusionRules,
  importStatusMappings,
} from "../../shared/schema";
import { isAuthenticated } from "../replitAuth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Column aliases ────────────────────────────────────────────────────────────
function normalizeRow(raw: Record<string, string>) {
  const g = (keys: string[]): string => {
    for (const k of keys) {
      const kNorm = k.toLowerCase().replace(/[\s_-]/g, "");
      const found = Object.keys(raw).find(
        rk => rk.toLowerCase().replace(/[\s_-]/g, "") === kNorm
      );
      if (found !== undefined && raw[found] !== undefined && raw[found] !== "") return raw[found];
    }
    return "";
  };
  return {
    itinerary_id:       g(["itinerary_id","itineraryid","itinerary","move_id","moveid"]),
    trip_id:            g(["trip_id","tripid","trip"]),
    account_id:         g(["account_id","accountid","client_id","clientid","customer_id","customerid"]),
    account_name:       g(["account_name","accountname","client_name","clientname","customer_name","customername","company"]),
    driver_id:          g(["driver_id","driverid"]),
    driver_email:       g(["driver_email","driveremail","email"]),
    driver_name:        g(["driver_name","drivername","driver"]),
    status:             g(["status","move_status","movestatus","trip_status","tripstatus","state"]),
    created_at:         g(["created_at","createdat","created_date","createddate","creation_date"]),
    // Draiver CSV uses start_at_itinerary / end_at_itinerary for actual timestamps
    pickup_at:          g(["start_at_itinerary","startatitinerary","pickup_at","pickupat","pickup_time","pickuptime","pickup_datetime","pickup_date"]),
    dropoff_at:         g(["end_at_itinerary","endatitinerary","dropoff_at","dropoffat","dropoff_time","dropofftime","dropoff_datetime","delivery_time","completed_at","completedat"]),
    last_modified_at:   g(["last_modified_at","lastmodifiedat","updated_at","updatedat","modified_at","modifiedat"]),
    start_address:      g(["start_address_itinerary","startaddressitinerary","start_address","startaddress","pickup_address","pickupaddress","origin","origin_address","from_address"]),
    start_lat:          g(["start_latitude_itinerary","start_lat","startlat","pickup_lat","pickuplat","origin_lat","originlat"]),
    start_lng:          g(["start_longitude_itinerary","start_lng","startlng","pickup_lng","pickuplng","origin_lng","originlng","start_lon","origin_lon"]),
    end_address:        g(["target_address_itinerary","targetaddressitinerary","end_address","endaddress","dropoff_address","dropoffaddress","destination","destination_address","to_address","delivery_address"]),
    end_lat:            g(["target_latitude_itinerary","end_lat","endlat","dropoff_lat","dropofflat","destination_lat"]),
    end_lng:            g(["target_longitude_itinerary","end_lng","endlng","dropoff_lng","dropofflng","destination_lng","destination_lon"]),
    // Draiver CSV uses unit_miles for actual distance; driving_time is decimal hours
    miles:              g(["unit_miles","unitmiles","miles","distance","distance_miles","total_miles","trip_miles"]),
    drive_time_minutes: g(["drive_time_minutes","drivetimeminutes","duration_minutes","duration","minutes"]),
    driving_time_hrs:   g(["driving_time","drivingtime"]),  // Draiver decimal-hours field
    cost:               g(["cost","total_cost","totalcost","charge","fare","amount"]),
    driver_payment:     g(["driver_payment","driverpayment","driver_pay","driver_payout","payout"]),
  };
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function stagingFingerprint(r: {
  sourceStatus?: string | null; mappedStatus?: string | null;
  matchedAccountId?: string | null; matchedDriverId?: string | null;
  pickupAt?: Date | string | null; dropoffAt?: Date | string | null;
  startAddress?: string | null; endAddress?: string | null;
  miles?: string | null; cost?: string | null; driverPayment?: string | null;
}): string {
  return [
    r.sourceStatus ?? "", r.mappedStatus ?? "",
    r.matchedAccountId ?? "", r.matchedDriverId ?? "",
    r.pickupAt  ? new Date(r.pickupAt  as string).toISOString() : "",
    r.dropoffAt ? new Date(r.dropoffAt as string).toISOString() : "",
    r.startAddress ?? "", r.endAddress ?? "",
    r.miles ?? "", r.cost ?? "", r.driverPayment ?? "",
  ].join("|");
}

// ── Helper: update a raw row with result metadata ─────────────────────────────
async function setRawResult(
  batchId: string, rowNum: number,
  opts: { resultType: string; errorMessage?: string; itineraryId?: string; sourceStatus?: string; mappedStatus?: string; excluded?: boolean }
) {
  await db.update(partnerDailyReportRaw).set({
    itineraryId:     opts.itineraryId     ?? null,
    sourceStatus:    opts.sourceStatus    ?? null,
    mappedStatus:    opts.mappedStatus    ?? null,
    resultType:      opts.resultType,
    errorMessage:    opts.errorMessage    ?? null,
    excludedFlag:    opts.excluded        ?? false,
    exclusionReason: opts.errorMessage    ?? null,
  }).where(sql`import_batch_id = ${batchId} AND row_number = ${rowNum}`);
}

// ── GET /api/draiver-import/status-mappings ───────────────────────────────────
router.get("/status-mappings", isAuthenticated, async (_req, res) => {
  try {
    const rows = await db.select().from(importStatusMappings)
      .orderBy(importStatusMappings.sourceSystem, importStatusMappings.sourceStatus);
    return res.json(rows);
  } catch (err: any) { return res.status(500).json({ error: err?.message }); }
});

// ── GET /api/draiver-import/exclusion-rules ───────────────────────────────────
router.get("/exclusion-rules", isAuthenticated, async (_req, res) => {
  try {
    const rules = await db.select().from(importExclusionRules).orderBy(importExclusionRules.createdAt);
    return res.json(rules);
  } catch (err: any) { return res.status(500).json({ error: err?.message }); }
});

// ── POST /api/draiver-import/upload ──────────────────────────────────────────
router.post("/upload", isAuthenticated, upload.single("file"), async (req, res) => {
  // Track batchId outside try so the catch block can mark it failed
  let batchId: string | null = null;

  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const user     = (req as any).user;
    const fileName = req.file.originalname;
    const csvText  = req.file.buffer.toString("utf-8");

    // Parse CSV
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true, skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return res.status(400).json({ error: "Failed to parse CSV", details: parsed.errors.slice(0, 5) });
    }
    const rawRows = parsed.data;

    // Load exclusion rules
    const exclusionRules = await db.select().from(importExclusionRules).where(eq(importExclusionRules.active, true));
    const excludedAccountIds   = new Map<string, string>();
    const excludedAccountNames = new Map<string, string>();
    for (const rule of exclusionRules) {
      if (rule.ruleType === "ACCOUNT_ID")   excludedAccountIds.set(rule.ruleValue.toLowerCase(), rule.reason);
      if (rule.ruleType === "ACCOUNT_NAME") excludedAccountNames.set(rule.ruleValue.toLowerCase().trim(), rule.reason);
    }

    // Load status mappings for DRAIVER (case-insensitive lookup by source_status)
    const statusMappingRows = await db.select().from(importStatusMappings)
      .where(and(eq(importStatusMappings.sourceSystem, "DRAIVER"), eq(importStatusMappings.isActive, true)));
    const statusMap = new Map<string, { mappedStatus: string; isTerminal: boolean }>();
    for (const m of statusMappingRows) {
      statusMap.set(m.sourceStatus.toLowerCase().trim(), {
        mappedStatus: m.mappedStatus,
        isTerminal:   m.isTerminal,
      });
    }

    // Create batch — batchId declared outside try so catch can mark it failed
    const importStartedAt = new Date();
    const [batch] = await db.insert(draiverImportBatches).values({
      fileName,
      uploadedByUserId: user?.id ?? null,
      processingStatus: "processing",
      totalRows:        rawRows.length,
      startedAt:        importStartedAt,
    }).returning();
    batchId = batch.id;

    // Intra-batch duplicate pre-scan
    const seenInBatch = new Map<string, number>();
    for (let i = 0; i < rawRows.length; i++) {
      const n = normalizeRow(rawRows[i]);
      if (n.itinerary_id && !seenInBatch.has(n.itinerary_id)) seenInBatch.set(n.itinerary_id, i + 1);
    }

    // Store raw rows (bulk insert)
    if (rawRows.length > 0) {
      await db.insert(partnerDailyReportRaw).values(
        rawRows.map((row, i) => ({
          importBatchId:   batchId,
          fileName,
          rowNumber:       i + 1,
          rawPayloadJson:  row as any,
          excludedFlag:    false,
          exclusionReason: null as string | null,
          resultType:      null as string | null,
        }))
      );
    }

    // Load account & driver lookup tables
    const accounts = await db.execute(sql`SELECT id, customer_name, tech_partner_account_id FROM customers WHERE is_deleted = false AND is_archived = false`);
    const drivers  = await db.execute(sql`SELECT d.id, u.email FROM drivers d LEFT JOIN users u ON u.id = d.user_id WHERE (d.status != 'inactive' OR d.status IS NULL) AND (d.is_deleted = false OR d.is_deleted IS NULL)`);

    const accountById   = new Map<string, { id: string; name: string }>();
    const accountByName = new Map<string, { id: string; name: string }>();
    for (const a of accounts.rows as any[]) {
      if (a.id)                      accountById.set(String(a.id).toLowerCase(), { id: a.id, name: a.customer_name ?? "" });
      if (a.customer_name)           accountByName.set(String(a.customer_name).toLowerCase().trim(), { id: a.id, name: a.customer_name ?? "" });
      // Primary match: Draiver's external account ID stored on the DriverHub account record
      if (a.tech_partner_account_id) accountById.set(String(a.tech_partner_account_id).toLowerCase().trim(), { id: a.id, name: a.customer_name ?? "" });
    }
    const driverById    = new Map<string, string>();
    const driverByEmail = new Map<string, string>();
    for (const d of drivers.rows as any[]) {
      if (d.id)    driverById.set(String(d.id).toLowerCase(), d.id);
      if (d.email) driverByEmail.set(String(d.email).toLowerCase().trim(), d.id);
    }

    // ── Bulk pre-fetch existing staging rows ─────────────────────────────────
    // Replaces N individual per-row SELECTs with a single IN-clause query.
    const allItineraryIds = rawRows
      .map(r => normalizeRow(r).itinerary_id)
      .filter(Boolean) as string[];
    const existingStagingRows = allItineraryIds.length > 0
      ? await db.select().from(partnerMoveStaging)
          .where(inArray(partnerMoveStaging.itineraryId, allItineraryIds))
      : [];
    const existingStagingMap = new Map<string, typeof existingStagingRows[0]>(
      existingStagingRows.map(s => [s.itineraryId, s])
    );

    // ── Process rows ─────────────────────────────────────────────────────────
    // DB writes are accumulated and flushed after the loop — reduces round-trips
    // from O(6N) individual awaits to O(N/100) bulk batches.
    let inserted = 0, updated = 0, noChange = 0, rejected = 0;
    let duplicates = 0, testAccount = 0, unmappedStatus = 0, unmatchedAccount = 0, unmatchedDriver = 0;
    const processedInRun = new Set<string>();

    type RawResultOpts = Parameters<typeof setRawResult>[2];
    const rawResultQueue: Array<{ rowNum: number; opts: RawResultOpts }> = [];
    const stagingInserts: any[] = [];
    const stagingUpdateOps: Array<{ itineraryId: string; payload: any }> = [];

    for (let i = 0; i < rawRows.length; i++) {
      const raw    = rawRows[i];
      const n      = normalizeRow(raw);
      const rowNum = i + 1;

      // Gate 1: Missing itinerary_id
      if (!n.itinerary_id) {
        rawResultQueue.push({ rowNum, opts: {
          resultType: "rejected", excluded: true,
          errorMessage: "Missing itinerary_id",
          sourceStatus: n.status || null,
        }});
        rejected++;
        continue;
      }

      // Gate 2: Exclusion rules
      const accountIdKey   = n.account_id?.toLowerCase() ?? "";
      const accountNameKey = n.account_name?.toLowerCase().trim() ?? "";
      let exclusionReason: string | null = null;
      if (accountIdKey   && excludedAccountIds.has(accountIdKey))   exclusionReason = `TEST_ACCOUNT: ${excludedAccountIds.get(accountIdKey)}`;
      if (!exclusionReason && accountNameKey && excludedAccountNames.has(accountNameKey)) exclusionReason = `TEST_ACCOUNT: ${excludedAccountNames.get(accountNameKey)}`;

      if (exclusionReason) {
        rawResultQueue.push({ rowNum, opts: {
          resultType: "test_account", excluded: true,
          errorMessage: exclusionReason, itineraryId: n.itinerary_id, sourceStatus: n.status || null,
        }});
        testAccount++;
        continue;
      }

      // Gate 3: Intra-batch duplicate
      if (processedInRun.has(n.itinerary_id)) {
        rawResultQueue.push({ rowNum, opts: {
          resultType: "duplicate", excluded: true,
          errorMessage: `Duplicate itinerary_id in file (first seen at row ${seenInBatch.get(n.itinerary_id) ?? "?"})`,
          itineraryId: n.itinerary_id, sourceStatus: n.status || null,
        }});
        duplicates++;
        continue;
      }
      processedInRun.add(n.itinerary_id);

      // Gate 4: Status mapping check
      const sourceStatusRaw = n.status || "";
      const statusKey       = sourceStatusRaw.toLowerCase().trim();
      const statusLookup    = statusKey ? statusMap.get(statusKey) : undefined;

      // If status is non-empty but not in mappings → reject as unmapped
      if (sourceStatusRaw && !statusLookup) {
        rawResultQueue.push({ rowNum, opts: {
          resultType: "unmapped_status", excluded: true,
          errorMessage: `Status "${sourceStatusRaw}" is not in the status mapping table`,
          itineraryId: n.itinerary_id, sourceStatus: sourceStatusRaw,
        }});
        unmappedStatus++;
        continue;
      }

      const resolvedMappedStatus = statusLookup?.mappedStatus ?? "unknown";

      // Account matching
      const errors: string[] = [];
      let matchedAccount: { id: string; name: string } | null = null;
      if (n.account_id)   matchedAccount = accountById.get(n.account_id.toLowerCase()) ?? null;
      if (!matchedAccount && n.account_name) matchedAccount = accountByName.get(n.account_name.toLowerCase().trim()) ?? null;

      if (!matchedAccount) {
        errors.push(`No account match: id="${n.account_id}" name="${n.account_name}"`);
        rawResultQueue.push({ rowNum, opts: {
          resultType: "unmatched_account", excluded: true,
          errorMessage: errors[0], itineraryId: n.itinerary_id,
          sourceStatus: sourceStatusRaw, mappedStatus: resolvedMappedStatus,
        }});
        unmatchedAccount++;
        continue;
      }

      // Driver matching
      let matchedDriverId: string | null = null;
      if (n.driver_id)    matchedDriverId = driverById.get(n.driver_id.toLowerCase()) ?? null;
      if (!matchedDriverId && n.driver_email) matchedDriverId = driverByEmail.get(n.driver_email.toLowerCase().trim()) ?? null;

      const hasDriverMatch = !!matchedDriverId;
      if (!hasDriverMatch) {
        errors.push(
          n.driver_name
            ? `No driver match (name only): "${n.driver_name}"`
            : `No driver match: id="${n.driver_id}" email="${n.driver_email}"`
        );
        // Do NOT increment unmatchedDriver here — we tally it at finalResultType below
        // to ensure counts align 1:1 with result_type stored in partner_daily_report_raw.
      }

      // Build staging payload
      const createdAt  = parseDate(n.created_at);
      const pickupAt   = parseDate(n.pickup_at);
      const dropoffAt  = parseDate(n.dropoff_at);
      const modifiedAt = parseDate(n.last_modified_at);

      // Drive time: prefer explicit minutes field, then convert Draiver decimal-hours field,
      // finally compute from start/end timestamps.
      let driveMin: number | null = null;
      if (n.drive_time_minutes) {
        const v = parseFloat(n.drive_time_minutes);
        if (!isNaN(v) && v > 0) driveMin = Math.round(v);
      }
      if (driveMin === null && n.driving_time_hrs) {
        const v = parseFloat(n.driving_time_hrs);
        if (!isNaN(v) && v > 0) driveMin = Math.round(v * 60);
      }
      if (driveMin === null && pickupAt && dropoffAt && dropoffAt > pickupAt) {
        driveMin = Math.round((dropoffAt.getTime() - pickupAt.getTime()) / 60000);
      }
      // Sanity bound: ignore values > 12 hours (720 min) or negative
      if (driveMin !== null && (driveMin <= 0 || driveMin > 720)) driveMin = null;

      // Miles: sanity-bound to 0–500 range
      const milesRaw = n.miles || null;
      const milesFloat = milesRaw ? parseFloat(milesRaw) : NaN;
      const sanitizedMiles = !isNaN(milesFloat) && milesFloat >= 0 && milesFloat <= 500
        ? milesRaw : null;

      const stagingPayload = {
        importBatchId:     batchId,
        sourceSystem:      "DRAIVER" as const,
        itineraryId:       n.itinerary_id,
        tripId:            n.trip_id      || null,
        sourceAccountId:   n.account_id   || null,
        sourceAccountName: n.account_name || null,
        matchedAccountId:  matchedAccount.id,
        sourceDriverId:    n.driver_id    || null,
        sourceDriverEmail: n.driver_email || null,
        sourceDriverName:  n.driver_name  || null,
        matchedDriverId,
        sourceStatus:      sourceStatusRaw || null,
        mappedStatus:      resolvedMappedStatus,
        moveCreatedAt:     createdAt,
        pickupAt,
        dropoffAt,
        lastModifiedAt:    modifiedAt,
        startAddress:      n.start_address || null,
        startLat:          n.start_lat     || null,
        startLng:          n.start_lng     || null,
        endAddress:        n.end_address   || null,
        endLat:            n.end_lat       || null,
        endLng:            n.end_lng       || null,
        miles:             sanitizedMiles,
        driveTimeMinutes:  driveMin,
        cost:              n.cost          || null,
        driverPayment:     n.driver_payment || null,
        validationStatus:  errors.length > 0 ? "warning" : "valid",
        validationErrors:  errors.length > 0 ? errors as any : null,
        updatedAt:         new Date(),
      };

      // Idempotent upsert — use pre-fetched map instead of per-row SELECT
      const existingRow = existingStagingMap.get(n.itinerary_id);

      let finalResultType: string;
      if (!existingRow) {
        stagingInserts.push(stagingPayload);
        finalResultType = hasDriverMatch ? "inserted" : "unmatched_driver";
      } else {
        const incomingFp = stagingFingerprint(stagingPayload);
        const existingFp = stagingFingerprint(existingRow);
        if (incomingFp === existingFp && stagingPayload.validationStatus === existingRow.validationStatus) {
          stagingUpdateOps.push({
            itineraryId: n.itinerary_id,
            payload: { importBatchId: batchId, updatedAt: new Date() },
          });
          finalResultType = "no_change";
        } else {
          stagingUpdateOps.push({ itineraryId: n.itinerary_id, payload: stagingPayload });
          finalResultType = hasDriverMatch ? "updated" : "unmatched_driver";
        }
      }

      // Tally counters from finalResultType so batch summary always reconciles
      // 1:1 with result_type stored in partner_daily_report_raw.
      if      (finalResultType === "inserted")          inserted++;
      else if (finalResultType === "updated")           updated++;
      else if (finalResultType === "no_change")         noChange++;
      else if (finalResultType === "unmatched_driver")  unmatchedDriver++;

      rawResultQueue.push({ rowNum, opts: {
        resultType:    finalResultType,
        itineraryId:   n.itinerary_id,
        sourceStatus:  sourceStatusRaw,
        mappedStatus:  resolvedMappedStatus,
        errorMessage:  errors.length > 0 ? errors.join("; ") : undefined,
      }});
    }

    // ── Flush accumulated writes ──────────────────────────────────────────────
    // 1. Bulk-insert all new staging rows in a single statement
    if (stagingInserts.length > 0) {
      await db.insert(partnerMoveStaging).values(stagingInserts);
    }
    // 2. Apply staging updates in parallel chunks of 50
    for (let i = 0; i < stagingUpdateOps.length; i += 50) {
      await Promise.all(
        stagingUpdateOps.slice(i, i + 50).map(u =>
          db.update(partnerMoveStaging)
            .set(u.payload)
            .where(eq(partnerMoveStaging.itineraryId, u.itineraryId))
        )
      );
    }
    // 3. Flush raw-result metadata in parallel chunks of 100
    for (let i = 0; i < rawResultQueue.length; i += 100) {
      await Promise.all(
        rawResultQueue.slice(i, i + 100).map(({ rowNum, opts }) =>
          setRawResult(batchId!, rowNum, opts)
        )
      );
    }

    // ── Finalize batch ────────────────────────────────────────────────────────
    const processingDurationMs = Date.now() - importStartedAt.getTime();
    await db.update(draiverImportBatches).set({
      processingStatus:     "completed",
      processingDurationMs,
      insertedRows:         inserted,
      updatedRows:          updated,
      noChangeRows:         noChange,
      rejectedRows:         rejected,
      duplicateRows:        duplicates,
      testAccountRows:      testAccount,
      unmappedStatusRows:   unmappedStatus,
      unmatchedAccountRows: unmatchedAccount,
      unmatchedDriverRows:  unmatchedDriver,
    }).where(eq(draiverImportBatches.id, batchId));

    return res.json({
      batchId,
      fileName,
      total:            rawRows.length,
      inserted,
      updated,
      noChange,
      rejected,
      duplicates,
      testAccount,
      unmappedStatus,
      unmatchedAccount,
      unmatchedDriver,
    });
  } catch (err: any) {
    console.error("[draiverImport] upload error:", err);
    // Always transition batch to failed so it never stays stuck in processing
    if (batchId) {
      try {
        await db.update(draiverImportBatches)
          .set({ processingStatus: "failed", notes: err?.message ?? "Unexpected error" })
          .where(eq(draiverImportBatches.id, batchId));
      } catch (updateErr: any) {
        console.error("[draiverImport] Failed to mark batch as failed:", updateErr?.message);
      }
    }
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
});

// ── GET /api/draiver-import/driver-stats ──────────────────────────────────────
// Per-driver Draiver staging KPI stats for the Driver Detail widget strip.
// ?driverId=xxx  window=this_week (Mon–Sun, default) | last_7_days | last_30_days
router.get("/driver-stats", isAuthenticated, async (req, res) => {
  try {
    const { driverId, window: win = "this_week" } = req.query as Record<string, string>;
    if (!driverId) return res.status(400).json({ error: "driverId required" });

    // Run stats query — use ((result).rows ?? result)[0] to safely handle both
    // QueryResult-style (neon http) and array-style (neon ws) db.execute returns.
    // Each window branch is a complete sql template to avoid empty-fragment issues.
    let statsResult: any;
    // Helper macros embedded in each query:
    //   valid_miles: unit_miles BETWEEN 0–500 (sanity-bounded; rules out bad CSV data)
    //   drive_time: drive_time_minutes > 0 (zero means no data, not an instant move)
    if (win === "last_7_days") {
      statsResult = await db.execute(sql`
        SELECT
          COUNT(*)::int AS moves_total,
          COUNT(*) FILTER (WHERE mapped_status = 'completed')::int AS moves_completed,
          COUNT(*) FILTER (WHERE mapped_status = 'cancelled')::int AS moves_cancelled,
          COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS exception_count,
          COALESCE(SUM(CASE WHEN mapped_status = 'completed'
            AND NULLIF(TRIM(miles),'')::float BETWEEN 0 AND 500
            THEN NULLIF(TRIM(miles),'')::float END), 0)::float AS miles_total,
          COALESCE(SUM(CASE WHEN mapped_status = 'completed' AND drive_time_minutes > 0
            THEN drive_time_minutes END), 0)::int AS drive_time_minutes,
          COALESCE(AVG(CASE WHEN mapped_status = 'completed' AND drive_time_minutes > 0
            THEN drive_time_minutes END), 0)::float AS avg_drive_time_minutes,
          COALESCE(AVG(CASE WHEN mapped_status = 'completed'
            AND NULLIF(TRIM(miles),'')::float BETWEEN 0 AND 500
            THEN NULLIF(TRIM(miles),'')::float END), 0)::float AS avg_miles
        FROM partner_move_staging
        WHERE matched_driver_id = ${driverId}
          AND source_system = 'DRAIVER'
          AND COALESCE(pickup_at, move_created_at) >= now() - interval '7 days'
      `);
    } else if (win === "last_30_days") {
      statsResult = await db.execute(sql`
        SELECT
          COUNT(*)::int AS moves_total,
          COUNT(*) FILTER (WHERE mapped_status = 'completed')::int AS moves_completed,
          COUNT(*) FILTER (WHERE mapped_status = 'cancelled')::int AS moves_cancelled,
          COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS exception_count,
          COALESCE(SUM(CASE WHEN mapped_status = 'completed'
            AND NULLIF(TRIM(miles),'')::float BETWEEN 0 AND 500
            THEN NULLIF(TRIM(miles),'')::float END), 0)::float AS miles_total,
          COALESCE(SUM(CASE WHEN mapped_status = 'completed' AND drive_time_minutes > 0
            THEN drive_time_minutes END), 0)::int AS drive_time_minutes,
          COALESCE(AVG(CASE WHEN mapped_status = 'completed' AND drive_time_minutes > 0
            THEN drive_time_minutes END), 0)::float AS avg_drive_time_minutes,
          COALESCE(AVG(CASE WHEN mapped_status = 'completed'
            AND NULLIF(TRIM(miles),'')::float BETWEEN 0 AND 500
            THEN NULLIF(TRIM(miles),'')::float END), 0)::float AS avg_miles
        FROM partner_move_staging
        WHERE matched_driver_id = ${driverId}
          AND source_system = 'DRAIVER'
          AND COALESCE(pickup_at, move_created_at) >= now() - interval '30 days'
      `);
    } else if (win === "this_week") {
      statsResult = await db.execute(sql`
        SELECT
          COUNT(*)::int AS moves_total,
          COUNT(*) FILTER (WHERE mapped_status = 'completed')::int AS moves_completed,
          COUNT(*) FILTER (WHERE mapped_status = 'cancelled')::int AS moves_cancelled,
          COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS exception_count,
          COALESCE(SUM(CASE WHEN mapped_status = 'completed'
            AND NULLIF(TRIM(miles),'')::float BETWEEN 0 AND 500
            THEN NULLIF(TRIM(miles),'')::float END), 0)::float AS miles_total,
          COALESCE(SUM(CASE WHEN mapped_status = 'completed' AND drive_time_minutes > 0
            THEN drive_time_minutes END), 0)::int AS drive_time_minutes,
          COALESCE(AVG(CASE WHEN mapped_status = 'completed' AND drive_time_minutes > 0
            THEN drive_time_minutes END), 0)::float AS avg_drive_time_minutes,
          COALESCE(AVG(CASE WHEN mapped_status = 'completed'
            AND NULLIF(TRIM(miles),'')::float BETWEEN 0 AND 500
            THEN NULLIF(TRIM(miles),'')::float END), 0)::float AS avg_miles
        FROM partner_move_staging
        WHERE matched_driver_id = ${driverId}
          AND source_system = 'DRAIVER'
          AND move_created_at >= date_trunc('week', now())
          AND move_created_at <  date_trunc('week', now()) + interval '7 days'
      `);
    } else {
      // all_time — no date clause; covers all historical data
      statsResult = await db.execute(sql`
        SELECT
          COUNT(*)::int AS moves_total,
          COUNT(*) FILTER (WHERE mapped_status = 'completed')::int AS moves_completed,
          COUNT(*) FILTER (WHERE mapped_status = 'cancelled')::int AS moves_cancelled,
          COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS exception_count,
          COALESCE(SUM(CASE WHEN mapped_status = 'completed'
            AND NULLIF(TRIM(miles),'')::float BETWEEN 0 AND 500
            THEN NULLIF(TRIM(miles),'')::float END), 0)::float AS miles_total,
          COALESCE(SUM(CASE WHEN mapped_status = 'completed' AND drive_time_minutes > 0
            THEN drive_time_minutes END), 0)::int AS drive_time_minutes,
          COALESCE(AVG(CASE WHEN mapped_status = 'completed' AND drive_time_minutes > 0
            THEN drive_time_minutes END), 0)::float AS avg_drive_time_minutes,
          COALESCE(AVG(CASE WHEN mapped_status = 'completed'
            AND NULLIF(TRIM(miles),'')::float BETWEEN 0 AND 500
            THEN NULLIF(TRIM(miles),'')::float END), 0)::float AS avg_miles
        FROM partner_move_staging
        WHERE matched_driver_id = ${driverId}
          AND source_system = 'DRAIVER'
      `);
    }

    const row = ((statsResult as any).rows ?? statsResult)[0] as any;

    const movesTotal           = row?.moves_total            ?? 0;
    const movesCompleted       = row?.moves_completed        ?? 0;
    const movesCancelled       = row?.moves_cancelled        ?? 0;
    const exceptionCount       = row?.exception_count        ?? 0;
    const milesTotal           = parseFloat(row?.miles_total ?? 0);
    const driveTimeMin         = row?.drive_time_minutes     ?? 0;
    const avgDriveTimeMinutes  = parseFloat(row?.avg_drive_time_minutes ?? 0) || null;
    const avgMiles             = parseFloat(row?.avg_miles   ?? 0) || null;
    const completionRate       = movesTotal > 0 ? Math.round((movesCompleted / movesTotal) * 100) : null;

    const windowLabel = win === "last_7_days" ? "Last 7 Days"
      : win === "last_30_days" ? "Last 30 Days"
      : win === "this_week" ? "This Week"
      : "All Time";

    console.info(`[Draiver driver-stats] driver=${driverId} window=${win} movesTotal=${movesTotal} completed=${movesCompleted} avgDriveMin=${avgDriveTimeMinutes} avgMiles=${avgMiles}`);

    return res.json({
      movesTotal,
      movesCompleted,
      movesCancelled,
      exceptionCount,
      milesTotal,
      driveTimeMinutes: driveTimeMin,
      avgDriveTimeMinutes,
      avgMiles,
      completionRate,
      windowLabel,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Helper: build a continuous ISO-date array for the last N days ─────────────
function buildDateSeries(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
  }
  return dates;
}

// ── GET /api/draiver-import/driver-performance ───────────────────────────────
// Real driver-level performance aggregates for the Driver Dashboard. This stays
// on the same source model as the individual Draiver trend endpoints, avoiding
// a dependence on the retired storage-layer aggregate methods.
router.get("/driver-performance", isAuthenticated, async (req, res) => {
  try {
    const driverId = req.query.driverId as string | undefined;
    if (!driverId) return res.status(400).json({ error: "driverId required" });

    const result = await db.execute(sql`
      WITH scoped_moves AS (
        SELECT
          mapped_status,
          validation_status,
          move_created_at,
          drive_time_minutes,
          CASE
            WHEN miles ~ '^[0-9]+(\\.[0-9]+)?$' THEN miles::numeric
            ELSE NULL
          END AS numeric_miles
        FROM partner_move_staging
        WHERE matched_driver_id = ${driverId}
          AND source_system = 'DRAIVER'
      ),
      all_time AS (
        SELECT
          COUNT(*)::int AS moves_total,
          COUNT(*) FILTER (WHERE mapped_status = 'completed')::int AS moves_completed,
          COUNT(*) FILTER (WHERE mapped_status = 'cancelled')::int AS moves_cancelled,
          COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS exception_count,
          COALESCE(SUM(numeric_miles) FILTER (WHERE mapped_status = 'completed'), 0)::float AS miles_total,
          COALESCE(SUM(drive_time_minutes) FILTER (WHERE mapped_status = 'completed'), 0)::int AS drive_time_minutes,
          AVG(drive_time_minutes) FILTER (WHERE mapped_status = 'completed' AND drive_time_minutes > 0)::float AS avg_drive_time_minutes,
          AVG(numeric_miles) FILTER (WHERE mapped_status = 'completed' AND numeric_miles >= 0 AND numeric_miles <= 500)::float AS avg_miles
        FROM scoped_moves
      ),
      this_week AS (
        SELECT
          COUNT(*)::int AS moves_total,
          COUNT(*) FILTER (WHERE mapped_status = 'completed')::int AS moves_completed,
          COUNT(*) FILTER (WHERE mapped_status = 'cancelled')::int AS moves_cancelled,
          COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS exception_count,
          COALESCE(SUM(numeric_miles) FILTER (WHERE mapped_status = 'completed'), 0)::float AS miles_total,
          COALESCE(SUM(drive_time_minutes) FILTER (WHERE mapped_status = 'completed'), 0)::int AS drive_time_minutes,
          AVG(drive_time_minutes) FILTER (WHERE mapped_status = 'completed' AND drive_time_minutes > 0)::float AS avg_drive_time_minutes,
          AVG(numeric_miles) FILTER (WHERE mapped_status = 'completed' AND numeric_miles >= 0 AND numeric_miles <= 500)::float AS avg_miles
        FROM scoped_moves
        WHERE move_created_at >= date_trunc('week', NOW())
      )
      SELECT
        (SELECT row_to_json(all_time) FROM all_time) AS all_time,
        (SELECT row_to_json(this_week) FROM this_week) AS this_week
    `);
    const row = ((result as any).rows ?? result)[0] as any;
    return res.json({
      allTime: row?.all_time ?? {},
      thisWeek: row?.this_week ?? {},
    });
  } catch (err: any) {
    console.error("[driver-performance] error:", err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/draiver-import/moves-since-incident ─────────────────────────────
// Returns completed move count since the driver's most recent claim/incident,
// plus the date of that incident and total lifetime completed moves.
// Response: { movesSince, totalMovesAllTime, hasIncidents, incidentCount, lastIncidentDate }
router.get("/moves-since-incident", isAuthenticated, async (req, res) => {
  try {
    const { driverId } = req.query as Record<string, string>;
    if (!driverId) return res.status(400).json({ error: "driverId required" });

    // Last incident date + count across all claims for this driver
    const incidentResult = await db.execute(sql`
      SELECT
        MAX(COALESCE(incident_date, accident_date)) AS last_incident_date,
        COUNT(*)::int                               AS incident_count
      FROM accidents
      WHERE driver_id = ${driverId}
    `);
    const incRow = ((incidentResult as any).rows ?? incidentResult)[0] as any;
    const lastIncidentDate: Date | null = incRow?.last_incident_date ?? null;
    const incidentCount = parseInt(incRow?.incident_count ?? "0", 10);
    const hasIncidents  = incidentCount > 0;

    // Total lifetime completed moves from Draiver staging
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM partner_move_staging
      WHERE matched_driver_id = ${driverId}
        AND source_system    = 'DRAIVER'
        AND mapped_status    = 'completed'
    `);
    const totalRow = ((totalResult as any).rows ?? totalResult)[0] as any;
    const totalMovesAllTime = parseInt(totalRow?.total ?? "0", 10);

    // Completed moves AFTER the last incident date (or all-time if no incidents)
    let movesSince = totalMovesAllTime;
    if (hasIncidents && lastIncidentDate) {
      const sinceResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM partner_move_staging
        WHERE matched_driver_id = ${driverId}
          AND source_system    = 'DRAIVER'
          AND mapped_status    = 'completed'
          AND COALESCE(pickup_at, move_created_at) > ${lastIncidentDate}
      `);
      const sinceRow = ((sinceResult as any).rows ?? sinceResult)[0] as any;
      movesSince = parseInt(sinceRow?.total ?? "0", 10);
    }

    return res.json({
      movesSince,
      totalMovesAllTime,
      hasIncidents,
      incidentCount,
      lastIncidentDate: lastIncidentDate ? (lastIncidentDate as Date).toISOString() : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/draiver-import/move-trend ───────────────────────────────────────
// Returns daily completed-move counts for a driver over the last N days (default 30).
// Fills in missing days with 0 so the chart has a continuous timeline.
// Response: { days: number, rows: { date: string, moves: number }[] }
router.get("/move-trend", isAuthenticated, async (req, res) => {
  try {
    const driverId = req.query.driverId as string | undefined;
    const days = Math.min(Math.max(parseInt((req.query.days as string) || "30", 10), 7), 90);
    if (!driverId) return res.status(400).json({ error: "driverId required" });

    const result = await db.execute(sql`
      SELECT
        DATE_TRUNC('day', move_created_at AT TIME ZONE 'UTC')::date AS move_date,
        COUNT(*)::int AS moves
      FROM partner_move_staging
      WHERE matched_driver_id = ${driverId}
        AND source_system = 'DRAIVER'
        AND mapped_status = 'completed'
        AND move_created_at >= (NOW() AT TIME ZONE 'UTC') - (${days} || ' days')::interval
      GROUP BY DATE_TRUNC('day', move_created_at AT TIME ZONE 'UTC')
      ORDER BY move_date
    `);
    const rawRows = (result.rows ?? result) as { move_date: string; moves: number }[];
    console.info(`[move-trend] driver=${driverId} days=${days} db_rows=${rawRows.length}`);

    // Build a full date series and merge in real data (0 for days with no moves)
    const byDate = new Map<string, number>();
    for (const r of rawRows) {
      const d = String(r.move_date).slice(0, 10); // normalise to YYYY-MM-DD
      byDate.set(d, Number(r.moves));
    }
    const rows = buildDateSeries(days).map(date => ({ date, moves: byDate.get(date) ?? 0 }));

    return res.json({ days, rows });
  } catch (err: any) {
    console.error("[move-trend] error:", err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/draiver-import/wiw-hours-trend ───────────────────────────────────
// Returns daily worked-hours for a driver over the last N days (default 14) from WIW.
// Fills in missing days with 0 so the chart has a continuous timeline.
// Response: { days: number, rows: { date: string, hours: number }[] }
router.get("/wiw-hours-trend", isAuthenticated, async (req, res) => {
  try {
    const driverId = req.query.driverId as string | undefined;
    const days = Math.min(Math.max(parseInt((req.query.days as string) || "14", 10), 7), 90);
    if (!driverId) return res.status(400).json({ error: "driverId required" });

    const result = await db.execute(sql`
      SELECT
        DATE_TRUNC('day', wt.clock_in AT TIME ZONE 'UTC')::date AS work_date,
        ROUND(SUM(wt.total_minutes)::numeric / 60, 2)::float AS hours
      FROM wiw_times wt
      JOIN wiw_users wu ON wu.id = wt.wiw_user_id
      WHERE wu.driver_id = ${driverId}
        AND wt.clock_in IS NOT NULL
        AND wt.total_minutes IS NOT NULL
        AND wt.total_minutes > 0
        AND wt.clock_in >= (NOW() AT TIME ZONE 'UTC') - (${days} || ' days')::interval
      GROUP BY DATE_TRUNC('day', wt.clock_in AT TIME ZONE 'UTC')
      ORDER BY work_date
    `);
    const rawRows = (result.rows ?? result) as { work_date: string; hours: number }[];
    console.info(`[wiw-hours-trend] driver=${driverId} days=${days} db_rows=${rawRows.length}`);

    // Build a full date series — 0 for days with no clocked time
    const byDate = new Map<string, number>();
    for (const r of rawRows) {
      const d = String(r.work_date).slice(0, 10);
      byDate.set(d, Number(r.hours));
    }
    const rows = buildDateSeries(days).map(date => ({ date, hours: byDate.get(date) ?? 0 }));

    return res.json({ days, rows });
  } catch (err: any) {
    console.error("[wiw-hours-trend] error:", err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// ── Exported helper: mark stale Draiver processing batches as abandoned ───────
export async function recoverStaleDraiverBatches() {
  try {
    const result = await db.execute(sql`
      UPDATE draiver_import_batches
      SET processing_status = 'abandoned',
          notes = 'Marked abandoned by startup recovery — was stuck in processing'
      WHERE processing_status = 'processing'
        AND uploaded_at < NOW() - INTERVAL '15 minutes'
      RETURNING id
    `);
    const count = result.rows?.length ?? 0;
    if (count > 0) {
      console.warn(`[DraiverRecovery] Marked ${count} stale processing batch(es) as abandoned`);
    } else {
      console.log("[DraiverRecovery] No stale Draiver batches found");
    }
    return count;
  } catch (err: any) {
    console.warn("[DraiverRecovery] Could not recover stale batches:", err?.message);
    return 0;
  }
}

// ── GET /api/draiver-import/batches ──────────────────────────────────────────
router.get("/batches", isAuthenticated, async (_req, res) => {
  try {
    const rows = await db.select().from(draiverImportBatches)
      .orderBy(desc(draiverImportBatches.uploadedAt)).limit(100);
    return res.json(rows);
  } catch (err: any) { return res.status(500).json({ error: err?.message }); }
});

// ── GET /api/draiver-import/batches/:id ──────────────────────────────────────
router.get("/batches/:id", isAuthenticated, async (req, res) => {
  try {
    const [batch] = await db.select().from(draiverImportBatches)
      .where(eq(draiverImportBatches.id, req.params.id));
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    return res.json(batch);
  } catch (err: any) { return res.status(500).json({ error: err?.message }); }
});

// ── GET /api/draiver-import/batches/:id/rows ─────────────────────────────────
// Unified view: raw row metadata + staging join for account/driver names.
// result_type filter: all | inserted | updated | no_change | unmatched_account |
//   unmatched_driver | unmapped_status | test_account | rejected | duplicate
router.get("/batches/:id/rows", isAuthenticated, async (req, res) => {
  try {
    const { resultType = "all", page = "1", pageSize = "50" } = req.query as Record<string, string>;
    const limit  = Math.min(parseInt(pageSize) || 50, 200);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    // Diagnostic log so tile-filter mismatches can be caught in server logs
    console.log(`[draiverImport] rows query batchId=${req.params.id} resultType=${resultType} page=${page} limit=${limit} offset=${offset}`);

    const rtClause = (resultType && resultType !== "all")
      ? sql` AND r.result_type = ${resultType}` : sql``;

    const cntResult = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM partner_daily_report_raw r
      WHERE r.import_batch_id = ${req.params.id}${rtClause}
    `);
    const { cnt } = (((cntResult as any).rows ?? cntResult)[0] ?? {}) as { cnt?: string };

    console.log(`[draiverImport] rows query → total matching rows: ${cnt}`);

    const rows = await db.execute(sql`
      SELECT
        r.row_number,
        r.itinerary_id,
        r.source_status,
        r.mapped_status,
        r.result_type,
        r.error_message,
        s.trip_id,
        COALESCE(c.customer_name, s.source_account_name, r.raw_payload_json->>'account_name', r.raw_payload_json->>'account_id') AS account_display,
        s.matched_account_id,
        COALESCE(s.source_driver_name, s.source_driver_email, r.raw_payload_json->>'driver_name') AS driver_display,
        s.matched_driver_id
      FROM partner_daily_report_raw r
      LEFT JOIN partner_move_staging s
        ON s.itinerary_id = r.itinerary_id AND s.source_system = 'DRAIVER'
      LEFT JOIN customers c ON c.id = s.matched_account_id
      WHERE r.import_batch_id = ${req.params.id}${rtClause}
      ORDER BY r.row_number
      LIMIT ${limit} OFFSET ${offset}
    `);

    return res.json({ rows: rows.rows, total: parseInt(cnt ?? "0"), page: parseInt(page), pageSize: limit });
  } catch (err: any) { return res.status(500).json({ error: err?.message }); }
});

// ── GET /api/draiver-import/batches/:id/staging (kept for compat) ─────────────
router.get("/batches/:id/staging", isAuthenticated, async (req, res) => {
  try {
    const { status, page = "1", pageSize = "50" } = req.query as Record<string, string>;
    const limit  = Math.min(parseInt(pageSize) || 50, 200);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;
    const statusClause = (status && status !== "all") ? sql` AND validation_status = ${status}` : sql``;

    const stagingCntResult = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM partner_move_staging WHERE import_batch_id = ${req.params.id}${statusClause}`
    );
    const { cnt: stagingCnt } = (((stagingCntResult as any).rows ?? stagingCntResult)[0] ?? {}) as { cnt?: string };
    const rows = await db.execute(
      sql`SELECT * FROM partner_move_staging WHERE import_batch_id = ${req.params.id}${statusClause}
          ORDER BY itinerary_id LIMIT ${limit} OFFSET ${offset}`
    );
    return res.json({ rows: rows.rows, total: parseInt(stagingCnt ?? "0"), page: parseInt(page), pageSize: limit });
  } catch (err: any) { return res.status(500).json({ error: err?.message }); }
});

// ── GET /api/draiver-import/batches/:id/raw (kept for compat) ─────────────────
router.get("/batches/:id/raw", isAuthenticated, async (req, res) => {
  try {
    const { page = "1", pageSize = "50" } = req.query as Record<string, string>;
    const limit  = Math.min(parseInt(pageSize) || 50, 200);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    const rawCntResult = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM partner_daily_report_raw WHERE import_batch_id = ${req.params.id} AND excluded_flag = true`
    );
    const { cnt: rawCnt } = (((rawCntResult as any).rows ?? rawCntResult)[0] ?? {}) as { cnt?: string };
    const rows = await db.execute(
      sql`SELECT row_number, exclusion_reason, raw_payload_json
          FROM partner_daily_report_raw WHERE import_batch_id = ${req.params.id} AND excluded_flag = true
          ORDER BY row_number LIMIT ${limit} OFFSET ${offset}`
    );
    return res.json({ rows: rows.rows, total: parseInt(rawCnt ?? "0"), page: parseInt(page), pageSize: limit });
  } catch (err: any) { return res.status(500).json({ error: err?.message }); }
});

// ── GET /api/draiver-import/account-stats ─────────────────────────────────────
// Per-account Draiver move intelligence stats for the Account Detail dashboard.
// ?accountId=xxx  window=30 | 60 | 90 (days, default 30)
// Uses move_created_at (not pickup_at) as the canonical date for filtering.
router.get("/account-stats", isAuthenticated, async (req, res) => {
  try {
    const { accountId, window: win = "30" } = req.query as Record<string, string>;
    if (!accountId) return res.status(400).json({ error: "accountId required" });

    const days = win === "60" ? 60 : win === "90" ? 90 : 30;
    const intervalStr = `${days} days`;

    // ── Core aggregate stats ───────────────────────────────────────────────────
    const statsResult = await db.execute(sql`
      SELECT
        -- volume in the selected window
        COUNT(*) FILTER (WHERE move_created_at >= NOW() - CAST(${intervalStr} AS INTERVAL))::int                                                          AS vol_window,
        COUNT(*) FILTER (WHERE move_created_at >= NOW() - CAST(${intervalStr} AS INTERVAL) * 2
                           AND move_created_at <  NOW() - CAST(${intervalStr} AS INTERVAL))::int                                                          AS vol_prev_window,
        -- completed / exception in window
        COUNT(*) FILTER (WHERE move_created_at >= NOW() - CAST(${intervalStr} AS INTERVAL)
                           AND mapped_status = 'completed')::int                                                                                           AS completed_window,
        COUNT(*) FILTER (WHERE move_created_at >= NOW() - CAST(${intervalStr} AS INTERVAL)
                           AND validation_status = 'warning')::int                                                                                         AS exceptions_window,
        -- this week (Mon–Sun)
        COUNT(*) FILTER (WHERE move_created_at >= DATE_TRUNC('week', NOW())
                           AND mapped_status = 'completed')::int                                                                                           AS moves_this_week,
        -- this calendar month
        COUNT(*) FILTER (WHERE move_created_at >= DATE_TRUNC('month', NOW())
                           AND mapped_status = 'completed')::int                                                                                           AS moves_this_month,
        -- last completed move date
        MAX(CASE WHEN mapped_status = 'completed' THEN move_created_at END)                                                                                AS last_move_date,
        -- unique drivers in window
        COUNT(DISTINCT CASE WHEN move_created_at >= NOW() - CAST(${intervalStr} AS INTERVAL) THEN matched_driver_id END)::int                             AS unique_drivers,
        -- all-time unique drivers (for utilization denominator)
        COUNT(DISTINCT matched_driver_id)::int                                                                                                              AS total_drivers_ever,
        -- all-time totals for context
        COUNT(*)::int                                                                                                                                       AS all_time_total,
        COUNT(*) FILTER (WHERE mapped_status = 'completed')::int                                                                                           AS all_time_completed
      FROM partner_move_staging
      WHERE matched_account_id = ${accountId}
        AND source_system = 'DRAIVER'
    `);

    const row = (((statsResult as any).rows ?? statsResult)[0] ?? {}) as {
      vol_window?: string;
      vol_prev_window?: string;
      completed_window?: string;
      exceptions_window?: string;
      moves_this_week?: string;
      moves_this_month?: string;
      last_move_date?: string | null;
      unique_drivers?: string;
      total_drivers_ever?: string;
      all_time_total?: string;
      all_time_completed?: string;
    };

    const volWindow      = parseInt(row.vol_window ?? "0");
    const volPrev        = parseInt(row.vol_prev_window ?? "0");
    const completedWin   = parseInt(row.completed_window ?? "0");
    const exceptionsWin  = parseInt(row.exceptions_window ?? "0");
    const movesThisWeek  = parseInt(row.moves_this_week ?? "0");
    const movesThisMon   = parseInt(row.moves_this_month ?? "0");
    const uniqueDrivers      = parseInt(row.unique_drivers ?? "0");
    const totalDriversEver   = parseInt(row.total_drivers_ever ?? "0");
    const allTimeTotal       = parseInt(row.all_time_total ?? "0");
    const driverUtilization  = totalDriversEver > 0
      ? Math.round((uniqueDrivers / totalDriversEver) * 100)
      : null;

    const pctChange = volPrev > 0
      ? Math.round(((volWindow - volPrev) / volPrev) * 100)
      : volWindow > 0 ? 100 : 0;

    const completionRate  = volWindow > 0 ? Math.round((completedWin / volWindow) * 100) : null;
    const exceptionRate   = volWindow > 0 ? Math.round((exceptionsWin / volWindow) * 100) : null;
    const avgMovesPerDriver = uniqueDrivers > 0 ? Math.round((volWindow / uniqueDrivers) * 10) / 10 : null;

    // Recency: days since last move
    const daysSinceLastMove = row.last_move_date
      ? Math.floor((Date.now() - new Date(row.last_move_date).getTime()) / 86_400_000)
      : null;

    // At-risk flags
    const atRiskDecline    = volPrev > 0 && pctChange <= -20;
    const atRiskInactive   = daysSinceLastMove !== null && daysSinceLastMove >= 14;
    const atRiskExceptions = exceptionRate !== null && exceptionRate >= 30;
    const atRisk           = atRiskDecline || atRiskInactive || atRiskExceptions;

    // ── Weekly trend (for the chart) ──────────────────────────────────────────
    const trendResult = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('week', move_created_at), 'YYYY-MM-DD') AS week_start,
        COUNT(*)::int                                                AS total,
        COUNT(*) FILTER (WHERE mapped_status = 'completed')::int    AS completed,
        COUNT(*) FILTER (WHERE validation_status = 'warning')::int  AS exceptions
      FROM partner_move_staging
      WHERE matched_account_id = ${accountId}
        AND source_system = 'DRAIVER'
        AND move_created_at >= NOW() - CAST(${intervalStr} AS INTERVAL)
      GROUP BY DATE_TRUNC('week', move_created_at)
      ORDER BY DATE_TRUNC('week', move_created_at)
    `);
    const trend = ((trendResult as any).rows ?? trendResult) as Array<{
      week_start: string;
      total: number;
      completed: number;
      exceptions: number;
    }>;

    return res.json({
      hasData: allTimeTotal > 0,
      windowDays: days,
      volWindow,
      volPrev,
      pctChange,
      completionRate,
      exceptionRate,
      movesThisWeek,
      movesThisMonth: movesThisMon,
      lastMoveDate: row.last_move_date ?? null,
      daysSinceLastMove,
      uniqueDrivers,
      totalDriversEver,
      driverUtilization,
      avgMovesPerDriver,
      allTimeTotal,
      atRisk,
      atRiskFlags: { decline: atRiskDecline, inactive: atRiskInactive, highExceptions: atRiskExceptions },
      trend,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

export default router;

