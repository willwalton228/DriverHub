import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
  align?: "start" | "center" | "end";
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  placeholder,
  className,
  "data-testid": testId,
  align = "start",
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);

  useEffect(() => {
    if (open) {
      setDraft(selected);
    }
  }, [open, selected]);

  function toggleOption(value: string) {
    setDraft((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function handleApply() {
    onChange(draft);
    setOpen(false);
  }

  function handleClearAll() {
    setDraft([]);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setDraft(selected);
    }
    setOpen(next);
  }

  const triggerLabel =
    selected.length === 0
      ? placeholder ?? "All"
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("flex items-center gap-1.5 pr-2", className)}
          data-testid={testId}
          aria-expanded={open}
        >
          <span className="truncate max-w-[140px]">{triggerLabel}</span>
          {selected.length > 0 ? (
            <span
              role="button"
              tabIndex={0}
              className="ml-0.5 rounded-sm opacity-60 hover:opacity-100 focus:outline-none"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange([]);
                }
              }}
              data-testid={testId ? `${testId}-clear` : undefined}
            >
              <X className="h-3 w-3" />
            </span>
          ) : (
            <ChevronDown className="h-3 w-3 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-52 p-0"
      >
        <div className="px-3 py-2 border-b">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
        </div>

        <div className="max-h-60 overflow-y-auto py-1">
          {options.map((option) => {
            const checked = draft.includes(option.value);
            return (
              <div
                key={option.value}
                className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover-elevate rounded-sm mx-1"
                onClick={() => toggleOption(option.value)}
                data-testid={testId ? `${testId}-option-${option.value}` : undefined}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleOption(option.value)}
                  id={`msf-${option.value}`}
                  className="pointer-events-none"
                  data-testid={testId ? `${testId}-checkbox-${option.value}` : undefined}
                />
                <label
                  htmlFor={`msf-${option.value}`}
                  className="text-sm cursor-pointer select-none flex-1"
                >
                  {option.label}
                </label>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2 text-muted-foreground"
            onClick={handleClearAll}
            disabled={draft.length === 0}
            data-testid={testId ? `${testId}-clear-all` : undefined}
          >
            Clear all
          </Button>
          <Button
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={handleApply}
            data-testid={testId ? `${testId}-apply` : undefined}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
