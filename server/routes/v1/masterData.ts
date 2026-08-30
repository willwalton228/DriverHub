/**
 * DriverConnect Integration API v1 — Master Data Endpoints
 *
 * GET /api/v1/drivers          — Paginated driver list with account + contact DTOs
 * GET /api/v1/drivers/:id      — Single driver with full detail
 * GET /api/v1/accounts         — Paginated account list with address + contact DTOs
 * GET /api/v1/accounts/:id     — Single account with full detail
 * GET /api/v1/locations        — Paginated work location list
 * GET /api/v1/locations/:id    — Single work location
 * GET /api/v1/service-types    — Enumerated service-type reference list
 * GET /api/v1/moves            — Paginated move/trip list
 * GET /api/v1/moves/:id        — Single move
 * GET /api/v1/schedules        — Paginated shift schedule list
 * GET /api/v1/schedules/:id    — Single shift with location name
 * GET /api/v1/users            — Paginated user list
 * GET /api/v1/users/:id        — Single user
 *
 * All DTOs are stable contracts — internal columns never exposed.
 * Tenant/org scoping applied where entity carries orgId.
 */
import { Router, Request, Response } from 'express';
import { db, pool } from '../../db';
import {
  drivers, users, customers, workLocations, trips, shifts, driverAccounts, shiftAssignments,
} from '@shared/schema';
import { eq, and, or, ilike, gte, lte, desc, asc, sql, isNull, ne, inArray } from 'drizzle-orm';
import { requireScope } from '../../middleware/v1ApiKeyAuth';

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Accept pageSize (DriverConnect standard) or limit (legacy) as page-size param.
 * The response transform middleware automatically renames meta.limit → meta.pageSize
 * and adds meta.hasMore, so internal response objects still use `limit`.
 */
function parsePagination(query: Record<string, any>) {
  const page = Math.max(1, parseInt(query.page as string) || 1);
  // pageSize is the DriverConnect contract name; limit is the legacy alias
  const rawSize = query.pageSize ?? query.limit;
  const limit = Math.min(500, Math.max(1, parseInt(rawSize as string) || 25));
  return { limit, offset: (page - 1) * limit, page };
}

function paginatedResponse(data: any[], total: number, page: number, limit: number) {
  return {
    success: true,
    data,
    meta: { total, page, limit },
    // meta.limit is renamed → meta.pageSize and meta.hasMore is added by
    // v1ResponseTransform middleware before the response is sent to the client.
  };
}

/**
 * Derive a canonical availability status for the DriverConnect API contract.
 * Values: "available" | "unavailable" | "off_shift"
 * (assigned / in_progress are set via driver-status-events and reflected in GET /driver-status-events)
 */
function deriveAvailabilityStatus(status: string | null, safetyState: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'inactive' || s === 'terminated' || s === 'archived') return 'off_shift';
  if (s === 'suspended') return 'unavailable';
  if (s === 'active') {
    if (safetyState === 'RESTRICTED' || safetyState === 'SUSPENDED' || safetyState === 'DISQUALIFIED') {
      return 'unavailable';
    }
    return 'available';
  }
  return 'unavailable';
}

