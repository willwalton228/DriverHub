# DriverHub 360 Design Guidelines

## Design Approach
**System:** Fluent Design + Modern Dashboard Patterns  
**Rationale:** Enterprise HR/management platform prioritizing data clarity, efficient workflows, and dual-role functionality. Selected for information-dense interfaces with strong organizational hierarchy.

## Brand Integration
- **Primary Brand Color:** Orange (#FF6B35 or similar from logo)
- **Logo Placement:** Top-left of navigation bar for both portals
- Use orange strategically for CTAs, active states, and key metrics highlights

## Typography System
- **Headings:** Inter or Work Sans (500-700 weight)
  - H1: 2rem (Dashboard titles)
  - H2: 1.5rem (Section headers)
  - H3: 1.25rem (Card titles)
- **Body:** Inter (400 weight, 0.875-1rem)
- **Data/Numbers:** Tabular figures, monospace for consistent alignment

## Layout & Spacing
**Tailwind Units:** Consistently use 2, 4, 6, 8, 12, 16, 20 for spacing
- Navigation bar: h-16
- Sidebar (corporate): w-64
- Content padding: p-6 to p-8
- Card spacing: gap-6
- Section margins: mb-8 to mb-12

## Component Library

### Navigation
**Driver Portal:**
- Top horizontal nav with logo, main links (Profile, Pay, Trips), user menu
- Mobile: Hamburger menu

**Corporate Dashboard:**
- Persistent left sidebar with sections: Dashboard, Drivers, Analytics, Settings
- Top bar: Search, notifications, user profile

### Core Components

**Dashboard Cards:**
- Rounded corners (rounded-lg)
- Subtle shadow (shadow-sm)
- White background with border
- Padding: p-6
- Stat cards: Large number, label below, small trend indicator

**Data Tables:**
- Zebra striping for rows
- Sticky header on scroll
- Sortable columns (up/down indicators)
- Action buttons (view, edit) aligned right
- Pagination at bottom
- Search and filter controls above table

**Forms:**
- Grouped fields with clear labels (font-medium, mb-2)
- Input fields: border, rounded-md, px-3 py-2, focus:ring-2
- Disabled fields for non-editable data (lighter background)
- Submit buttons: orange primary, gray secondary

**Notes Section (Corporate):**
- Chronological list with timestamp, author name
- Text area for new notes
- Each note in card format with subtle divider

**Metrics Display:**
- KPI cards in 3-4 column grid
- Icon + number + label pattern
- Percentage changes with up/down arrows (green/red)

### Pay Data Visualization
- Summary cards: Total earnings, current period, YTD
- Table breakdown by pay period
- Simple bar chart for earnings trends (optional)

### Trip History
- Timeline view with date dividers
- Each trip: origin → destination, date, status badge
- Filters: Date range picker, status dropdown
- Export button (CSV/PDF)

## Responsive Strategy
- **Desktop (1024px+):** Full sidebar + content area
- **Tablet (768-1024px):** Collapsible sidebar
- **Mobile (<768px):** Top nav only, stack all content single-column

## Accessibility
- WCAG AA contrast ratios throughout
- Keyboard navigation for all interactive elements
- Screen reader labels on icons
- Focus indicators visible on all inputs/buttons

## Animation
Minimal, functional only:
- Smooth transitions on hover (150ms)
- Sidebar collapse/expand (200ms)
- Loading spinners for data fetches
- No decorative animations

## Images
**No hero images required** - this is a functional dashboard application
**Profile Photos:** Circular avatars (64px) for driver profiles
**Empty States:** Simple illustrations for "No trips yet" or "No notes"