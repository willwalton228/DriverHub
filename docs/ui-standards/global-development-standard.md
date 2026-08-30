[GLOBAL DRIVERHUB 360 DEVELOPMENT STANDARD]

TITLE
Mandatory Product UI Compliance Gate for All Development

SCOPE
DriverHub 360 — ALL modules, screens, components, enhancements, bugs, and feature requests

OBJECTIVE

The documented DriverHub 360 Product UI Guidelines are mandatory global development requirements.

They are NOT optional reference material.

They do NOT need to be repeated inside individual AMRs/tickets.

From this point forward, every ticket that creates, modifies, replaces, or materially affects a user-facing screen must automatically comply with the established Product UI Guidelines.

An individual ticket describes WHAT functionality needs to change.

The Product UI Guidelines define HOW that functionality must be presented.

==================================================
1. GLOBAL RULE — UI GUIDELINES APPLY AUTOMATICALLY
==================================================

Before modifying any user-facing UI:

1. Review the established DriverHub Product UI Guidelines.
2. Review existing approved/shared components applicable to the screen.
3. Identify the established DriverHub pattern for that type of interface.
4. Implement the requested functionality using those standards.

Do NOT require the ticket author to restate:

- Typography
- Font sizes
- Table standards
- Column header standards
- Alignment
- Spacing
- Density
- Status colors
- Pill treatment
- Widget/card standards
- Button standards
- Search standards
- Filter standards
- Empty states
- Error states
- Loading states
- Responsive behavior
- Navigation behavior

These are platform requirements.

Ticket silence does NOT authorize deviation from the Product UI Guidelines.

==================================================
2. DO NOT INVENT NEW UI PATTERNS
==================================================

Do not create a new visual treatment when DriverHub already has an approved pattern.

Before building a new:

- Table
- List
- KPI strip
- Dashboard widget
- Filter bar
- Search bar
- Detail header
- Status indicator
- Modal
- Empty state
- Error state
- Action menu
- Tab structure

first determine whether an approved DriverHub pattern/component already exists.

Reuse the approved pattern whenever practical.

Do not introduce unnecessary:

- Oversized cards
- Excessive padding
- Excessive whitespace
- Decorative icons
- Colored backgrounds
- Pill-shaped controls
- Large empty-state illustrations
- Multiple font treatments
- Unnecessary containers
- Redundant labels
- Redundant search fields

DriverHub is an operational application. Information density and usability take priority over decorative design.

==================================================
3. REFERENCE STANDARD FOR DATA-HEAVY SCREENS
==================================================

For operational list/table screens, use the established compact DriverHub list treatment, including the approved Claims-style patterns where applicable.

The expectation is:

- Compact page header
- Minimal vertical whitespace
- Compact KPI/summary strip
- One primary search experience where appropriate
- Compact filters
- Dense readable table
- Consistent typography
- Clear hierarchy
- Consistent alignment
- Minimal decorative elements
- Maximum useful information visible without unnecessary scrolling

Users should not have to scroll down immediately simply because headers, widgets, filters, or whitespace consume excessive vertical space.

==================================================
4. TYPOGRAPHY COMPLIANCE
==================================================

Use the established DriverHub typography standard consistently.

Do not introduce arbitrary:

- font families
- monospace fonts
- font sizes
- font weights
- letter spacing

within a table or comparable data presentation.

Primary table data should use one consistent body treatment unless the Product UI Guidelines explicitly define an exception.

Approved secondary information may use the established smaller secondary treatment.

Examples include secondary Account/location information beneath the primary Account name.

==================================================
5. TABLE COMPLIANCE
==================================================

Every table must be reviewed for:

- Column order based on operational importance
- Approved header typography
- Header alignment
- Data alignment
- Column width
- Sort indicators
- Sort behavior
- Filtering
- Search
- Row interaction
- Sticky behavior where required
- Responsive behavior
- Consistent font treatment
- Appropriate numeric alignment
- Appropriate date alignment
- Appropriate currency alignment

Do not allow unnecessarily long headers to create horizontal overflow when approved wrapping/column sizing can prevent it.

Do not add icons to column headers unless the Product UI Guidelines specifically require them.

==================================================
6. COLOR AND STATUS COMPLIANCE
==================================================

All status, urgency, priority, health, and state indicators must use the established DriverHub color definitions.

Do not select arbitrary Tailwind colors or approximate colors.

Do not create new status colors because they "look appropriate."

Use the approved semantic colors and exact approved design tokens/values.

Do not use pills merely because a value represents a status.

Use the established DriverHub treatment for that specific type of value.

==================================================
7. KPI / SUMMARY WIDGET COMPLIANCE
==================================================

Summary widgets must follow the compact DriverHub standard.

Avoid oversized dashboard cards.

Widgets should consume only the vertical and horizontal space necessary to communicate:

