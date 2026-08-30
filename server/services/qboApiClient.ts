/**
 * QuickBooks Online API Client — Phase 1 Read-Only
 * Handles OAuth 2.0 token refresh and QBO REST API calls for expense data.
 */

import { db } from "../db";
import { quickbooksSettings } from "../../shared/schema";
import { eq } from "drizzle-orm";

const QBO_BASE = "https://quickbooks.api.intuit.com/v3/company";
const SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com/v3/company";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export interface QBOTokens {
  accessToken: string;
  refreshToken: string;
  realmId: string;
  expiresAt: Date;
}

export interface QBOQueryResult<T> {
  QueryResponse: Record<string, T[]> & { startPosition: number; maxResults: number; totalCount?: number };
  time: string;
}

function useSandbox(): boolean {
  return process.env.QBO_SANDBOX === "true" || process.env.NODE_ENV === "development";
}

function base(realmId: string): string {
  return `${useSandbox() ? SANDBOX_BASE : QBO_BASE}/${realmId}`;
}

// ── Token management ──────────────────────────────────────────────────────────

export async function getValidTokens(): Promise<QBOTokens | null> {
  const [row] = await db.select().from(quickbooksSettings).limit(1);
  if (!row?.isConnected || !row.accessToken || !row.realmId) return null;

  // If token is still valid (5-min buffer), return as-is
  const now = Date.now();
  const expiry = row.tokenExpiresAt ? new Date(row.tokenExpiresAt).getTime() : 0;
  if (expiry - now > 5 * 60 * 1000) {
    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken!,
      realmId: row.realmId,
      expiresAt: new Date(expiry),
    };
  }

  // Refresh the token
  if (!row.refreshToken) {
    await db.update(quickbooksSettings)
      .set({ connectionError: "Refresh token missing — re-connect QuickBooks", isConnected: false })
      .where(eq(quickbooksSettings.id, row.id));
    return null;
  }

  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    // In stub mode: return tokens as-is without refresh
    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      realmId: row.realmId,
      expiresAt: new Date(expiry),
    };
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: row.refreshToken,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      await db.update(quickbooksSettings)
        .set({ connectionError: `Token refresh failed: ${err}`, isConnected: false })
        .where(eq(quickbooksSettings.id, row.id));
      return null;
    }

    const data = await resp.json() as any;
    const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
    await db.update(quickbooksSettings)
      .set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || row.refreshToken,
        tokenExpiresAt: newExpiry,
        connectionError: null,
        updatedAt: new Date(),
      })
      .where(eq(quickbooksSettings.id, row.id));

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || row.refreshToken,
      realmId: row.realmId,
      expiresAt: newExpiry,
    };
  } catch (err: any) {
    await db.update(quickbooksSettings)
      .set({ connectionError: `Token refresh error: ${err.message}` })
      .where(eq(quickbooksSettings.id, row.id));
    return null;
  }
}

// ── Core API helpers ──────────────────────────────────────────────────────────

