/**
 * ImportSourceAdapter — the contract every data-source adapter must satisfy.
 *
 * The rest of the import pipeline (validation → entity resolution → domain writes)
 * consumes FetchResult.rows: an array of plain objects keyed by column name.
 *
 * Adapter responsibilities:
 *   1. Connect to / read from the underlying source (file buffer, SQL, HTTP …)
 *   2. Apply the fieldMap: translate source column names to the canonical header
 *      names that the validation rules expect (e.g. "trip_id" → "TripId").
 *   3. Return a standardised FetchResult.
 *
 * The validation, entity-mapping, and domain-write layers MUST NOT be
 * modified when a new adapter is added.
 */

// ── Output ────────────────────────────────────────────────────────────────────

export interface FetchResult {
  /** Canonical column names after fieldMap has been applied. */
  headers:     string[];
  rows:        Record<string, unknown>[];
  /** Human-readable source label for audit trail (file name, SQL DSN, URL …). */
  sourceLabel: string;
  rowCount:    number;
}

// ── Connection configs (one sub-type per configType) ─────────────────────────

/**
 * SQL Server connection stored in import_source_configs.connection_config.
 * The database password is NEVER stored — only the env-var name is stored,
 * and the actual value is read from process.env at sync time.
 *
 * query:  Parameterised T-SQL. Use @dateFrom / @dateTo placeholders; they are
 *         bound from the runtime params passed to the sync endpoint.
 * Example:
 *   SELECT TripId, Date, Dealer, Driver, RCStatus, Minutes, Chg_Total, Pay_Total
 *   FROM   dbo.MoveReport
 *   WHERE  Date BETWEEN @dateFrom AND @dateTo
 */
export interface SqlServerConnectionConfig {
  host:                    string;
  port?:                   number;   // default 1433
  database:                string;
  username:                string;
  passwordEnvVar:          string;   // name of env var (e.g. "SQLSERVER_IMPORT_PASSWORD")
  query:                   string;
  trustServerCertificate?: boolean;
  encrypt?:                boolean;
  connectTimeout?:         number;   // ms, default 30 000
  requestTimeout?:         number;   // ms, default 60 000
}

/**
 * CSV served over HTTP/HTTPS.
 * Supports token-auth via an env-var and URL placeholders {dateFrom}/{dateTo}.
 * Useful for payroll systems, scheduling platforms, and accounting APIs.
 */
export interface CsvUrlConnectionConfig {
  url:              string;
  method?:          "GET" | "POST";
  authHeaderName?:  string;   // e.g. "X-API-Key"
  authHeaderEnvVar?: string;  // env var holding the key value
}

export type ConnectionConfig =
  | SqlServerConnectionConfig
  | CsvUrlConnectionConfig
  | Record<string, unknown>;  // forward-compat for future adapter types

// ── Source config (mirrors import_source_configs row) ────────────────────────

/**
 * Full config for one import source.
 *
 * fieldMap: source column name → canonical pipeline header name.
 * Columns absent from fieldMap pass through unchanged.
 *
 * SQL Server example:
 *   { "trip_id": "TripId", "dealer_name": "Dealer", "driver_name": "Driver" }
 */
export interface ImportSourceConfig {
  id:               string;
  name:             string;
  configType:       "excel_csv" | "sql_server" | "csv_url" | "api";
  importType:       string;   // "move_report" | "driver_return" | "uber_transaction" | …
  sourceSystemKey:  string;   // FK to import_source_systems.source_key
  connectionConfig: ConnectionConfig;
  fieldMap:         Record<string, string>;
  batchMode:        "supplement" | "correction" | "reprocess";
}

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface ImportSourceAdapter {
  /** Short identifier for logs and error messages (e.g. "sql_server"). */
  readonly adapterType: string;

  /**
   * Fetch rows from the underlying source, apply fieldMap, and return a
   * FetchResult that the validation pipeline can consume directly.
   *
   * @param config  Full source config (connectionConfig + fieldMap + metadata)
   * @param params  Runtime parameters: dateFrom, dateTo, and any adapter-
   *                specific values (e.g. SQL input bindings).
   */
  fetch(
    config: ImportSourceConfig,
    params?: Record<string, string>,
  ): Promise<FetchResult>;
}
