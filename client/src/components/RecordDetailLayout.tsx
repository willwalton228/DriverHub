import { cn } from "@/lib/utils";

/**
 * RecordDetailLayout
 *
 * Standard shell for all core record detail pages (Drivers, Employees,
 * Accounts, Claims, Vendors).  It owns no data-fetching or business logic —
 * it is purely a layout primitive.
 *
 * Slot anatomy (top → bottom, left → right):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  stickyHeader  (z-50, sticks to top of viewport)           │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  summaryStrip? (optional KPI / quick-stats row)            │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  mainContent                    │  rightPanel?             │
 *   │  (flex-1, scrollable)           │  (w-80, sticky)          │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   <RecordDetailLayout
 *     stickyHeader={<RecordHeader ... />}
 *     summaryStrip={<DriverKpiStrip driver={driver} />}
 *     rightPanel={<ActivityTimeline ... />}
 *   >
 *     <ProfileSection />
 *     <PaySection />
 *   </RecordDetailLayout>
 */

export interface RecordDetailLayoutProps {
  /** Sticky header zone — typically <RecordHeader> + <RecordWorkspaceTabs> */
  stickyHeader: React.ReactNode;
  /** Optional KPI / summary strip rendered below the sticky header */
  summaryStrip?: React.ReactNode;
  /** Optional right-hand support panel (sticky, desktop only) */
  rightPanel?: React.ReactNode;
  /** Pixel offset from the top for the right panel's sticky position.
   *  Should match the sticky header height. Defaults to 128. */
  rightPanelStickyTop?: number;
  /** Main scrollable content area */
  children: React.ReactNode;
  className?: string;
}

export function RecordDetailLayout({
  stickyHeader,
  summaryStrip,
  rightPanel,
  rightPanelStickyTop = 128,
  children,
  className,
}: RecordDetailLayoutProps) {
  return (
    <div className={cn("space-y-0", className)}>
      {stickyHeader}

      <div className="space-y-4 pt-4">
        {summaryStrip && (
          <div data-testid="record-summary-strip">{summaryStrip}</div>
        )}

        {rightPanel ? (
          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0 space-y-4" data-testid="record-main-content">
              {children}
            </div>
            <aside
              className="hidden xl:block w-80 shrink-0"
              style={{
                position: "sticky",
                top: `${rightPanelStickyTop}px`,
                maxHeight: `calc(100vh - ${rightPanelStickyTop + 16}px)`,
                overflowY: "auto",
              }}
              data-testid="record-right-panel"
            >
              {rightPanel}
            </aside>
          </div>
        ) : (
          <div data-testid="record-main-content">{children}</div>
        )}
      </div>
    </div>
  );
}