async function qboGet<T>(path: string, tokens: QBOTokens): Promise<T> {
  const url = `${base(tokens.realmId)}${path}`;
  const resp = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${tokens.accessToken}`,
      "Accept": "application/json",
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`QBO API ${resp.status}: ${body.slice(0, 300)}`);
  }
  return resp.json() as Promise<T>;
}

async function qboQuery<T>(entity: string, where: string, tokens: QBOTokens, maxResults = 1000): Promise<T[]> {
  const q = encodeURIComponent(`SELECT * FROM ${entity} WHERE ${where} MAXRESULTS ${maxResults}`);
  const data = await qboGet<QBOQueryResult<T>>(`/query?query=${q}`, tokens);
  return (data.QueryResponse?.[entity] as T[]) ?? [];
}

async function qboQueryAll<T>(entity: string, where: string, tokens: QBOTokens): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let start = 1;
  while (true) {
    const q = encodeURIComponent(`SELECT * FROM ${entity} WHERE ${where} STARTPOSITION ${start} MAXRESULTS ${PAGE}`);
    const data = await qboGet<QBOQueryResult<T>>(`/query?query=${q}`, tokens);
    const rows = (data.QueryResponse?.[entity] as T[]) ?? [];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    start += PAGE;
  }
  return all;
}

// ── Expense data fetchers ─────────────────────────────────────────────────────

export interface QBOTransaction {
  Id: string;
  TxnDate: string;
  TotalAmt: number;
  DocNumber?: string;
  PrivateNote?: string;
  Memo?: string;
  PaymentMethodRef?: { name: string };
  VendorRef?: { value: string; name: string };
  EntityRef?: { value: string; name: string };
  AccountRef?: { value: string; name: string };
  DepartmentRef?: { value: string; name: string };
  PayType?: string;
  Line?: QBOLine[];
  CurrencyRef?: { value: string };
  sparse?: boolean;
  MetaData?: { CreateTime: string; LastUpdatedTime: string };
}

export interface QBOLine {
  Id?: string;
  Amount: number;
  DetailType: string;
  Description?: string;
  AccountBasedExpenseLineDetail?: {
    AccountRef?: { value: string; name: string };
    BillableStatus?: string;
    CustomerRef?: { value: string; name: string };
    ClassRef?: { value: string; name: string };
    TaxCodeRef?: { value: string };
  };
  JournalEntryLineDetail?: {
    PostingType: string;
    AccountRef?: { value: string; name: string };
    Entity?: { EntityRef?: { value: string; name: string } };
  };
}

export interface QBOVendor {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  TaxIdentifier?: string;
  Active: boolean;
}

export interface QBOAccount {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  AccountType: string;
  AccountSubType?: string;
  Classification?: string;
  Active: boolean;
  ParentRef?: { value: string };
}

export async function fetchBills(tokens: QBOTokens, since: string, until: string): Promise<QBOTransaction[]> {
  return qboQueryAll<QBOTransaction>("Bill", `TxnDate >= '${since}' AND TxnDate <= '${until}'`, tokens);
}

export async function fetchBillPayments(tokens: QBOTokens, since: string, until: string): Promise<QBOTransaction[]> {
  return qboQueryAll<QBOTransaction>("BillPayment", `TxnDate >= '${since}' AND TxnDate <= '${until}'`, tokens);
}

export async function fetchChecks(tokens: QBOTokens, since: string, until: string): Promise<QBOTransaction[]> {
  // Checks are "Purchase" with PayType = Check
  return qboQueryAll<QBOTransaction>("Purchase", `TxnDate >= '${since}' AND TxnDate <= '${until}'`, tokens);
}

export async function fetchJournalEntries(tokens: QBOTokens, since: string, until: string): Promise<QBOTransaction[]> {
  return qboQueryAll<QBOTransaction>("JournalEntry", `TxnDate >= '${since}' AND TxnDate <= '${until}'`, tokens);
}

export async function fetchVendors(tokens: QBOTokens): Promise<QBOVendor[]> {
  const PAGE = 1000;
  let all: QBOVendor[] = [];
  let start = 1;
  while (true) {
    const q = encodeURIComponent(`SELECT * FROM Vendor STARTPOSITION ${start} MAXRESULTS ${PAGE}`);
    const data = await qboGet<QBOQueryResult<QBOVendor>>(`/query?query=${q}`, tokens);
    const rows = (data.QueryResponse?.Vendor as QBOVendor[]) ?? [];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    start += PAGE;
  }
  return all;
}

export async function fetchExpenseAccounts(tokens: QBOTokens): Promise<QBOAccount[]> {
  const q = encodeURIComponent(
    `SELECT * FROM Account WHERE AccountType IN ('Expense','Cost of Goods Sold','Other Expense') MAXRESULTS 1000`
  );
  const data = await qboGet<QBOQueryResult<QBOAccount>>(`/query?query=${q}`, tokens);
  return (data.QueryResponse?.Account as QBOAccount[]) ?? [];
}

// ── AR-side interfaces ─────────────────────────────────────────────────────────

export interface QBOCustomer {
  Id: string;
  SyncToken: string;
  DisplayName: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1?: string; City?: string; CountrySubDivisionCode?: string; PostalCode?: string;
  };
  Active: boolean;
  Balance?: number;
  BalanceWithJobs?: number;
  MetaData?: { CreateTime: string; LastUpdatedTime: string };
}

export interface QBOInvoiceLine {
  Id?: string;
  LineNum?: number;
  Amount: number;
  DetailType: string;
  Description?: string;
  SalesItemLineDetail?: {
    ItemRef?: { value: string; name: string };
    Qty?: number;
    UnitPrice?: number;
    ClassRef?: { value: string; name: string };
    ServiceDate?: string;
  };
  SubTotalLineDetail?: Record<string, unknown>;
  DiscountLineDetail?: Record<string, unknown>;
}

export interface QBOInvoice {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  DueDate?: string;
  DocNumber?: string;
  CustomerRef?: { value: string; name: string };
  TotalAmt: number;
  Balance?: number;
  TxnTaxDetail?: { TotalTax?: number };
  PrintStatus?: string;
  EmailStatus?: string;
  BillStatus?: string;
  PrivateNote?: string;
  CustomerMemo?: { value?: string };
  ClassRef?: { value: string; name: string };
  DepartmentRef?: { value: string; name: string };
  Line?: QBOInvoiceLine[];
  LinkedTxn?: Array<{ TxnId: string; TxnType: string }>;
  MetaData?: { CreateTime: string; LastUpdatedTime: string };
}

export interface QBOPaymentReceived {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  DocNumber?: string;
  CustomerRef?: { value: string; name: string };
  TotalAmt: number;
  UnappliedAmt?: number;
  PrivateNote?: string;
  Line?: Array<{
    Amount: number;
    LinkedTxn?: Array<{ TxnId: string; TxnType: string }>;
  }>;
  LinkedTxn?: Array<{ TxnId: string; TxnType: string }>;
  MetaData?: { CreateTime: string; LastUpdatedTime: string };
}

// ── AR fetch functions ─────────────────────────────────────────────────────────

export async function fetchCustomers(tokens: QBOTokens): Promise<QBOCustomer[]> {
  const PAGE = 1000;
  let all: QBOCustomer[] = [];
  let start = 1;
  while (true) {
    const q = encodeURIComponent(`SELECT * FROM Customer STARTPOSITION ${start} MAXRESULTS ${PAGE}`);
    const data = await qboGet<QBOQueryResult<QBOCustomer>>(`/query?query=${q}`, tokens);
    const rows = (data.QueryResponse?.Customer as QBOCustomer[]) ?? [];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    start += PAGE;
  }
  return all;
}

export async function fetchInvoices(tokens: QBOTokens, since: string, until: string): Promise<QBOInvoice[]> {
  return qboQueryAll<QBOInvoice>("Invoice", `TxnDate >= '${since}' AND TxnDate <= '${until}'`, tokens);
}

export async function fetchPaymentsReceived(tokens: QBOTokens, since: string, until: string): Promise<QBOPaymentReceived[]> {
  return qboQueryAll<QBOPaymentReceived>("Payment", `TxnDate >= '${since}' AND TxnDate <= '${until}'`, tokens);
}

export async function fetchCreditMemos(tokens: QBOTokens, since: string, until: string): Promise<QBOInvoice[]> {
  return qboQueryAll<QBOInvoice>("CreditMemo", `TxnDate >= '${since}' AND TxnDate <= '${until}'`, tokens);
}
