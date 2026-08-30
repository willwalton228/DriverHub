/**
 * QuickBooks Web Connector (QBWC) Service — Phase 1
 *
 * DriverHub acts as the SOAP server. QBWC (running on the Windows machine
 * alongside QB Desktop Enterprise 24) polls this service via HTTPS SOAP calls.
 *
 * Protocol flow:
 *   QBWC → serverVersion()         → returns server version
 *   QBWC → clientVersion(v)        → returns "" (OK)
 *   QBWC → authenticate(u,p)       → returns [ticket, ""] or ["","nvu"]
 *   QBWC → sendRequestXML(ticket)  → returns next qbXML query or "" when done
 *   QBWC → receiveResponseXML(...) → server parses response, returns % complete
 *   (repeat sendRequest/receiveResponse for each query in the queue)
 *   QBWC → closeConnection(ticket) → returns "OK"
 *
 * Read-only in Phase 1: DriverHub only sends Query requests, never Add/Mod/Del.
 */

import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { qboWcSessions, qboSyncQueue } from "../../shared/schema";
import { auditLog, enqueueJob } from "./qboSyncEngine";
import crypto from "crypto";

// ── Constants ──────────────────────────────────────────────────────────────────

export const QBWC_SERVER_VERSION = "1.0.0";

/** Ordered list of qbXML query types executed in a full sync session */
export const FULL_SYNC_QUERY_QUEUE = [
  "AccountQuery",
  "VendorQuery",
  "CustomerQuery",
  "InvoiceQuery",
  "ReceivePaymentQuery",
  "CreditMemoQuery",
  "BillQuery",
  "BillPaymentCheckQuery",
  "BillPaymentCreditCardQuery",
  "CheckQuery",
  "CreditCardChargeQuery",
];

/** Per-session in-memory cache to avoid DB round-trips on every SOAP call */
const sessionCache = new Map<string, {
  ticket: string;
  queryQueue: string[];
  currentQueryIdx: number;
  queriesTotal: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  status: string;
  errorMessage?: string;
  recordsProcessed: number;
}>();

// ── SOAP envelope helpers ──────────────────────────────────────────────────────

const SOAP_NS = 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/1999/XMLSchema-instance" xmlns:xsd="http://www.w3.org/1999/XMLSchema"';
const QBWC_NS = 'xmlns="http://developer.intuit.com/"';

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function extractAllTags(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

export function parseSoapMethod(xml: string): { method: string; params: Record<string, string> } {
  const bodyMatch = xml.match(/<(?:[^:>]+:)?Body[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Body>/i);
  if (!bodyMatch) return { method: "", params: {} };

  const body = bodyMatch[1];
  const methodMatch = body.match(/<([A-Za-z][A-Za-z0-9_]*)[\s>]/);
  const method = methodMatch ? methodMatch[1] : "";

  const params: Record<string, string> = {};
  const paramRe = /<([A-Za-z][A-Za-z0-9_]*)>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = paramRe.exec(body)) !== null) {
    params[m[1]] = m[2].trim();
  }
  return { method, params };
}

