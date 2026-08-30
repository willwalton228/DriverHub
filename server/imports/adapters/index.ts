/**
 * Adapter factory — returns the right ImportSourceAdapter for a given config.
 *
 * To add a new source type:
 *   1. Create a new class in adapters/ implementing ImportSourceAdapter.
 *   2. Add a case to the switch below.
 *   3. Add a new row to the import_source_configs UI.
 *
 * Nothing else in the pipeline needs to change.
 */
import type { ImportSourceAdapter, ImportSourceConfig } from "./types";
import { ExcelCsvAdapter } from "./ExcelCsvAdapter";
import { SqlServerAdapter } from "./SqlServerAdapter";
import { CsvUrlAdapter }    from "./CsvUrlAdapter";

export function getAdapter(config: ImportSourceConfig): ImportSourceAdapter {
  switch (config.configType) {
    case "excel_csv":  return new ExcelCsvAdapter();
    case "sql_server": return new SqlServerAdapter();
    case "csv_url":    return new CsvUrlAdapter();
    default:
      throw new Error(
        `No adapter registered for configType: "${(config as any).configType}". ` +
        "Implement a class in server/imports/adapters/ and register it here.",
      );
  }
}

// Re-export everything consumers need
export type { ImportSourceAdapter, ImportSourceConfig, FetchResult } from "./types";
export { ExcelCsvAdapter } from "./ExcelCsvAdapter";
export { SqlServerAdapter } from "./SqlServerAdapter";
export { CsvUrlAdapter }    from "./CsvUrlAdapter";
export { applyFieldMap }    from "./utils";
