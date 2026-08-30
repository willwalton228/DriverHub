# Market Pricing Overview — Existing Architecture Audit

## Scope and safety boundary

This audit covers the existing production pricing architecture requested by the Market Pricing Overview ticket. The isolated Sales Market Pricing administration tables are not an authoritative source for this overview and must not be used to replace or duplicate production pricing.

The proposed overview must remain read-only. Viewing, searching, filtering, or comparing records must not update customer pricing or pricing configuration.

## 1. Current production pricing sources

The existing commercial pricing hierarchy is:

1. **Products** — default product/service configuration, unit price, pricing model, billing frequency/trigger, suggested/minimum/maximum price, target margin, cost, effective date, price book, and an unnormalized market list.
2. **Account products** — the products enabled for an account, including account-level price overrides, billing rules, and effective dates.
3. **Account service positions** — positions configured beneath an account service.
4. **Account service rates** — effective-dated bill rate, pay rate, rate type, billing unit, and overtime configuration.

The existing production billing-rate APIs join these sources for account-level pricing administration. A legacy account Shift bill-rate field also remains in use, so it must be identified separately rather than silently merged with service-rate records.

## 2. Existing market relationships

DriverHub currently has multiple non-equivalent market concepts:

- Accounts contain city, state, and the Account Detail **Network** field.
- Payroll markets have a market identifier, code, and name.
- Payroll zones reference payroll markets.
- Products contain an unnormalized JSON market list.

The product owner confirmed that the value shown on Account Detail is the authoritative pricing market for this overview. In the current implementation that field is labeled **Network** and stored in `customers.network`. The overview therefore treats `customers.network` as its market key and does not infer a market from city/state, payroll zones, or product market text.

This decision removes the market-linkage blocker without creating a new table or duplicate mapping.

## 3. Products, services, and driver models

Products provide product/service identity, service category, default move types, and pricing model. Accounts provide an operational driver model. Account service positions and rates provide the configured bill/pay terms for a specific account service.

These fields can populate Product / Service, Driver Model, Pricing Model, Bill Rate, Pay Rate, Rate Type, Billing Unit, Overtime configuration, effective dates, and account-specific indicators where the relevant joins exist.

## 4. Pricing tiers

No normalized customer-pricing tier table or tier-range model currently exists in the production pricing architecture.

- Account service rates support rate types such as regular, overtime, holiday, and custom; these are not customer volume tiers.
- Products can identify a pricing model as tiered, but no authoritative tier names, thresholds, or rate rows were found.
- Payroll policy versions/rules are pay-side configuration and must not be presented as customer pricing tiers.

Tier names and thresholds therefore cannot be inferred or hard-coded.

## 5. Account-specific pricing

The established production account-specific sources are:

- Account product price overrides.
- Account service bill/pay rates.

These must be displayed as account-specific records and never blended into a market standard in a way that makes them appear to be default pricing.

## 6. Driver costs, customer rates, and other components

Available:

- Customer bill rate from account service rates.
- Default product price and account product price override.
- Configured pay rate from account service rates.
- Driver pay profile and realized driver earnings data.
- Realized repositioning cost in move financials.

Not available as one dependable production pricing configuration:

- Customer mileage pricing.
- Additional-hour pricing.
- Minimum/base move charge.
- Minimum hours.
- Minimum weekly commitment.
- Customer repositioning/driver-return charge.
- Priority or rush fees.
- Other unified fee components.
- Final Hybrid pricing formula.

Invoice line types and realized move costs must not be reinterpreted as standing customer price rules.

## 7. Margin calculation

The authoritative realized margin sources are move financials and account financial summaries. Existing logic calculates gross profit from recognized revenue minus recorded costs and derives margin percentage from that result.

The overview may display those existing realized values where a reliable account relationship exists. It must not invent a new expected-margin formula or combine configured rates and unrelated pay profiles without the existing cost engine.

## 8. Pricing history

Available history sources include:

- Account billing-rate audit records.
- Effective-dated account service rates.
- Product audit history where applicable.
- Move-financial calculation timestamps for realized financial results.

Historical rates must remain visibly distinct from currently effective rates.

## 9. Permissions

Existing production billing-rate reads require corporate access. Current billing-rate edit roles include established administrative and finance roles.

The new overview should:

- Permit Corporate Admin and Super Admin read access.
- Remain read-only.
- Reuse existing corporate-access authorization.
- Not expand Corporate Admin mutation permissions.
- Link to existing pricing/account screens only where the destination already enforces its own permissions.

## 10. Requested fields that cannot currently be populated reliably

The following remain unavailable or unreliable without a new approved source:

- Normalized pricing tier names and thresholds.
- Unified minimum, mileage, additional-hour, weekly-commitment, repositioning, and fee rules.
- Expected configuration-level margin where the existing cost engine has not produced a value.
- A single market-standard price version spanning all production pricing sources.

The UI must show unavailable fields as unavailable or omit them; it must not insert misleading zero values.

## Recommended implementation after market authority is confirmed

Add a read-only corporate API that:

- Joins accounts, account products, products, service positions, and latest effective service rates.
- Uses the approved authoritative market relationship.
- Returns field-level provenance and explicit missing-data flags.
- Separates standard product pricing, account product overrides, and account service rates.
- Optionally includes existing realized account margin values without recalculation.
- Supports parameterized market, product, driver model, pricing model, rate type/tier, status, account-specific, date, and search filters.
- Performs no writes and never reads from the isolated Sales pricing administration tables.

Add a distinct corporate route and label, such as **Market Pricing Overview**, so it cannot be confused with the separate Sales Market Pricing administration/reference workspace.