// ─── GET /api/v1/drivers ──────────────────────────────────────────────────
// Query params: page, pageSize, search, status, accountId, network, updatedAfter
//
// Stable DTO per item:
//   id, externalId, firstName, lastName, fullName, status, network,
//   phone, email, primaryAccount{id,name}, secondaryAccounts[{id,name}],
//   location{city,state}, availabilityStatus, updatedAt
router.get('/drivers', requireScope('read:drivers'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const {
      search, status, network, accountId, updatedAfter,
      // legacy params still accepted
      classification, safety_state, market,
    } = req.query as Record<string, string>;

    // Base conditions — always exclude soft-deleted
    const conditions: any[] = [eq(drivers.isDeleted, false)];

    if (status)         conditions.push(eq(drivers.status, status));
    if (network)        conditions.push(eq(drivers.network, network));
    if (classification) conditions.push(eq(drivers.driverClassification, classification));
    if (safety_state)   conditions.push(eq(drivers.safetyState, safety_state));
    if (market)         conditions.push(ilike(drivers.market, `%${market}%`));

    // updatedAfter — ISO 8601 timestamp; filter drivers updated after this time
    if (updatedAfter) {
      const afterDate = new Date(updatedAfter);
      if (!isNaN(afterDate.getTime())) {
        conditions.push(gte(drivers.updatedAt, afterDate));
      }
    }

    // accountId — matches primary account OR any secondary account in driver_accounts
    if (accountId) {
      const secondarySubq = db
        .select({ driverId: driverAccounts.driverId })
        .from(driverAccounts)
        .where(and(
          eq(driverAccounts.accountId, accountId),
          isNull(driverAccounts.assignmentEndedAt)
        ));
      conditions.push(
        or(
          eq(drivers.drivershiftCustomerId, accountId),
          sql`${drivers.id} IN ${secondarySubq}`
        )
      );
    }

    // search — matches first name, last name, email, or driver number
    if (search) {
      conditions.push(
        or(
          ilike(users.firstName, `%${search}%`),
          ilike(users.lastName,  `%${search}%`),
          ilike(users.email,     `%${search}%`),
          ilike(drivers.driverNumber, `%${search}%`)
        )
      );
    }

    const whereClause = and(...conditions);

    // ── Main query + count in parallel ──────────────────────────────────
    const [rows, countRes] = await Promise.all([
      db
        .select({
          id:                 drivers.id,
          driverNumber:       drivers.driverNumber,
          firstName:          users.firstName,
          lastName:           users.lastName,
          email:              users.email,
          phone:              drivers.phoneNumber,
          classification:     drivers.driverClassification,
          network:            drivers.network,
          market:             drivers.market,
          status:             drivers.status,
          safetyState:        drivers.safetyState,
          city:               drivers.city,
          state:              drivers.state,
          licenseNumber:      drivers.licenseNumber,
          licenseState:       drivers.licenseState,
          licenseExpiration:  drivers.licenseExpiration,
          profileImageUrl:    users.profileImageUrl,
          hireDate:           drivers.hireDate,
          primaryAccountId:   drivers.drivershiftCustomerId,
          primaryAccountName: customers.customerName,
          updatedAt:          drivers.updatedAt,
          createdAt:          drivers.createdAt,
        })
        .from(drivers)
        .leftJoin(users,      eq(drivers.userId, users.id))
        .leftJoin(customers,  eq(drivers.drivershiftCustomerId, customers.id))
        .where(whereClause)
        .orderBy(asc(users.lastName))
        .limit(limit)
        .offset(offset),

      db.select({ count: sql<number>`count(*)` })
        .from(drivers)
        .leftJoin(users,      eq(drivers.userId, users.id))
        .leftJoin(customers,  eq(drivers.drivershiftCustomerId, customers.id))
        .where(whereClause),
    ]);

    // ── Batch-load secondary accounts for this page (single query, no N+1) ─
    const pageDriverIds = rows.map(r => r.id).filter(Boolean);
    const secondaryRows = pageDriverIds.length > 0
      ? await db
          .select({
            driverId:    driverAccounts.driverId,
            accountId:   driverAccounts.accountId,
            accountName: customers.customerName,
          })
          .from(driverAccounts)
          .leftJoin(customers, eq(driverAccounts.accountId, customers.id))
          .where(
            and(
              inArray(driverAccounts.driverId, pageDriverIds),
              eq(driverAccounts.isPrimary, false),
              isNull(driverAccounts.assignmentEndedAt)
            )
          )
      : [];

    // Group secondary accounts by driverId for O(1) lookup
    const secondaryMap = new Map<string, { id: string; name: string }[]>();
    for (const sa of secondaryRows) {
      if (!secondaryMap.has(sa.driverId)) secondaryMap.set(sa.driverId, []);
      secondaryMap.get(sa.driverId)!.push({ id: sa.accountId, name: sa.accountName ?? '' });
    }

    // ── Shape DTO ────────────────────────────────────────────────────────
    const data = rows.map(r => {
      const firstName = (r.firstName ?? '').trim();
      const lastName  = (r.lastName  ?? '').trim();
      return {
        id:           r.id,
        externalId:   r.driverNumber ? `DH-DR-${r.driverNumber}` : `DH-DR-${r.id.slice(0, 8).toUpperCase()}`,
        firstName,
        lastName,
        fullName:     [firstName, lastName].filter(Boolean).join(' ') || null,
        status:       (r.status ?? 'unknown').toLowerCase(),
        network:      r.network ?? null,
        phone:        r.phone ?? null,
        email:        r.email ?? null,
        primaryAccount: r.primaryAccountId
          ? { id: r.primaryAccountId, name: r.primaryAccountName ?? '' }
          : null,
        secondaryAccounts: secondaryMap.get(r.id) ?? [],
        location: {
          city:  r.city  ?? null,
          state: r.state ?? null,
        },
        availabilityStatus: deriveAvailabilityStatus(r.status, r.safetyState),
        updatedAt: r.updatedAt?.toISOString() ?? null,
      };
    });

    res.json(paginatedResponse(data, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /drivers error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch drivers.' });
  }
});

// ─── GET /api/v1/drivers/:id ──────────────────────────────────────────────
// Stable DTO: all list fields + address, location, license, classification,
//             market, safetyState, safetyScore, profileImageUrl, hireDate,
//             terminationDate, tags, stats, createdAt
router.get('/drivers/:id', requireScope('read:drivers'), async (req: Request, res: Response) => {
  try {
    // ── Main record + primary account in one query ───────────────────────
    const [row] = await db
      .select({
        id:                   drivers.id,
        driverNumber:         drivers.driverNumber,
        firstName:            users.firstName,
        lastName:             users.lastName,
        email:                users.email,
        phone:                drivers.phoneNumber,
        address:              drivers.address,
        city:                 drivers.city,
        state:                drivers.state,
        zipCode:              drivers.zipCode,
        classification:       drivers.driverClassification,
        network:              drivers.network,
        market:               drivers.market,
        status:               drivers.status,
        safetyState:          drivers.safetyState,
        safetyScore:          drivers.safetyScore,
        licenseNumber:        drivers.licenseNumber,
        licenseState:         drivers.licenseState,
        licenseExpiration:    drivers.licenseExpiration,
        cdlCertified:         drivers.cdlCertified,
        hazmatCertified:      drivers.hazmatCertified,
        profileImageUrl:      users.profileImageUrl,
        hireDate:             drivers.hireDate,
        terminationDate:      drivers.terminationDate,
        lifetimeMoveCount:    drivers.lifetimeMoveCount,
        currentMonthMoveCount:drivers.currentMonthMoveCount,
        lastMoveDate:         drivers.lastMoveDate,
        hoursYtd:             drivers.hoursYtd,
        primaryAccountId:     drivers.drivershiftCustomerId,
        primaryAccountName:   customers.customerName,
        updatedAt:            drivers.updatedAt,
        createdAt:            drivers.createdAt,
      })
      .from(drivers)
      .leftJoin(users,     eq(drivers.userId, users.id))
      .leftJoin(customers, eq(drivers.drivershiftCustomerId, customers.id))
      .where(and(eq(drivers.id, req.params.id), eq(drivers.isDeleted, false)))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: 'NOT_FOUND', message: `Driver '${req.params.id}' not found.` });
    }

    // ── Secondary accounts (single query, no N+1) ────────────────────────
    const secondaryRows = await db
      .select({
        accountId:   driverAccounts.accountId,
        accountName: customers.customerName,
      })
      .from(driverAccounts)
      .leftJoin(customers, eq(driverAccounts.accountId, customers.id))
      .where(
        and(
          eq(driverAccounts.driverId, row.id),
          eq(driverAccounts.isPrimary, false),
          isNull(driverAccounts.assignmentEndedAt)
        )
      );

    const secondaryAccounts = secondaryRows.map(sa => ({
      id:   sa.accountId,
      name: sa.accountName ?? '',
    }));

    // ── Shape DTO ────────────────────────────────────────────────────────
    const firstName = (row.firstName ?? '').trim();
    const lastName  = (row.lastName  ?? '').trim();
    const status    = (row.status    ?? 'unknown').toLowerCase();

    res.json({
      success: true,
      data: {
        // ── DriverConnect contract fields ───────────────────────────────
        id:                 row.id,
        externalId:         row.driverNumber
                              ? `DH-DR-${row.driverNumber}`
                              : `DH-DR-${row.id.slice(0, 8).toUpperCase()}`,
        firstName,
        lastName,
        fullName:           [firstName, lastName].filter(Boolean).join(' ') || null,
        status,
        network:            row.network            ?? null,
        phone:              row.phone              ?? null,
        email:              row.email              ?? null,
        primaryAccount:     row.primaryAccountId
                              ? { id: row.primaryAccountId, name: row.primaryAccountName ?? '' }
                              : null,
        secondaryAccounts,
        availabilityStatus: deriveAvailabilityStatus(row.status, row.safetyState),
        updatedAt:          row.updatedAt?.toISOString() ?? null,

        // ── Extended detail (not in list endpoint) ──────────────────────
        // Section 17: expose operational fields; exclude PII/HR/compliance data
        location: {
          address: row.address ?? null,
          city:    row.city    ?? null,
          state:   row.state   ?? null,
          zipCode: row.zipCode ?? null,
        },
        classification:  row.classification  ?? null,
        market:          row.market          ?? null,
        safetyState:     row.safetyState     ?? null,
        safetyScore:     row.safetyScore     ?? null,
        // Expose only operational safety flags — raw license number/expiration
        // are PII and not needed by DriverConnect for dispatch decisions
        license: {
          cdlCertified:    row.cdlCertified    === 'Y' || row.cdlCertified    === 'true',
          hazmatCertified: row.hazmatCertified === 'Y' || row.hazmatCertified === 'true',
        },
        profileImageUrl: row.profileImageUrl ?? null,
        stats: {
          lifetimeMoveCount:     row.lifetimeMoveCount     ?? 0,
          currentMonthMoveCount: row.currentMonthMoveCount ?? 0,
          lastMoveDate:          row.lastMoveDate          ?? null,
          hoursYtd:              row.hoursYtd              ?? null,
        },
        createdAt: row.createdAt?.toISOString() ?? null,
      },
    });
  } catch (err: any) {
    console.error('[v1] GET /drivers/:id error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch driver.' });
  }
});