export function buildSoapResponse(method: string, innerXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope ${SOAP_NS}>
  <soap:Body>
    <${method}Response ${QBWC_NS}>
      ${innerXml}
    </${method}Response>
  </soap:Body>
</soap:Envelope>`;
}

// ── SOAP method handlers ───────────────────────────────────────────────────────

export function handleServerVersion(): string {
  return buildSoapResponse("serverVersion",
    `<serverVersionResult>${QBWC_SERVER_VERSION}</serverVersionResult>`
  );
}

export function handleClientVersion(strVersion: string): string {
  // Accept any version; return "" for OK, "W:message" for warning, "E:message" to reject
  return buildSoapResponse("clientVersion",
    `<clientVersionResult></clientVersionResult>`
  );
}

export async function handleAuthenticate(strUserName: string, strPassword: string): Promise<string> {
  const isValid = await validateQbwcCredentials(strUserName, strPassword);
  if (!isValid) {
    return buildSoapResponse("authenticate",
      `<authenticateResult><string></string><string>nvu</string></authenticateResult>`
    );
  }

  const ticket = crypto.randomUUID();
  const now = new Date();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const until = now.toISOString().slice(0, 10);

  // Persist session to DB
  await db.insert(qboWcSessions).values({
    ticket,
    username: strUserName,
    status: "active",
    queryQueue: FULL_SYNC_QUERY_QUEUE,
    currentQueryIdx: 0,
    queriesTotal: FULL_SYNC_QUERY_QUEUE.length,
    dateRangeStart: since,
    dateRangeEnd: until,
    recordsProcessed: 0,
    lastHeartbeat: now,
  });

  // Cache in memory
  sessionCache.set(ticket, {
    ticket,
    queryQueue: [...FULL_SYNC_QUERY_QUEUE],
    currentQueryIdx: 0,
    queriesTotal: FULL_SYNC_QUERY_QUEUE.length,
    dateRangeStart: since,
    dateRangeEnd: until,
    status: "active",
    recordsProcessed: 0,
  });

  await auditLog({
    eventType: "qbwc_session_started",
    entityType: "qbwc_session",
    entityId: ticket,
    message: `QBWC session authenticated for user ${strUserName}`,
    details: { ticket, since, until },
  });

  // Return [ticket, ""] — empty second string means use file currently open in QB
  return buildSoapResponse("authenticate",
    `<authenticateResult><string>${ticket}</string><string></string></authenticateResult>`
  );
}

export async function handleSendRequestXML(
  ticket: string,
  strHCPResponse: string,
  strCompanyFileName: string,
  qbXMLCountry: string,
  qbXMLMajorVers: string,
  qbXMLMinorVers: string,
): Promise<string> {
  const session = await getOrLoadSession(ticket);
  if (!session) {
    return buildSoapResponse("sendRequestXML", `<sendRequestXMLResult></sendRequestXMLResult>`);
  }

  // Update company file if provided
  if (strCompanyFileName) {
    await db.update(qboWcSessions)
      .set({ companyFile: strCompanyFileName, lastHeartbeat: new Date() })
      .where(eq(qboWcSessions.ticket, ticket));
  }

  if (session.currentQueryIdx >= session.queriesTotal) {
    // All done — return empty string to signal QBWC we're finished
    return buildSoapResponse("sendRequestXML", `<sendRequestXMLResult></sendRequestXMLResult>`);
  }

  const queryType = session.queryQueue[session.currentQueryIdx];
  const qbXml = buildQueryRq(queryType, session.dateRangeStart, session.dateRangeEnd);

  return buildSoapResponse("sendRequestXML",
    `<sendRequestXMLResult><![CDATA[${qbXml}]]></sendRequestXMLResult>`
  );
}

export async function handleReceiveResponseXML(
  ticket: string,
  response: string,
  hresult: string,
  message: string,
): Promise<string> {
  const session = await getOrLoadSession(ticket);
  if (!session) {
    return buildSoapResponse("receiveResponseXML", `<receiveResponseXMLResult>-1</receiveResponseXMLResult>`);
  }

  let recordCount = 0;
  const queryType = session.queryQueue[session.currentQueryIdx];

  if (hresult && hresult !== "0x00000000") {
    // QB reported an error for this query — log and skip it
    await auditLog({
      eventType: "qbwc_query_error",
      entityType: "qbwc_session",
      entityId: ticket,
      message: `QBWC query ${queryType} error: ${hresult} — ${message}`,
      severity: "warning",
      details: { queryType, hresult, message },
    });
  } else if (response) {
    try {
      recordCount = await parseQueryRs(queryType, response);
    } catch (err: any) {
      console.error(`[QBWC] Parse error for ${queryType}:`, err.message);
      await auditLog({
        eventType: "qbwc_parse_error",
        entityType: "qbwc_session",
        entityId: ticket,
        message: `Parse error for ${queryType}: ${err.message}`,
        severity: "error",
      });
    }
  }

  // Advance to next query
  const nextIdx = session.currentQueryIdx + 1;
  const totalProcessed = session.recordsProcessed + recordCount;
  const percentComplete = Math.floor((nextIdx / session.queriesTotal) * 100);

  // Update cache
  session.currentQueryIdx = nextIdx;
  session.recordsProcessed = totalProcessed;

  // Persist to DB
  await db.update(qboWcSessions).set({
    currentQueryIdx: nextIdx,
    recordsProcessed: totalProcessed,
    lastHeartbeat: new Date(),
    updatedAt: new Date(),
  }).where(eq(qboWcSessions.ticket, ticket));

  await auditLog({
    eventType: "qbwc_query_completed",
    entityType: "qbwc_session",
    entityId: ticket,
    message: `QBWC ${queryType} completed: ${recordCount} records. Progress: ${percentComplete}%`,
    details: { queryType, recordCount, percentComplete, nextIdx },
  });

  return buildSoapResponse("receiveResponseXML",
    `<receiveResponseXMLResult>${percentComplete}</receiveResponseXMLResult>`
  );
}

export async function handleConnectionError(ticket: string, hresult: string, message: string): Promise<string> {
  const errMsg = `QBWC connection error: ${hresult} — ${message}`;
  sessionCache.delete(ticket);

  await db.update(qboWcSessions).set({
    status: "error",
    errorMessage: errMsg,
    updatedAt: new Date(),
  }).where(eq(qboWcSessions.ticket, ticket));

  await auditLog({
    eventType: "qbwc_connection_error",
    entityType: "qbwc_session",
    entityId: ticket,
    message: errMsg,
    severity: "error",
    details: { hresult, message },
  });

  return buildSoapResponse("connectionError", `<connectionErrorResult>done</connectionErrorResult>`);
}

export async function handleGetLastError(ticket: string): Promise<string> {
  const session = sessionCache.get(ticket);
  const err = session?.errorMessage ?? "";
  return buildSoapResponse("getLastError", `<getLastErrorResult>${err}</getLastErrorResult>`);
}

export async function handleCloseConnection(ticket: string): Promise<string> {
  const session = sessionCache.get(ticket);
  sessionCache.delete(ticket);

  await db.update(qboWcSessions).set({
    status: "completed",
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(qboWcSessions.ticket, ticket));

  await auditLog({
    eventType: "qbwc_session_closed",
    entityType: "qbwc_session",
    entityId: ticket,
    message: `QBWC session closed. Total records processed: ${session?.recordsProcessed ?? 0}`,
    details: { recordsProcessed: session?.recordsProcessed ?? 0 },
  });

  return buildSoapResponse("closeConnection", `<closeConnectionResult>OK</closeConnectionResult>`);
}

// ── Main SOAP dispatcher ───────────────────────────────────────────────────────

export async function handleSoapRequest(xmlBody: string): Promise<string> {
  const { method, params } = parseSoapMethod(xmlBody);

  switch (method) {
    case "serverVersion":
      return handleServerVersion();
    case "clientVersion":
      return handleClientVersion(params.strVersion ?? "");
    case "authenticate":
      return handleAuthenticate(params.strUserName ?? "", params.strPassword ?? "");
    case "sendRequestXML":
      return handleSendRequestXML(
        params.ticket ?? "",
        params.strHCPResponse ?? "",
        params.strCompanyFileName ?? "",
        params.qbXMLCountry ?? "",
        params.qbXMLMajorVers ?? "",
        params.qbXMLMinorVers ?? "",
      );
    case "receiveResponseXML":
      return handleReceiveResponseXML(
        params.ticket ?? "",
        params.response ?? "",
        params.hresult ?? "",
        params.message ?? "",
      );
    case "connectionError":
      return handleConnectionError(
        params.ticket ?? "",
        params.hresult ?? "",
        params.message ?? "",
      );
    case "getLastError":
      return handleGetLastError(params.ticket ?? "");
    case "closeConnection":
      return handleCloseConnection(params.ticket ?? "");
    default:
      return buildSoapResponse("unknown", `<result>Unknown method: ${method}</result>`);
  }
}

// ── Session helpers ────────────────────────────────────────────────────────────

async function getOrLoadSession(ticket: string) {
  if (sessionCache.has(ticket)) return sessionCache.get(ticket)!;

  // Load from DB (handles server restart)
  const [row] = await db.select().from(qboWcSessions)
    .where(eq(qboWcSessions.ticket, ticket)).limit(1);
  if (!row) return null;

  const state = {
    ticket: row.ticket,
    queryQueue: (row.queryQueue ?? FULL_SYNC_QUERY_QUEUE) as string[],
    currentQueryIdx: row.currentQueryIdx ?? 0,
    queriesTotal: row.queriesTotal ?? FULL_SYNC_QUERY_QUEUE.length,
    dateRangeStart: row.dateRangeStart ?? new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    dateRangeEnd: row.dateRangeEnd ?? new Date().toISOString().slice(0, 10),
    status: row.status,
    errorMessage: row.errorMessage ?? undefined,
    recordsProcessed: row.recordsProcessed ?? 0,
  };
  sessionCache.set(ticket, state);
  return state;
}

// ── Credential validation ──────────────────────────────────────────────────────

async function validateQbwcCredentials(username: string, password: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT wc_username, wc_password_hash FROM quickbooks_settings LIMIT 1
    `);
    const rows = (result.rows ?? result) as any[];
    if (!rows.length || !rows[0].wc_username) return false;
    if (rows[0].wc_username !== username) return false;
    const hash = crypto.createHash("sha256").update(password).digest("hex");
    return rows[0].wc_password_hash === hash;
  } catch {
    return false;
  }
}

