export interface ClaimCreatedEmailDetails {
  claimNumber: string;
  driverName: string | null;
  incidentDate: Date | string | null;
  customerName: string | null;
  location: string | null;
  market: string | null;
  claimType: string | null;
  incidentType: string | null;
  resolutionStatus: string | null;
  severity: string | null;
  executionSystem: string | null;
  estimatedDamageOrProbableCost: string | number | null;
  actualCost: string | number | null;
  photoCount: number | string | null;
  documentCount: number | string | null;
  openItemCount: number | string | null;
  claimUrl: string;
}

type TemplateContext = Record<string, string>;

const EMPTY_VALUE = "—";
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function present(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? escapeHtml(trimmed) : EMPTY_VALUE;
}

function titleCase(value: string | null | undefined): string {
  if (!value?.trim()) return EMPTY_VALUE;

  return escapeHtml(
    value
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
  );
}

function executionSystemLabel(value: string | null | undefined): string {
  if (!value?.trim()) return EMPTY_VALUE;

  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    redcap: "REDCap",
    move_now_driver_connect: "Move Now Driver Connect",
    draiver: "Draiver",
  };

  return labels[normalized] ? escapeHtml(labels[normalized]) : titleCase(value);
}

function formatDate(value: Date | string | null): string {
  if (!value) return EMPTY_VALUE;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatCurrency(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  const amount = Number(value);
  return Number.isFinite(amount) ? currencyFormatter.format(amount) : EMPTY_VALUE;
}

function formatCount(value: number | string | null): string {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  const count = Number(value);
  return Number.isFinite(count) ? numberFormatter.format(count) : EMPTY_VALUE;
}

/**
 * Produces presentation-ready, HTML-safe merge fields for the CLAIM_CREATED
 * communication template. This keeps formatting rules in the communication
 * layer and prevents raw nulls, IDs, or unescaped user-entered values in email.
 */
export function buildClaimCreatedEmailContext(details: ClaimCreatedEmailDetails): TemplateContext {
  return {
    claimNumber: present(details.claimNumber),
    driverName: present(details.driverName),
    incidentDate: formatDate(details.incidentDate),
    customerName: present(details.customerName),
    location: present(details.location),
    market: present(details.market),
    claimType: titleCase(details.claimType),
    incidentType: titleCase(details.incidentType),
    resolutionStatus: titleCase(details.resolutionStatus),
    severity: titleCase(details.severity),
    executionSystem: executionSystemLabel(details.executionSystem),
    estimatedDamageOrProbableCost: formatCurrency(details.estimatedDamageOrProbableCost),
    actualCost: formatCurrency(details.actualCost),
    photoCount: formatCount(details.photoCount),
    documentCount: formatCount(details.documentCount),
    openItemCount: formatCount(details.openItemCount),
    claimUrl: escapeHtml(details.claimUrl),
  };
}