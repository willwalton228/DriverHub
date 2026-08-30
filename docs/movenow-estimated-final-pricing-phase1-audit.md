# MoveNow Estimated and Final Move Pricing Engine

## Phase 1 — Existing Architecture Audit

## Executive conclusion

DriverHub does not currently have a single authoritative service that calculates an estimated or final customer Move price.

The production architecture contains useful building blocks:

- Product defaults.
- Account product assignments and overrides.
- Account service positions and effective-dated bill/pay rates.
- Trip-level rate and imported financial fields.
- Realized move financials.
- Rideshare reconciliation.
- Expense and approval records.
- Invoice and payment records.

Those components do not yet form a complete, reproducible pricing-resolution hierarchy. Market pricing and customer pricing tiers are not authoritative production concepts, the booking API accepts caller-supplied rates, and Move completion does not trigger final pricing.

The isolated Sales Market Pricing administration tables are informational/administrative only and explicitly do not mutate production pricing. They must not be used as MoveNow’s authoritative price source.

No pricing formulas, pricing tables, payment changes, or structural pricing changes were implemented during this audit.

## 1. Current pricing tables

### Product defaults

`products` provides:

- Unit price.
- Pricing model.
- Billing frequency and trigger.
- Minimum, maximum, and suggested price.
- Margin target.
- Cost.
- Effective date.
- Price book.
- An unnormalized JSON market list.

Source: `shared/schema.ts`, `products`.

### Account configuration

`account_products` links an account to a product and provides:

- Account-specific `priceOverride`.
- Billing-rule overrides.
- Active and effective dates.
- Billing method and frequency.
- Program configuration.

Source: `shared/schema.ts`, `accountProducts`.

### Service and rate configuration

`account_service_positions` defines positions beneath an account service.

`account_service_rates` provides:

- Bill rate.
- Pay rate.
- Rate type.
- Billing unit.
- Effective and end dates.
- Overtime eligibility.
- Active status.

Source: `shared/schema.ts`, `accountServicePositions` and `accountServiceRates`.

### Legacy rate

`customers.shift_bill_rate` remains a separate production field. The current architecture does not prove that it is equivalent to an account service rate or when it should take precedence.

## 2. Current account pricing configuration

The hierarchy directly supported by existing production code is:

1. Active account product assignment.
2. Active product definition.
3. Account product price override when present; otherwise the product unit price.
4. Active service positions.
5. Active, effective-dated service rates.

`server/services/contractProductsService.ts` exposes:

- Account price override.
- Standard product price.
- Minimum, maximum, and suggested price.
- Hourly, mileage, and flat rates where matching billing-unit records exist.
- Effective rate rows and history.

The service exposes multiple rate components. It does not prove one universal precedence rule among product price, account override, service rate, and legacy Shift rate for every billing method.

## 3. Current market pricing configuration

There is no authoritative production account-to-pricing-market relationship.

Current market-like data includes:

- Account city and state.
- Payroll markets and zones.
- Product `markets` JSON.
- Isolated Sales pricing markets.

These sources are not equivalent. Account city/state cannot safely be treated as a pricing market, payroll zones are pay-side concepts, and product market text does not establish account membership.

The `sales_pricing_*` tables are isolated administration/reference records. Their migrations and APIs explicitly avoid production pricing mutations.

## 4. Current pricing-tier structure

No normalized production customer-pricing tier model was found.

- `account_service_rates.rate_type` classifies rates such as regular, overtime, holiday, or custom; these are not volume tiers.
- Products may identify their pricing model as tiered, but there are no authoritative tier names, ranges, thresholds, or tier-rate rows.
- Payroll policy rules are pay-side configuration.
- Standard, Preferred, and Preferred Plus currently exist only in the isolated Sales reference model and are not connected to booking or billing.

## 5. Current DriverDash pricing logic

DriverDash product applicability is established in `contractProductsService`:

- The product must be eligible for DriverDash.
- The account driver model must be DriverDash or Hybrid.

The service returns configured prices and rates. It does not calculate a completed DriverDash customer quote from duration, mileage, repositioning, wait time, expenses, or volume tier.