export async function getQbwcSettings(): Promise<{ username?: string; configured: boolean; ownerGuid: string; fileGuid: string }> {
  try {
    const result = await db.execute(sql`
      SELECT wc_username, wc_owner_guid, wc_file_guid FROM quickbooks_settings LIMIT 1
    `);
    const rows = (result.rows ?? result) as any[];
    if (!rows.length || !rows[0].wc_username) {
      return { configured: false, ownerGuid: generateGuid(), fileGuid: generateGuid() };
    }
    return {
      configured: true,
      username:  rows[0].wc_username,
      ownerGuid: rows[0].wc_owner_guid ?? generateGuid(),
      fileGuid:  rows[0].wc_file_guid  ?? generateGuid(),
    };
  } catch {
    return { configured: false, ownerGuid: generateGuid(), fileGuid: generateGuid() };
  }
}

export async function saveQbwcSettings(username: string, password: string): Promise<void> {
  const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
  const ownerGuid = generateGuid();
  const fileGuid  = generateGuid();
  // Upsert: insert a row if none exists, otherwise update
  const existing = await db.execute(sql`SELECT id FROM quickbooks_settings LIMIT 1`);
  const rows = (existing.rows ?? existing) as any[];
  if (rows.length > 0) {
    await db.execute(sql`
      UPDATE quickbooks_settings
      SET wc_username = ${username}, wc_password_hash = ${passwordHash},
          wc_owner_guid = ${ownerGuid}, wc_file_guid = ${fileGuid},
          updated_at = NOW()
      WHERE id = ${rows[0].id}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO quickbooks_settings (wc_username, wc_password_hash, wc_owner_guid, wc_file_guid)
      VALUES (${username}, ${passwordHash}, ${ownerGuid}, ${fileGuid})
    `);
  }
}