// ─── GET /api/v1/accounts ─────────────────────────────────────────────────
// Contract params: page, pageSize, search, status, serviceType, updatedAfter
// Stable DTO: id, externalId, name, status, network, billingCode,
//             location{id,name,address1,city,state,postalCode},
//             serviceTypes[], updatedAt
// + extended: program, region, driverModel, primaryContact, parentAccountId,
//             health, healthTrend, driverRequirements, createdAt
router.get('/accounts', requireScope('read:accounts'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const {
      search, status, serviceType, updatedAfter,
      // Legacy aliases kept for backward compat
      program, region, driver_model,
    } = req.query as Record<string, string>;

    const conditions: any[] = [eq(customers.isDeleted, false)];
    if (status)        conditions.push(ilike(customers.status, status));
    if (program)       conditions.push(eq(customers.program, program));
    if (region)        conditions.push(eq(customers.region, region));
    if (driver_model)  conditions.push(eq(customers.driverModel, driver_model));
    if (serviceType)   conditions.push(ilike(customers.enabledServices, `%${serviceType}%`));
    if (updatedAfter) {
      const ts = new Date(updatedAfter);
      if (!isNaN(ts.getTime())) conditions.push(gte(customers.updatedAt, ts));
    }
    if (search) {
      conditions.push(
        or(
          ilike(customers.customerName,   `%${search}%`),
          ilike(customers.customerNumber, `%${search}%`),
          ilike(customers.customerCity,   `%${search}%`),
          ilike(customers.customerState,  `%${search}%`)
        )
      );
    }

    const whereClause = and(...conditions);

    const [rows, countRes] = await Promise.all([
      db
        .select({
          id:                  customers.id,
          customerNumber:      customers.customerNumber,
          name:                customers.customerName,
          status:              customers.status,
          program:             customers.program,
          region:              customers.region,
          driverModel:         customers.driverModel,
          network:             customers.network,
          address:             customers.customerAddress,
          city:                customers.customerCity,
          state:               customers.customerState,
          zipCode:             customers.customerZip,
          latitude:            customers.customerLatitude,
          longitude:           customers.customerLongitude,
          primaryContactName:  customers.primaryContactName,
          primaryContactPhone: customers.primaryContactNumber,
          primaryContactEmail: customers.primaryContactEmail,
          parentAccountId:     customers.parentAccountId,
          health:              customers.health,
          healthTrend:         customers.healthTrend,
          icAllowed:           customers.icAllowed,
          employeeOnly:        customers.employeeOnly,
          enabledServices:     customers.enabledServices,
          updatedAt:           customers.updatedAt,
          createdAt:           customers.createdAt,
        })
        .from(customers)
        .where(whereClause)
        .orderBy(asc(customers.customerName))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(customers).where(whereClause),
    ]);

    // ── Shape DTO ────────────────────────────────────────────────────────
    const data = rows.map(r => {
      // Parse enabledServices JSON → string[]
      let serviceTypes: string[] = [];
      if (r.enabledServices) {
        try { serviceTypes = JSON.parse(r.enabledServices); } catch { /* ignore */ }
      }

      const statusLower = (r.status ?? 'unknown').toLowerCase();
      const extId = r.customerNumber
        ? `DH-AC-${r.customerNumber}`
        : `DH-AC-${r.id.slice(0, 8).toUpperCase()}`;

      return {
        // ── DriverConnect contract fields ─────────────────────────────
        id:          r.id,
        externalId:  extId,
        name:        r.name,
        status:      statusLower,
        network:     r.network  ?? null,
        billingCode: r.customerNumber ?? null,
        location: {
          id:         `loc_${r.id.slice(0, 8)}`,
          name:       r.name,
          address1:   r.address  || null,
          city:       r.city     || null,
          state:      r.state    || null,
          postalCode: r.zipCode  || null,
        },
        serviceTypes,
        updatedAt: r.updatedAt?.toISOString() ?? null,

        // ── Extended detail ───────────────────────────────────────────
        program:      r.program     ?? null,
        region:       r.region      ?? null,
        driverModel:  r.driverModel ?? null,
        primaryContact: {
          name:  r.primaryContactName  ?? null,
          phone: r.primaryContactPhone ?? null,
          email: r.primaryContactEmail ?? null,
        },
        parentAccountId: r.parentAccountId ?? null,
        health:      r.health      ?? null,
        healthTrend: r.healthTrend ?? null,
        driverRequirements: {
          icAllowed:    r.icAllowed    ?? true,
          employeeOnly: r.employeeOnly ?? false,
        },
        createdAt: r.createdAt?.toISOString() ?? null,
      };
    });

    res.json(paginatedResponse(data, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /accounts error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch accounts.' });
  }
});

// ─── GET /api/v1/accounts/:id ─────────────────────────────────────────────
// Contract fields: id, externalId, name, status, network, location,
//                 serviceTypes, assignedDrivers, updatedAt
// Extended detail: legalName, program, region, driverModel, billingCode,
//                  primaryContact, billingContact, parentAccountId,
//                  health, healthTrend, driverRequirements, isStrategicAccount,
//                  implementationDate, website, createdAt
router.get('/accounts/:id', requireScope('read:accounts'), async (req: Request, res: Response) => {
  try {
    // ── Main record ──────────────────────────────────────────────────────
    const [row] = await db
      .select({
        id:                  customers.id,
        customerNumber:      customers.customerNumber,
        name:                customers.customerName,
        legalName:           customers.customerLegalName,
        status:              customers.status,
        program:             customers.program,
        region:              customers.region,
        driverModel:         customers.driverModel,
        network:             customers.network,
        address:             customers.customerAddress,
        city:                customers.customerCity,
        state:               customers.customerState,
        zipCode:             customers.customerZip,
        latitude:            customers.customerLatitude,
        longitude:           customers.customerLongitude,
        primaryContactName:  customers.primaryContactName,
        primaryContactPhone: customers.primaryContactNumber,
        primaryContactCell:  customers.primaryContactCell,
        primaryContactEmail: customers.primaryContactEmail,
        billingContactName:  customers.billingContactName,
        billingContactPhone: customers.billingContactNumber,
        billingContactEmail: customers.billingContactEmail,
        parentAccountId:     customers.parentAccountId,
        health:              customers.health,
        healthTrend:         customers.healthTrend,
        enabledServices:     customers.enabledServices,
        icAllowed:           customers.icAllowed,
        employeeOnly:        customers.employeeOnly,
        coverageExpectation: customers.coverageExpectation,
        implementationDate:  customers.implementationDate,
        website:             customers.customerWebsite,
        isStrategicAccount:  customers.isStrategicAccount,
        updatedAt:           customers.updatedAt,
        createdAt:           customers.createdAt,
      })
      .from(customers)
      .where(and(eq(customers.id, req.params.id), eq(customers.isDeleted, false)))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: 'NOT_FOUND', message: `Account '${req.params.id}' not found.` });
    }

    // ── Assigned drivers (single query, no N+1) ──────────────────────────
    const assignedRows = await db
      .select({
        driverId:  driverAccounts.driverId,
        isPrimary: driverAccounts.isPrimary,
        firstName: users.firstName,
        lastName:  users.lastName,
      })
      .from(driverAccounts)
      .leftJoin(drivers, eq(driverAccounts.driverId, drivers.id))
      .leftJoin(users,   eq(drivers.userId, users.id))
      .where(and(
        eq(driverAccounts.accountId, row.id),
        isNull(driverAccounts.assignmentEndedAt)
      ));

    const assignedDrivers = assignedRows.map(dr => {
      const first = (dr.firstName ?? '').trim();
      const last  = (dr.lastName  ?? '').trim();
      return {
        id:             dr.driverId,
        name:           [first, last].filter(Boolean).join(' ') || 'Unknown Driver',
        assignmentType: dr.isPrimary ? 'primary' : 'secondary',
      };
    });

    // ── Parse enabledServices JSON → serviceTypes[] ──────────────────────
    let serviceTypes: string[] = [];
    try { serviceTypes = row.enabledServices ? JSON.parse(row.enabledServices) : []; } catch { /* ignore */ }

    // ── Shape DTO ────────────────────────────────────────────────────────
    const statusLower = (row.status ?? 'unknown').toLowerCase();
    const extId = row.customerNumber
      ? `DH-AC-${row.customerNumber}`
      : `DH-AC-${row.id.slice(0, 8).toUpperCase()}`;

    res.json({
      success: true,
      data: {
        // ── DriverConnect contract fields ───────────────────────────────
        id:          row.id,
        externalId:  extId,
        name:        row.name,
        status:      statusLower,
        network:     row.network  ?? null,
        billingCode: row.customerNumber ?? null,
        location: {
          id:         `loc_${row.id.slice(0, 8)}`,
          name:       row.name,
          address1:   row.address  || null,
          city:       row.city     || null,
          state:      row.state    || null,
          postalCode: row.zipCode  || null,
        },
        serviceTypes,
        assignedDrivers,
        updatedAt: row.updatedAt?.toISOString() ?? null,

        // ── Extended detail ─────────────────────────────────────────────
        legalName:       row.legalName    ?? null,
        program:         row.program      ?? null,
        region:          row.region       ?? null,
        driverModel:     row.driverModel  ?? null,
        primaryContact: {
          name:  row.primaryContactName  ?? null,
          phone: row.primaryContactPhone ?? null,
          cell:  row.primaryContactCell  ?? null,
          email: row.primaryContactEmail ?? null,
        },
        billingContact: {
          name:  row.billingContactName  ?? null,
          phone: row.billingContactPhone ?? null,
          email: row.billingContactEmail ?? null,
        },
        parentAccountId:  row.parentAccountId   ?? null,
        health:           row.health             ?? null,
        healthTrend:      row.healthTrend        ?? null,
        driverRequirements: {
          icAllowed:           row.icAllowed           ?? true,
          employeeOnly:        row.employeeOnly         ?? false,
          coverageExpectation: row.coverageExpectation  ?? null,
        },
        isStrategicAccount: row.isStrategicAccount ?? false,
        implementationDate: row.implementationDate  ?? null,
        website:            row.website             ?? null,
        createdAt:          row.createdAt?.toISOString() ?? null,
      },
    });
  } catch (err: any) {
    console.error('[v1] GET /accounts/:id error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch account.' });
  }
});