- Label
- Primary metric
- Required secondary metric/context
- Required action

When several metrics belong together, they should read as a compact unified summary strip.

Do not push the primary operational list substantially down the page simply to display summary information.

==================================================
8. SPACING AND DENSITY
==================================================

DriverHub is a high-density operational system.

Every screen must be reviewed for wasted space.

Specifically check:

- Page top spacing
- Header height
- Header-to-widget spacing
- Widget height
- Widget padding
- Search spacing
- Tab spacing
- Filter spacing
- Table row height
- Section gaps
- Empty-state height

Do not use large blank areas merely for visual separation.

==================================================
9. RESPONSIVE DESIGN
==================================================

Compliance must be checked at supported screen sizes.

Do not assume that a screen is responsive because responsive CSS classes exist.

Verify that:

- Important data remains usable
- Controls do not overlap
- Headers do not collide
- Tables behave appropriately
- Actions remain accessible
- Text remains readable
- Horizontal scrolling occurs only where justified
- Excessive desktop spacing does not become unusable on tablets

==================================================
10. REQUIRED UI COMPLIANCE AUDIT
==================================================

Before declaring ANY user-facing ticket complete, perform a UI compliance audit.

Audit at minimum:

[ ] Page structure
[ ] Header
[ ] Typography
[ ] Spacing
[ ] Density
[ ] KPI/widgets
[ ] Search
[ ] Tabs
[ ] Filters
[ ] Table/list
[ ] Column order
[ ] Header alignment
[ ] Data alignment
[ ] Sorting
[ ] Colors
[ ] Status/urgency treatment
[ ] Buttons/actions
[ ] Icons
[ ] Empty states
[ ] Loading states
[ ] Error states
[ ] Responsive behavior
[ ] Navigation/back behavior
[ ] Existing DriverHub component reuse

Any discovered violation must be corrected BEFORE the ticket is returned for UAT.

==================================================
11. BUILD SUCCESS IS NOT UI VALIDATION
==================================================

A successful:

- Build
- Compile
- TypeScript check
- Vite reload
- Unit test
- API test

does NOT constitute visual/UI verification.

Do not state or imply that a screen has been visually verified merely because the application compiled successfully.

If authentication or another limitation prevents actual visual inspection, explicitly state:

"Visual UI verification was not completed."

Do not claim:

- UI compliant
- visually verified
- layout verified
- responsive verified

unless those items were actually inspected.

==================================================
12. EXISTING SCREEN REGRESSION PROTECTION
==================================================

When modifying an existing screen:

Do not unnecessarily redesign or replace portions of the screen unrelated to the ticket.

Preserve approved existing:

- Layout
- Behaviors
- Filters
- Sorts
- Navigation
- Typography
- Components
- User state
- Responsive behavior

unless the ticket explicitly changes them or they violate the current Product UI Guidelines.

A functional change must not cause a UI regression.

==================================================
13. SHARED COMPONENT FIRST
==================================================

Where repeated UI violations exist because individual screens implement their own versions of common controls, move toward shared components/design tokens rather than repeatedly fixing screens independently.

Examples:

- Status display
- Urgency display
- Table headers
- Sort indicators
- KPI widgets
- Search bars
- Filter controls
- Empty states
- Error states
- Loading states

Fixing a shared component should improve every applicable screen without requiring separate cosmetic tickets.

==================================================
14. DEFINITION OF DONE
==================================================

A user-facing ticket is NOT Done merely because its requested business functionality works.

Definition of Done requires BOTH:

A. Functional requirements pass.

AND

B. Product UI Guidelines pass.

If either fails, the ticket is incomplete.

==================================================
15. CURRENT ENFORCEMENT TEST
==================================================

Use:

Recruiting → Closed Campaigns

as the first screen audited under this global standard.

The Closed Campaign data issue has now been corrected.

Do NOT limit the next work to individual cosmetic issues identified by the user.

Perform a complete Product UI Guidelines audit of the entire Closed Campaigns screen and correct ALL violations found.

Compare the implementation against established DriverHub operational/list standards, particularly the approved compact data-heavy screen patterns.

This includes, but is not limited to:

- Page/header density
- Summary widget sizing
- Excessive whitespace
- Table typography
- Column header treatment
- Column alignment
- Data alignment
- Status/urgency treatment
- Spacing
- Sorting presentation
- Filter treatment
- Responsive behavior
- Empty/loading/error states
- Overall information density

Do not return the Closed Campaigns screen for UAT until both its functionality AND UI compliance have been validated.

==================================================
PERMANENT REQUIREMENT
==================================================

This is a GLOBAL DriverHub development requirement.

Do not require Will to repeatedly identify Product UI Guideline violations after development.

UI compliance is part of implementation, not a separate user-requested enhancement.