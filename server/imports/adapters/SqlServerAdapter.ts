/**
 * SqlServerAdapter — fetches rows directly from Microsoft SQL Server.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  This adapter replaces ONLY the source layer.                   │
 * │  Validation, entity mapping, reconciliation, and domain writes  │
 * │  are completely unchanged.                                       │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Connection parameters are stored in import_source_configs.connection_config.
 * The database password is NEVER stored in the DB — only the env-var name
 * (passwordEnvVar) is stored, and the actual value is read from process.env
 * at sync time.
 *
 * Query design:
 *   • Use @dateFrom / @dateTo named parameters for date-range filtering.
 *   • Column names can be anything — use import_source_configs.field_map
 *     to translate them to the canonical headers the pipeline expects.
 *
 * Peer dependency:
 *   npm install mssql
 *   (not auto-installed; only required when the sql_server adapter is used)
 */
import type { ImportSourceAdapter, ImportSourceConfig, FetchResult, SqlServerConnectionConfig } from "./types";
import { applyFieldMap } from "./utils";

export class SqlServerAdapter implements ImportSourceAdapter {
  readonly adapterType = "sql_server";

  async fetch(
    config: ImportSourceConfig,
    params: Record<string, string> = {},
  ): Promise<FetchResult> {
    // Lazy-require so the package is only needed when this adapter is used
    let mssql: typeof import("mssql");
    try {
      mssql = require("mssql");
    } catch {
      throw new Error(
        "SqlServerAdapter: the 'mssql' package is not installed. " +
        "Run `npm install mssql` to enable SQL Server synchronisation.",
      );
    }

    const cc = config.connectionConfig as SqlServerConnectionConfig;

    if (!cc.host || !cc.database || !cc.username || !cc.passwordEnvVar) {
      throw new Error(
        "SqlServerAdapter: connection_config must include host, database, username, and passwordEnvVar",
      );
    }
    if (!cc.query) {
      throw new Error("SqlServerAdapter: connection_config.query is required");
    }

    const password = process.env[cc.passwordEnvVar];
    if (!password) {
      throw new Error(
        `SqlServerAdapter: env var "${cc.passwordEnvVar}" is not set. ` +
        "Add it to Replit Secrets before running a sync.",
      );
    }

    const pool = await mssql.connect({
      server:   cc.host,
      port:     cc.port ?? 1433,
      database: cc.database,
      user:     cc.username,
      password,
      options: {
        trustServerCertificate: cc.trustServerCertificate ?? false,
        encrypt:                cc.encrypt ?? true,
        connectTimeout:         cc.connectTimeout ?? 30_000,
        requestTimeout:         cc.requestTimeout ?? 60_000,
      },
    });

    try {
      const request = pool.request();

      // Bind every runtime param as a named SQL input (@dateFrom, @dateTo, …)
      for (const [k, v] of Object.entries(params)) {
        request.input(k, v);
      }

      const result = await request.query(cc.query);
      const rawRows = (result.recordset ?? []) as Record<string, unknown>[];
      const rows = applyFieldMap(rawRows, config.fieldMap);

      return {
        headers:     rows.length > 0 ? Object.keys(rows[0]) : [],
        rows,
        sourceLabel: `sqlserver://${cc.host}/${cc.database}`,
        rowCount:    rows.length,
      };
    } finally {
      await pool.close().catch(() => {/* ignore close errors */});
    }
  }
}
