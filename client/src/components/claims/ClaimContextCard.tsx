import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Building2, Calendar, Tag, DollarSign, ShieldAlert, Clock } from "lucide-react";

// ─── Risk Engine ─────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "moderate" | "high";

export interface ClaimRisk {
  level: RiskLevel;
  score: number;
  factors: string[];
}

const RISK_THRESHOLDS = { moderate: 3, high: 6 };

export function computeClaimRisk(accident: Record<string, any>): ClaimRisk {
  const factors: string[] = [];
  let score = 0;

  const add = (pts: number, label: string) => {
    score += pts;
    factors.push(label);
  };

  // ── HIGH-impact triggers ──────────────────────────────────────────────────
  if (accident.injuryFlag || accident.medicalTreatmentSought || accident.injuryDescription)
    add(3, "Bodily injury present");

  if (accident.incidentType === "hit_and_run")
    add(3, "Hit-and-run incident");

  if (accident.lawsuitFiled)
    add(3, "Lawsuit filed");

  if (accident.catastrophicLoss)
    add(3, "Catastrophic loss flagged");

  if (accident.litigationHoldActive)
    add(2, "Litigation hold active");

  // ── Severity estimate ─────────────────────────────────────────────────────
  if (accident.severityEstimate === "catastrophic")
    add(3, "Catastrophic severity estimate");
  else if (accident.severityEstimate === "major")
    add(2, "Major severity estimate");
  else if (accident.severityEstimate === "moderate")
    add(1, "Moderate severity estimate");

  // ── Financial exposure ────────────────────────────────────────────────────
  const dmg = parseFloat(accident.estimatedDamageAmount ?? "0") || 0;
  if (dmg >= 10_000)
    add(2, `High estimated damage ($${dmg.toLocaleString()})`);
  else if (dmg >= 2_500)
    add(1, `Significant estimated damage ($${dmg.toLocaleString()})`);

  // ── Additional risk signals ───────────────────────────────────────────────
  if (accident.policeReportFiled || accident.policeReportObtained)
    add(1, "Police report filed");

  if (accident.claimantName)
    add(2, "Third party / other vehicle involved");

  if (accident.liabilityFault === "at_fault")
    add(1, "At-fault determination");

  const level: RiskLevel =
    score >= RISK_THRESHOLDS.high
      ? "high"
      : score >= RISK_THRESHOLDS.moderate
      ? "moderate"
      : "low";

  return { level, score, factors };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="mt-0.5 h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-1">
          {label}
        </p>
        <div className="text-sm font-semibold leading-tight">{children}</div>
      </div>
    </div>
  );
}

function SeverityBadge({ value, label }: { value: string; label: string }) {
  const colorMap: Record<string, string> = {
    minor:        "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-300/50",
    moderate:     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300/50",
    major:        "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300/50",
    catastrophic: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <Badge variant="outline" className={`text-xs font-semibold ${colorMap[value] ?? "bg-muted/60 text-muted-foreground"}`}>
      {label}
    </Badge>
  );
}

function ClaimTypeBadge({ label }: { label: string }) {
  const isInsurance = label.toLowerCase().includes("insurance");
  return (
    <Badge
      variant="outline"
      className={
        isInsurance
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300/50 text-xs font-semibold"
          : "bg-muted/60 text-muted-foreground text-xs font-semibold"
      }
    >
      {label}
    </Badge>
  );
}

function formatLastUpdated(ts: string | Date | null | undefined): { date: string; time: string } | null {
  if (!ts) return null;
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { date, time };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface ClaimContextCardProps {
  driverName: string;
  customerName: string;
  incidentDate: string;
  claimType: string;
  estimatedDamage: string | null;
  severity: {
    value: string;
    label: string;
  };
  lastUpdatedAt?: string | Date | null;
  lastUpdatedByName?: string | null;
}

export function ClaimContextCard({
  driverName,
  customerName,
  incidentDate,
  claimType,
  estimatedDamage,
  severity,
  lastUpdatedAt,
  lastUpdatedByName,
}: ClaimContextCardProps) {
  const lastUpdated = formatLastUpdated(lastUpdatedAt);

  return (
    <Card className="border-border/60 bg-card" data-testid="card-claim-context">
      {/* ── Card header ─────────────────────────────────────────────── */}
      <CardHeader className="pb-2 pt-4 px-5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Claim Summary
        </span>
      </CardHeader>

      <CardContent className="pt-0 pb-4 px-5">
        {/* ── Six context fields ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
          <Field icon={User} label="Driver">
            <span className="text-foreground">{driverName || "—"}</span>
          </Field>

          <Field icon={Building2} label="Account">
            <span className="text-foreground">{customerName || "—"}</span>
          </Field>

          <Field icon={Calendar} label="Incident Date">
            <span className="text-foreground">{incidentDate || "—"}</span>
          </Field>

          <Field icon={Tag} label="Claim Type">
            <ClaimTypeBadge label={claimType} />
          </Field>

          <Field icon={DollarSign} label="Est. Damage">
            <span className={estimatedDamage ? "text-foreground" : "text-muted-foreground"}>
              {estimatedDamage ?? "—"}
            </span>
          </Field>

          <Field icon={ShieldAlert} label="Severity">
            <SeverityBadge value={severity.value} label={severity.label} />
          </Field>
        </div>

        {/* ── Last Updated footer ────────────────────────────────────────── */}
        {lastUpdated && (
          <div
            className="mt-4 pt-3 border-t border-border/50 flex items-center gap-1.5"
            data-testid="claim-last-updated"
          >
            <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">
              Last updated{" "}
              <span className="font-medium text-foreground">{lastUpdated.date}</span>
              {" at "}
              <span className="font-medium text-foreground">{lastUpdated.time}</span>
              {lastUpdatedByName && (
                <>
                  {" by "}
                  <span className="font-medium text-foreground">{lastUpdatedByName}</span>
                </>
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
