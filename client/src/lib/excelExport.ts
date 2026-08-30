import * as XLSX from 'xlsx';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  columns: ExcelColumn[],
  filename: string
) {
  const worksheetData = data.map((item) => {
    const row: Record<string, unknown> = {};
    columns.forEach((col) => {
      const value = item[col.key];
      if (value === null || value === undefined) {
        row[col.header] = "";
      } else if (value instanceof Date) {
        row[col.header] = value.toLocaleDateString();
      } else if (typeof value === "object") {
        row[col.header] = JSON.stringify(value);
      } else {
        row[col.header] = value;
      }
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);

  const colWidths = columns.map((col) => ({
    wch: col.width || Math.max(col.header.length + 2, 15),
  }));
  worksheet["!cols"] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

  const timestamp = new Date().toISOString().split("T")[0];
  const fullFilename = `${filename}_${timestamp}.xlsx`;

  XLSX.writeFile(workbook, fullFilename);

  return fullFilename;
}

export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return `$${num.toFixed(2)}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  let date: Date;
  if (typeof value === "string") {
    // Parse date-only strings as LOCAL time to avoid UTC-midnight timezone shift
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      date = new Date(parseInt(dateOnly[1]), parseInt(dateOnly[2]) - 1, parseInt(dateOnly[3]));
    } else {
      date = new Date(value);
    }
  } else {
    date = value;
  }
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}
