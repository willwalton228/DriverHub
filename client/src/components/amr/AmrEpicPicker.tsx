import { useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type AmrEpicOption = {
  id: string;
  name: string;
};

interface AmrEpicPickerProps {
  epics: AmrEpicOption[];
  value: string | null | undefined;
  onValueChange: (value: string | null) => void;
  includeUnassigned?: boolean;
  unassignedLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

/**
 * Shared AMR Epic picker. The complete eligible Epic list is passed in by the
 * caller; filtering happens locally so the entire dataset remains searchable.
 */
export function AmrEpicPicker({
  epics,
  value,
  onValueChange,
  includeUnassigned = false,
  unassignedLabel = "Not assigned — assign later",
  placeholder = "Select an Epic...",
  searchPlaceholder = "Search Epics...",
  disabled = false,
  className,
  testId = "amr-epic-picker",
}: AmrEpicPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedEpic = epics.find((epic) => epic.id === value);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredEpics = [...epics]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((epic) => epic.name.toLocaleLowerCase().includes(normalizedSearch));

  const closeWithValue = (nextValue: string | null) => {
    onValueChange(nextValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Epic"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
          data-testid={`${testId}-trigger`}
        >
          <span className={cn("truncate", !selectedEpic && "text-muted-foreground")}>
            {selectedEpic?.name || (includeUnassigned ? unassignedLabel : placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
        align="start"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            ref={searchInputRef}
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
            autoFocus
            data-testid={`${testId}-search`}
          />
          <CommandList>
            {filteredEpics.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
                {normalizedSearch
                  ? `No Epics found matching "${search}".`
                  : "No Epics found."}
              </div>
            )}
            {filteredEpics.length > 0 && (
              <CommandGroup>
                {filteredEpics.map((epic) => (
                  <CommandItem
                    key={epic.id}
                    value={epic.id}
                    onSelect={() => closeWithValue(epic.id)}
                    data-testid={`${testId}-option-${epic.id}`}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === epic.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{epic.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {includeUnassigned && (
              <CommandGroup>
                <CommandItem
                  value="__unassigned__"
                  onSelect={() => closeWithValue(null)}
                  className="border-t text-muted-foreground"
                  data-testid={`${testId}-option-unassigned`}
                >
                  <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                  {unassignedLabel}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}