function generateGuid(): string {
  return crypto.randomUUID().toUpperCase();
}

// ── qbXML request builders ─────────────────────────────────────────────────────

export function buildQueryRq(queryType: string, since: string, until: string): string {
  switch (queryType) {
    case "AccountQuery":         return buildAccountQueryRq();
    case "VendorQuery":          return buildVendorQueryRq(since);
    case "CustomerQuery":        return buildCustomerQueryRq(since);
    case "InvoiceQuery":         return buildInvoiceQueryRq(since, until);
    case "ReceivePaymentQuery":  return buildReceivePaymentQueryRq(since, until);
    case "CreditMemoQuery":      return buildCreditMemoQueryRq(since, until);
    case "BillQuery":            return buildBillQueryRq(since, until);
    case "BillPaymentCheckQuery":       return buildBillPaymentCheckQueryRq(since, until);
    case "BillPaymentCreditCardQuery":  return buildBillPaymentCreditCardQueryRq(since, until);
    case "CheckQuery":           return buildCheckQueryRq(since, until);
    case "CreditCardChargeQuery":       return buildCreditCardChargeQueryRq(since, until);
    default: return "";
  }
}

function qbxmlHeader(version = "13.0"): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<?qbxml version="${version}"?>\n<QBXML>\n  <QBXMLMsgsRq onError="continueOnError">`;
}
const qbxmlFooter = `  </QBXMLMsgsRq>\n</QBXML>`;

function modDateFilter(since: string, until?: string): string {
  return `<ModifiedDateRangeFilter><FromModifiedDate>${since}</FromModifiedDate>${until ? `<ToModifiedDate>${until}</ToModifiedDate>` : ""}</ModifiedDateRangeFilter>`;
}
function txnDateFilter(since: string, until: string): string {
  return `<TxnDateRangeFilter><FromTxnDate>${since}</FromTxnDate><ToTxnDate>${until}</ToTxnDate></TxnDateRangeFilter>`;
}

function buildAccountQueryRq(): string {
  return `${qbxmlHeader()}
    <AccountQueryRq requestID="AccountQuery">
      <ActiveStatus>All</ActiveStatus>
    </AccountQueryRq>
${qbxmlFooter}`;
}

function buildVendorQueryRq(since: string): string {
  return `${qbxmlHeader()}
    <VendorQueryRq requestID="VendorQuery">
      <ActiveStatus>All</ActiveStatus>
      ${modDateFilter(since)}
    </VendorQueryRq>
${qbxmlFooter}`;
}

function buildCustomerQueryRq(since: string): string {
  return `${qbxmlHeader()}
    <CustomerQueryRq requestID="CustomerQuery">
      <ActiveStatus>All</ActiveStatus>
      ${modDateFilter(since)}
    </CustomerQueryRq>
${qbxmlFooter}`;
}

function buildInvoiceQueryRq(since: string, until: string): string {
  return `${qbxmlHeader()}
    <InvoiceQueryRq requestID="InvoiceQuery">
      <MaxReturned>500</MaxReturned>
      ${txnDateFilter(since, until)}
      <IncludeLineItems>true</IncludeLineItems>
    </InvoiceQueryRq>
${qbxmlFooter}`;
}

function buildReceivePaymentQueryRq(since: string, until: string): string {
  return `${qbxmlHeader()}
    <ReceivePaymentQueryRq requestID="ReceivePaymentQuery">
      <MaxReturned>500</MaxReturned>
      ${txnDateFilter(since, until)}
    </ReceivePaymentQueryRq>
${qbxmlFooter}`;
}

function buildCreditMemoQueryRq(since: string, until: string): string {
  return `${qbxmlHeader()}
    <CreditMemoQueryRq requestID="CreditMemoQuery">
      <MaxReturned>500</MaxReturned>
      ${txnDateFilter(since, until)}
      <IncludeLineItems>true</IncludeLineItems>
    </CreditMemoQueryRq>
${qbxmlFooter}`;
}

function buildBillQueryRq(since: string, until: string): string {
  return `${qbxmlHeader()}
    <BillQueryRq requestID="BillQuery">
      <MaxReturned>500</MaxReturned>
      ${txnDateFilter(since, until)}
      <IncludeLineItems>true</IncludeLineItems>
    </BillQueryRq>
${qbxmlFooter}`;
}

function buildBillPaymentCheckQueryRq(since: string, until: string): string {
  return `${qbxmlHeader()}
    <BillPaymentCheckQueryRq requestID="BillPaymentCheckQuery">
      <MaxReturned>500</MaxReturned>
      ${txnDateFilter(since, until)}
    </BillPaymentCheckQueryRq>
${qbxmlFooter}`;
}

function buildBillPaymentCreditCardQueryRq(since: string, until: string): string {
  return `${qbxmlHeader()}
    <BillPaymentCreditCardQueryRq requestID="BillPaymentCreditCardQuery">
      <MaxReturned>500</MaxReturned>
      ${txnDateFilter(since, until)}
    </BillPaymentCreditCardQueryRq>
