/**
 * CsvUrlAdapter — fetches a CSV from an HTTP/HTTPS URL.
 *
 * Useful for:
 *   • Accounting systems that expose reports as downloadable CSV
 *   • Payroll platforms with a CSV export API
 *   • Scheduling software with HTTP-accessible data feeds
 *
 * Supports token auth via a Replit Secret and URL placeholders:
 *   https://example.com/report?from={dateFrom}&to={dateTo}
 *                                       ↑                ↑
 *               filled from the sync endpoint's runtime params
 */
import type { ImportSourceAdapter, ImportSourceConfig, FetchResult, CsvUrlConnectionConfig } from "./types";
import { applyFieldMap } from "./utils";

export class CsvUrlAdapter implements ImportSourceAdapter {
  readonly adapterType = "csv_url";

  async fetch(
    config: ImportSourceConfig,
    params: Record<string, string> = {},
  ): Promise<FetchResult> {
    const cc = config.connectionConfig as CsvUrlConnectionConfig;
    if (!cc.url) {
      throw new Error("CsvUrlAdapter: connection_config.url is required");
    }

    // Build request headers — auth token from env var if configured
    const reqHeaders: Record<string, string> = {};
    if (cc.authHeaderName && cc.authHeaderEnvVar) {
      const token = process.env[cc.authHeaderEnvVar];
      if (!token) {
        throw new Error(
          `CsvUrlAdapter: env var "${cc.authHeaderEnvVar}" is not set. ` +
          "Add it to Replit Secrets before running a sync.",
        );
      }
      reqHeaders[cc.authHeaderName] = token;
    }

    // Substitute {paramName} placeholders in the URL
    let url = cc.url;
    for (const [k, v] of Object.entries(params)) {
      url = url.replace(new RegExp(`\\{${k}\\}`, "g"), encodeURIComponent(v));
    }

    const response = await fetch(url, {
      method:  cc.method ?? "GET",
      headers: reqHeaders,
    });

    if (!response.ok) {
      throw new Error(
        `CsvUrlAdapter: HTTP ${response.status} ${response.statusText} fetching ${url}`,
      );
    }

    const text = await response.text();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Papa = require("papaparse");
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rawRows: Record<string, unknown>[] = parsed.data;
    const rows = applyFieldMap(rawRows, config.fieldMap);

    return {
      headers:     rows.length > 0 ? Object.keys(rows[0]) : (parsed.meta.fields ?? []),
      rows,
      sourceLabel: url,
      rowCount:    rows.length,
    };
  }
}
