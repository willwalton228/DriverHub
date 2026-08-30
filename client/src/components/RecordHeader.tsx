import { useState } from "react";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface RecordHeaderProps {
  backLabel?: string;
  onBack?: () => void;
  recordId: string;
  /** Raw identifier copied by the header control. Defaults to the displayed record ID. */
  copyValue?: string;
  accountLine?: React.ReactNode;
  subtitle?: React.ReactNode;
  statusPills?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** When false the component does not apply its own sticky/z-index — use when
   *  a parent element handles sticky positioning for the whole header zone.
   *  Default: true */
  asSticky?: boolean;
  /** When true, removes the -mx-6 px-6 full-width bleed — use when a parent
   *  wrapper already handles the edge-to-edge bleed. Default: false */
  noBleed?: boolean;
}

export function RecordHeader({
  backLabel = "Back",
  onBack,
  recordId,
  copyValue,
  accountLine,
  subtitle,
  statusPills,
  actions,
  className,
  asSticky = true,
  noBleed = false,
}: RecordHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(String(copyValue ?? recordId)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleScrollToTop = () => {
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div
      className={cn(
        "bg-background py-3 space-y-1.5 transition-shadow duration-150 border-b",
        !noBleed && "-mx-6 px-6",
        noBleed && "px-6",
        asSticky && "sticky top-0 z-50",
        className
      )}
    >
      {/* Row 1: Back navigation + Claim ID + Copy */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-muted-foreground -ml-2 shrink-0"
          data-testid="record-header-back"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Button>
        <div className="h-5 w-px bg-border shrink-0" />

        {/* Claim ID — large, prominent, clickable back-to-top */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleScrollToTop}
              className="text-4xl font-bold tracking-tight shrink-0 cursor-pointer hover:text-primary hover:underline underline-offset-4 decoration-primary/40 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded leading-none"
              data-testid="record-header-id"
              aria-label={`Back to top — ${recordId}`}
            >
              {recordId}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Back to top
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopyId}
              className="shrink-0 text-muted-foreground self-center"
              data-testid="button-copy-record-id"
              aria-label="Copy claim ID"
            >
              {copied
                ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                : <Copy className="h-3.5 w-3.5" />
              }
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {copied ? "Copied!" : "Copy claim ID"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Row 2: Account name (clickable, opens account detail in new tab) */}
      {accountLine && (
        <div data-testid="record-header-account">
          {accountLine}
        </div>
      )}

      {/* Row 3: Context subtitle (Driver • Date • Type) */}
      {subtitle && (
        <p className="text-sm text-muted-foreground" data-testid="record-header-subtitle">
          {subtitle}
        </p>
      )}

      {/* Row 4: Status pills (left) + Actions (right) */}
      {(statusPills || actions) && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap" data-testid="record-header-pills">
            {statusPills}
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-wrap" data-testid="record-header-actions">
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
