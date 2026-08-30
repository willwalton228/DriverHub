import { DRIVER_RISK_SCORE_CONFIG } from "@/lib/driverRiskScoreConfig";

/**
 * Shared popover body for the Driver Risk Score info button.
 * Used in the Claims tab Risk Summary hero and any future location.
 *
 * Wrap this in <PopoverContent> — it renders its own header and body.
 * Width / max-height should be controlled by the wrapping PopoverContent.
 */
export function DriverRiskScorePopoverContent() {
  const cfg = DRIVER_RISK_SCORE_CONFIG;

  return (
    <div className="overflow-y-auto max-h-[70vh]">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/40">
        <p className="font-semibold text-sm leading-tight">{cfg.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{cfg.subtitle}</p>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Definition */}
        <div>
          <p className="text-xs text-foreground leading-relaxed">{cfg.definition}</p>
        </div>

        {/* Formula summary */}
        <div>
          <p className="text-xs font-semibold text-foreground mb-1.5">Weighted Formula (0–100, higher = safer)</p>
          <div className="rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] text-foreground leading-relaxed space-y-0.5">
            {cfg.components.map((c, i) => (
              <div key={c.name}>
                {i === 0 ? "" : "+ "}({c.name} × {c.weight}%)
              </div>
            ))}
            <div className="pt-1 border-t border-border/50 mt-1 not-italic font-sans text-[10px] text-muted-foreground">
              Weighted risk converted: Score = 100 − weighted risk
            </div>
          </div>
        </div>

        {/* Components */}
        <div>
          <p className="text-xs font-semibold text-foreground mb-2">Components</p>
          <div className="space-y-3">
            {cfg.components.map((c) => (
              <div key={c.name}>
                <p className="text-xs font-medium text-foreground">
                  {c.name} ({c.weight}%)
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{c.description}</p>
                <div className="rounded bg-muted/60 px-2 py-1 font-mono text-[11px] text-foreground mt-1">
                  {c.formula}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tiers */}
        <div>
          <p className="text-xs font-semibold text-foreground mb-1.5">Tiers</p>
          <div className="rounded-md border overflow-hidden text-[11px]">
            {cfg.tiers.map((t, i) => (
              <div
                key={t.label}
                className={`flex items-center justify-between px-3 py-1.5 ${i % 2 === 0 ? "bg-muted/30" : ""}`}
              >
                <span className="font-mono text-muted-foreground">
                  {t.min}–{t.max}
                </span>
                <span className={t.colorClass}>{t.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">{cfg.tierLegendNote}</p>
        </div>

        {/* Immediate Review */}
        <div>
          <p className="text-xs font-semibold text-foreground mb-1">Immediate Review Flag</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {cfg.immediateReviewTriggers}
          </p>
        </div>

        {/* How to use */}
        <div>
          <p className="text-xs font-semibold text-foreground mb-1">How to Use</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{cfg.howToUse}</p>
        </div>

        {/* Data note */}
        <div className="border-t pt-3">
          <p className="text-[10px] text-muted-foreground leading-relaxed">{cfg.dataNote}</p>
        </div>
      </div>
    </div>
  );
}
