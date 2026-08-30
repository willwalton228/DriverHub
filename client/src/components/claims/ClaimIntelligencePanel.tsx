import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Brain,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  AlertOctagon,
  ArrowRight,
  XCircle,
  Info,
} from "lucide-react";

export type IntelligenceLevel = "good" | "warn" | "moderate" | "critical";

// ── Explanation model ─────────────────────────────────────────────────────────
// Architecture note: this structure is designed to support future AI-generated
// explanations, predictive litigation scoring, and underwriting risk analysis.
// Replace `why` with an async AI-generated narrative when the AI layer is added.

export interface ChipThreshold {
  label: string;
  desc: string;
  active?: boolean;
}

export interface ChipExplanation {
  what: string;
  why: string[];
  thresholds: ChipThreshold[];
  action: string;
}

export interface IntelligenceChip {
  label: string;
  value: string;
  level: IntelligenceLevel;
  explanation: ChipExplanation;
}

export interface ClaimIntelligenceData {
  chips: IntelligenceChip[];
  missingItems: string[];
  recommendedAction: string | null;
}

// ── Rules engine ─────────────────────────────────────────────────────────────

interface ComputeParams {
  accident: any;
  litigationHold?: {
    litigationHoldActive?: boolean;
    triageSeverity?: string | null;
    injuryFlag?: boolean;
  };
  photoCount: number;
  docCount: number;
  claimReadiness?: {
    requiredReady: boolean;
    items: {
      field: string;
      label: string;
      required: boolean;
      ready: boolean;
      notApplicable?: boolean;
      count?: number;
      requiredCount?: number;
    }[];
  } | null;
}

function fmt(n: number) {
  return `$${n.toLocaleString()}`;
}

