/**
 * Billing Brand Configuration — Driver on Demand
 * Single source of truth for all customer-facing billing surfaces:
 *   - Invoice PDF
 *   - Invoice email
 *   - Payment page
 *
 * Override any field by passing a billing entity record to the templates.
 */

export const BILLING_BRAND = {
  // Customer-facing name
  displayName:    "Driver on Demand",

  // Legal entity
  legalName:      "AutoNition, LLC",

  // Tax
  ein:            "39-4553456",

  // Contact
  billingEmail:   "billing@driverondemand.co",
  website:        "https://driverondemand.co",

  // Remittance address
  addressLine1:   "4491 South State Road 7",
  city:           "Fort Lauderdale",
  state:          "FL",
  postalCode:     "33314",

  // Color palette
  navy:           "#1F2A6D",
  navyLight:      "#2A3A8A",
  gray:           "#F5F6F8",
  textPrimary:    "#111111",
  textSecondary:  "#666666",
  borderColor:    "#E2E4E8",
  green:          "#16a34a",
  white:          "#FFFFFF",
} as const;

/** Full one-line address string */
export function brandAddress(): string {
  const b = BILLING_BRAND;
  return `${b.addressLine1}, ${b.city}, ${b.state} ${b.postalCode}`;
}

/** Merge billing entity overrides on top of the default brand */
export function resolveBrand(entity?: {
  dbaName?:         string | null;
  legalName?:       string;
  taxId?:           string | null;
  email?:           string | null;
  website?:         string | null;
  addressLine1?:    string | null;
  city?:            string | null;
  state?:           string | null;
  postalCode?:      string | null;
  remitAddressLine1?: string | null;
  remitCity?:       string | null;
  remitState?:      string | null;
  remitPostalCode?: string | null;
  primaryColor?:    string | null;
} | null) {
  if (!entity) return BILLING_BRAND;

  const remitLine1 = entity.remitAddressLine1 || entity.addressLine1 || BILLING_BRAND.addressLine1;
  const remitCity  = entity.remitCity  || entity.city  || BILLING_BRAND.city;
  const remitState = entity.remitState || entity.state || BILLING_BRAND.state;
  const remitZip   = entity.remitPostalCode || entity.postalCode || BILLING_BRAND.postalCode;

  return {
    ...BILLING_BRAND,
    displayName:  entity.dbaName   || BILLING_BRAND.displayName,
    legalName:    entity.legalName || BILLING_BRAND.legalName,
    ein:          entity.taxId     || BILLING_BRAND.ein,
    billingEmail: entity.email     || BILLING_BRAND.billingEmail,
    website:      entity.website   || BILLING_BRAND.website,
    addressLine1: remitLine1,
    city:         remitCity,
    state:        remitState,
    postalCode:   remitZip,
    navy:         entity.primaryColor || BILLING_BRAND.navy,
  };
}
