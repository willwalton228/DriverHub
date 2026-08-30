/**
 * QuickBooks Desktop IIF Export Service
 * Generates Intuit Interchange Format (.iif) files for AR invoices.
 *
 * IIF format overview:
 *   !TRNS / !SPL / !ENDTRNS  — header rows defining column order
 *   TRNS                     — one row per invoice (debit: AR account)
 *   SPL                      — one row per line item (credit: income account)
 *   ENDTRNS                  — terminates each invoice block
 */

export interface IifInvoiceLine {
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  totalAmount: string | number;
  incomeAccountCode?: string | null;
  taxCode?: string | null;
  classCode?: string | null;
  productName?: string | null;
}

export interface IifInvoice {
  invoiceNumber: string;
  invoiceDate: string; // MM/DD/YYYY
  dueDate: string;     // MM/DD/YYYY
  customerName: string;
  totalAmount: string | number;
  arAccountCode: string; // Accounts Receivable account
  memo?: string | null;
  lines: IifInvoiceLine[];
}

function formatDate(raw: string | Date | null | undefined): string {
  if (!raw) return '';
  const d = typeof raw === 'string' ? new Date(raw) : raw;
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatAmount(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0.00';
  return parseFloat(String(val)).toFixed(2);
}

function tab(...fields: (string | number | null | undefined)[]): string {
  return fields.map(f => (f === null || f === undefined ? '' : String(f))).join('\t');
}

/**
 * Build a complete IIF file content string from one or more invoices.
 */
export function buildIifContent(invoices: IifInvoice[]): string {
  const lines: string[] = [];

  // IIF Header rows — define column layout for TRNS and SPL
  lines.push(tab('!TRNS', 'TRNSID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'CLASS', 'AMOUNT', 'DOCNUM', 'MEMO', 'CLEAR', 'TOPRINT', 'DUEDATE'));
  lines.push(tab('!SPL',  'SPLID',  'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'CLASS', 'AMOUNT', 'DOCNUM', 'MEMO', 'CLEAR', 'QNTY',   'PRICE', 'INVITEM', 'TAXABLE'));
  lines.push('!ENDTRNS');

  for (const inv of invoices) {
    // TRNS row — invoice header (debit side: AR)
    lines.push(tab(
      'TRNS',
      '',                       // TRNSID (QB assigns internally)
      'INVOICE',                // TRNSTYPE
      inv.invoiceDate,          // DATE
      inv.arAccountCode || 'Accounts Receivable', // ACCNT
      inv.customerName,         // NAME
      '',                       // CLASS (at header level — optional)
      formatAmount(inv.totalAmount), // AMOUNT (positive = AR debit)
      inv.invoiceNumber,        // DOCNUM
      inv.memo || '',           // MEMO
      'N',                      // CLEAR
      'Y',                      // TOPRINT
      inv.dueDate,              // DUEDATE
    ));

    // SPL rows — one per line item (credit side: income accounts)
    for (const line of inv.lines) {
      const lineAmt = parseFloat(formatAmount(line.totalAmount));
      lines.push(tab(
        'SPL',
        '',                                     // SPLID
        'INVOICE',                              // TRNSTYPE
        inv.invoiceDate,                        // DATE
        line.incomeAccountCode || 'Uncategorized Income', // ACCNT
        '',                                     // NAME
        line.classCode || '',                   // CLASS
        (-lineAmt).toFixed(2),                  // AMOUNT (negative = income credit)
        inv.invoiceNumber,                      // DOCNUM
        line.description || '',                 // MEMO
        'N',                                    // CLEAR
        formatAmount(line.quantity),            // QNTY
        formatAmount(line.unitPrice),           // PRICE
        line.productName || line.description || '', // INVITEM
        line.taxCode ? 'Y' : 'N',              // TAXABLE
      ));
    }

    lines.push('ENDTRNS');
  }

  return lines.join('\r\n') + '\r\n';
}

/**
 * Validate an invoice's lines for required GL mappings.
 * Returns an array of error messages (empty = valid).
 */
export function validateIifMappings(
  invoiceNumber: string,
  lines: IifInvoiceLine[],
  requireMappingBeforeExport: boolean,
): string[] {
  if (!requireMappingBeforeExport) return [];
  const errors: string[] = [];
  lines.forEach((line, i) => {
    if (!line.incomeAccountCode) {
      errors.push(`Line ${i + 1} on invoice ${invoiceNumber} is missing an income account code.`);
    }
  });
  return errors;
}
