import { db } from "../db";
import {
  accountProducts,
  accountServicePositions,
  accountServiceRates,
  customers,
  products,
} from "@shared/schema";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

type ContractProductRow = {
  assignmentId: string;
  assignmentUpdatedAt: Date | string | null;
  priceOverride: string | null;
  billingRuleOverride: string | null;
  assignmentStartDate: string | null;
  assignmentEndDate: string | null;
  billingMethod: string | null;
  billingFrequencyOverride: string | null;
  program: string | null;
  productId: string;
  productName: string;
  productDescription: string | null;
  productSku: string | null;
  productCategory: string | null;
  serviceCategory: string | null;
  operationalDivision: string | null;
  productType: string | null;
  pricingModel: string | null;
  billingFrequency: string | null;
  billingTrigger: string | null;
  unitPrice: string;
  unit: string | null;
  currency: string;
  productEligibleForDriverDash: boolean | null;
  productIsActive: boolean;
  productMinPrice: string | null;
  productMaxPrice: string | null;
  productSuggestedPrice: string | null;
  productEffectiveDate: string | null;
  priceBook: string | null;
  productUpdatedAt: Date | string | null;
  positionId: string | null;
  positionName: string | null;
  positionActive: boolean | null;
  rateId: string | null;
  billRate: string | null;
  rateType: string | null;
  effectiveDate: string | null;
  endDate: string | null;
  billingUnit: string | null;
  overtimeEligible: boolean | null;
};

type AccountRow = {
  id: string;
  customerNumber: string | null;
  name: string;
  status: string | null;
  driverModel: string | null;
  updatedAt: Date | string | null;
};

export type ContractProductsResponse = {
  account: {
    id: string;
    externalId: string;
    name: string;
    status: string;
    driverModel: string | null;
  };
  products: ReturnType<typeof toContractProduct>[];
  productCount: number;
  hasApplicableDriverDashPricing: boolean;
  message?: string;
};

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedDriverModel(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() || null;
}

function driverDashApplies(driverModel: string | null, eligibleForDriverDash: boolean | null): boolean {
  const model = normalizedDriverModel(driverModel);
  return Boolean(eligibleForDriverDash) && (model === "driverdash" || model === "hybrid");
}

export function toContractProduct(
  rows: ContractProductRow[],
  accountDriverModel: string | null,
) {
  const first = rows[0];
  const rates = rows
    .filter((row) => row.rateId && row.positionId)
    .map((row) => ({
      id: row.rateId,
      positionId: row.positionId,
      positionName: row.positionName,
      rateType: row.rateType,
      billingUnit: row.billingUnit,
      billRate: asNumber(row.billRate),
      effectiveStartDate: row.effectiveDate,
      effectiveEndDate: row.endDate,
      overtimeEligible: row.overtimeEligible ?? false,
    }));

  const hourlyRate = rates.find((rate) =>
    ["hourly", "time"].includes((rate.billingUnit ?? "").toLowerCase()),
  )?.billRate ?? null;
  const mileageRate = rates.find((rate) =>
    ["mile", "mileage", "per_mile"].includes((rate.billingUnit ?? "").toLowerCase()),
  )?.billRate ?? null;
  const flatRate = rates.find((rate) =>
    ["flat", "flat_rate"].includes((rate.billingUnit ?? "").toLowerCase()),
  )?.billRate ?? null;

  const applicableForDriverDash = driverDashApplies(
    accountDriverModel,
    first.productEligibleForDriverDash,
  );
  const pricingVersion = [
    first.assignmentUpdatedAt ? asIso(first.assignmentUpdatedAt) : "assignment-unknown",
    first.productUpdatedAt ? asIso(first.productUpdatedAt) : "product-unknown",
  ].join(":");

  return {
    pricingConfigurationId: first.assignmentId,
    pricingConfigurationVersion: pricingVersion,
    productId: first.productId,
    productName: first.productName,
    description: first.productDescription,
    sku: first.productSku,
    serviceClassification: {
      category: first.productCategory,
      serviceCategory: first.serviceCategory,
      productType: first.productType,
      operationalDivision: first.operationalDivision,
    },
    driverModelApplicability: {
      accountDriverModel: normalizedDriverModel(accountDriverModel),
      productEligibleForDriverDash: Boolean(first.productEligibleForDriverDash),
      driverDash: applicableForDriverDash,
      driverShift: normalizedDriverModel(accountDriverModel) === "drivershift"
        || normalizedDriverModel(accountDriverModel) === "hybrid",
    },
    applicableForAccount: applicableForDriverDash
      || normalizedDriverModel(accountDriverModel) === "drivershift"
      || normalizedDriverModel(accountDriverModel) === "hybrid",
    status: {
      active: first.productIsActive,
      effectiveStartDate: first.assignmentStartDate ?? first.productEffectiveDate,
      effectiveEndDate: first.assignmentEndDate,
    },
    pricing: {
      method: first.billingMethod ?? first.pricingModel ?? first.unit,
      type: first.pricingModel,
      billingFrequency: first.billingFrequencyOverride ?? first.billingFrequency,
      billingTrigger: first.billingTrigger,
      currency: first.currency,
      accountPriceOverride: asNumber(first.priceOverride),
      standardUnitPrice: asNumber(first.unitPrice),
      minimumCharge: asNumber(first.productMinPrice),
      maximumCharge: asNumber(first.productMaxPrice),
      suggestedCharge: asNumber(first.productSuggestedPrice),
      mileageRate,
      hourlyRate,
      flatRate: flatRate ?? asNumber(first.priceOverride) ?? asNumber(first.unitPrice),
      rates,
      repositioning: null,
      additionalChargeParameters: null,
    },
    accountConfiguration: {
      billingRuleOverride: first.billingRuleOverride,
      billingMethod: first.billingMethod,
      program: first.program,
    },
    priceBook: first.priceBook,
  };
}

