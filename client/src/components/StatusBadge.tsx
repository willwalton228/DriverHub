import { getStatusBadgeClass, formatStatusLabel } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string | null | undefined;
  label?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * StatusBadge — the single source of truth for all status badges in DriverHub 360.
 *
 * Color is controlled by the centralized STATUS_COLOR_MAP in @/lib/statusColors.
 * To change a status color system-wide, update that map — no component edits needed.
 *
 * Renders as a plain <span> (not the shadcn Badge wrapper) so there is zero
 * risk of the Badge default variant's bg-primary (orange) competing with the
 * status color class from the color map.
 *
 * Usage:
 *   <StatusBadge status={driver.status} />
 *   <StatusBadge status="active" label="Active" />
 */
export function StatusBadge({ status, label, className, "data-testid": testId }: StatusBadgeProps) {
  const colorClass = getStatusBadgeClass(status);
  const display = label ?? formatStatusLabel(status);

  return (
    <span
      className={cn(
        "whitespace-nowrap inline-flex items-center rounded-md border border-transparent px-2.5 py-0.5 text-xs font-semibold capitalize",
        colorClass,
        className
      )}
      data-testid={testId}
    >
      {display}
    </span>
  );
}