No production DriverDash estimate/final-price formula was found.

## 6. Current Hybrid pricing logic

Hybrid exists as an account/driver model and can qualify for both DriverDash and DriverShift product applicability.

Hybrid is not a valid persisted Trip move type; canonical Trip move types are DriverDash and DriverShift. No production rule was found that resolves a Hybrid booking to a customer price or defines how Hybrid chooses between transactional and contracted-shift pricing.

## 7. Current DriverShift treatment

DriverShift is a canonical Trip move type and a product applicability path.

The current architecture can expose configured DriverShift products and rates. It does not prove that every DriverShift Move should receive transactional customer pricing. The ticket correctly requires contracted-shift treatment to remain authoritative where per-Move pricing is not applicable.

The isolated Sales calculator’s Shift multiplier is informational and is not production booking logic.

## 8. Existing pricing APIs

### Production account pricing

- `GET /api/accounts/billing-rates`
- `PATCH /api/accounts/billing-rates/rates/:rateId`
- `GET /api/accounts/billing-rates/audit`
- `GET /api/accounts/:id/services`
- Existing nested account service, position, and rate mutation routes
- `GET /api/v1/accounts/:id/contract-products`

### Booking

`POST /api/v1/bookings` validates booking/account/service information and creates a Trip. It accepts caller-supplied bill rate, pay rate, estimated minutes, coordinates, and pay-estimate values.

It does not resolve authoritative pricing, calculate a customer estimate, geocode addresses, calculate a route, or persist a pricing snapshot.

### Non-authoritative pricing APIs

`/api/sales/pricing` provides isolated market/rule administration and an informational calculator. It must not be used as the MoveNow production pricing source.

`dynamicPricingEngine` provides advisory cost signals/guidance bands and explicitly does not calculate a quote or customer price.

## 9. Existing Move pricing fields

`trips` contains:

- Distance and duration.
- Bill rate and pay rate.
- Gross profit.
- Imported customer revenue and driver cost.
- Imported margin.
- Origin/destination coordinates.
- Estimated minutes.
- Pay-estimate fields.
- Structured account, vehicle, origin, and destination information.

Missing:

- Estimated customer price.
- Final customer price.
- Price variance.
- Pricing status.
- Pricing configuration/version identifier.
- Pricing tier identifier.
- Immutable booking-pricing snapshot.
- Immutable final-pricing snapshot.
- Calculation component ledger.
- Estimate/final timestamps.
- Repricing history.
- Manual price adjustment history.
- Review flags and approval state.

Existing `move_snapshots` are claim/audit snapshots. They do not preserve a reproducible customer quote or final-price calculation and are not created by booking or completion.

## 10. Existing estimated-mileage/time services

No authoritative routing, directions, distance-matrix, or geocoding service was found in the booking flow.

The booking API accepts coordinates and estimated minutes supplied by the caller. Existing distance and duration fields are legacy/unstructured and are not verified route snapshots.

The customer timeline currently returns no mileage, duration, or ETA calculation.

Required gap:

- Address normalization/geocoding.
- Routing provider and error/fallback policy.
- Persisted estimated miles and minutes.
- Route calculation provenance.
- Recalculation triggers when route-relevant fields change.

## 11. Existing rideshare/repositioning data

Rideshare currently operates as an import, matching, reconciliation, and billing domain.

`move_financials` has an aggregate repositioning cost field, but no:

- Estimated versus actual repositioning pair.
- Planned versus actual method.
- Calculation basis.
- Approval.
- Source ride/vendor/expense foreign key.
- Customer-billable repositioning amount.

The current move-financial engine calculates direct cost from labor plus matched rideshare. It does not populate repositioning, incentive, adjustment, toll, parking, or general expense costs.

Rideshare matching uses account and a date window, which can misattribute costs where multiple Moves are plausible matches.

## 12. Existing expense structure

`expenses` provides:

- Trip ID.
- Amount.
- Category, including tolls and parking.
- Receipt URL.
- Status.
- Associated customer.
- Invoice ID.

`expense_approvals` provides staged manager/COO/executive decisions, approvers, timestamps, and notes.

Missing:

- Customer-billable flag.
- Billable rationale.
- Pricing treatment or markup.
- Immutable customer-billing approval.
- Required-receipt policy.
- Receipt integrity metadata.
- Direct inclusion in the move-financial calculation.

Approved expenses are not currently consumed by the move-financial engine, so approval alone does not establish a customer charge.

## 13. Existing Stripe authorization/capture integration

Stripe currently creates PaymentIntents with automatic payment methods. The implementation does not set manual capture and exposes confirm/cancel/refund helpers rather than an explicit authorization-then-capture workflow.

The payment model stores PaymentIntent and charge identifiers, processor fees, net amount, status, failures, and refunds.

Invoices store payment-link information but do not have an enforced direct PaymentIntent foreign key. Payment-to-invoice linkage relies on fields/metadata rather than one authoritative relational link.

Before any MoveNow payment implementation:

- Verify amount and invoice/account ownership at the server boundary.
- Define authorization versus automatic capture.
- Define estimate changes and incremental authorization behavior.
- Define final capture/settlement behavior.
- Prove webhook idempotency and reconciliation.
- Keep pricing calculation separate from payment execution.

No Move/customer pricing Terms & Conditions acceptance record was found. There is no applicable acceptance timestamp, actor, terms version, or content hash.

## 14. Existing pricing calculations

No MoveNow booking estimate or completion-time final-price calculation exists.

The current move-financial engine:

- Uses a Trip bill rate where available.
- Otherwise may allocate invoice revenue equally across completed customer Trips in a period.
- Matches eligible rideshare transactions by account and date proximity.
- Calculates direct cost from labor plus rideshare.
- Derives gross profit and margin percentage.

This is retrospective financial reporting, not an authoritative booking/final customer-pricing engine.

Known risks:

- Equal-split revenue can misstate individual Move revenue.
- Date-proximity rideshare matching can misattribute cost.
- Approved expenses and several existing cost fields are excluded.
- Invoice line source links are not consistently enforced by foreign keys.
- Repeated engine execution requires an explicit idempotency review.

## 15. Gaps that must be addressed before implementation

### Authoritative pricing decisions

1. Define the authoritative pricing resolver and precedence among:
   - Account service bill rates.
   - Account product overrides.
   - Product unit price.
   - Legacy Shift bill rate.
   - Contract terms.
2. Define the authoritative account-to-market relationship.
3. Define whether customer tiers exist in production and where they are stored.
4. Define Hybrid pricing semantics.
5. Define when DriverShift is transactional versus covered by a shift contract.

### Calculation configuration

6. Model only approved pricing components:
   - Minimum/base charge.
   - Hourly and per-Move billing.
   - Included and additional mileage.
   - Wait-time inclusion, increments, and rates.
   - Repositioning billing treatment.
   - Additional stops and service time.
   - Customer-billable expenses and markup.
7. Define estimate inputs, actual inputs, rounding, and missing-input behavior.

### Durable audit model

8. Add an immutable, versioned pricing snapshot for booking estimates.
9. Add an immutable final-calculation record with components, variance reasons, warnings, and review flags.
10. Preserve system calculation separately from authorized manual adjustments.
11. Establish idempotency for estimate refresh, booking submission, completion, finalization, and repricing.

### Operational data

12. Establish an authoritative routing/geocoding service and route snapshot.
13. Establish reliable Move-to-rideshare, Move-to-expense, and Move-to-invoice-line relationships.
14. Add customer-billable expense and approval semantics.
15. Define final-price status transitions using existing Move/invoice states where possible.

### Payments and customer acceptance

16. Document and approve Stripe authorization/capture behavior before changing payment flow.
17. Add auditable pricing/T&C acceptance if required.

### Security finding requiring separate correction

The audited customer Move list route appears not to enforce the intended customer-account filter: its account predicate resolves true for every candidate row. This could expose unrelated Moves to an authenticated customer user. It should be corrected and regression-tested independently before exposing estimate or final-price data through the customer portal.

## Required stop

Per the ticket, work stops after this audit. No pricing formulas, pricing snapshots, payment changes, rate-resolution service, or MoveNow pricing UI have been implemented.