import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cleanPhone, formatPhone } from "@/lib/phone";

interface PhoneDisplayProps {
  phone: string | null | undefined;
  className?: string;
  "data-testid"?: string;
}

/**
 * Renders a phone number as a click-to-call link with a copy-to-clipboard button.
 *
 *   (XXX) XXX-XXXX  [copy icon]
 *
 * - The formatted text is a `tel:` link for click-to-call.
 * - The copy button writes the raw 10-digit value to the clipboard and shows
 *   a green check-mark for 1.8 s.
 * - Renders nothing (null) for empty / null / undefined values.
 */
export function PhoneDisplay({ phone, className, "data-testid": testId }: PhoneDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (!phone) return null;

  const digits = cleanPhone(phone);
  if (digits.length !== 10) return null;
  const formatted = formatPhone(phone);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(digits).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      try {
        const el = document.createElement("textarea");
        el.value = digits;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        // silent fail — clipboard unavailable
      }
    });
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className || ""}`}
      data-testid={testId}
    >
      <a
        href={`tel:${digits}`}
        onClick={(e) => e.stopPropagation()}
        className="tabular-nums hover:text-primary hover:underline underline-offset-2 transition-colors"
        data-testid={testId ? `${testId}-link` : "phone-link"}
        title={`Call ${formatted}`}
      >
        {formatted}
      </a>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center rounded p-0.5 opacity-40 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid={testId ? `${testId}-copy` : "phone-copy"}
            aria-label="Copy phone number"
          >
            {copied
              ? <Check className="h-3 w-3 text-green-500" />
              : <Copy className="h-3 w-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {copied ? "Copied!" : "Copy number"}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