export function computeClaimIntelligence(p: ComputeParams): ClaimIntelligenceData {
  const { accident, litigationHold, photoCount, docCount, claimReadiness } = p;

  // ── Risk Level ─────────────────────────────────────────────────────────────
  const litigationActive = litigationHold?.litigationHoldActive;
  const attorneyLetter = accident.attorneyLetterReceived;
  const injury = litigationHold?.injuryFlag;
  const severity = litigationHold?.triageSeverity;
  const atFault = accident.dodAtFault;

  const riskReasons: string[] = [];
  if (litigationActive) riskReasons.push("Litigation hold is active on this claim");
  if (attorneyLetter) riskReasons.push("Attorney representation letter received");
  if (injury) riskReasons.push("Bodily injury reported");
  if (severity === "severe") riskReasons.push("Triage severity assessed as Severe");
  if (severity === "moderate") riskReasons.push("Triage severity assessed as Moderate");
  if (atFault === "yes") riskReasons.push("Driver determined to be at fault");
  if (atFault === "partial") riskReasons.push("Driver determined to be partially at fault");
  if (!injury && atFault !== "yes" && atFault !== "partial" && !litigationActive && !attorneyLetter && severity !== "severe" && severity !== "moderate") {
    riskReasons.push("No elevated risk indicators detected on this claim");
  }

  let riskValue: string;
  let riskLevel: IntelligenceLevel;
  if (litigationActive || attorneyLetter) {
    riskValue = "Critical"; riskLevel = "critical";
  } else if (injury || severity === "severe") {
    riskValue = "High"; riskLevel = "critical";
  } else if (severity === "moderate" || atFault === "yes" || atFault === "partial") {
    riskValue = "Medium"; riskLevel = "moderate";
  } else {
    riskValue = "Low"; riskLevel = "good";
  }

  const riskChip: IntelligenceChip = {
    label: "Risk Level",
    value: riskValue,
    level: riskLevel,
    explanation: {
      what: "Risk Level reflects the overall exposure this claim creates — considering injury, fault, legal indicators, and severity signals.",
      why: riskReasons,
      thresholds: [
        { label: "Low", desc: "No injury, not at fault, no litigation indicators", active: riskValue === "Low" },
        { label: "Medium", desc: "Moderate severity or shared / at-fault determination", active: riskValue === "Medium" },
        { label: "High", desc: "Bodily injury reported or severe triage severity", active: riskValue === "High" },
        { label: "Critical", desc: "Active litigation hold or attorney involvement", active: riskValue === "Critical" },
      ],
      action: riskValue === "Critical"
        ? "Escalate immediately — legal review and management visibility required."
        : riskValue === "High"
        ? "Expedite claim processing — injury involvement warrants close monitoring."
        : riskValue === "Medium"
        ? "Monitor closely — fault or severity signals may elevate exposure."
        : "Standard processing applies — no elevated risk indicators present.",
    },
  };

  // ── Cost Exposure ──────────────────────────────────────────────────────────
  const costCandidates = [
    accident.actualCost,
    accident.probableCost,
    accident.totalEstimate,
    accident.propertyDamage,
  ]
    .map((v: any) => (v != null ? parseFloat(v) : NaN))
    .filter((v) => !isNaN(v) && v > 0);
  const maxCost = costCandidates.length > 0 ? Math.max(...costCandidates) : null;

  const costReasons: string[] = [];
  if (maxCost === null) {
    costReasons.push("No cost estimate has been recorded on this claim yet");
  } else {
    costReasons.push(`Highest recorded cost estimate: ${fmt(maxCost)}`);
    if (accident.actualCost && parseFloat(accident.actualCost) > 0)
      costReasons.push(`Actual cost: ${fmt(parseFloat(accident.actualCost))}`);
    if (accident.probableCost && parseFloat(accident.probableCost) > 0)
      costReasons.push(`Probable cost: ${fmt(parseFloat(accident.probableCost))}`);
    if (accident.totalEstimate && parseFloat(accident.totalEstimate) > 0)
      costReasons.push(`Total estimate: ${fmt(parseFloat(accident.totalEstimate))}`);
    if (maxCost >= 10_000)
      costReasons.push("Exceeds the $10,000 threshold — insurance review recommended");
    if (maxCost >= 4_000 && maxCost < 10_000)
      costReasons.push("Supplement risk likely — repairs may exceed initial estimate");
  }

  let costValue: string;
  let costLevel: IntelligenceLevel;
  if (maxCost === null) {
    costValue = "Unknown"; costLevel = "warn";
  } else if (maxCost >= 50_000) {
    costValue = "Severe"; costLevel = "critical";
  } else if (maxCost >= 10_000) {
    costValue = "Significant"; costLevel = "moderate";
  } else if (maxCost >= 1_000) {
    costValue = "Moderate"; costLevel = "warn";
  } else {
    costValue = "Low"; costLevel = "good";
  }

  const costChip: IntelligenceChip = {
    label: "Cost Exposure",
    value: costValue,
    level: costLevel,
    explanation: {
      what: "Cost Exposure measures the financial risk of this claim based on recorded repair estimates, actual costs, and probable cost projections.",
      why: costReasons,
      thresholds: [
        { label: "Low", desc: "Under $1,000 — routine repair or minor damage", active: costValue === "Low" },
        { label: "Moderate", desc: "$1,000–$9,999 — standard repair range", active: costValue === "Moderate" },
        { label: "Significant", desc: "$10,000–$49,999 — insurance review recommended", active: costValue === "Significant" },
        { label: "Severe", desc: "$50,000+ — management visibility required", active: costValue === "Severe" },
        { label: "Unknown", desc: "No cost data recorded yet", active: costValue === "Unknown" },
      ],
      action: costValue === "Severe"
        ? "Requires management review and likely insurance coordination."
        : costValue === "Significant"
        ? "Escalate to insurance review — claim may exceed standard handling thresholds."
        : costValue === "Moderate"
        ? "Standard processing — monitor for supplement requests."
        : costValue === "Unknown"
        ? "Enter cost estimates to enable accurate exposure tracking."
        : "Routine claim — no elevated cost concerns.",
    },
  };

  // ── Evidence Completeness ──────────────────────────────────────────────────
  const evidenceItems = claimReadiness?.items.filter((item) =>
    ["photos", "accidentReport", "driverStatement", "policeReport"].includes(item.field)
  ) ?? [];
  const requiredEvidenceItems = evidenceItems.filter((item) => item.required && !item.notApplicable);
  const completeEvidenceItems = requiredEvidenceItems.filter((item) => item.ready);
  const evidenceReady = requiredEvidenceItems.length > 0 &&
    completeEvidenceItems.length === requiredEvidenceItems.length;
  const hasSomeEvidence = evidenceItems.some((item) => item.ready);
  const photoItem = evidenceItems.find((item) => item.field === "photos");
  const hasNotes = !!(
    accident.notesReceived?.trim() ||
    (Array.isArray(accident.incidentCommentsHistory) &&
      accident.incidentCommentsHistory.length > 0)
  );

  const evidenceReasons: string[] = [];
  if (photoItem) {
    evidenceReasons.push(
      `${photoItem.count ?? photoCount} of ${photoItem.requiredCount ?? 1} required qualifying photo/video item(s)`,
    );
  }
  evidenceReasons.push(`${docCount} supporting document${docCount !== 1 ? "s" : ""} on file`);
  if (hasNotes) evidenceReasons.push("Driver statement or incident notes recorded");
  requiredEvidenceItems
    .filter((item) => !item.ready)
    .forEach((item) => evidenceReasons.push(`Missing: ${item.label}`));

  let evidenceValue: string;
  let evidenceLevel: IntelligenceLevel;
  if (evidenceReady) {
    evidenceValue = "Complete"; evidenceLevel = "good";
  } else if (hasSomeEvidence) {
    evidenceValue = "Partial"; evidenceLevel = "warn";
  } else {
    evidenceValue = "Missing Critical Items"; evidenceLevel = "critical";
  }

  const evidenceChip: IntelligenceChip = {
    label: "Evidence",
    value: evidenceValue,
    level: evidenceLevel,
    explanation: {
      what: "Evidence Status tracks whether the claim has the documentation needed to support processing and carrier submission — including photos, documents, and driver statements.",
      why: evidenceReasons,
      thresholds: [
        { label: "Complete", desc: "All required evidence items are complete", active: evidenceValue === "Complete" },
        { label: "Partial", desc: "Some required evidence is present", active: evidenceValue === "Partial" },
        { label: "Missing Critical Items", desc: "Required evidence is missing", active: evidenceValue === "Missing Critical Items" },
      ],
      action: evidenceValue === "Missing Critical Items"
        ? "Upload scene and damage photos immediately — this claim cannot be submitted without them."
        : evidenceValue === "Partial"
        ? "Add a driver statement or supporting documents to complete the evidence package."
        : "Evidence package is complete — claim is eligible for submission.",
    },
  };

  // ── Insurance Readiness ────────────────────────────────────────────────────
  const reportedStatuses = ["REPORTED", "ACKNOWLEDGED", "ADJUSTER_ASSIGNED", "CLOSED"];
  const carrierStatus: string = accident.carrierSubmissionStatus ?? "DRAFT";
  const alreadyReported = reportedStatuses.includes(carrierStatus);

  const insuranceReasons: string[] = [];
  if (alreadyReported) {
    insuranceReasons.push(`Claim has been submitted — current carrier status: ${carrierStatus.replace(/_/g, " ")}`);
  } else if (claimReadiness?.requiredReady) {
    insuranceReasons.push("All required fields and documents are complete");
    insuranceReasons.push("Claim form can be generated and submitted to carrier");
  } else {
    const unready = claimReadiness?.items.filter((i) => i.required && !i.ready) ?? [];
    if (unready.length > 0) {
      unready.slice(0, 4).forEach((i) => insuranceReasons.push(`Missing: ${i.label}`));
      if (unready.length > 4) insuranceReasons.push(`…and ${unready.length - 4} more required item(s)`);
    } else {
      insuranceReasons.push("Readiness check has not been completed yet");
    }
  }

  let insuranceValue: string;
  let insuranceLevel: IntelligenceLevel;
  if (alreadyReported) {
    insuranceValue = "Already Reported"; insuranceLevel = "good";
  } else if (claimReadiness?.requiredReady) {
    insuranceValue = "Ready to Report"; insuranceLevel = "good";
  } else {
    insuranceValue = "Missing Information"; insuranceLevel = "warn";
  }

  const insuranceChip: IntelligenceChip = {
    label: "Insurance Status",
    value: insuranceValue,
    level: insuranceLevel,
    explanation: {
      what: "Insurance Status indicates whether this claim is ready for — or has already been submitted to — the carrier for processing.",
      why: insuranceReasons,
      thresholds: [
        { label: "Already Reported", desc: "Claim submitted — carrier acknowledgment received or in progress", active: insuranceValue === "Already Reported" },
        { label: "Ready to Report", desc: "All required items complete — claim can be submitted now", active: insuranceValue === "Ready to Report" },
        { label: "Missing Information", desc: "Required fields or documents are still incomplete", active: insuranceValue === "Missing Information" },
      ],
      action: alreadyReported
        ? "Monitor carrier response and adjuster assignment."
        : claimReadiness?.requiredReady
        ? "Generate the carrier claim form and submit to insurance."
        : "Complete all required fields and documentation before submission.",
    },
  };

  // ── Missing Items ──────────────────────────────────────────────────────────
  const missing = claimReadiness?.items
    .filter((item) => item.required && !item.notApplicable && !item.ready)
    .map((item) => item.label) ?? [];

  // ── Recommended Next Action ────────────────────────────────────────────────
  let recommendedAction: string | null = null;
  if (claimReadiness && !claimReadiness.requiredReady) {
    const firstMissing = claimReadiness.items.find((i) => i.required && !i.ready);
    if (firstMissing) recommendedAction = `Complete required item: ${firstMissing.label}`;
  } else if (claimReadiness?.requiredReady && !alreadyReported) {
    recommendedAction = "Generate carrier claim form and submit to insurance";
  }

  return {
    chips: [riskChip, insuranceChip, costChip, evidenceChip],
    missingItems: missing,
    recommendedAction,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelStyles(level: IntelligenceLevel) {
  // Card background is always white — color is carried only by icons and value text.
  const card = "bg-background border-border";
  switch (level) {
    case "good":
      return {
        card,
        text: "text-emerald-700 dark:text-emerald-400",
        label: "text-muted-foreground",
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />,
        infoIcon: "text-muted-foreground/40",
        activeThreshold: "text-emerald-700 dark:text-emerald-400 font-semibold",
        activeDot: "bg-emerald-500",
      };
    case "warn":
      return {
        card,
        text: "text-foreground",
        label: "text-muted-foreground",
        icon: <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
        infoIcon: "text-muted-foreground/40",
        activeThreshold: "text-foreground font-semibold",
        activeDot: "bg-muted-foreground",
      };
    case "moderate":
      return {
        card,
        text: "text-orange-700 dark:text-orange-400",
        label: "text-muted-foreground",
        icon: <AlertTriangle className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400 shrink-0" />,
        infoIcon: "text-muted-foreground/40",
        activeThreshold: "text-orange-700 dark:text-orange-400 font-semibold",
        activeDot: "bg-orange-500",
      };
    case "critical":
      return {
        card,
        text: "text-destructive",
        label: "text-muted-foreground",
        icon: <AlertOctagon className="h-3.5 w-3.5 text-destructive shrink-0" />,
        infoIcon: "text-muted-foreground/40",
        activeThreshold: "text-destructive font-semibold",
        activeDot: "bg-destructive",
      };
  }
}

// ── Explanation Tooltip Content ───────────────────────────────────────────────

function ExplanationPanel({ chip, styles }: { chip: IntelligenceChip; styles: ReturnType<typeof levelStyles> }) {
  const { explanation } = chip;
  return (
    <div className="space-y-3 text-left" style={{ maxWidth: 300 }}>
      {/* Header */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
          {chip.label}
        </p>
        <p className={`text-sm font-bold leading-tight ${styles.text}`}>{chip.value}</p>
      </div>

      {/* What it means */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          What this means
        </p>
        <p className="text-xs text-foreground leading-relaxed">{explanation.what}</p>
      </div>

      {/* Why this claim */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Why this claim
        </p>
        <ul className="space-y-0.5">
          {explanation.why.map((reason, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
              <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${styles.activeDot}`} />
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {/* Thresholds */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Assessment levels
        </p>
        <ul className="space-y-0.5">
          {explanation.thresholds.map((t) => (
            <li key={t.label} className="flex items-start gap-1.5 text-xs">
              <span
                className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${t.active ? styles.activeDot : "bg-muted-foreground/30"}`}
              />
              <span className={t.active ? `${styles.activeThreshold}` : "text-muted-foreground"}>
                <span className="font-medium">{t.label}:</span>{" "}
                <span className={t.active ? "" : "font-normal"}>{t.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Operational action */}
      <div className="border-t border-border/50 pt-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Recommended action
        </p>
        <p className="text-xs text-foreground leading-relaxed">{explanation.action}</p>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ClaimIntelligencePanelProps {
  data: ClaimIntelligenceData;
  onChipClick?: (label: string) => void;
  onMissingItemClick?: (item: string) => void;
}

export function ClaimIntelligencePanel({ data, onChipClick, onMissingItemClick }: ClaimIntelligencePanelProps) {
  const { chips, missingItems, recommendedAction } = data;
  const hasMissing = missingItems.length > 0;

  return (
    <Card className="h-full" data-testid="card-claim-intelligence">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
          <Brain className="h-4 w-4 text-primary" />
          Claim Intelligence
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 px-5 pb-4 space-y-2">
        {/* Primary chips — Risk Level + Insurance Status (increased emphasis) */}
        <div className="grid grid-cols-2 gap-2">
          {chips.slice(0, 2).map((chip) => {
            const s = levelStyles(chip.level);
            const clickable = !!onChipClick;
            return (
              <Tooltip key={chip.label} delayDuration={300}>
                <TooltipTrigger asChild>
                  <div
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? () => onChipClick(chip.label) : undefined}
                    onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && onChipClick(chip.label) : undefined}
                    data-testid={`intel-chip-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
                    className={`relative rounded-md border px-3 py-3 ${s.card} ${clickable ? "cursor-pointer hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" : ""}`}
                  >
                    <div className="flex items-center gap-1 mb-1.5">
                      {s.icon}
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${s.label}`}>
                        {chip.label}
                      </span>
                      <Info className={`h-2.5 w-2.5 ml-auto shrink-0 ${s.infoIcon}`} />
                    </div>
                    <p className={`text-lg font-bold leading-tight ${s.text}`}>
                      {chip.value}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="left"
                  align="start"
                  sideOffset={8}
                  className="p-3 shadow-lg bg-popover border border-border"
                  data-testid={`intel-explanation-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <ExplanationPanel chip={chip} styles={s} />
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {/* Secondary chips — Cost Exposure + Evidence (reduced emphasis) */}
        <div className="grid grid-cols-2 gap-2">
          {chips.slice(2).map((chip) => {
            const s = levelStyles(chip.level);
            const clickable = !!onChipClick;
            return (
              <Tooltip key={chip.label} delayDuration={300}>
                <TooltipTrigger asChild>
                  <div
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? () => onChipClick(chip.label) : undefined}
                    onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && onChipClick(chip.label) : undefined}
                    data-testid={`intel-chip-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
                    className={`relative rounded-md border px-2.5 py-2 ${s.card} ${clickable ? "cursor-pointer hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" : ""}`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      {s.icon}
                      <span className={`text-[10px] font-medium uppercase tracking-wide ${s.label}`}>
                        {chip.label}
                      </span>
                      <Info className={`h-2.5 w-2.5 ml-auto shrink-0 ${s.infoIcon}`} />
                    </div>
                    <p className={`text-xs font-semibold leading-tight ${s.text}`}>
                      {chip.value}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="left"
                  align="start"
                  sideOffset={8}
                  className="p-3 shadow-lg bg-popover border border-border"
                  data-testid={`intel-explanation-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <ExplanationPanel chip={chip} styles={s} />
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Missing items */}
        {hasMissing && (
          <>
            <Separator />
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Missing Items
              </p>
              <ul className="space-y-0.5">
                {missingItems.map((item) => {
                  const clickable = !!onMissingItemClick;
                  return (
                    <li
                      key={item}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => onMissingItemClick(item) : undefined}
                      onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && onMissingItemClick(item) : undefined}
                      data-testid={`intel-missing-${item.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`}
                      className={`flex items-start gap-1.5 text-xs text-muted-foreground rounded ${clickable ? "cursor-pointer hover:text-foreground hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 -mx-1 px-1 py-0.5" : ""}`}
                    >
                      <XCircle className="h-3 w-3 text-destructive/70 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        {/* Recommended next action */}
        {recommendedAction && (
          <>
            {!hasMissing && <Separator />}
            <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 px-2.5 py-2">
              <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-medium text-primary uppercase tracking-wide">
                  Recommended Next Step
                </span>
                <p className="text-xs text-foreground mt-0.5">{recommendedAction}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
