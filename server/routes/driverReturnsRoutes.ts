import { Router } from "express";
import { db } from "../db";
import {
  driverReturnEntries,
  trips,
  drivers,
  customers,
} from "../../shared/schema";
import {
  eq, and, or, ilike, desc, count, sql, isNull, isNotNull,
} from "drizzle-orm";

const router = Router();

// ── Summary — aggregate stats + financials across all non-superseded entries ──
router.get("/summary", async (_req, res) => {
  try {
    const [stats] = await db.select({
      total:              count(),
      matched:            sql<number>`count(*) filter (where parent_match_status = 'matched'  and is_superseded = false)`,
      unmatched:          sql<number>`count(*) filter (where parent_match_status = 'unmatched' and is_superseded = false)`,
      superseded:         sql<number>`count(*) filter (where is_superseded = true)`,
      completed:          sql<number>`count(*) filter (where lower(status) = 'completed'  and is_superseded = false)`,
      cancelled:          sql<number>`count(*) filter (where lower(status) = 'cancelled'  and is_superseded = false)`,
      totalCustomerBilled:sql<string>`sum(customer_billed)  filter (where is_superseded = false)`,
      totalBaseCost:      sql<string>`sum(base_cost)         filter (where is_superseded = false)`,
      totalCustomerTotal: sql<string>`sum(customer_total)    filter (where is_superseded = false)`,
      totalMinutes:       sql<string>`sum(minutes)           filter (where is_superseded = false)`,
    }).from(driverReturnEntries);

    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Trip search — used by the "Link to Move" dialog ───────────────────────────
router.get("/trip-search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json([]);

    const results = await db.select({
      id:             trips.id,
      moveNumber:     trips.moveNumber,
      externalMoveId: trips.externalMoveId,
      tripDate:       trips.tripDate,
      status:         trips.status,
      sourceSystem:   trips.sourceSystem,
    })
      .from(trips)
      .where(or(
        ilike(trips.moveNumber, `%${q}%`),
        ilike(trips.externalMoveId as any, `%${q}%`),
      ))
      .orderBy(desc(trips.tripDate))
      .limit(20);

    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Exception queue — unmatched, non-superseded entries ───────────────────────
router.get("/exception-queue", async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(String(req.query.page     ?? "1")));
    const pageSize = Math.min(100, parseInt(String(req.query.pageSize ?? "50")));
    const offset   = (page - 1) * pageSize;
    const search   = String(req.query.search ?? "").trim();
    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo   = String(req.query.dateTo   ?? "").trim();

    const where: any[] = [
      eq(driverReturnEntries.parentMatchStatus, "unmatched"),
      eq(driverReturnEntries.isSuperseded, false),
    ];
    if (search) {
      where.push(or(
        ilike(driverReturnEntries.sourceTripId, `%${search}%`),
        ilike(driverReturnEntries.dealerName,   `%${search}%`),
        ilike(driverReturnEntries.driverName,   `%${search}%`),
        ilike(driverReturnEntries.roNumber,     `%${search}%`),
      ));
    }
    if (dateFrom) where.push(sql`trip_date >= ${dateFrom}::date`);
    if (dateTo)   where.push(sql`trip_date <= ${dateTo}::date`);

    const [{ total }] = await db
      .select({ total: count() })
      .from(driverReturnEntries)
      .where(and(...where));

    const rows = await db
      .select({
        id:              driverReturnEntries.id,
        redcapId:        driverReturnEntries.redcapId,
        sourceTripId:    driverReturnEntries.sourceTripId,
        tripDate:        driverReturnEntries.tripDate,
        dealerName:      driverReturnEntries.dealerName,
        driverName:      driverReturnEntries.driverName,
        status:          driverReturnEntries.status,
        tripTypeGroup:   driverReturnEntries.tripTypeGroup,
        minutes:         driverReturnEntries.minutes,
        milesEstimate:   driverReturnEntries.milesEstimate,
        customerBilled:  driverReturnEntries.customerBilled,
        baseCost:        driverReturnEntries.baseCost,
        roNumber:        driverReturnEntries.roNumber,
        batchId:         driverReturnEntries.batchId,
        sourceSystemKey: driverReturnEntries.sourceSystemKey,
        createdAt:       driverReturnEntries.createdAt,
      })
      .from(driverReturnEntries)
      .where(and(...where))
      .orderBy(desc(driverReturnEntries.tripDate), desc(driverReturnEntries.createdAt))
      .limit(pageSize)
      .offset(offset);

    return res.json({ total, page, pageSize, rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── List — all entries with full filter set ────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const page              = Math.max(1, parseInt(String(req.query.page              ?? "1")));
    const pageSize          = Math.min(100, parseInt(String(req.query.pageSize        ?? "50")));
    const offset            = (page - 1) * pageSize;
    const search            = String(req.query.search            ?? "").trim();
    const status            = String(req.query.status            ?? "").trim();
    const parentMatchStatus = String(req.query.parentMatchStatus ?? "").trim();
    const batchId           = String(req.query.batchId           ?? "").trim();
    const dateFrom          = String(req.query.dateFrom          ?? "").trim();
    const dateTo            = String(req.query.dateTo            ?? "").trim();

    const where: any[] = [eq(driverReturnEntries.isSuperseded, false)];
    if (status)            where.push(sql`lower(${driverReturnEntries.status}) = ${status.toLowerCase()}`);
    if (parentMatchStatus) where.push(eq(driverReturnEntries.parentMatchStatus, parentMatchStatus));
    if (batchId)           where.push(eq(driverReturnEntries.batchId, batchId));
    if (dateFrom)          where.push(sql`trip_date >= ${dateFrom}::date`);
    if (dateTo)            where.push(sql`trip_date <= ${dateTo}::date`);
    if (search) {
      where.push(or(
        ilike(driverReturnEntries.sourceTripId, `%${search}%`),
        ilike(driverReturnEntries.dealerName,   `%${search}%`),
        ilike(driverReturnEntries.driverName,   `%${search}%`),
        ilike(driverReturnEntries.roNumber,     `%${search}%`),
        ilike(driverReturnEntries.customerVin,  `%${search}%`),
      ));
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(driverReturnEntries)
      .where(and(...where));

    const rows = await db
      .select({
        id:               driverReturnEntries.id,
        redcapId:         driverReturnEntries.redcapId,
        sourceTripId:     driverReturnEntries.sourceTripId,
        linkedTripId:     driverReturnEntries.linkedTripId,
        parentMatchStatus:driverReturnEntries.parentMatchStatus,
        tripDate:         driverReturnEntries.tripDate,
        dealerName:       driverReturnEntries.dealerName,
        driverName:       driverReturnEntries.driverName,
        status:           driverReturnEntries.status,
        tripTypeGroup:    driverReturnEntries.tripTypeGroup,
        minutes:          driverReturnEntries.minutes,
        milesEstimate:    driverReturnEntries.milesEstimate,
        customerBilled:   driverReturnEntries.customerBilled,
        baseCost:         driverReturnEntries.baseCost,
        roNumber:         driverReturnEntries.roNumber,
        batchId:          driverReturnEntries.batchId,
        sourceSystemKey:  driverReturnEntries.sourceSystemKey,
        createdAt:        driverReturnEntries.createdAt,
      })
      .from(driverReturnEntries)
      .where(and(...where))
      .orderBy(desc(driverReturnEntries.tripDate), desc(driverReturnEntries.createdAt))
      .limit(pageSize)
      .offset(offset);

    return res.json({ total, page, pageSize, rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Single entry detail ───────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const [entry] = await db
      .select()
      .from(driverReturnEntries)
      .where(eq(driverReturnEntries.id, req.params.id))
      .limit(1);
    if (!entry) return res.status(404).json({ error: "Not found" });

    let parentTrip: { id: string; moveNumber: string; externalMoveId: string | null; tripDate: string | null; status: string | null } | null = null;
    if (entry.linkedTripId) {
      const [t] = await db
        .select({ id: trips.id, moveNumber: trips.moveNumber, externalMoveId: trips.externalMoveId, tripDate: trips.tripDate, status: trips.status })
        .from(trips)
        .where(eq(trips.id, entry.linkedTripId))
        .limit(1);
      parentTrip = t ?? null;
    }

    return res.json({ ...entry, parentTrip });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Link to a trip ────────────────────────────────────────────────────────────
router.patch("/:id/link", async (req, res) => {
  try {
    const { tripId } = req.body ?? {};
    if (!tripId) return res.status(400).json({ error: "tripId is required" });

    const [trip] = await db
      .select({ id: trips.id, moveNumber: trips.moveNumber, externalMoveId: trips.externalMoveId })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const [updated] = await db
      .update(driverReturnEntries)
      .set({ linkedTripId: tripId, parentMatchStatus: "matched" })
      .where(eq(driverReturnEntries.id, req.params.id))
      .returning({ id: driverReturnEntries.id, parentMatchStatus: driverReturnEntries.parentMatchStatus, linkedTripId: driverReturnEntries.linkedTripId });

    if (!updated) return res.status(404).json({ error: "Entry not found" });
    return res.json({ ...updated, linkedTrip: trip });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Unlink from a trip ────────────────────────────────────────────────────────
router.patch("/:id/unlink", async (req, res) => {
  try {
    const [updated] = await db
      .update(driverReturnEntries)
      .set({ linkedTripId: null, parentMatchStatus: "unmatched" })
      .where(eq(driverReturnEntries.id, req.params.id))
      .returning({ id: driverReturnEntries.id, parentMatchStatus: driverReturnEntries.parentMatchStatus });

    if (!updated) return res.status(404).json({ error: "Entry not found" });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
