import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PermissionDescription } from "@/lib/permissionDescriptions";

interface Props {
  description: PermissionDescription;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * Renders a small ⓘ icon that shows a structured tooltip describing a role
 * or permission when hovered (desktop) or tapped (mobile).
 *
 * Wrap a <TooltipProvider> at the page/app level if you find multiple
 * instances causing nesting warnings; each instance is self-contained by
 * default so it works without any parent provider.
 */
export function PermissionInfo({ description, side = "right", className }: Props) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center text-muted-foreground hover:text-foreground transition-colors align-middle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm ${className ?? ""}`}
            onClick={(e) => {
              // Prevent click from bubbling into parent interactive elements
              // (e.g. DropdownMenuItem, form submit) when tapping on mobile.
              e.stopPropagation();
              e.preventDefault();
            }}
            aria-label={`More information about ${description.title}`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-72 p-3 text-left space-y-2 z-[9999]"
          // Keep tooltip open when the user moves the mouse from trigger to content
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <p className="font-semibold text-sm leading-snug">{description.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{description.summary}</p>
          <ul className="space-y-1">
            {description.allows.map((bullet, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed">
                <span className="mt-px shrink-0 text-muted-foreground">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          {description.note && (
            <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-1 italic leading-relaxed">
              {description.note}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
