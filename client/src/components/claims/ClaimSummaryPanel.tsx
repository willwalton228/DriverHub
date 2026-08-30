import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface SummaryField {
  label: string;
  value: string;
  colorClass?: string;
  onClick?: () => void;
}

export interface SummaryGroup {
  title: string;
  fields: SummaryField[];
}

interface ClaimSummaryPanelProps {
  /** Grouped layout — preferred */
  groups?: SummaryGroup[];
  /** Flat list — backward-compat, renders as a single unnamed group */
  fields?: SummaryField[];
  title?: string;
  icon?: LucideIcon;
  testId?: string;
}

function FieldValue({ label, value, colorClass, onClick }: SummaryField) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`text-xs font-semibold leading-snug text-right cursor-pointer underline-offset-2 hover:underline focus-visible:underline outline-none truncate ${colorClass ?? "text-foreground"}`}
          data-testid={`summary-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value}
        </button>
      ) : (
        <span className={`text-xs font-semibold leading-snug text-right truncate ${colorClass ?? "text-foreground"}`}>{value}</span>
      )}
    </div>
  );
}

export function ClaimSummaryPanel({
  groups,
  fields,
  title = "Claim Summary",
  icon: Icon = LayoutDashboard,
  testId = "card-claim-summary",
}: ClaimSummaryPanelProps) {
  // Normalise to groups
  const resolvedGroups: SummaryGroup[] =
    groups && groups.length > 0
      ? groups
      : fields && fields.length > 0
      ? [{ title: "", fields }]
      : [];

  return (
    <Card className="h-full" data-testid={testId}>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-5 pb-3">
        <div className="divide-y divide-border/40">
          {resolvedGroups.map((group, gi) => (
            <div key={gi} className={gi === 0 ? "pb-2.5" : "pt-2.5 pb-2.5"}>
              {group.title && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                  {group.title}
                </p>
              )}
              <div className="space-y-1">
                {group.fields.map(({ label, value, colorClass, onClick }) => (
                  <FieldValue
                    key={label}
                    label={label}
                    value={value}
                    colorClass={colorClass}
                    onClick={onClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
