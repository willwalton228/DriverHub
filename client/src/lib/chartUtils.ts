/**
 * Shared Recharts tooltip style helpers.
 *
 * Recharts does NOT inherit text color from `contentStyle.color` for its
 * internal label row or item rows — those require explicit `labelStyle` and
 * `itemStyle` props. Without them, Recharts defaults to hard-coded dark colors
 * (#333 / #666) that become invisible on dark backgrounds.
 *
 * Usage:
 *   import { rechartsTooltipStyle } from "@/lib/chartUtils";
 *
 *   <Tooltip {...rechartsTooltipStyle} formatter={...} />
 *   <Tooltip {...rechartsTooltipStyle} labelStyle={{ ...rechartsTooltipStyle.labelStyle, fontWeight: 700 }} />
 */

export const rechartsTooltipStyle = {
  contentStyle: {
    background:   "hsl(var(--popover))",
    border:       "1px solid hsl(var(--border))",
    borderRadius: "6px",
    fontSize:     12,
    color:        "hsl(var(--popover-foreground))",
  },
  /** Muted label (the x-axis key shown above the data rows, e.g. "Mon, Mar 24") */
  labelStyle: {
    color:        "hsl(var(--muted-foreground))",
    fontWeight:   600,
    marginBottom: 2,
  },
  /** Each data row — name and value both inherit this */
  itemStyle: {
    color: "hsl(var(--popover-foreground))",
  },
  /** Subtle cursor highlight that works in both themes */
  cursor: { fill: "hsl(var(--muted))", opacity: 0.35 },
} as const;