export async function getContractProducts(accountId: string): Promise<ContractProductsResponse | null> {
  const [account] = await db
    .select({
      id: customers.id,
      customerNumber: customers.customerNumber,
      name: customers.customerName,
      status: customers.status,
      driverModel: customers.driverModel,
      updatedAt: customers.updatedAt,
    })
    .from(customers)
    .where(and(eq(customers.id, accountId), eq(customers.isDeleted, false)))
    .limit(1);

  if (!account) return null;

  const rows = await db
    .select({
      assignmentId: accountProducts.id,
      assignmentUpdatedAt: accountProducts.updatedAt,
      priceOverride: accountProducts.priceOverride,
      billingRuleOverride: accountProducts.billingRuleOverride,
      assignmentStartDate: accountProducts.startDate,
      assignmentEndDate: accountProducts.endDate,
      billingMethod: accountProducts.billingMethod,
      billingFrequencyOverride: accountProducts.billingFrequencyOverride,
      program: accountProducts.program,
      productId: products.id,
      productName: products.name,
      productDescription: products.description,
      productSku: products.sku,
      productCategory: products.category,
      serviceCategory: products.serviceCategory,
      operationalDivision: products.operationalDivision,
      productType: products.productType,
      pricingModel: products.pricingModel,
      billingFrequency: products.billingFrequency,
      billingTrigger: products.billingTrigger,
      unitPrice: products.unitPrice,
      unit: products.unit,
      currency: products.currency,
      productEligibleForDriverDash: products.eligibleForDriverDash,
      productIsActive: products.isActive,
      productMinPrice: products.minPrice,
      productMaxPrice: products.maxPrice,
      productSuggestedPrice: products.suggestedPrice,
      productEffectiveDate: products.effectiveDate,
      priceBook: products.priceBook,
      productUpdatedAt: products.updatedAt,
      positionId: accountServicePositions.id,
      positionName: accountServicePositions.positionName,
      positionActive: accountServicePositions.isActive,
      rateId: accountServiceRates.id,
      billRate: accountServiceRates.billRate,
      rateType: accountServiceRates.rateType,
      effectiveDate: accountServiceRates.effectiveDate,
      endDate: accountServiceRates.endDate,
      billingUnit: accountServiceRates.billingUnit,
      overtimeEligible: accountServiceRates.overtimeEligible,
    })
    .from(accountProducts)
    .innerJoin(products, eq(products.id, accountProducts.productId))
    .leftJoin(
      accountServicePositions,
      and(
        eq(accountServicePositions.accountProductId, accountProducts.id),
        eq(accountServicePositions.isActive, true),
      ),
    )
    .leftJoin(
      accountServiceRates,
      and(
        eq(accountServiceRates.positionId, accountServicePositions.id),
        eq(accountServiceRates.isActive, true),
        or(isNull(accountServiceRates.effectiveDate), lte(accountServiceRates.effectiveDate, sql`CURRENT_DATE`)),
        or(isNull(accountServiceRates.endDate), gte(accountServiceRates.endDate, sql`CURRENT_DATE`)),
      ),
    )
    .where(and(
      eq(accountProducts.customerId, accountId),
      eq(accountProducts.isActive, true),
      eq(products.isActive, true),
      or(isNull(accountProducts.startDate), lte(accountProducts.startDate, sql`CURRENT_DATE`)),
      or(isNull(accountProducts.endDate), gte(accountProducts.endDate, sql`CURRENT_DATE`)),
    ));

  const grouped = new Map<string, ContractProductRow[]>();
  for (const row of rows as ContractProductRow[]) {
    const existing = grouped.get(row.assignmentId) ?? [];
    existing.push(row);
    grouped.set(row.assignmentId, existing);
  }

  const productRows = [...grouped.values()].map((productRows) =>
    toContractProduct(productRows, account.driverModel),
  );

  const driverModel = normalizedDriverModel(account.driverModel);
  return {
    account: {
      id: account.id,
      externalId: account.customerNumber
        ? `DH-AC-${account.customerNumber}`
        : `DH-AC-${account.id.slice(0, 8).toUpperCase()}`,
      name: account.name,
      status: (account.status ?? "unknown").toLowerCase(),
      driverModel,
    },
    products: productRows,
    productCount: productRows.length,
    hasApplicableDriverDashPricing: productRows.some((product) =>
      product.driverModelApplicability.driverDash && product.applicableForAccount,
    ),
    ...(productRows.length === 0
      ? { message: "No active or applicable contracted products are configured for this account." }
      : {}),
  };
}