// ─── GET /api/v1/locations ────────────────────────────────────────────────
// Contract params: page, pageSize, search, accountId, status
// Stable DTO: id, name, status, accountId, address1, address2,
//             city, state, postalCode, timezone
// Extended: latitude, longitude, geofenceRadius, createdAt, updatedAt
//
// Notes:
//  - workLocations.entityId  = accountId link
//  - workLocations.isActive  = source of truth for status
//  - No address2 column — always null
router.get('/locations', requireScope('read:locations'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { search, accountId, status } = req.query as Record<string, string>;

    const conditions: any[] = [];

    // status param: "active" → isActive=true, "inactive" → isActive=false
    // default: return all (no isActive filter)
    if (status === 'active')   conditions.push(eq(workLocations.isActive, true));
    if (status === 'inactive') conditions.push(eq(workLocations.isActive, false));

    if (accountId) conditions.push(eq(workLocations.entityId, accountId));

    if (search) {
      conditions.push(
        or(
          ilike(workLocations.name,    `%${search}%`),
          ilike(workLocations.address, `%${search}%`),
          ilike(workLocations.city,    `%${search}%`),
          ilike(workLocations.state,   `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countRes] = await Promise.all([
      db
        .select({
          id:             workLocations.id,
          name:           workLocations.name,
          accountId:      workLocations.entityId,
          address:        workLocations.address,
          city:           workLocations.city,
          state:          workLocations.state,
          zipCode:        workLocations.zipCode,
          latitude:       workLocations.latitude,
          longitude:      workLocations.longitude,
          geofenceRadius: workLocations.geofenceRadius,
          timezone:       workLocations.timezone,
          isActive:       workLocations.isActive,
          createdAt:      workLocations.createdAt,
          updatedAt:      workLocations.updatedAt,
        })
        .from(workLocations)
        .where(whereClause)
        .orderBy(asc(workLocations.name))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(workLocations).where(whereClause),
    ]);

    // ── Shape DTO ────────────────────────────────────────────────────────
    const data = rows.map(r => ({
      // ── Contract fields ───────────────────────────────────────────────
      id:        r.id,
      name:      r.name,
      status:    r.isActive ? 'active' : 'inactive',
      accountId: r.accountId || null,
      address1:  r.address   || null,
      address2:  null,               // no address2 column in this schema version
      city:      r.city      || null,
      state:     r.state     || null,
      postalCode:r.zipCode   || null,
      timezone:  r.timezone  ?? 'America/New_York',
      // ── Extended ─────────────────────────────────────────────────────
      latitude:       r.latitude       ?? null,
      longitude:      r.longitude      ?? null,
      geofenceRadius: r.geofenceRadius ?? null,
      createdAt:      r.createdAt?.toISOString() ?? null,
      updatedAt:      r.updatedAt?.toISOString() ?? null,
    }));

    res.json(paginatedResponse(data, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /locations error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch locations.' });
  }
});

// ─── GET /api/v1/locations/:id ────────────────────────────────────────────
router.get('/locations/:id', requireScope('read:locations'), async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select({
        id: workLocations.id,
        name: workLocations.name,
        address: workLocations.address,
        city: workLocations.city,
        state: workLocations.state,
        zipCode: workLocations.zipCode,
        latitude: workLocations.latitude,
        longitude: workLocations.longitude,
        geofenceRadius: workLocations.geofenceRadius,
        timezone: workLocations.timezone,
        isActive: workLocations.isActive,
        createdAt: workLocations.createdAt,
        updatedAt: workLocations.updatedAt,
      })
      .from(workLocations)
      .where(eq(workLocations.id, req.params.id))
      .limit(1);

    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Location not found.' });
    res.json({ success: true, data: row });
  } catch (err: any) {
    console.error('[v1] GET /locations/:id error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch location.' });
  }
});

// ─── GET /api/v1/service-types ────────────────────────────────────────────
// Static reference list — no DB query needed.
// Codes match the values stored in customers.enabledServices JSON array.
// Response transform auto-injects meta.requestId + meta.timestamp.
const SERVICE_TYPE_CATALOG = [
  // ── Dealer ────────────────────────────────────────────────────────────
  { code: 'dealer_pickup',          name: 'Dealer Pickup',           category: 'dealer',    isActive: true  },
  { code: 'dealer_delivery',        name: 'Dealer Delivery',          category: 'dealer',    isActive: true  },
  { code: 'dealer_transfer',        name: 'Dealer Transfer',          category: 'dealer',    isActive: true  },
  { code: 'dealer_loaner_delivery', name: 'Dealer Loaner Delivery',   category: 'dealer',    isActive: true  },
  { code: 'dealer_loaner_return',   name: 'Dealer Loaner Return',     category: 'dealer',    isActive: true  },
  // ── Rental ────────────────────────────────────────────────────────────
  { code: 'rental_delivery',          name: 'Rental Delivery',           category: 'rental',  isActive: true  },
  { code: 'rental_return',            name: 'Rental Return',             category: 'rental',  isActive: true  },
  { code: 'airport_rental_delivery',  name: 'Airport Rental Delivery',   category: 'rental',  isActive: true  },
  { code: 'airport_rental_return',    name: 'Airport Rental Return',     category: 'rental',  isActive: true  },
  // ── Transport ─────────────────────────────────────────────────────────
  { code: 'vehicle_transport',    name: 'Vehicle Transport',        category: 'transport', isActive: true  },
  { code: 'open_haul',            name: 'Open Haul',                category: 'transport', isActive: true  },
  { code: 'enclosed_haul',        name: 'Enclosed Haul',            category: 'transport', isActive: true  },
  { code: 'repo_transport',       name: 'Repossession Transport',   category: 'transport', isActive: true  },
  // ── Parts ─────────────────────────────────────────────────────────────
  { code: 'parts_delivery',       name: 'Parts Delivery',           category: 'parts',     isActive: true  },
  { code: 'parts_pickup',         name: 'Parts Pickup',             category: 'parts',     isActive: true  },
  // ── Fleet ─────────────────────────────────────────────────────────────
  { code: 'fleet_delivery',       name: 'Fleet Delivery',           category: 'fleet',     isActive: true  },
  { code: 'fleet_return',         name: 'Fleet Return',             category: 'fleet',     isActive: true  },
  { code: 'fleet_transfer',       name: 'Fleet Transfer',           category: 'fleet',     isActive: true  },
  // ── Other ─────────────────────────────────────────────────────────────
  { code: 'shuttle',              name: 'Shuttle',                  category: 'other',     isActive: true  },
  { code: 'on_demand',            name: 'On Demand',                category: 'other',     isActive: true  },
  { code: 'other',                name: 'Other',                    category: 'other',     isActive: true  },
] as const;

router.get('/service-types', requireScope('read:service-types'), (_req: Request, res: Response) => {
  res.json({ success: true, data: SERVICE_TYPE_CATALOG });
});

// NOTE: GET /moves and GET /moves/:id are handled by operationsRouter (operations.ts)
// with account/driver enrichment and assignment history. Routes removed from here
// to avoid duplicate registration since masterDataRouter mounts first.

// ─── GET /api/v1/schedules ────────────────────────────────────────────────────
// Data source: wiw_shifts (canonical WIW sync table) — same data shown in DriverHub UI.
// Contract params: page, pageSize, date, driverId, accountId, status, startDate, endDate
// Legacy aliases still accepted: from_date, to_date
//
// Default status filter: excludes 'deleted' and 'cancelled' shifts unless the
// caller explicitly passes ?status=<value>, which pins to exactly that value.
//
// Active statuses returned by default:
//   published — shift posted, driver has been notified
//   accepted  — driver has confirmed the shift
//   alerted   — notification sent, driver has not yet responded (still upcoming)
router.get('/schedules', requireScope('read:schedules'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const {
      date, driverId, accountId, status,
      startDate, endDate,
      from_date, to_date,
    } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: any[] = [];
    let pi = 1;

    if (driverId)  { conditions.push(`wu.driver_id = $${pi++}`);                  params.push(driverId);  }
    if (accountId) { conditions.push(`ws.driverhub_account_id = $${pi++}`);        params.push(accountId); }
    if (date)      { conditions.push(`ws.start_time::date = $${pi++}`);            params.push(date);      }

    // Status: explicit override pins to exact value; default excludes deleted/cancelled
    if (status) {
      conditions.push(`ws.status = $${pi++}`);
      params.push(status);
    } else {
      conditions.push(`ws.status NOT IN ('deleted', 'cancelled')`);
    }

    // Contract date-range aliases
    if (startDate) { conditions.push(`ws.start_time >= $${pi++}`);                 params.push(startDate); }
    if (endDate)   { conditions.push(`ws.start_time < ($${pi++}::date + interval '1 day')`); params.push(endDate); }
    // Legacy aliases
    if (from_date) { conditions.push(`ws.start_time >= $${pi++}`);                 params.push(from_date); }
    if (to_date)   { conditions.push(`ws.start_time < ($${pi++}::date + interval '1 day')`); params.push(to_date); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          ws.id,
          ws.start_time::date                                     AS date,
          ws.start_time,
          ws.end_time,
          ws.scheduled_minutes,
          ws.status,
          ws.notes,
          ws.is_open,
          ws.updated_at,
          wu.driver_id,
          u.first_name                                            AS driver_first_name,
          u.last_name                                             AS driver_last_name,
          ws.driverhub_account_id                                 AS account_id,
          c.customer_name                                         AS account_name,
          wl.id                                                   AS location_id,
          wl.name                                                 AS location_name,
          wl.address                                              AS location_address,
          wl.timezone                                             AS location_timezone,
          wp.name                                                 AS role_name
        FROM wiw_shifts ws
        LEFT JOIN wiw_users     wu ON wu.id  = ws.wiw_user_id
        LEFT JOIN drivers        d ON d.id   = wu.driver_id
        LEFT JOIN users          u ON u.id   = d.user_id
        LEFT JOIN wiw_locations wl ON wl.id  = ws.wiw_location_id
        LEFT JOIN wiw_positions wp ON wp.id  = ws.wiw_position_id
        LEFT JOIN customers      c ON c.id   = ws.driverhub_account_id
        ${where}
        ORDER BY ws.start_time ASC NULLS LAST
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, limit, offset]),
      pool.query(
        `SELECT count(*)::int AS total
         FROM wiw_shifts ws
         LEFT JOIN wiw_users wu ON wu.id = ws.wiw_user_id
         ${where}`,
        params
      ),
    ]);

    const data = rowsQ.rows.map((r: any) => ({
      id:          r.id,
      date:        r.date,
      driverId:    r.driver_id    ?? null,
      driverName:  r.driver_id
        ? ([r.driver_first_name, r.driver_last_name].filter(Boolean).join(' ') || null)
        : null,
      accountId:   r.account_id   ?? null,
      accountName: r.account_name ?? null,
      startTime:   r.start_time ? new Date(r.start_time).toISOString() : null,
      endTime:     r.end_time   ? new Date(r.end_time).toISOString()   : null,
      status:      r.status ?? null,
      scheduledHours: r.scheduled_minutes != null
        ? Math.round((r.scheduled_minutes / 60) * 100) / 100
        : null,
      breakMinutes: 0,
      roleName:    r.role_name  ?? null,
      isOpenShift: r.is_open    ?? false,
      notes:       r.notes      ?? null,
      location: r.location_id ? {
        id:       r.location_id,
        name:     r.location_name     ?? null,
        address:  r.location_address  ?? null,
        timezone: r.location_timezone ?? null,
      } : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    }));

    res.json(paginatedResponse(data, countQ.rows[0]?.total ?? 0, page, limit));
  } catch (err: any) {
    console.error('[v1] GET /schedules error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch schedules.' });
  }
});

// ─── GET /api/v1/schedules/:id ───────────────────────────────────────────
router.get('/schedules/:id', requireScope('read:schedules'), async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        ws.id,
        ws.start_time::date     AS date,
        ws.start_time,
        ws.end_time,
        ws.scheduled_minutes,
        ws.status,
        ws.notes,
        ws.is_open,
        ws.created_at,
        ws.updated_at,
        wu.driver_id,
        u.first_name            AS driver_first_name,
        u.last_name             AS driver_last_name,
        ws.driverhub_account_id AS account_id,
        c.customer_name         AS account_name,
        wl.id                   AS location_id,
        wl.name                 AS location_name,
        wl.address              AS location_address,
        wp.name                 AS role_name
      FROM wiw_shifts ws
      LEFT JOIN wiw_users     wu ON wu.id = ws.wiw_user_id
      LEFT JOIN drivers        d ON d.id  = wu.driver_id
      LEFT JOIN users          u ON u.id  = d.user_id
      LEFT JOIN wiw_locations wl ON wl.id = ws.wiw_location_id
      LEFT JOIN wiw_positions wp ON wp.id = ws.wiw_position_id
      LEFT JOIN customers      c ON c.id  = ws.driverhub_account_id
      WHERE ws.id = $1
      LIMIT 1
    `, [req.params.id]);

    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Schedule not found.' });

    res.json({
      success: true,
      data: {
        id:          row.id,
        date:        row.date,
        driverId:    row.driver_id   ?? null,
        driverName:  row.driver_id
          ? ([row.driver_first_name, row.driver_last_name].filter(Boolean).join(' ') || null)
          : null,
        accountId:   row.account_id   ?? null,
        accountName: row.account_name ?? null,
        startTime:   row.start_time ? new Date(row.start_time).toISOString() : null,
        endTime:     row.end_time   ? new Date(row.end_time).toISOString()   : null,
        scheduledHours: row.scheduled_minutes != null
          ? Math.round((row.scheduled_minutes / 60) * 100) / 100
          : null,
        breakMinutes: 0,
        status:      row.status   ?? null,
        roleName:    row.role_name ?? null,
        isOpenShift: row.is_open  ?? false,
        notes:       row.notes    ?? null,
        location: row.location_id ? {
          id:      row.location_id,
          name:    row.location_name    ?? null,
          address: row.location_address ?? null,
        } : null,
        createdAt:  row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt:  row.updated_at ? new Date(row.updated_at).toISOString() : null,
      },
    });
  } catch (err: any) {
    console.error('[v1] GET /schedules/:id error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch schedule.' });
  }
});

// ─── GET /api/v1/users ────────────────────────────────────────────────────
router.get('/users', requireScope('read:users'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, page } = parsePagination(req.query);
    const { search, role, status } = req.query as Record<string, string>;

    // Tenant scoping: if the API key has an orgId, scope to that org
    const apiKeyOrgId = (req as any).v1ApiKey?.orgId;

    const conditions: any[] = [];
    if (apiKeyOrgId) conditions.push(eq(users.orgId, apiKeyOrgId));
    if (role) conditions.push(eq(users.role, role));
    if (status) conditions.push(eq(users.status, status));
    if (search) {
      conditions.push(
        or(
          ilike(users.firstName, `%${search}%`),
          ilike(users.lastName, `%${search}%`),
          ilike(users.email, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countRes] = await Promise.all([
      db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          status: users.status,
          orgId: users.orgId,
          profileImageUrl: users.profileImageUrl,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(asc(users.lastName))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(users).where(whereClause),
    ]);

    res.json(paginatedResponse(rows, Number(countRes[0]?.count || 0), page, limit));
  } catch (err: any) {
    console.error('[v1] GET /users error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch users.' });
  }
});

// ─── GET /api/v1/users/:id ────────────────────────────────────────────────
router.get('/users/:id', requireScope('read:users'), async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        status: users.status,
        orgId: users.orgId,
        profileImageUrl: users.profileImageUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.params.id))
      .limit(1);

    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' });
    res.json({ success: true, data: row });
  } catch (err: any) {
    console.error('[v1] GET /users/:id error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch user.' });
  }
});

export default router;
