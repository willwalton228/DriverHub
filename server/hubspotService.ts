import { storage } from "./storage";
import { geocodeAddress } from "./geocodingService";
import { db } from "./db";
import { sql } from "drizzle-orm";

const HUBSPOT_API_BASE = "https://api.hubapi.com";
const CUSTOMERS_ONLY_LIFECYCLE_STAGE = "customer";

interface HubSpotConfig {
  accessToken: string;
  isConfigured: boolean;
}

interface HubSpotCompany {
  id: string;
  properties: {
    name?: string;
    customer_number?: string;
    hs_lead_status?: string;
    customer_prospect_type?: string;
    legal_name?: string;
    domain?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    latitude?: string;
    longitude?: string;
    phone?: string;
    lifecyclestage?: string;
    hubspot_owner_id?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

interface HubSpotSearchResponse {
  total: number;
  results: HubSpotCompany[];
  paging?: {
    next?: {
      after: string;
    };
  };
}

export interface SyncResult {
  success: boolean;
  totalEvaluated: number;
  totalEligible: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  syncedAt: string;
  syncCustomersOnly: boolean;
}

export interface HubSpotSettings {
  syncCustomersOnly: boolean;
  lastSyncTotalEvaluated?: number;
  lastSyncTotalEligible?: number;
  lastSyncTotalCreated?: number;
  lastSyncTotalUpdated?: number;
  lastSyncTotalSkipped?: number;
  lastSyncErrorCount?: number;
  lastSyncAt?: string;
}

export class HubSpotApiError extends Error {
  httpStatus: number;
  errorCategory?: string;
  requestId?: string;

  constructor(httpStatus: number, message: string, errorCategory?: string, requestId?: string) {
    super(message);
    this.name = "HubSpotApiError";
    this.httpStatus = httpStatus;
    this.errorCategory = errorCategory;
    this.requestId = requestId;
  }
}

export function getHubSpotConfig(): HubSpotConfig {
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN || "";
  return {
    accessToken,
    isConfigured: !!accessToken,
  };
}

export function isHubSpotConfigured(): boolean {
  return !!process.env.HUBSPOT_ACCESS_TOKEN;
}

async function hubspotApiRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: object
): Promise<T> {
  const config = getHubSpotConfig();
  if (!config.isConfigured) {
    throw new Error("HubSpot is not configured. Please set HUBSPOT_ACCESS_TOKEN.");
  }

  const url = `${HUBSPOT_API_BASE}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    let errorMessage = `HubSpot API error (${response.status})`;
    let errorCategory: string | undefined;
    let requestId: string | undefined;

    try {
      const errorBody = await response.json() as Record<string, unknown>;
      errorMessage = (errorBody.message as string) || errorMessage;
      errorCategory = (errorBody.category as string) || (errorBody.error as string) || undefined;
      requestId = (errorBody.requestId as string) || (errorBody.correlationId as string) || undefined;
      console.error(`[HubSpot] API error ${response.status} ${endpoint}:`, JSON.stringify(errorBody, null, 2));
    } catch {
      const rawText = await response.text().catch(() => "");
      console.error(`[HubSpot] API error ${response.status} ${endpoint} (non-JSON):`, rawText);
      errorMessage = rawText ? `${errorMessage}: ${rawText}` : errorMessage;
    }

    throw new HubSpotApiError(response.status, errorMessage, errorCategory, requestId);
  }

  return response.json() as Promise<T>;
}

// Properties to request from HubSpot
const COMPANY_PROPERTIES = [
  "name",
  "customer_number",
  "hs_lead_status",
  "customer_prospect_type",
  "legal_name",
  "domain",
  "address",
  "city",
  "state",
  "zip",
  "latitude",
  "longitude",
  "phone",
  "lifecyclestage",
  "hubspot_owner_id",
];

async function fetchCustomerCompanies(
  syncCustomersOnly: boolean,
  after?: string
): Promise<HubSpotSearchResponse> {
  const searchBody: {
    filterGroups?: Array<{
      filters: Array<{
        propertyName: string;
        operator: string;
        value?: string;
      }>;
    }>;
    properties: string[];
    limit: number;
    after?: string;
  } = {
    properties: COMPANY_PROPERTIES,
    limit: 100,
  };

  if (syncCustomersOnly) {
    searchBody.filterGroups = [
      {
        filters: [
          {
            propertyName: "lifecyclestage",
            operator: "EQ",
            value: CUSTOMERS_ONLY_LIFECYCLE_STAGE,
          },
        ],
      },
    ];
  }

  if (after) {
    searchBody.after = after;
  }

  return hubspotApiRequest<HubSpotSearchResponse>(
    "/crm/v3/objects/companies/search",
    "POST",
    searchBody
  );
}

function mapHubSpotToCustomer(company: HubSpotCompany): {
  customerName: string;
  customerNumber?: string;
  status?: string;
  customerType?: string;
  customerLegalName?: string;
  customerWebsite?: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  customerZip?: string;
  customerLatitude?: string;
  customerLongitude?: string;
  primaryContactNumber?: string;
  hubspotId: string;
  hubspotSource: string;
  hubspotSyncStatus: string;
  hubspotLastSyncedAt: Date;
} {
  const props = company.properties;

  return {
    customerName: props.name || "Unknown Company",
    customerNumber: props.customer_number || undefined,
    customerType: props.customer_prospect_type || undefined,
    customerLegalName: props.legal_name || undefined,
    customerWebsite: props.domain || undefined,
    customerAddress: props.address || undefined,
    customerCity: props.city || undefined,
    customerState: props.state || undefined,
    customerZip: props.zip || undefined,
    customerLatitude: props.latitude || undefined,
    customerLongitude: props.longitude || undefined,
    primaryContactNumber: props.phone || undefined,
    hubspotId: company.id,
    hubspotSource: "hubspot",
    hubspotSyncStatus: "synced",
    hubspotLastSyncedAt: new Date(),
  };
}

// ─── Settings persistence (single-tenant, no orgId scoping needed) ────────────

export async function getHubSpotSettings(): Promise<HubSpotSettings> {
  try {
    const rows = await db.execute(
      sql`SELECT * FROM hubspot_settings ORDER BY created_at ASC LIMIT 1`
    );
    const row = (rows as any).rows?.[0] ?? (rows as any)[0];
    if (!row) {
      return { syncCustomersOnly: true };
    }
    return {
      syncCustomersOnly: row.sync_customers_only ?? true,
      lastSyncTotalEvaluated: row.last_sync_total_evaluated ?? undefined,
      lastSyncTotalEligible: row.last_sync_total_eligible ?? undefined,
      lastSyncTotalCreated: row.last_sync_total_created ?? undefined,
      lastSyncTotalUpdated: row.last_sync_total_updated ?? undefined,
      lastSyncTotalSkipped: row.last_sync_total_skipped ?? undefined,
      lastSyncErrorCount: row.last_sync_error_count ?? undefined,
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : undefined,
    };
  } catch (err) {
    console.error("[HubSpot] Failed to load settings:", err);
    return { syncCustomersOnly: true };
  }
}

export async function saveHubSpotSettings(
  settings: Partial<HubSpotSettings>
): Promise<void> {
  try {
    const existing = await db.execute(
      sql`SELECT id FROM hubspot_settings LIMIT 1`
    );
    const row = (existing as any).rows?.[0] ?? (existing as any)[0];

    if (row?.id) {
      await db.execute(
        sql`UPDATE hubspot_settings SET
          sync_customers_only = ${settings.syncCustomersOnly ?? true},
          last_sync_total_evaluated = ${settings.lastSyncTotalEvaluated ?? null},
          last_sync_total_eligible = ${settings.lastSyncTotalEligible ?? null},
          last_sync_total_created = ${settings.lastSyncTotalCreated ?? null},
          last_sync_total_updated = ${settings.lastSyncTotalUpdated ?? null},
          last_sync_total_skipped = ${settings.lastSyncTotalSkipped ?? null},
          last_sync_error_count = ${settings.lastSyncErrorCount ?? null},
          last_sync_at = ${settings.lastSyncAt ? new Date(settings.lastSyncAt) : null},
          updated_at = NOW()
        WHERE id = ${row.id}`
      );
    } else {
      await db.execute(
        sql`INSERT INTO hubspot_settings (
          sync_customers_only,
          last_sync_total_evaluated, last_sync_total_eligible,
          last_sync_total_created, last_sync_total_updated,
          last_sync_total_skipped, last_sync_error_count, last_sync_at
        ) VALUES (
          ${settings.syncCustomersOnly ?? true},
          ${settings.lastSyncTotalEvaluated ?? null},
          ${settings.lastSyncTotalEligible ?? null},
          ${settings.lastSyncTotalCreated ?? null},
          ${settings.lastSyncTotalUpdated ?? null},
          ${settings.lastSyncTotalSkipped ?? null},
          ${settings.lastSyncErrorCount ?? null},
          ${settings.lastSyncAt ? new Date(settings.lastSyncAt) : null}
        )`
      );
    }
  } catch (err) {
    console.error("[HubSpot] Failed to save settings:", err);
  }
}

// ─── Main Sync ────────────────────────────────────────────────────────────────

export async function syncCustomersFromHubSpot(
  opts: { syncCustomersOnly?: boolean } = {}
): Promise<SyncResult> {
  const settings = await getHubSpotSettings();
  const syncCustomersOnly = opts.syncCustomersOnly ?? settings.syncCustomersOnly;

  const result: SyncResult = {
    success: false,
    totalEvaluated: 0,
    totalEligible: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    syncedAt: new Date().toISOString(),
    syncCustomersOnly,
  };

  if (!isHubSpotConfigured()) {
    result.errors.push("HubSpot is not configured");
    return result;
  }

  try {
    let hasMore = true;
    let after: string | undefined;
    const allCompanies: HubSpotCompany[] = [];

    while (hasMore) {
      const response = await fetchCustomerCompanies(syncCustomersOnly, after);
      allCompanies.push(...response.results);

      if (response.paging?.next?.after) {
        after = response.paging.next.after;
      } else {
        hasMore = false;
      }
    }

    result.totalEvaluated = allCompanies.length;

    console.log(
      `[HubSpot Sync] Evaluated ${allCompanies.length} companies from HubSpot` +
      (syncCustomersOnly ? " (lifecyclestage=customer filter applied)" : " (all companies)")
    );

    for (const company of allCompanies) {
      try {
        const lifecycleStage = company.properties.lifecyclestage;
        const companyName = company.properties.name || `Company ${company.id}`;

        // Server-side enforcement: skip non-customers even if API filter already applied
        if (syncCustomersOnly && lifecycleStage !== CUSTOMERS_ONLY_LIFECYCLE_STAGE) {
          console.log(
            `[HubSpot Sync] SKIPPED (lifecyclestage="${lifecycleStage ?? "null"}"): ${companyName} (ID: ${company.id})`
          );
          result.skipped++;
          continue;
        }

        // Also skip records with null lifecyclestage when syncCustomersOnly is true
        if (syncCustomersOnly && !lifecycleStage) {
          console.log(`[HubSpot Sync] SKIPPED (lifecyclestage=null): ${companyName} (ID: ${company.id})`);
          result.skipped++;
          continue;
        }

        result.totalEligible++;

        const existingCustomer = await storage.getCustomerByHubspotId(company.id);
        const mappedData = mapHubSpotToCustomer(company);

        if (!mappedData.customerLatitude || !mappedData.customerLongitude) {
          try {
            const geocodeResult = await geocodeAddress(
              mappedData.customerAddress,
              mappedData.customerCity,
              mappedData.customerState,
              mappedData.customerZip
            );
            if (geocodeResult) {
              mappedData.customerLatitude = geocodeResult.latitude;
              mappedData.customerLongitude = geocodeResult.longitude;
              console.log(`[HubSpot Sync] Geocoded ${companyName}: ${geocodeResult.latitude}, ${geocodeResult.longitude}`);
            }
          } catch (geoErr) {
            console.warn(`[HubSpot Sync] Geocoding failed for ${companyName}:`, geoErr);
          }
        }

        if (existingCustomer) {
          // Never overwrite a merged account — merge state is managed exclusively by DriverHub
          if (existingCustomer.mergedIntoId) {
            console.log(`[HubSpot Sync] SKIPPED (account is merged): ${companyName} (ID: ${company.id})`);
            result.skipped++;
            continue;
          }
          await storage.updateCustomer(existingCustomer.id, mappedData);
          console.log(`[HubSpot Sync] Updated: ${companyName} (ID: ${company.id})`);
          result.updated++;
        } else {
          await storage.createCustomer(mappedData);
          console.log(`[HubSpot Sync] Created: ${companyName} (ID: ${company.id})`);
          result.created++;
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const companyName = company.properties.name || company.id;
        console.error(`[HubSpot Sync] ERROR syncing ${companyName} (ID: ${company.id}): ${error}`);
        result.errors.push(`Failed to sync company "${companyName}": ${error}`);
      }
    }

    result.success = result.errors.length === 0;

    console.log(
      `[HubSpot Sync] Complete — evaluated=${result.totalEvaluated} eligible=${result.totalEligible} ` +
      `created=${result.created} updated=${result.updated} skipped=${result.skipped} errors=${result.errors.length}`
    );

    // Persist sync stats to settings
    await saveHubSpotSettings({
      syncCustomersOnly,
      lastSyncTotalEvaluated: result.totalEvaluated,
      lastSyncTotalEligible: result.totalEligible,
      lastSyncTotalCreated: result.created,
      lastSyncTotalUpdated: result.updated,
      lastSyncTotalSkipped: result.skipped,
      lastSyncErrorCount: result.errors.length,
      lastSyncAt: result.syncedAt,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    result.errors.push(`Sync failed: ${error}`);
    console.error("[HubSpot Sync] Fatal error:", err);
  }

  return result;
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function getSyncStatus(): Promise<{
  isConfigured: boolean;
  totalCustomers: number;
  syncedFromHubSpot: number;
  lastSyncDate?: string;
  pendingSync: number;
  errorCount: number;
  settings: HubSpotSettings;
}> {
  const isConfigured = isHubSpotConfigured();
  const settings = await getHubSpotSettings();

  const customers = await storage.getAllCustomers();
  const syncedFromHubSpot = customers.filter((c) => c.hubspotId && c.hubspotSyncStatus === "synced").length;
  const pendingSync = customers.filter((c) => c.hubspotSyncStatus === "pending").length;
  const errorCount = customers.filter((c) => c.hubspotSyncStatus === "error").length;

  const lastSynced = customers
    .filter((c) => c.hubspotLastSyncedAt)
    .sort((a, b) => new Date(b.hubspotLastSyncedAt!).getTime() - new Date(a.hubspotLastSyncedAt!).getTime())[0];

  return {
    isConfigured,
    totalCustomers: customers.length,
    syncedFromHubSpot,
    lastSyncDate: lastSynced?.hubspotLastSyncedAt
      ? new Date(lastSynced.hubspotLastSyncedAt).toISOString()
      : undefined,
    pendingSync,
    errorCount,
    settings,
  };
}

// ─── Test Connection ──────────────────────────────────────────────────────────

export async function testHubSpotConnection(): Promise<{
  success: boolean;
  message: string;
  companyCount?: number;
  customerCount?: number;
}> {
  if (!isHubSpotConfigured()) {
    return {
      success: false,
      message: "HubSpot is not configured. Please set HUBSPOT_ACCESS_TOKEN secret.",
    };
  }

  try {
    // Test with a lightweight lifecycle=customer query to validate the filter works
    const response = await hubspotApiRequest<HubSpotSearchResponse>(
      "/crm/v3/objects/companies/search",
      "POST",
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "lifecyclestage",
                operator: "EQ",
                value: "customer",
              },
            ],
          },
        ],
        properties: ["name", "lifecyclestage"],
        limit: 1,
      }
    );

    return {
      success: true,
      message: "Successfully connected to HubSpot",
      customerCount: response.total,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to connect to HubSpot: ${error}`,
    };
  }
}

// ─── Properties ───────────────────────────────────────────────────────────────

export interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description: string;
  groupName: string;
  options?: { label: string; value: string }[];
  hubspotDefined: boolean;
}

interface HubSpotPropertiesResponse {
  results: HubSpotProperty[];
}

export async function getHubSpotCompanyProperties(): Promise<{
  success: boolean;
  properties?: HubSpotProperty[];
  error?: string;
}> {
  if (!isHubSpotConfigured()) {
    return {
      success: false,
      error: "HubSpot is not configured. Please set HUBSPOT_ACCESS_TOKEN secret.",
    };
  }

  try {
    const response = await hubspotApiRequest<HubSpotPropertiesResponse>(
      "/crm/v3/properties/companies",
      "GET"
    );

    const sorted = response.results.sort((a, b) => {
      if (a.hubspotDefined !== b.hubspotDefined) {
        return a.hubspotDefined ? -1 : 1;
      }
      return a.label.localeCompare(b.label);
    });

    return {
      success: true,
      properties: sorted,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[HubSpot] Failed to fetch company properties:", error);
    return {
      success: false,
      error: `Failed to fetch HubSpot properties: ${error}`,
    };
  }
}