${qbxmlFooter}`;
}

function buildCheckQueryRq(since: string, until: string): string {
  return `${qbxmlHeader()}
    <CheckQueryRq requestID="CheckQuery">
      <MaxReturned>500</MaxReturned>
      ${txnDateFilter(since, until)}
      <IncludeLineItems>true</IncludeLineItems>
    </CheckQueryRq>
${qbxmlFooter}`;
}

function buildCreditCardChargeQueryRq(since: string, until: string): string {
  return `${qbxmlHeader()}
    <CreditCardChargeQueryRq requestID="CreditCardChargeQuery">
      <MaxReturned>500</MaxReturned>
      ${txnDateFilter(since, until)}
      <IncludeLineItems>true</IncludeLineItems>
    </CreditCardChargeQueryRq>
${qbxmlFooter}`;
}

// ── qbXML response parsers ─────────────────────────────────────────────────────

export async function parseQueryRs(queryType: string, xml: string): Promise<number> {
  switch (queryType) {
    case "AccountQuery":         return parseAccountQueryRs(xml);
    case "VendorQuery":          return parseVendorQueryRs(xml);
    case "CustomerQuery":        return parseCustomerQueryRs(xml);
    case "InvoiceQuery":         return parseInvoiceQueryRs(xml);
    case "ReceivePaymentQuery":  return parseReceivePaymentQueryRs(xml);
    case "CreditMemoQuery":      return parseCreditMemoQueryRs(xml);
    case "BillQuery":            return parseBillQueryRs(xml);
    case "BillPaymentCheckQuery":      return parseBillPaymentQueryRs(xml, "BillPaymentCheck");
    case "BillPaymentCreditCardQuery": return parseBillPaymentQueryRs(xml, "BillPaymentCreditCard");
    case "CheckQuery":           return parseCheckQueryRs(xml);
    case "CreditCardChargeQuery":      return parseCreditCardChargeQueryRs(xml);
    default: return 0;
  }
}

async function parseAccountQueryRs(xml: string): Promise<number> {
  const rets = extractAllTags(xml, "AccountRet");
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  for (const r of rets) {
    const listId  = extractTag(r, "ListID");
    const name    = extractTag(r, "FullName") || extractTag(r, "Name");
    const acctType = extractTag(r, "AccountType");
    const acctNum = extractTag(r, "AccountNumber");
    const isActive = extractTag(r, "IsActive") !== "false";
    if (!listId) continue;
    try {
      await db.execute(sql`
        INSERT INTO qbo_chart_of_accounts (qbo_account_id, name, account_type, account_number,
          is_active, source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (${listId}, ${name}, ${acctType || null}, ${acctNum || null},
          ${isActive}, 'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_account_id) DO UPDATE
          SET name = EXCLUDED.name, account_type = EXCLUDED.account_type,
              is_active = EXCLUDED.is_active, last_sync_at = EXCLUDED.last_sync_at,
              updated_at = EXCLUDED.updated_at
      `);
      count++;
    } catch (e: any) {
      console.error("[QBWC] Account upsert error:", e.message);
    }
  }
  return count;
}

async function parseVendorQueryRs(xml: string): Promise<number> {
  const rets = extractAllTags(xml, "VendorRet");
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  for (const r of rets) {
    const listId   = extractTag(r, "ListID");
    const name     = extractTag(r, "Name");
    const fullName = extractTag(r, "FullName") || name;
    const email    = extractTag(r, "Email");
    const phone    = extractTag(r, "Phone");
    const isActive = extractTag(r, "IsActive") !== "false";
    const balance  = extractTag(r, "Balance");
    if (!listId) continue;
    try {
      await db.execute(sql`
        INSERT INTO qbo_vendors (qbo_vendor_id, display_name, company_name, email, phone,
          is_active, balance, source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (${listId}, ${fullName}, ${fullName}, ${email || null}, ${phone || null},
          ${isActive}, ${balance ? parseFloat(balance) : 0},
          'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_vendor_id) DO UPDATE
          SET display_name = EXCLUDED.display_name, email = EXCLUDED.email,
              phone = EXCLUDED.phone, is_active = EXCLUDED.is_active,
              balance = EXCLUDED.balance, last_sync_at = EXCLUDED.last_sync_at,
              updated_at = EXCLUDED.updated_at
      `);
      count++;
    } catch (e: any) {
      console.error("[QBWC] Vendor upsert error:", e.message);
    }
  }
  return count;
}

async function parseCustomerQueryRs(xml: string): Promise<number> {
  const rets = extractAllTags(xml, "CustomerRet");
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  for (const r of rets) {
    const listId   = extractTag(r, "ListID");
    const name     = extractTag(r, "FullName") || extractTag(r, "Name");
    const email    = extractTag(r, "Email");
    const phone    = extractTag(r, "Phone");
    const isActive = extractTag(r, "IsActive") !== "false";
    const balance  = extractTag(r, "Balance");
    const balWithJobs = extractTag(r, "TotalBalance") || balance;
    const addrLine1 = extractTag(extractTag(r, "BillAddress"), "Addr1");
    const addrCity  = extractTag(extractTag(r, "BillAddress"), "City");
    const addrState = extractTag(extractTag(r, "BillAddress"), "State");
    const addrZip   = extractTag(extractTag(r, "BillAddress"), "PostalCode");
    if (!listId) continue;
    try {
      await db.execute(sql`
        INSERT INTO qbo_customers (qbo_customer_id, display_name, email, phone,
          is_active, balance, balance_with_jobs,
          bill_addr_line1, bill_addr_city, bill_addr_state, bill_addr_zip,
          source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (${listId}, ${name}, ${email || null}, ${phone || null},
          ${isActive}, ${balance ? parseFloat(balance) : null},
          ${balWithJobs ? parseFloat(balWithJobs) : null},
          ${addrLine1 || null}, ${addrCity || null}, ${addrState || null}, ${addrZip || null},
          'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_customer_id) DO UPDATE
          SET display_name = EXCLUDED.display_name, email = EXCLUDED.email,
              phone = EXCLUDED.phone, is_active = EXCLUDED.is_active,
              balance = EXCLUDED.balance, balance_with_jobs = EXCLUDED.balance_with_jobs,
              last_sync_at = EXCLUDED.last_sync_at, updated_at = EXCLUDED.updated_at
      `);
      count++;
    } catch (e: any) {
      console.error("[QBWC] Customer upsert error:", e.message);
    }
  }
  return count;
}

async function parseInvoiceQueryRs(xml: string): Promise<number> {
  const rets = extractAllTags(xml, "InvoiceRet");
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  for (const r of rets) {
    const txnId     = extractTag(r, "TxnID");
    const txnDate   = extractTag(r, "TxnDate");
    const dueDate   = extractTag(r, "DueDate");
    const refNum    = extractTag(r, "RefNumber");
    const custId    = extractTag(extractTag(r, "CustomerRef"), "ListID");
    const custName  = extractTag(extractTag(r, "CustomerRef"), "FullName");
    const subtotal  = extractTag(r, "Subtotal");
    const salesTax  = extractTag(r, "SalesTaxTotal");
    const balance   = extractTag(r, "BalanceRemaining");
    const total     = extractTag(r, "TotalAmount") || String((parseFloat(subtotal || "0") + parseFloat(salesTax || "0")));
    const isPaid    = parseFloat(balance || "0") <= 0;
    if (!txnId) continue;
    try {
      const [arRow] = await db.execute(sql`
        INSERT INTO qbo_ar_transactions (
          qbo_txn_id, qbo_txn_type, qbo_doc_number, qbo_ref_number,
          txn_date, due_date, qbo_customer_id, customer_name,
          total_amount, balance, tax_amount,
          is_paid, is_voided, source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (
          ${txnId}, 'Invoice', ${refNum || null}, ${refNum || null},
          ${txnDate}::date, ${dueDate ? dueDate + "::date" : null},
          ${custId || null}, ${custName || null},
          ${parseFloat(total) || 0},
          ${parseFloat(balance || "0")},
          ${parseFloat(salesTax || "0")},
          ${isPaid}, false, 'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_txn_id, qbo_txn_type) DO UPDATE
          SET qbo_doc_number = EXCLUDED.qbo_doc_number,
              qbo_customer_id = EXCLUDED.qbo_customer_id,
              customer_name = EXCLUDED.customer_name,
              total_amount = EXCLUDED.total_amount,
              balance = EXCLUDED.balance,
              is_paid = EXCLUDED.is_paid,
              last_sync_at = EXCLUDED.last_sync_at,
              updated_at = EXCLUDED.updated_at
        RETURNING id
      `);
      // Import line items
      const lineRets = extractAllTags(r, "InvoiceLineRet");
      if (lineRets.length && arRow) {
        const arId = (arRow as any).id ?? ((arRow as any).rows?.[0]?.id);
        if (arId) await upsertInvoiceLines(arId, txnId, lineRets, now);
      }
      count++;
    } catch (e: any) {
      console.error("[QBWC] Invoice upsert error:", e.message);
    }
  }
  return count;
}

async function upsertInvoiceLines(arTransactionId: string, qboTxnId: string, lineRets: string[], now: Date): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM qbo_ar_transaction_lines WHERE ar_transaction_id = ${arTransactionId}`);
    for (let idx = 0; idx < lineRets.length; idx++) {
      const l = lineRets[idx];
      const itemRef  = extractTag(l, "ItemRef");
      const itemId   = extractTag(itemRef, "ListID");
      const itemName = extractTag(itemRef, "FullName") || extractTag(itemRef, "Name");
      const desc     = extractTag(l, "Desc");
      const qty      = extractTag(l, "Quantity");
      const rate     = extractTag(l, "Rate");
      const amount   = extractTag(l, "Amount");
      await db.execute(sql`
        INSERT INTO qbo_ar_transaction_lines
          (ar_transaction_id, qbo_txn_id, line_num, qbo_item_id, item_name,
           description, quantity, unit_price, amount, source_system, last_sync_at, created_at)
        VALUES
          (${arTransactionId}, ${qboTxnId}, ${idx + 1}, ${itemId || null}, ${itemName || null},
           ${desc || null}, ${qty || null}, ${rate || null},
           ${parseFloat(amount || "0")}, 'quickbooks_wc', ${now}, ${now})
      `);
    }
  } catch (e: any) {
    console.error("[QBWC] Invoice line upsert error:", e.message);
  }
}

async function parseReceivePaymentQueryRs(xml: string): Promise<number> {
  const rets = extractAllTags(xml, "ReceivePaymentRet");
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  for (const r of rets) {
    const txnId   = extractTag(r, "TxnID");
    const txnDate = extractTag(r, "TxnDate");
    const refNum  = extractTag(r, "RefNumber");
    const custId  = extractTag(extractTag(r, "CustomerRef"), "ListID");
    const custName = extractTag(extractTag(r, "CustomerRef"), "FullName");
    const total   = extractTag(r, "TotalAmount");
    if (!txnId) continue;
    try {
      await db.execute(sql`
        INSERT INTO qbo_ar_transactions (
          qbo_txn_id, qbo_txn_type, qbo_ref_number,
          txn_date, qbo_customer_id, customer_name,
          total_amount, balance, is_paid, is_voided,
          source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (
          ${txnId}, 'Payment', ${refNum || null},
          ${txnDate}::date, ${custId || null}, ${custName || null},
          ${parseFloat(total || "0")}, 0, true, false,
          'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_txn_id, qbo_txn_type) DO UPDATE
          SET total_amount = EXCLUDED.total_amount,
              last_sync_at = EXCLUDED.last_sync_at, updated_at = EXCLUDED.updated_at
      `);
      count++;
    } catch (e: any) {
      console.error("[QBWC] Payment upsert error:", e.message);
    }
  }
  return count;
}

async function parseCreditMemoQueryRs(xml: string): Promise<number> {
  const rets = extractAllTags(xml, "CreditMemoRet");
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  for (const r of rets) {
    const txnId   = extractTag(r, "TxnID");
    const txnDate = extractTag(r, "TxnDate");
    const refNum  = extractTag(r, "RefNumber");
    const custId  = extractTag(extractTag(r, "CustomerRef"), "ListID");
    const custName = extractTag(extractTag(r, "CustomerRef"), "FullName");
    const total   = extractTag(r, "TotalAmount");
    const balance = extractTag(r, "CreditRemaining");
    if (!txnId) continue;
    try {
      await db.execute(sql`
        INSERT INTO qbo_ar_transactions (
          qbo_txn_id, qbo_txn_type, qbo_ref_number,
          txn_date, qbo_customer_id, customer_name,
          total_amount, balance, is_paid, is_voided,
          source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (
          ${txnId}, 'CreditMemo', ${refNum || null},
          ${txnDate}::date, ${custId || null}, ${custName || null},
          ${parseFloat(total || "0")},
          ${parseFloat(balance || "0")},
          ${parseFloat(balance || "0") <= 0}, false,
          'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_txn_id, qbo_txn_type) DO UPDATE
          SET total_amount = EXCLUDED.total_amount, balance = EXCLUDED.balance,
              last_sync_at = EXCLUDED.last_sync_at, updated_at = EXCLUDED.updated_at
      `);
      count++;
    } catch (e: any) {
      console.error("[QBWC] CreditMemo upsert error:", e.message);
    }
  }
  return count;
}

async function parseBillQueryRs(xml: string): Promise<number> {
  const rets = extractAllTags(xml, "BillRet");
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  for (const r of rets) {
    const txnId      = extractTag(r, "TxnID");
    const txnDate    = extractTag(r, "TxnDate");
    const dueDate    = extractTag(r, "DueDate");
    const refNum     = extractTag(r, "RefNumber");
    const vendorId   = extractTag(extractTag(r, "VendorRef"), "ListID");
    const vendorName = extractTag(extractTag(r, "VendorRef"), "FullName");
    const total      = extractTag(r, "TotalAmount") || extractTag(r, "AmountDue");
    const balance    = extractTag(r, "AmountDue");
    if (!txnId) continue;
    try {
      await db.execute(sql`
        INSERT INTO qbo_expense_transactions (
          qbo_txn_id, qbo_txn_type, qbo_ref_number, txn_date, due_date,
          vendor_id, vendor_name, total_amount, is_bill_payment,
          source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (
          ${txnId}, 'Bill', ${refNum || null}, ${txnDate}::date,
          ${dueDate ? dueDate + "::date" : null},
          ${vendorId || null}, ${vendorName || null},
          ${parseFloat(total || "0")}, false,
          'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_txn_id, qbo_txn_type) DO UPDATE
          SET total_amount = EXCLUDED.total_amount,
              vendor_name = EXCLUDED.vendor_name,
              last_sync_at = EXCLUDED.last_sync_at, updated_at = EXCLUDED.updated_at
      `);
      count++;
    } catch (e: any) {
      console.error("[QBWC] Bill upsert error:", e.message);
    }
  }
  return count;
}

async function parseBillPaymentQueryRs(xml: string, retTag: "BillPaymentCheck" | "BillPaymentCreditCard"): Promise<number> {
  const rets = extractAllTags(xml, `${retTag}Ret`);
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  const txnType = retTag === "BillPaymentCheck" ? "BillPaymentCheck" : "BillPaymentCreditCard";
  for (const r of rets) {
    const txnId      = extractTag(r, "TxnID");
    const txnDate    = extractTag(r, "TxnDate");
    const refNum     = extractTag(r, "RefNumber");
    const vendorId   = extractTag(extractTag(r, "PayeeEntityRef"), "ListID");
    const vendorName = extractTag(extractTag(r, "PayeeEntityRef"), "FullName");
    const total      = extractTag(r, "Amount");
    if (!txnId) continue;
    try {
      await db.execute(sql`
        INSERT INTO qbo_expense_transactions (
          qbo_txn_id, qbo_txn_type, qbo_ref_number, txn_date,
          vendor_id, vendor_name, total_amount, is_bill_payment,
          source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (
          ${txnId}, ${txnType}, ${refNum || null}, ${txnDate}::date,
          ${vendorId || null}, ${vendorName || null},
          ${parseFloat(total || "0")}, true,
          'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_txn_id, qbo_txn_type) DO UPDATE
          SET total_amount = EXCLUDED.total_amount,
              last_sync_at = EXCLUDED.last_sync_at, updated_at = EXCLUDED.updated_at
      `);
      count++;
    } catch (e: any) {
      console.error(`[QBWC] ${retTag} upsert error:`, e.message);
    }
  }
  return count;
}

async function parseCheckQueryRs(xml: string): Promise<number> {
  const rets = extractAllTags(xml, "CheckRet");
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  for (const r of rets) {
    const txnId      = extractTag(r, "TxnID");
    const txnDate    = extractTag(r, "TxnDate");
    const refNum     = extractTag(r, "RefNumber");
    const payeeId    = extractTag(extractTag(r, "PayeeEntityRef"), "ListID");
    const payeeName  = extractTag(extractTag(r, "PayeeEntityRef"), "FullName");
    const total      = extractTag(r, "Amount");
    const memo       = extractTag(r, "Memo");
    if (!txnId) continue;
    try {
      await db.execute(sql`
        INSERT INTO qbo_expense_transactions (
          qbo_txn_id, qbo_txn_type, qbo_ref_number, txn_date,
          vendor_id, vendor_name, total_amount, memo, is_bill_payment,
          source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (
          ${txnId}, 'Check', ${refNum || null}, ${txnDate}::date,
          ${payeeId || null}, ${payeeName || null},
          ${parseFloat(total || "0")}, ${memo || null}, false,
          'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_txn_id, qbo_txn_type) DO UPDATE
          SET total_amount = EXCLUDED.total_amount,
              last_sync_at = EXCLUDED.last_sync_at, updated_at = EXCLUDED.updated_at
      `);
      count++;
    } catch (e: any) {
      console.error("[QBWC] Check upsert error:", e.message);
    }
  }
  return count;
}

async function parseCreditCardChargeQueryRs(xml: string): Promise<number> {
  const rets = extractAllTags(xml, "CreditCardChargeRet");
  if (!rets.length) return 0;
  const now = new Date();
  let count = 0;
  for (const r of rets) {
    const txnId      = extractTag(r, "TxnID");
    const txnDate    = extractTag(r, "TxnDate");
    const refNum     = extractTag(r, "RefNumber");
    const payeeId    = extractTag(extractTag(r, "PayeeEntityRef"), "ListID");
    const payeeName  = extractTag(extractTag(r, "PayeeEntityRef"), "FullName");
    const total      = extractTag(r, "TotalAmount");
    const memo       = extractTag(r, "Memo");
    if (!txnId) continue;
    try {
      await db.execute(sql`
        INSERT INTO qbo_expense_transactions (
          qbo_txn_id, qbo_txn_type, qbo_ref_number, txn_date,
          vendor_id, vendor_name, total_amount, memo, is_bill_payment,
          source_system, sync_status, last_sync_at, created_at, updated_at)
        VALUES (
          ${txnId}, 'CreditCardCharge', ${refNum || null}, ${txnDate}::date,
          ${payeeId || null}, ${payeeName || null},
          ${parseFloat(total || "0")}, ${memo || null}, false,
          'quickbooks_wc', 'ok', ${now}, ${now}, ${now})
        ON CONFLICT (qbo_txn_id, qbo_txn_type) DO UPDATE
          SET total_amount = EXCLUDED.total_amount,
              last_sync_at = EXCLUDED.last_sync_at, updated_at = EXCLUDED.updated_at
      `);
      count++;
    } catch (e: any) {
      console.error("[QBWC] CreditCardCharge upsert error:", e.message);
    }
  }
  return count;
}

// ── Session history (for admin UI) ────────────────────────────────────────────

export async function getWcSessions(limit = 20) {
  const result = await db.execute(sql`
    SELECT ticket, username, company_file, status,
           current_query_idx, queries_total, records_processed,
           date_range_start, date_range_end,
           error_message, last_heartbeat, completed_at, created_at
    FROM qbo_wc_sessions
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return (result.rows ?? result) as any[];
}
