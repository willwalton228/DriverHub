# DriverHub 360

## Overview
DriverHub 360 is a web application designed for transportation and delivery companies. Its core purpose is to centralize driver management, optimize operational workflows, and deliver comprehensive business intelligence. The platform aims to boost efficiency and support industry growth by offering self-service driver portals and advanced HR/management dashboards that unify financial, operational, and driver data. Key capabilities include optimized logistics, streamlined driver operations, and actionable business insights. The project envisions becoming the industry standard for logistics operations, enabling significant cost reductions, improved service delivery, and a competitive advantage.

## User Preferences
### Deployment
- **Always suggest publishing immediately after every completed change.** The user expects a Publish prompt at the end of every task without being asked. This is a standing instruction — never skip it.
- Note: the Replit platform requires the user to click the Publish button. The agent cannot trigger a deployment programmatically. Surfacing the prompt every time is the only mechanism available.

### Design System
- Primary color: Orange (#FF6B35 - from DriverHub 360 branding)
- Clean, modern UI with professional dashboard aesthetics
- Dark mode support with theme toggle
- Responsive design for mobile and desktop

### Sticky / Pinned Header Layering Rule
For any page that has a global application header **plus** a secondary sticky/pinned module header:
- The `<main>` scroll container must have **zero top padding** for that route (add it to the `p-0` condition in `App.tsx` alongside `/ops-map`).
- The module's outer wrapper must **not** use negative top-margin compensations (`-mt-*`) to counteract `<main>`'s padding — those compensations are brittle and allow scrolling content to bleed through the gap between the global header and the sticky module header.
- The sticky element must use `top-0`, `z-50`, and a fully opaque `bg-background` (no opacity, no backdrop-blur).
- The entire region from the bottom of the global header to the bottom of the secondary sticky header must be visually opaque at all times — no scrolling content may appear in that space.
- This rule applies to **all** DriverHub modules, not only Claims.

### Dashboard Design Principle
Dashboards should only exist when they provide actionable operational or executive intelligence. Dashboards should never be created solely because every module is expected to have one. If a dashboard cannot answer meaningful business questions or influence decisions, the module's primary workspace should become its default landing page. Business intelligence always takes precedence over visual symmetry.

### Code Conventions
- TypeScript throughout
- React Hook Form with Zod validation
- TanStack Query for data fetching
- Shadcn UI components
- Tailwind CSS for styling

## System Architecture
The application utilizes a React + TypeScript frontend, an Express.js + TypeScript backend, and a PostgreSQL database with Drizzle ORM. Authentication is managed via Replit Auth (OpenID Connect).

### Core Architectural Decisions & Features
- **Dual Portals**: Separate Driver Portal and Corporate Dashboard for distinct user roles.
- **Data Management**: Comprehensive CRUD operations with Role-Based Access Control (RBAC), multi-tenancy, white-labeling, and secure document handling.
- **Automation & Intelligence**: Operational automation, risk assessment, market analysis, forecasting, and AI-assisted decision support.
- **Integration Framework**: A reusable adapter framework facilitates integration with external systems.
- **Reporting & Compliance**: Robust financial, legal, and operational reporting, configurable data retention policies, and immutable audit trails. A scalable registry-based reporting framework supports multi-module custom reporting, dynamic field catalog generation, and grain control for relationship modes (`primary_only`, `all_records`, `summary`).
- **API Layer**: Versioned DriverConnect API (`/api/v1`) with OpenAPI documentation.
- **Webhook Event Framework**: Secure and reliable outbound webhook system with HMAC-SHA256, retry mechanisms, and dead-letter queue.
- **Payment Processing**: Includes a Stripe webhook event engine, a FIFO payment application engine for invoice allocation, and a financial record locking engine for immutability.
- **Branded Communications**: System for generating branded HTML emails and PDF documents using centralized templates.
- **Customer Billing Documents Portal**: An admin-managed public document library with versioning.
- **Financial Integrity Services**: Features for duplicate detection, deposit batch validation, and ledger reconciliation.
- **Invoicing Rollout Control & Monitoring**: Tools for managing and monitoring invoicing rollouts.
- **Fraud Detection Intelligence**: Owner-only module with pre-loaded patterns and investigation workflows.
- **Payment Adjustment & Reversal Controls**: Role-gated system with mandatory reasons and audit logging.
- **Server-Side Permission Enforcement**: Backend role checks on all financial API write endpoints.
- **Claims Management**: Email-push workflows, PDF generation, immutable audit trails, risk analysis, and AI-powered narrative generation. Includes a **Per-Claim Auto Narrative Generator** (`claim_narratives` table, `server/services/claimNarrativeService.ts`) that produces a 4-section structured narrative (What Happened, Who Involved, Damage Summary, Liability Context) using OpenAI GPT-4o, with staleness detection, user editability, and copy-to-clipboard support (`ClaimNarrativeCard` component in `AccidentDetail`). Also includes a **Claims Alerts & Risk Flags** system (`server/claimAlertsService.ts`) with 4 alert types (missing info, high cost, repeat driver, delayed), per-claim panel (`ClaimAlertsPanel`), inline queue badge (`ClaimAlertBadge`), and dashboard summary card (`ClaimAlertsSummaryCard`).
- **Modular Dashboards**: Configurable widgets with role-based permissions.
- **Document Hub**: Centralized document management with a global standard library.
- **Hierarchical Accounts**: Support for Parent/Child account structures with rolled-up metrics.
- **Vendor Management**: Renewal alerts, compliance tracking, performance scorecards, and AI Contract Review.
- **Recruiting Module**: Manages candidates, pre-hire screening, and AI-assisted screening. Includes a comprehensive Recruiting Request Intake & Campaign Conversion system with COO approval workflows, multi-channel ad selection, review layers, ad publishing workflows, and job ad template management. Post-approval workflow: on request approval, a requisition is auto-created, the recruiter is notified by email, and the **Campaign Workspace** (5-step wizard at `/recruiting/campaigns/:id/workspace`) guides the recruiter through ad template selection, channel selection, ad review/editing, and publishing to all chosen channels.
- **Scheduling Engine**: Manages shift-based and on-demand labor, time clock, and leave.
- **Invoicing System**: Comprehensive invoicing with a public payment portal and automated delivery.
- **Payroll System**: Full payroll lifecycle management.
- **Financial Intelligence**: Rolling 12-month forecasts, P&L variance analysis, margin intelligence, and repricing detection.
- **Margin Engine**: Move-level profitability analysis with financial status and exception management.
- **SSO Identity & Access Foundation**: DriverHub acts as an identity provider for DriverConnect.
- **Driver Risk Enforcement Engine**: Automated actions based on Driver Risk Score tiers.
- **Timezone Normalization**: Time displays in scheduling workspaces rendered in local timezones.
- **Revenue Engine**: Product-driven billing module covering the full billing lifecycle.
- **Automated Weekly Reporting**: Generation and email delivery of PDF schedules and Excel hours reports.
- **Core Communications Framework**: Channel-based, provider-pluggable infrastructure for all outbound communications with a centralized orchestrator and audit logging, including a typed Node.js Event Bus and DB-driven template engine.
- **Heymarket SMS Communications Framework**: Full outbound SMS stack including driver readiness, phone normalization, Heymarket API integration, admin configuration, and user-to-Heymarket identity mapping.
- **Financial Exception Detection Engine**: Real-time anomaly detection for financial discrepancies.
- **Weekly Billing Control Panel**: Wizard for reviewing and executing weekly invoice generation.
- **Invoice Import Engine**: Multi-step wizard for bulk invoice creation from CSV/XLSX.
- **Operations Map**: Interactive Leaflet/OpenStreetMap-based operational map with toggleable layers (Accounts, Drivers, Employees, Moves), contextual detail cards, and filtering.
- **Driver Photo Approval Framework**: System for managing driver photo submissions and approvals.
- **Migration Infrastructure**: Numbered SQL files executed via a runner for database schema management.
- **Account Contacts Workspace**: CRM-style contact management tab within Account Detail (`account_contacts` table). Supports multiple contacts per account with structured fields (name, role, department, phone, email, extension), designation flags (Primary, Billing, Communication), notification preferences (schedule emails, escalations, billing, service updates), and archive/restore lifecycle. Primary and Billing designations auto-sync to the existing Company Details contact fields on the `customers` table. All create/update/archive actions logged to `account_activity_events`. Routes: `GET/POST /api/accounts/:id/contacts`, `PATCH /api/accounts/:id/contacts/:id`, `PATCH /api/accounts/:id/contacts/:id/archive`.
- **Commercial Services & Billing Framework**: Foundational commercial data structure integrated into Account Detail ("Services & Billing" tab). Uses the Products sub-module as the source of truth for sellable/billable items. Relationship: `products` → `account_products` (extended as Account Services with `program`, `launch_date`, `billing_method`, `billing_frequency_override`, `invoice_group`, `operational_notes`) → `account_service_positions` → `account_service_rates`. Supports multiple services per account, multiple positions per service (with schedule/shift position mapping and headcount), and multiple effective-dated rates per position (bill rate, pay rate, rate type, billing unit, OT eligibility). UI is an expandable card workspace at `client/src/components/accounts/AccountServicesTab.tsx`. Routes: `GET/POST /api/accounts/:id/services`, `PATCH /api/accounts/:id/services/:sid`, positions CRUD at `…/:sid/positions[/:pid]`, rates CRUD at `…/:pid/rates[/:rid]`.

## Development Operating Protocol (applies to all DriverHub 360 work)

1. **Work only the approved ticket.** No adjacent improvements, no scope expansion, no acting on suggested next tasks. Discovered issues are documented in the completion report, not fixed unless they directly block the approved ticket.
2. **No questions answerable by inspection.** Inspect existing code, schema, APIs, UI patterns, and related modules before asking. Escalate only genuine business/product/policy/workflow decisions.
3. **No jumping ahead.** Phase gates are mandatory. Feature N.x → Stop → Will performs UAT → Will confirms pass → only then does N.(x+1) begin. Development complete ≠ UAT accepted.
4. **UI/UX verification before handoff.** Verify against established DriverHub patterns: page structure, header, spacing, typography, buttons, cards, tables, filters, status indicators, tooltips, loading/empty/error states.
5. **Technical verification before handoff.** Compile, load affected route, verify DB migrations, verify API behavior, verify primary workflow, check for regressions.
6. **Completion report format** (and nothing else after completing a ticket):
   - A. COMPLETED — what was implemented
   - B. TECHNICAL VERIFICATION — what was self-verified
   - C. UAT — exact user actions (where to go / what to do / what to expect)
   - D. KNOWN ISSUES — unresolved issues relevant to this ticket only
   - E. STATUS — always ends with: **READY FOR WILL'S UAT**
7. **UAT defects** → root cause + what changed + what was verified + exact retest steps. Do not advance phase.
8. **No unnecessary decision points.** Continuing investigation, restarting the app, checking the DB, fixing compilation, following UI patterns — these are development responsibilities, not escalation triggers.
9. **Ignore suggested next tasks** unless Will explicitly instructs otherwise.
10. **Phase gate is Will's explicit UAT acceptance.** Not development completion, not self-testing.
11. **Primary operating principle**: Will is the product owner. Bring business/product/workflow decisions. Handle all implementation mechanics independently.

## DriverHub Product UI Standards

### Pinned / Sticky Header Occlusion Standard

Established with Claims List as the reference implementation. Applies to all future sticky/pinned list and dashboard pages.

1. Pinned regions must use a fully opaque background matching the active theme (`bg-background` — do not add `opacity`, `bg-opacity`, or `backdrop-blur`).
2. Underlying page content must never be visible through the pinned region.
3. The pinned region must maintain `z-50` (or higher) to stay above scrolling content.
4. Scrolling table rows, text, borders, cards, and charts must not bleed through or appear above the pinned region.
5. A subtle bottom separator (`shadow-[0_1px_0_0_hsl(var(--border))]`) creates a visually clean transition between the pinned region and scrolling content.
6. The behavior must work consistently in Light Mode and Dark Mode.
7. Do not use excessive blank space as a workaround for layering problems.
8. Add `pt-4` (minimum) to the scrolling content area below the sticky zone to give table column headers adequate visual separation from the pinned controls.

**Reference implementation**: `client/src/pages/corporate/ClaimsQueue.tsx` (sticky zone wrapper + content area top padding).

### Action Bar Placement Standard

- **Widget Library** is a Dashboard configuration function. It belongs on Dashboard pages only — never on operational List views.
- List page actions: navigation to Dashboard, operational imports, primary create action.
- Dashboard page actions: navigation to List, Widget Library, Email/reporting actions, primary create action.

## External Dependencies
- **Replit Auth**: User authentication.
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: Database interactions.
- **Shadcn UI**: Frontend component library.
- **Tailwind CSS**: Styling.
- **TanStack Query**: Data fetching and state management.
- **Replit Object Storage**: Cloud storage for documents.
- **HubSpot CRM**: Customer data synchronization.
- **Stripe**: Payment processing.
- **QuickBooks**: Accounting integration.
- **WhenIWork API**: Integration for pulling worked-hours data.
- **Microsoft Graph**: Primary for email delivery.
- **Resend**: Fallback for email delivery.
- **Puppeteer**: Used for PDF generation.
- **Heymarket**: SMS communication provider.
- **Leaflet / react-leaflet**: Interactive map rendering (Operations Map).
- **OpenStreetMap / Nominatim**: Map tiles and server-side geocoding for Operations Map.