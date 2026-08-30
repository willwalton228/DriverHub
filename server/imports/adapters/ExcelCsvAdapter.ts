/**
 * ExcelCsvAdapter — wraps spreadsheet / CSV parsing.
 *
 * This is the adapter the file-upload flow has always used implicitly.
 * It now participates in the adapter contract so all paths (file upload,
 * SQL sync, URL fetch) share the same orchestrator and validation pipeline.
 *
 * Runtime params required:
 *   buffer   — file Buffer (from multer or any source)
 *   fileName — original filename (used to detect .csv vs .xlsx)
 */
import * as XLSX from "xlsx";
import type { ImportSourceAdapter, ImportSourceConfig, FetchResult } from "./types";
import { applyFieldMap } from "./utils";

export class ExcelCsvAdapter implements ImportSourceAdapter {
  readonly adapterType = "excel_csv";

  async fetch(
    config: ImportSourceConfig,
    params: Record<string, string> & { buffer?: Buffer; fileName?: string } = {},
  ): Promise<FetchResult> {
    const { buffer, fileName = "upload.xlsx" } = params;
    if (!buffer) {
      throw new Error("ExcelCsvAdapter: params.buffer is required");
    }

    const { headers, rows: rawRows } = parseBuffer(buffer, fileName);
    const rows = applyFieldMap(rawRows, config.fieldMap);
    const mappedHeaders = rows.length > 0 ? Object.keys(rows[0]) : headers;

    return {
      headers:     mappedHeaders,
      rows,
      sourceLabel: fileName,
      rowCount:    rows.length,
    };
  }
}

// ── Internal parser (mirrors dataImportsRoutes.parseBuffer) ───────────────────

function parseBuffer(buf: Buffer, name: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "csv") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Papa = require("papaparse");
    const r = Papa.parse(buf.toString("utf-8"), { header: true, skipEmptyLines: true });
    return { headers: r.meta.fields ?? [], rows: r.data };
  }
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return { headers: rows.length > 0 ? Object.keys(rows[0]) : [], rows };
}
