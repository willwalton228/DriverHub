import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, FileBarChart, Save, Star, Download, Calendar, Copy, ChevronRight, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, GripVertical, X, Plus, Minus, Info, AlertTriangle,
  ArrowUp, ArrowDown, ArrowUpDown, Search, Check, ChevronsUpDown,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { frontendRegistry } from "@/lib/reporting";
import { cn } from "@/lib/utils";


// ── Preview types ─────────────────────────────────────────────────────────────

interface RowResult {
  mode: "rows";
  columns: string[];
  rows: Record<string, unknown>[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

interface GroupedResult {
  mode: "grouped";
  groupByFields: string[];
  /** Financial/currency/percent field keys that were aggregated server-side. */
  aggregateFields?: string[];
  rows: Record<string, unknown>[];
}

type PreviewResult = RowResult | GroupedResult;

// ── Drill-down filter ─────────────────────────────────────────────────────────

interface DrillFilter {
  field: string;
  value: string | null; // null = IS NULL / blank
}

// ── Sort ──────────────────────────────────────────────────────────────────────

interface SortLevel {
  field: string;
  dir: "asc" | "desc";
}

/** Controls how a related module is joined to the primary subject. */
type RelationshipMode = "primary_only" | "all_records" | "summary";

/** Comparison operators for report filters. */
type FilterOp = "eq" | "neq" | "blank" | "notblank" | "contains" | "gt" | "lt";

/** A single user-defined filter row. */
interface FilterRow {
  id:    string;
  field: string;
  op:    FilterOp;
  value: string;
}

const FILTER_OPS: { value: FilterOp; label: string; hasValue: boolean }[] = [
  { value: "eq",       label: "Equals",        hasValue: true  },
  { value: "neq",      label: "Does Not Equal", hasValue: true  },
  { value: "contains", label: "Contains",       hasValue: true  },
  { value: "gt",       label: "Greater Than",   hasValue: true  },
  { value: "lt",       label: "Less Than",      hasValue: true  },
  { value: "blank",    label: "Is Blank",       hasValue: false },
  { value: "notblank", label: "Is Not Blank",   hasValue: false },
];

// ── Config type for debounce ──────────────────────────────────────────────────

interface QueryConfig {
  fields: string[];
  filters: FilterRow[];
  groupBy1: string;
  groupBy2: string;
  offset: number;
  drillFilters: DrillFilter[];
  sortLevels: SortLevel[];
  includedModules: string[];
  moduleGrainModes: Record<string, RelationshipMode>;
  includeRideshare: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Date(value + "T00:00:00").toLocaleDateString();
  return String(value);
}

function formatCurrency(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(n)) return String(value);
  return new Intl.NumberFormat("en-US", {
    style:                 "currency",
    currency:              "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPercent(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(n)) return String(value);
  return `${n.toFixed(1)}%`;
}

function toTitleCase(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  return String(value).replace(/\b\w/g, c => c.toUpperCase());
}

function buildPreviewUrl(cfg: QueryConfig): string {
  const p = new URLSearchParams();
  p.set("fields", cfg.fields.join(","));
  const activeFilters = cfg.filters.filter(f => f.field && f.op);
  if (activeFilters.length > 0) p.set("filters", JSON.stringify(activeFilters));
  const gb = [cfg.groupBy1, cfg.groupBy2].filter(Boolean).join(",");
  if (gb) p.set("groupBy", gb);
  if (cfg.offset > 0) p.set("offset", String(cfg.offset));
  if (cfg.drillFilters.length > 0)
    p.set("drillFilters", JSON.stringify(cfg.drillFilters));
  const activeSorts = cfg.sortLevels.filter(sl => sl.field);
  if (activeSorts.length > 0) p.set("sort", JSON.stringify(activeSorts));
  if (cfg.includedModules.length > 0)
    p.set("includedModules", cfg.includedModules.join(","));
  if (Object.keys(cfg.moduleGrainModes).length > 0)
    p.set("grainModes", JSON.stringify(cfg.moduleGrainModes));
  if (!cfg.includeRideshare)
    p.set("includeRideshare", "false");
  return `/api/reports/custom/drivers/preview?${p.toString()}`;
}

// ── Shared field search helpers ────────────────────────────────────────────────

/** Highlight the first occurrence of `query` inside `text`. */
function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-600/40 text-inherit not-italic rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

interface FieldComboboxGroup { label: string; options: { key: string; label: string }[] }

/**
 * Searchable drop-down field selector.
 * Replaces <Select> for Filter, Group By, and Sort pickers.
 * Uses Popover + Command (cmdk) — keyboard: arrows, Enter, Esc.
 */
function FieldSearchCombobox({
  value,
  onChange,
  placeholder = "Select field…",
  groups,
  disabled,
  testId,
}: {
  value:       string;
  onChange:    (key: string) => void;
  placeholder?: string;
  groups:      FieldComboboxGroup[];
  disabled?:   boolean;
  testId?:     string;
}) {
  const [open, setOpen] = useState(false);
  const allOptions = groups.flatMap(g => g.options);
  const selected   = allOptions.find(o => o.key === value);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          data-testid={testId}
          className={cn(
            "flex h-7 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-2 text-xs ring-offset-background",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="truncate flex-1 text-left">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[180px]"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <Command>
          <CommandInput
            placeholder="Search fields…"
            className="h-8 text-xs py-0"
          />
          <CommandList className="max-h-[220px]">
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              No fields found.
            </CommandEmpty>
            {groups.map(group => (
              <CommandGroup
                key={group.label}
                heading={group.label}
                className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground/60 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
              >
                {group.options.map(opt => (
                  <CommandItem
                    key={opt.key}
                    value={opt.label}
                    keywords={[group.label]}
                    onSelect={() => { onChange(opt.key); setOpen(false); }}
                    className="text-xs py-1 gap-1.5"
                    data-testid={testId ? `${testId}-opt-${opt.key}` : undefined}
                  >
                    <Check className={cn("h-3 w-3 shrink-0", opt.key === value ? "opacity-100" : "opacity-0")} />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Left panel ────────────────────────────────────────────────────────────────

function LeftPanel({
  subject,
  selectedFields, setSelectedFields,
  filters,        setFilters,
  groupLevels,    setGroupLevels,
  sortLevels,     setSortLevels,
  includedModules, setIncludedModules,
  moduleGrainModes, setModuleGrainMode,
  userRole,
  includeRideshare, setIncludeRideshare,
}: {
  subject: string;
  selectedFields: string[];   setSelectedFields: (v: string[]) => void;
  filters: FilterRow[];       setFilters: (v: FilterRow[]) => void;
  groupLevels: string[];      setGroupLevels: (v: string[]) => void;
  sortLevels: SortLevel[];    setSortLevels: (v: SortLevel[]) => void;
  includedModules: string[];  setIncludedModules: (v: string[]) => void;
  moduleGrainModes: Record<string, RelationshipMode>;
  setModuleGrainMode: (moduleId: string, mode: RelationshipMode) => void;
  userRole: string | null;
  includeRideshare: boolean;  setIncludeRideshare: (v: boolean) => void;
}) {
  const subjectKey      = subject.toLowerCase();
  const subjectDef      = frontendRegistry.getSubject(subjectKey);
  const relatedSubjects = frontendRegistry.getRelatedSubjects(subjectKey);

  // Field is accessible if it has no role restriction, or the user's role matches.
  const canAccess = (f: { requiresRole?: readonly string[] }) =>
    !f.requiresRole?.length || (!!userRole && f.requiresRole.includes(userRole));

  // Merge fields from primary subject + currently included related subjects,
  // then filter out fields the current user isn't permitted to see.
  const includedRelated = relatedSubjects.filter(rs => includedModules.includes(rs.id));
  const allFields = [
    ...(subjectDef?.fieldGroups.flatMap(g => g.fields) ?? []),
    ...includedRelated.flatMap(rs => rs.fieldGroups.flatMap(g => g.fields)),
  ].filter(canAccess);
  const filterFields    = allFields.filter(f => f.filterable);
  const groupFields     = allFields.filter(f => f.groupable);
  const groupOptions    = [{ key: "", label: "— None —" }, ...groupFields];
  const sortableFields  = allFields;

  // Only show the primary subject + enabled related modules in the field picker
  const visibleModules = [
    ...(subjectDef ? [subjectDef] : []),
    ...includedRelated,
  ];

  // Calculated field groups live in a separate section — not inside the module picker.
  // We collect them from the primary subject's fieldGroups where isCalculated === true,
  // then role-filter their fields before rendering.
  const calculatedGroups = (subjectDef?.fieldGroups ?? []).filter(g => g.isCalculated);

  // ── Module-grouped options for searchable comboboxes ─────────────────────
  // Each picker (Filter, Group By, Sort) gets a grouped option list so the
  // search combobox can show module headings and support searching by module name.
  const filterComboGroups: FieldComboboxGroup[] = [
    ...(subjectDef ? [{
      label: subjectDef.label,
      options: subjectDef.fieldGroups.filter(g => !g.isCalculated)
        .flatMap(g => g.fields).filter(f => f.filterable && canAccess(f))
        .map(f => ({ key: f.key, label: f.label })),
    }] : []),
    ...includedRelated.map(rs => ({
      label: rs.label,
      options: rs.fieldGroups.flatMap(g => g.fields)
        .filter(f => f.filterable && canAccess(f))
        .map(f => ({ key: f.key, label: f.label })),
    })),
  ].filter(g => g.options.length > 0);

  const groupComboGroups: FieldComboboxGroup[] = [
    ...(subjectDef ? [{
      label: subjectDef.label,
      options: subjectDef.fieldGroups.filter(g => !g.isCalculated)
        .flatMap(g => g.fields).filter(f => f.groupable && canAccess(f))
        .map(f => ({ key: f.key, label: f.label })),
    }] : []),
    ...includedRelated.map(rs => ({
      label: rs.label,
      options: rs.fieldGroups.flatMap(g => g.fields)
        .filter(f => f.groupable && canAccess(f))
        .map(f => ({ key: f.key, label: f.label })),
    })),
  ].filter(g => g.options.length > 0);

  const sortComboGroups: FieldComboboxGroup[] = [
    ...(subjectDef ? [{
      label: subjectDef.label,
      options: subjectDef.fieldGroups.filter(g => !g.isCalculated)
        .flatMap(g => g.fields).filter(canAccess)
        .map(f => ({ key: f.key, label: f.label })),
    }] : []),
    ...includedRelated.map(rs => ({
      label: rs.label,
      options: rs.fieldGroups.flatMap(g => g.fields).filter(canAccess)
        .map(f => ({ key: f.key, label: f.label })),
    })),
    ...calculatedGroups.map(g => ({
      label: g.label,
      options: g.fields.filter(canAccess).map(f => ({ key: f.key, label: f.label })),
    })),
  ].filter(g => g.options.length > 0);

  // Primary subject expanded by default; related subjects auto-expand when enabled
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set([subjectKey]));

  // Drag-to-reorder state for selected columns
  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Subject not yet implemented in the registry → show "coming soon"
  if (!subjectDef || subjectDef.fieldGroups.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Configuration for <strong>{subject}</strong> coming soon.
      </div>
    );
  }

  const addField = (key: string) => {
    if (!selectedFields.includes(key)) setSelectedFields([...selectedFields, key]);
  };

  const removeField = (key: string) => {
    setSelectedFields(selectedFields.filter(f => f !== key));
  };

  const moveField = (from: number, to: number) => {
    if (from === to) return;
    const next = [...selectedFields];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setSelectedFields(next);
  };

  const toggleModule = (id: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Expanded grain-mode panels (for related data sources) — declared before toggleIncludedModule
  const [grainExpanded, setGrainExpanded] = useState<Set<string>>(() => new Set());
  // Module pending removal confirmation (id or null)
  const [confirmRemoveModule, setConfirmRemoveModule] = useState<string | null>(null);
  // Field picker panel open/close
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  // Search query inside the field picker panel
  const [fieldPickerSearch, setFieldPickerSearch] = useState("");

  const toggleIncludedModule = (modId: string, checked: boolean) => {
    if (checked) {
      setIncludedModules([...includedModules, modId]);
      // Set the default grain mode for this relationship
      const relDef = frontendRegistry.getRelationship(subjectKey, modId);
      const defaultMode: RelationshipMode = relDef?.supportsPrimaryOnly ? "primary_only" : "all_records";
      setModuleGrainMode(modId, defaultMode);
      // Auto-expand: grain panel (for configurable relationships), module in field picker, open picker
      if (relDef?.supportsPrimaryOnly) {
        setGrainExpanded(prev => { const n = new Set(prev); n.add(modId); return n; });
      }
      setExpandedModules(prev => { const n = new Set(prev); n.add(modId); return n; });
      setShowFieldPicker(true);
    } else {
      setIncludedModules(includedModules.filter(m => m !== modId));
      const modSubject = frontendRegistry.getSubject(modId);
      if (modSubject) {
        const modFieldKeys = new Set(modSubject.fieldGroups.flatMap(g => g.fields.map(f => f.key)));
        setSelectedFields(selectedFields.filter(f => !modFieldKeys.has(f)));
        setFilters(filters.filter(fr => !modFieldKeys.has(fr.field)));
      }
    }
  };

  // Helper: detect if removing a module would break existing config
  const getModuleImpact = (modId: string) => {
    const modSubject = frontendRegistry.getSubject(modId);
    if (!modSubject) return { fields: 0, filter: false, groups: 0, sorts: 0 };
    const modKeys    = new Set(modSubject.fieldGroups.flatMap(g => g.fields.map(f => f.key)));
    const fields     = selectedFields.filter(f => modKeys.has(f)).length;
    const filter     = filters.some(fr => modKeys.has(fr.field));
    const groups     = groupLevels.filter(g => g && modKeys.has(g)).length;
    const sorts      = sortLevels.filter(sl => modKeys.has(sl.field)).length;
    return { fields, filter, groups, sorts };
  };

  const executeRemoveModule = (modId: string) => {
    toggleIncludedModule(modId, false);
    setConfirmRemoveModule(null);
    setGrainExpanded(prev => { const n = new Set(prev); n.delete(modId); return n; });
    // Also clear groupBy levels that used this module's fields
    const modSubject = frontendRegistry.getSubject(modId);
    if (modSubject) {
      const modKeys = new Set(modSubject.fieldGroups.flatMap(g => g.fields.map(f => f.key)));
      setGroupLevels(groupLevels.filter(g => !modKeys.has(g)));
      setSortLevels(sortLevels.filter(sl => !modKeys.has(sl.field)));
    }
  };

  const requestRemoveModule = (modId: string) => {
    const impact = getModuleImpact(modId);
    const hasImpact = impact.fields > 0 || impact.filter || impact.groups > 0 || impact.sorts > 0;
    if (hasImpact) {
      setConfirmRemoveModule(modId);
    } else {
      executeRemoveModule(modId);
    }
  };

  // Shared section header
  const SectionHeader = ({ label, count, action }: { label: string; count?: number; action?: { text: string; onClick: () => void; testId: string } }) => (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {label}
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-4 font-medium">{count}</Badge>
        )}
      </span>
      {action && (
        <button
          className="flex items-center gap-0.5 text-xs text-muted-foreground/50 hover:text-primary transition-colors"
          onClick={action.onClick}
          data-testid={action.testId}
        >
          <Plus className="h-3 w-3" />{action.text}
        </button>
      )}
    </div>
  );

  // Shared empty-state row
  const EmptyRow = ({ text }: { text: string }) => (
    <p className="text-xs text-muted-foreground/40 italic py-1">{text}</p>
  );

  // Shared configured item row (label + value chip + optional controls)
  const ConfigRow = ({
    children, onRemove, removeTestId, className = "",
  }: {
    children: ReactNode;
    onRemove?: () => void;
    removeTestId?: string;
    className?: string;
  }) => (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card ${className}`}>
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-auto shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors p-0.5"
          data-testid={removeTestId}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">

      {/* ── 0. Financial Options — shown only when financial calc fields exist */}
      {calculatedGroups.length > 0 && (
        <div>
          <SectionHeader label="Financial Options" />
          <div className="px-2.5 py-2.5 rounded-md border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium leading-snug">Include Rideshare Cost</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Affects Total Direct Cost, GP$, and GP%
                </p>
              </div>
              <Switch
                checked={includeRideshare}
                onCheckedChange={setIncludeRideshare}
                data-testid="toggle-include-rideshare"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 1. Data Sources ─────────────────────────────────────────────── */}
      <div>
        <SectionHeader label="Data Sources" count={1 + includedModules.length} />

        <div className="space-y-1">
          {/* Primary subject — always present, locked */}
          {subjectDef && (() => {
            const Icon = subjectDef.icon;
            return (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-muted/30">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${subjectDef.color}`} />
                <span className="text-sm flex-1 truncate font-medium">{subjectDef.label}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-4 shrink-0">Primary</Badge>
              </div>
            );
          })()}

          {/* All related subjects — unified +/- list */}
          {relatedSubjects.map(rs => {
            const RsIcon      = rs.icon;
            const isIncluded  = includedModules.includes(rs.id);
            const relDef      = frontendRegistry.getRelationship(subjectKey, rs.id);
            const currentMode: RelationshipMode = moduleGrainModes[rs.id] ?? (relDef?.supportsPrimaryOnly ? "primary_only" : "all_records");
            const isGrainOpen = grainExpanded.has(rs.id);
            const isPending   = confirmRemoveModule === rs.id;

            return (
              <div key={rs.id} className="rounded-md border border-border overflow-hidden">
                {/* Main row */}
                <div className={`flex items-center gap-2 px-2.5 py-2 transition-colors ${isIncluded ? "bg-card" : "bg-muted/20"}`}>
                  <RsIcon className={`h-3.5 w-3.5 shrink-0 ${isIncluded ? rs.color : "text-muted-foreground/40"}`} />
                  <span className={`text-sm flex-1 truncate ${isIncluded ? "font-medium" : "text-muted-foreground"}`}>
                    {rs.label}
                  </span>

                  {isIncluded ? (
                    <>
                      {/* Grain mode toggle — only for relationships with configurable grain */}
                      {relDef?.supportsPrimaryOnly ? (
                        <button
                          className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors p-0.5"
                          onClick={() => setGrainExpanded(prev => {
                            const n = new Set(prev); n.has(rs.id) ? n.delete(rs.id) : n.add(rs.id); return n;
                          })}
                          title="Configure relationship mode"
                          data-testid={`btn-grain-toggle-${rs.id}`}
                        >
                          <ChevronDown className={`h-3 w-3 transition-transform ${isGrainOpen ? "rotate-180" : ""}`} />
                        </button>
                      ) : (
                        /* Fixed join type — show label so it's clear the include has effect */
                        <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">All records</span>
                      )}
                      {/* Included badge */}
                      <Badge className="text-[10px] px-1.5 py-0 leading-4 shrink-0 bg-primary/10 text-primary border-primary/20 dark:bg-primary/15">
                        Included
                      </Badge>
                      {/* Remove (minus) button */}
                      <button
                        className="shrink-0 flex items-center justify-center h-5 w-5 rounded border border-border text-muted-foreground/50 hover:border-destructive/60 hover:text-destructive hover:bg-destructive/5 transition-colors"
                        onClick={() => { setConfirmRemoveModule(null); requestRemoveModule(rs.id); }}
                        title={`Exclude ${rs.label}`}
                        data-testid={`btn-exclude-ds-${rs.id}`}
                      >
                        <Minus className="h-2.5 w-2.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Not-included dim label */}
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">Not included</span>
                      {/* Add (plus) button */}
                      <button
                        className="shrink-0 flex items-center justify-center h-5 w-5 rounded border border-border text-muted-foreground/50 hover:border-primary/60 hover:text-primary hover:bg-primary/5 transition-colors"
                        onClick={() => toggleIncludedModule(rs.id, true)}
                        title={`Include ${rs.label}`}
                        data-testid={`btn-include-ds-${rs.id}`}
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Grain mode panel (expandable) */}
                {isIncluded && isGrainOpen && relDef?.supportsPrimaryOnly && (
                  <div className="px-3 py-2 border-t border-border bg-muted/20 space-y-1.5" data-testid={`grain-mode-panel-${rs.id}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Relationship mode</p>
                    {(
                      [
                        { value: "primary_only" as RelationshipMode, label: "Primary account only", desc: "1 row per driver" },
                        { value: "all_records"  as RelationshipMode, label: "All related records",   desc: "May duplicate rows" },
                        { value: "summary"      as RelationshipMode, label: "Summary (aggregate)",   desc: "1 row + account count" },
                      ] as { value: RelationshipMode; label: string; desc: string }[]
                    ).map(opt => (
                      <label key={opt.value} className="flex items-start gap-2 cursor-pointer" data-testid={`grain-mode-option-${rs.id}-${opt.value}`}>
                        <input type="radio" name={`grain-${rs.id}`} value={opt.value} checked={currentMode === opt.value}
                          onChange={() => setModuleGrainMode(rs.id, opt.value)} className="mt-0.5 accent-primary shrink-0" />
                        <span className="flex flex-col">
                          <span className="text-xs font-medium leading-snug">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground leading-snug">{opt.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Inline removal confirmation */}
                {isPending && (() => {
                  const impact = getModuleImpact(rs.id);
                  const parts: string[] = [];
                  if (impact.fields > 0) parts.push(`${impact.fields} field${impact.fields > 1 ? "s" : ""}`);
                  if (impact.filter)     parts.push("filter");
                  if (impact.groups > 0) parts.push("grouping");
                  if (impact.sorts > 0)  parts.push("sort");
                  return (
                    <div className="px-3 py-2.5 border-t border-destructive/20 bg-destructive/5 space-y-2">
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive/70 mt-0.5" />
                        <p className="text-xs text-foreground leading-snug">
                          Excluding <span className="font-semibold">{rs.label}</span> will remove{" "}
                          {parts.join(", ")} from this report.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs px-2.5"
                          onClick={() => executeRemoveModule(rs.id)}
                          data-testid={`btn-confirm-remove-ds-${rs.id}`}
                        >
                          Yes, exclude
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2.5"
                          onClick={() => setConfirmRemoveModule(null)}
                          data-testid={`btn-cancel-remove-ds-${rs.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* ── 2. Filters ──────────────────────────────────────────────────── */}
      <div>
        <SectionHeader
          label="Filters"
          count={filters.length}
          action={{
            text:     "Add Filter",
            onClick:  () => setFilters([...filters, { id: `f_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, field: "", op: "eq", value: "" }]),
            testId:   "btn-add-filter",
          }}
        />

        {filters.length === 0 && <EmptyRow text="No filters applied." />}

        {filters.length > 0 && (
          <div className="space-y-2">
            {filters.map((fr, idx) => {
              const fieldDef  = allFields.find(f => f.key === fr.field);
              const isNumeric = !!(fieldDef?.isCurrency || fieldDef?.isPercent);
              const opsForField = FILTER_OPS.filter(op => {
                if (!fieldDef)  return true;
                if (isNumeric)  return op.value !== "contains";
                return op.value !== "gt" && op.value !== "lt";
              });
              const opDef = FILTER_OPS.find(o => o.value === fr.op);
              const updateFilter = (patch: Partial<FilterRow>) =>
                setFilters(filters.map((f, i) => i === idx ? { ...f, ...patch } : f));
              return (
                <ConfigRow
                  key={fr.id}
                  onRemove={() => setFilters(filters.filter((_, i) => i !== idx))}
                  removeTestId={`btn-remove-filter-${idx}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <FieldSearchCombobox
                      value={fr.field}
                      onChange={key => updateFilter({ field: key, value: "" })}
                      placeholder="Select field…"
                      groups={filterComboGroups}
                      testId={`select-filter-field-${idx}`}
                    />
                    <Select
                      value={fr.op}
                      onValueChange={v => updateFilter({ op: v as FilterOp, value: "" })}
                    >
                      <SelectTrigger className="h-7 text-xs w-full" data-testid={`select-filter-op-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {opsForField.map(op => (
                          <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {opDef?.hasValue && (
                      <Input
                        placeholder="Value…"
                        value={fr.value}
                        onChange={e => updateFilter({ value: e.target.value })}
                        className="text-xs h-7"
                        data-testid={`input-filter-value-${idx}`}
                      />
                    )}
                  </div>
                </ConfigRow>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* ── 3. Grouping ─────────────────────────────────────────────────── */}
      <div>
        <SectionHeader
          label="Grouping"
          count={groupLevels.filter(Boolean).length}
          action={groupLevels.length < 2
            ? {
                text:    "Add Group Level",
                onClick: () => setGroupLevels([...groupLevels, ""]),
                testId:  "btn-add-group-level",
              }
            : undefined}
        />

        {groupLevels.length === 0 && <EmptyRow text="No grouping configured." />}

        <div className="space-y-1">
          {groupLevels.map((gl, idx) => (
            <ConfigRow
              key={idx}
              onRemove={() => setGroupLevels(groupLevels.filter((_, i) => i !== idx))}
              removeTestId={`btn-remove-group-${idx}`}
            >
              {/* Up / Down reorder */}
              <div className="flex flex-col shrink-0 gap-0">
                <button
                  className="h-3.5 w-4 flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors disabled:opacity-20"
                  disabled={idx === 0}
                  onClick={() => {
                    const next = [...groupLevels];
                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                    setGroupLevels(next);
                  }}
                  data-testid={`btn-group-up-${idx}`}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  className="h-3.5 w-4 flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors disabled:opacity-20"
                  disabled={idx === groupLevels.length - 1}
                  onClick={() => {
                    const next = [...groupLevels];
                    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                    setGroupLevels(next);
                  }}
                  data-testid={`btn-group-down-${idx}`}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              <span className="text-[10px] tabular-nums text-muted-foreground/50 w-3 shrink-0 text-right">{idx + 1}</span>

              <FieldSearchCombobox
                value={gl}
                onChange={key => {
                  const next = [...groupLevels];
                  next[idx] = key;
                  setGroupLevels(next);
                }}
                placeholder="Group by…"
                groups={groupComboGroups.map(g => ({
                  ...g,
                  options: g.options.filter(o => !groupLevels.some((lv, i) => i !== idx && lv === o.key)),
                }))}
                testId={`select-group-by-${idx}`}
              />
            </ConfigRow>
          ))}
        </div>
      </div>

      <Separator />

      {/* ── 4. Sort ─────────────────────────────────────────────────────── */}
      <div>
        <SectionHeader
          label="Sort"
          count={sortLevels.length}
          action={sortLevels.length < 5
            ? {
                text: "Add Sort Level",
                onClick: () => {
                  const nextField = sortableFields.find(f => !sortLevels.find(sl => sl.field === f.key))?.key ?? "";
                  setSortLevels([...sortLevels, { field: nextField, dir: "asc" }]);
                },
                testId: "btn-add-sort-level",
              }
            : undefined}
        />

        {sortLevels.length === 0 && <EmptyRow text="No sort configured." />}

        <div className="space-y-1">
          {sortLevels.map((sl, idx) => (
            <ConfigRow
              key={idx}
              onRemove={() => setSortLevels(sortLevels.filter((_, i) => i !== idx))}
              removeTestId={`btn-sort-remove-${idx}`}
            >
              <span className="text-[10px] tabular-nums text-muted-foreground/50 w-4 shrink-0 text-right">{idx + 1}</span>

              <FieldSearchCombobox
                value={sl.field}
                onChange={key => {
                  const next = [...sortLevels];
                  next[idx] = { ...next[idx], field: key };
                  setSortLevels(next);
                }}
                placeholder="Field…"
                groups={sortComboGroups.map(g => ({
                  ...g,
                  options: g.options.filter(o => !sortLevels.some((sv, si) => si !== idx && sv.field === o.key)),
                }))}
                testId={`select-sort-field-${idx}`}
              />

              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  const next = [...sortLevels];
                  next[idx] = { ...next[idx], dir: sl.dir === "asc" ? "desc" : "asc" };
                  setSortLevels(next);
                }}
                title={sl.dir === "asc" ? "Ascending — click for Descending" : "Descending — click for Ascending"}
                data-testid={`btn-sort-dir-${idx}`}
              >
                {sl.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              </Button>

              <div className="flex flex-col shrink-0">
                <button
                  className="h-3.5 w-3.5 flex items-center justify-center text-muted-foreground/40 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                  onClick={() => { if (idx === 0) return; const n = [...sortLevels]; [n[idx-1], n[idx]] = [n[idx], n[idx-1]]; setSortLevels(n); }}
                  disabled={idx === 0} title="Move up" data-testid={`btn-sort-up-${idx}`}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  className="h-3.5 w-3.5 flex items-center justify-center text-muted-foreground/40 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                  onClick={() => { if (idx === sortLevels.length - 1) return; const n = [...sortLevels]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; setSortLevels(n); }}
                  disabled={idx === sortLevels.length - 1} title="Move down" data-testid={`btn-sort-down-${idx}`}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </ConfigRow>
          ))}
        </div>
      </div>

      <Separator />

      {/* ── 5. Fields / Columns ─────────────────────────────────────────── */}
      <div>
        <SectionHeader
          label="Fields"
          count={selectedFields.length}
          action={{
            text:    showFieldPicker ? "Close" : "Add Field",
            onClick: () => { if (showFieldPicker) setFieldPickerSearch(""); setShowFieldPicker(v => !v); },
            testId:  "btn-add-field",
          }}
        />

        {selectedFields.length === 0 && !showFieldPicker && <EmptyRow text="No fields selected." />}

        {/* Selected column rows — draggable to reorder */}
        {selectedFields.length > 0 && (
          <div className="space-y-1">
            {selectedFields.map((key, i) => {
              const field = allFields.find(f => f.key === key);
              if (!field) return null;
              return (
                <div
                  key={key}
                  draggable
                  onDragStart={() => { dragIndexRef.current = i; }}
                  onDragOver={e => { e.preventDefault(); setDragOver(i); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => {
                    if (dragIndexRef.current !== null) moveField(dragIndexRef.current, i);
                    dragIndexRef.current = null;
                    setDragOver(null);
                  }}
                  onDragEnd={() => { dragIndexRef.current = null; setDragOver(null); }}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border bg-card select-none cursor-grab active:cursor-grabbing transition-colors ${dragOver === i ? "border-primary/60 bg-primary/5" : "border-border"}`}
                  data-testid={`field-item-${key}`}
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  <span className="text-xs flex-1 truncate">{field.label}</span>
                  <button
                    onClick={() => removeField(key)}
                    className="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors p-0.5"
                    data-testid={`button-remove-field-${key}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Field picker panel — slides open when Add Field is clicked */}
        {showFieldPicker && (() => {
          const q = fieldPickerSearch.toLowerCase().trim();
          const searching = q.length > 0;

          // When searching, auto-expand modules that have matching fields
          const isModExpanded = (id: string) => searching ? true : expandedModules.has(id);

          return (
            <div className="mt-2 rounded-md border border-border overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/50 bg-muted/30">
                <Search className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <input
                  type="text"
                  value={fieldPickerSearch}
                  onChange={e => setFieldPickerSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape") { setFieldPickerSearch(""); if (!fieldPickerSearch) { setShowFieldPicker(false); } }
                  }}
                  placeholder="Search fields…"
                  autoFocus
                  className="flex-1 text-xs bg-transparent border-0 outline-none placeholder:text-muted-foreground/40 text-foreground"
                  data-testid="input-field-picker-search"
                />
                {fieldPickerSearch && (
                  <button
                    onClick={() => setFieldPickerSearch("")}
                    className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
                    data-testid="btn-clear-field-search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="divide-y divide-border/50">
                {/* Primary + related module field groups */}
                {visibleModules.map(mod => {
                  const modNonCalc  = mod.fieldGroups.filter(g => !g.isCalculated);
                  const modFields   = modNonCalc.flatMap(g => g.fields).filter(canAccess);
                  const available   = modFields.filter(f =>
                    !selectedFields.includes(f.key) &&
                    (!searching || f.label.toLowerCase().includes(q) || mod.label.toLowerCase().includes(q))
                  );
                  if (searching && available.length === 0) return null;
                  const isPrimary  = mod.id === subjectKey;
                  const isExpanded = isModExpanded(mod.id);
                  const ModIcon    = mod.icon;
                  return (
                    <div key={mod.id}>
                      <button
                        onClick={() => !searching && toggleModule(mod.id)}
                        className={`flex items-center gap-2 w-full px-2.5 py-1.5 hover-elevate text-left ${isPrimary ? "bg-muted/50" : "bg-muted/20"} ${searching ? "cursor-default" : ""}`}
                        data-testid={`button-toggle-module-${mod.id}`}
                      >
                        <ModIcon className={`h-3.5 w-3.5 shrink-0 ${mod.color}`} />
                        <span className={`text-xs flex-1 truncate ${isPrimary ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                          {searching ? highlightMatch(mod.label, fieldPickerSearch) : mod.label}
                        </span>
                        {available.length > 0 && !searching && (
                          <span className="text-xs tabular-nums text-muted-foreground/50 shrink-0">{available.length}</span>
                        )}
                        {!searching && <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`} />}
                      </button>

                      {isExpanded && (
                        <div className="divide-y divide-border/40">
                          {available.length === 0 ? (
                            <p className="text-xs text-muted-foreground/50 italic px-3 py-2">All fields selected.</p>
                          ) : (
                            modNonCalc.map(group => {
                              const groupAvail = group.fields.filter(f =>
                                !selectedFields.includes(f.key) && canAccess(f) &&
                                (!searching || f.label.toLowerCase().includes(q) || mod.label.toLowerCase().includes(q))
                              );
                              if (groupAvail.length === 0) return null;
                              return (
                                <div key={group.label} className="px-2 py-1.5 space-y-0.5">
                                  {modNonCalc.length > 1 && !searching && (
                                    <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wide px-0.5 pb-0.5">{group.label}</p>
                                  )}
                                  {groupAvail.map(f => (
                                    <button
                                      key={f.key}
                                      onClick={() => addField(f.key)}
                                      className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-left"
                                      data-testid={`button-add-field-${f.key}`}
                                    >
                                      <Plus className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                                      <span className="truncate">{highlightMatch(f.label, fieldPickerSearch)}</span>
                                    </button>
                                  ))}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Calculated field groups */}
                {calculatedGroups.map(group => {
                  const gFields    = group.fields.filter(canAccess);
                  const available  = gFields.filter(f =>
                    !selectedFields.includes(f.key) &&
                    (!searching || f.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q))
                  );
                  if (gFields.length === 0) return null;
                  if (searching && available.length === 0) return null;
                  const calcKey    = `calc_${group.label}`;
                  const isExpanded = isModExpanded(calcKey);
                  return (
                    <div key={group.label}>
                      <button
                        onClick={() => !searching && toggleModule(calcKey)}
                        className={`flex items-center gap-2 w-full px-2.5 py-1.5 hover-elevate text-left bg-amber-500/10 dark:bg-amber-500/8 ${searching ? "cursor-default" : ""}`}
                        data-testid={`button-toggle-calc-${group.label}`}
                      >
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400 flex-1 truncate">
                          {searching ? highlightMatch(group.label, fieldPickerSearch) : group.label}
                        </span>
                        {available.length > 0 && !searching && (
                          <span className="text-xs tabular-nums text-muted-foreground/50 shrink-0">{available.length}</span>
                        )}
                        {!searching && <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`} />}
                      </button>
                      {isExpanded && (
                        <div className="px-2 py-1.5 space-y-0.5">
                          {available.length === 0 ? (
                            <p className="text-xs text-muted-foreground/50 italic px-0.5 py-1">All fields selected.</p>
                          ) : (
                            available.map(f => (
                              <Tooltip key={f.key} delayDuration={0}>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => { if (!selectedFields.includes(f.key)) setSelectedFields([...selectedFields, f.key]); }}
                                    className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-amber-500/8 transition-colors text-left"
                                    data-testid={`button-add-calc-field-${f.key}`}
                                  >
                                    <Plus className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                                    <span className="flex-1 truncate">{highlightMatch(f.label, fieldPickerSearch)}</span>
                                    {f.formulaTooltip && <Info className="h-3 w-3 shrink-0 text-amber-600/40" />}
                                  </button>
                                </TooltipTrigger>
                                {f.formulaTooltip && (
                                  <TooltipContent side="right" className="max-w-64 break-words space-y-1">
                                    <p className="font-medium">{f.label}</p>
                                    <p className="text-xs font-mono text-muted-foreground">{f.formulaTooltip}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty state when search has no results */}
                {searching && (() => {
                  const anyVisible =
                    visibleModules.some(mod => {
                      const modFields = mod.fieldGroups.filter(g => !g.isCalculated).flatMap(g => g.fields).filter(canAccess);
                      return modFields.some(f => !selectedFields.includes(f.key) && (f.label.toLowerCase().includes(q) || mod.label.toLowerCase().includes(q)));
                    }) ||
                    calculatedGroups.some(group =>
                      group.fields.filter(canAccess).some(f => !selectedFields.includes(f.key) && (f.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q)))
                    );
                  return !anyVisible ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground/60 italic">
                      No fields match "{fieldPickerSearch}".
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          );
        })()}
      </div>

    </div>
  );
}

// ── Grouped table ─────────────────────────────────────────────────────────────

function GroupedTable({
  result,
  fieldLabels,
  currencyFieldKeys,
  percentFieldKeys,
  onDrillGroup1,
  onDrillGroup2,
  onDrillSingleRow,
}: {
  result: GroupedResult;
  fieldLabels: Record<string, string>;
  currencyFieldKeys: Set<string>;
  percentFieldKeys: Set<string>;
  onDrillGroup1?: (g0Val: string) => void;
  onDrillGroup2?: (g0Val: string, g1Val: string) => void;
  onDrillSingleRow?: (gVal: string) => void;
}) {
  const { groupByFields, rows, aggregateFields = [] } = result;
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const keys = new Set<string>();
    rows.forEach(r => keys.add(String(r.g0 ?? "—")));
    return keys;
  });

  const toggle = (key: string, e: { stopPropagation(): void }) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const label0 = fieldLabels[groupByFields[0]] ?? groupByFields[0];
  const label1 = groupByFields[1] ? (fieldLabels[groupByFields[1]] ?? groupByFields[1]) : null;

  // Helper: format a cell value for a given field key
  const fmtAgg = (key: string, val: unknown) =>
    currencyFieldKeys.has(key) ? formatCurrency(val) :
    percentFieldKeys.has(key)  ? formatPercent(val)  :
    formatCell(val);

  // Must be above any early return — Rules of Hooks
  const groups = useMemo(() => {
    const map = new Map<string, { total: number; aggTotals: Record<string, number>; children: typeof rows }>();
    rows.forEach(row => {
      const key = String(row.g0 ?? "—");
      if (!map.has(key)) map.set(key, { total: 0, aggTotals: {}, children: [] });
      const g = map.get(key)!;
      g.children.push(row);
      g.total += Number(row.count) || 0;
      // Sum numeric aggregates for the parent-level display (currency fields only;
      // percent fields intentionally omitted — weighted avg can't be naively summed).
      for (const f of aggregateFields) {
        if (currencyFieldKeys.has(f)) {
          g.aggTotals[f] = (g.aggTotals[f] ?? 0) + (Number(row[f]) || 0);
        }
      }
    });
    return map;
  }, [rows, aggregateFields, currencyFieldKeys]);

  const isDrillable1 = !!onDrillGroup1;
  const isDrillableSingle = !!onDrillSingleRow;

  const thAgg = "px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b whitespace-nowrap";
  const tdAgg = "px-3 py-2 text-right tabular-nums text-sm";

  // Single-level grouped table (used when drilling into L1 — only L2 remains)
  if (groupByFields.length === 1) {
    return (
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
          <tr>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">{label0}</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b w-16">Count</th>
            {aggregateFields.map(key => (
              <th key={key} className={thAgg}>{fieldLabels[key] ?? key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const cellVal = formatCell(row.g0);
            return (
              <tr
                key={i}
                className={`border-b last:border-0 group transition-colors ${isDrillableSingle ? "cursor-pointer hover:bg-primary/5" : "hover:bg-muted/20"}`}
                onClick={() => onDrillSingleRow?.(cellVal)}
              >
                <td className="px-3 py-2">
                  <span className="flex items-center justify-between gap-2">
                    <span>{cellVal}</span>
                    {isDrillableSingle && (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary invisible group-hover:visible" />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{String(row.count)}</td>
                {aggregateFields.map(key => (
                  <td key={key} className={tdAgg}>{fmtAgg(key, row[key])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // Two-level: hierarchical display
  // Parent rows show group label + total count + summed currency aggregates.
  // Child rows show sub-group label + child count + per-row aggregates.
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
        <tr>
          <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">{label0} / {label1}</th>
          <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b w-16">Count</th>
          {aggregateFields.filter(f => currencyFieldKeys.has(f)).map(key => (
            <th key={key} className={thAgg}>{fieldLabels[key] ?? key}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...groups.entries()].flatMap(([key, { total, aggTotals, children }]) => [
          // ── Level-1 group header row ─────────────────────────────────────
          <tr
            key={`hdr-${key}`}
            className={`border-b bg-muted/30 select-none group transition-colors ${isDrillable1 ? "cursor-pointer hover:bg-primary/5" : "hover:bg-muted/40 cursor-pointer"}`}
            onClick={() => onDrillGroup1?.(key)}
          >
            <td className="px-3 py-2 font-semibold">
              <span className="flex items-center gap-1.5">
                <span
                  className="shrink-0 p-0.5 rounded hover:bg-muted/50"
                  onClick={e => toggle(key, e)}
                  title={expanded.has(key) ? "Collapse" : "Expand"}
                >
                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded.has(key) ? "rotate-90" : ""}`} />
                </span>
                <span className="flex-1">{key}</span>
                {isDrillable1 && (
                  <span className="flex items-center gap-0.5 text-xs text-primary font-normal invisible group-hover:visible">
                    View <ChevronRight className="h-3 w-3" />
                  </span>
                )}
              </span>
            </td>
            <td className="px-3 py-2 text-right font-semibold tabular-nums">{total}</td>
            {aggregateFields.filter(f => currencyFieldKeys.has(f)).map(f => (
              <td key={f} className={`${tdAgg} font-semibold`}>{formatCurrency(aggTotals[f] ?? null)}</td>
            ))}
          </tr>,

          // ── Level-2 child rows ────────────────────────────────────────────
          ...(expanded.has(key) ? children.map((row, ci) => {
            const childVal = formatCell(row.g1);
            return (
              <tr
                key={`${key}-child-${ci}`}
                className={`border-b last:border-0 group transition-colors ${onDrillGroup2 ? "cursor-pointer hover:bg-primary/5" : "hover:bg-muted/20"}`}
                onClick={() => onDrillGroup2?.(key, childVal)}
              >
                <td className="px-3 py-2 pl-8 text-muted-foreground">
                  <span className="flex items-center justify-between gap-2">
                    <span>{childVal}</span>
                    {onDrillGroup2 && (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary invisible group-hover:visible" />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{String(row.count)}</td>
                {aggregateFields.filter(f => currencyFieldKeys.has(f)).map(f => (
                  <td key={f} className={tdAgg}>{fmtAgg(f, row[f])}</td>
                ))}
              </tr>
            );
          }) : []),
        ])}
      </tbody>
    </table>
  );
}

// ── Center panel ──────────────────────────────────────────────────────────────

function CenterPanel({
  subject, selectedFields, previewData, isLoading, isError, onLoadMore,
  onDrillGroup1, onDrillGroup2, onDrillSingleRow, onDrillRow,
  sortLevels, includedModules,
}: {
  subject: string;
  selectedFields: string[];
  previewData?: PreviewResult;
  isLoading: boolean;
  isError: boolean;
  onLoadMore: () => void;
  onDrillGroup1?: (g0Val: string) => void;
  onDrillGroup2?: (g0Val: string, g1Val: string) => void;
  onDrillSingleRow?: (gVal: string) => void;
  onDrillRow?: (driverId: string) => void;
  sortLevels?: SortLevel[];
  includedModules?: string[];
}) {
  // Build combined label map: primary subject + all related module subjects.
  // This ensures related-module column keys (e.g. claim_actualCost) resolve to
  // their human label ("Actual Cost") instead of falling back to the raw key string.
  const fieldLabels = useMemo(() => {
    const map = frontendRegistry.getLabelMap(subject.toLowerCase());
    (includedModules ?? []).forEach(m => Object.assign(map, frontendRegistry.getLabelMap(m)));
    return map;
  }, [subject, includedModules]);

  // Build sets for currency and percent field keys from all active subjects.
  const { currencyFieldKeys, percentFieldKeys } = useMemo(() => {
    const currency = new Set<string>();
    const percent  = new Set<string>();
    const addFromSubject = (id: string) => {
      const def = frontendRegistry.getSubject(id);
      if (!def) return;
      def.fieldGroups.forEach(g => g.fields.forEach(f => {
        if (f.isCurrency) currency.add(f.key);
        if (f.isPercent)  percent.add(f.key);
      }));
    };
    addFromSubject(subject.toLowerCase());
    (includedModules ?? []).forEach(m => addFromSubject(m));
    return { currencyFieldKeys: currency, percentFieldKeys: percent };
  }, [subject, includedModules]);

  // Build set of fields whose DB values should be Title Cased (status, classification, etc.).
  const capitalizeFieldKeys = useMemo(() => {
    const keys = new Set<string>();
    const addFromSubject = (id: string) => {
      const def = frontendRegistry.getSubject(id);
      if (!def) return;
      def.fieldGroups.forEach(g => g.fields.forEach(f => { if (f.capitalizeValue) keys.add(f.key); }));
    };
    addFromSubject(subject.toLowerCase());
    (includedModules ?? []).forEach(m => addFromSubject(m));
    return keys;
  }, [subject, includedModules]);

  const subjectRegistered = !!frontendRegistry.getSubject(subject.toLowerCase());
  if (!subjectRegistered) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Configuration for <strong className="mx-1">{subject}</strong> coming soon.
      </div>
    );
  }

  if (selectedFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <FileBarChart className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium">Select fields to build your report</p>
        <p className="text-xs text-center max-w-xs">Choose the fields you want to see in the left panel.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-destructive">
        <p className="text-sm font-medium">Failed to load preview</p>
        <p className="text-xs">Check your configuration and try again.</p>
      </div>
    );
  }

  if (!previewData) return null;

  if (previewData.mode === "grouped") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-auto">
          <GroupedTable
            result={previewData}
            fieldLabels={fieldLabels}
            currencyFieldKeys={currencyFieldKeys}
            percentFieldKeys={percentFieldKeys}
            onDrillGroup1={onDrillGroup1}
            onDrillGroup2={onDrillGroup2}
            onDrillSingleRow={onDrillSingleRow}
          />
        </div>
        <div className="shrink-0 px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          {previewData.rows.length} groups — click a row to drill down
        </div>
      </div>
    );
  }

  // Row mode
  const { columns, rows, hasMore } = previewData;
  const colLabels = columns.map(c => fieldLabels[c] ?? c);
  const rowsClickable = !!onDrillRow;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
            <tr>
              {columns.map((key, i) => {
                const label       = colLabels[i];
                const isNumeric   = currencyFieldKeys.has(key) || percentFieldKeys.has(key);
                const sortIdx     = (sortLevels ?? []).findIndex(sl => sl.field === key && sl.field !== "");
                const isSorted    = sortIdx !== -1;
                const sortDir     = isSorted ? (sortLevels![sortIdx].dir) : null;
                const isPrimary   = sortIdx === 0;
                const sortTitle   = isSorted
                  ? `Sort level ${sortIdx + 1} — ${sortDir === "asc" ? "Ascending (A→Z)" : "Descending (Z→A)"}`
                  : undefined;
                return (
                  <th
                    key={i}
                    className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap border-b select-none ${isNumeric ? "text-right" : "text-left"}`}
                    title={sortTitle}
                    data-testid={`th-col-${key}`}
                  >
                    <span className={`flex items-center gap-1 ${isNumeric ? "justify-end" : ""}`}>
                      {isSorted ? (
                        sortDir === "asc"
                          ? <ArrowUp   className={`h-3 w-3 shrink-0 ${isPrimary ? "text-primary" : "text-primary/40"}`} />
                          : <ArrowDown className={`h-3 w-3 shrink-0 ${isPrimary ? "text-primary" : "text-primary/40"}`} />
                      ) : null}
                      {isSorted && !isPrimary && (
                        <span className="text-[9px] tabular-nums text-primary/40 leading-none">{sortIdx + 1}</span>
                      )}
                      <span>{label}</span>
                    </span>
                  </th>
                );
              })}
              {/* Extra header cell for the drill-in chevron column */}
              {rowsClickable && <th className="w-6 border-b" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowsClickable ? 1 : 0)} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No drivers match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => {
                const driverId   = row["_driverId"] ? String(row["_driverId"]) : undefined;
                // A row is navigable only when it has a driver ID (d.id from backend).
                // After the backend filter this should always be true, but guard defensively.
                const isClickable = rowsClickable && !!driverId;
                const isInvalid   = rowsClickable && !driverId;
                return (
                  <tr
                    key={ri}
                    className={`border-b last:border-0 group transition-colors
                      ${isClickable ? "cursor-pointer hover:bg-primary/5" :
                        isInvalid   ? "opacity-50 cursor-not-allowed" :
                                      "hover:bg-muted/20"}`}
                    onClick={() => { if (isClickable) onDrillRow!(driverId!); }}
                    title={isInvalid ? "Driver record unavailable" : undefined}
                    data-testid={`row-driver-${ri}`}
                  >
                    {columns.map((key, ci) => {
                      const raw       = row[key];
                      const blank     = raw === null || raw === undefined || String(raw).trim() === "";
                      const isNumeric = currencyFieldKeys.has(key) || percentFieldKeys.has(key);
                      return (
                        <td
                          key={ci}
                          className={`px-3 py-2 text-sm whitespace-nowrap${isNumeric ? " text-right tabular-nums font-medium" : ""}`}
                        >
                          {key === "name" && blank
                            ? <span className="italic text-muted-foreground">Unnamed Driver Record</span>
                            : currencyFieldKeys.has(key)   ? formatCurrency(raw)
                            : percentFieldKeys.has(key)    ? formatPercent(raw)
                            : capitalizeFieldKeys.has(key) ? toTitleCase(raw)
                            : formatCell(raw)
                          }
                        </td>
                      );
                    })}
                    {rowsClickable && (
                      <td className="px-2 py-2 w-6">
                        {isClickable
                          ? <ChevronRight className="h-3.5 w-3.5 text-primary invisible group-hover:visible" />
                          : null
                        }
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 px-3 py-2 border-t bg-muted/30 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {rows.length} rows{hasMore ? ` (showing first ${rows.length})` : ""}
          {rowsClickable && rows.length > 0 && (
            <span className="ml-2 text-muted-foreground/60">· click a row to open driver profile</span>
          )}
        </span>
        {hasMore && (
          <Button size="sm" variant="outline" onClick={onLoadMore} className="h-6 text-xs">
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Save Report Modal ──────────────────────────────────────────────────────────

function SaveReportModal({
  open, onClose, onSave, saving, isSaveAs,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string | null; isPublic: boolean }) => void;
  saving: boolean;
  isSaveAs: boolean;
}) {
  const [modalName, setModalName]              = useState("");
  const [modalDescription, setModalDescription] = useState("");
  const [modalIsPublic, setModalIsPublic]       = useState(false);
  const [nameError, setNameError]               = useState("");

  // Reset form every time the modal opens
  useEffect(() => {
    if (open) {
      setModalName("");
      setModalDescription("");
      setModalIsPublic(false);
      setNameError("");
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = modalName.trim();
    if (!trimmed) {
      setNameError("Report name is required.");
      return;
    }
    setNameError("");
    onSave({ name: trimmed, description: modalDescription.trim() || null, isPublic: modalIsPublic });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isSaveAs ? "Save As New Report" : "Save Report"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-report-name" className="text-sm">
              Report Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="modal-report-name"
              data-testid="input-modal-report-name"
              placeholder="e.g. Active Drivers by State"
              value={modalName}
              onChange={e => { setModalName(e.target.value); if (nameError) setNameError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-report-desc" className="text-sm">Description</Label>
            <Textarea
              id="modal-report-desc"
              data-testid="input-modal-report-desc"
              placeholder="What does this report show? (optional)"
              value={modalDescription}
              onChange={e => setModalDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Visibility */}
          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Make Public</p>
              <p className="text-xs text-muted-foreground">Visible to all users in Reports</p>
            </div>
            <Switch
              data-testid="switch-modal-public"
              checked={modalIsPublic}
              onCheckedChange={setModalIsPublic}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} data-testid="button-modal-save">
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : "Save Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Right panel ───────────────────────────────────────────────────────────────

function RightPanel({
  name, setName,
  description, setDescription,
  isPublic, setIsPublic,
  onSave, saving, saveDisabled,
  hasSavedReport,
  onSaveAs,
  onExport, exporting,
  isFavorited, onToggleFavorite,
  onSchedule,
}: {
  name: string; setName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  isPublic: boolean; setIsPublic: (v: boolean) => void;
  onSave: () => void; saving: boolean; saveDisabled: boolean;
  hasSavedReport: boolean;
  onSaveAs: () => void;
  onExport: () => void; exporting: boolean;
  isFavorited: boolean; onToggleFavorite: () => void;
  onSchedule: () => void;
}) {

  return (
    <div className="overflow-y-auto p-4 space-y-4">
      {/* Primary actions */}
      <div className="space-y-2">
        <Button
          className="w-full gap-2 justify-start"
          onClick={onSave}
          disabled={saveDisabled || saving}
          data-testid="button-save-report"
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : hasSavedReport
              ? <CheckCircle2 className="h-4 w-4" />
              : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : hasSavedReport ? "Update Report" : "Save Report"}
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2 justify-start"
          onClick={onSaveAs}
          disabled={saveDisabled}
          data-testid="button-save-as"
        >
          <Copy className="h-4 w-4" />Save As Copy
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2 justify-start"
          onClick={onToggleFavorite}
          data-testid="button-favorite-report"
        >
          <Star className={`h-4 w-4 ${isFavorited ? "fill-amber-400 text-amber-400" : ""}`} />
          {isFavorited ? "Unfavorite" : "Favorite"}
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2 justify-start"
          onClick={onExport}
          disabled={saveDisabled || exporting}
          data-testid="button-export-report"
        >
          {exporting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Download className="h-4 w-4" />}
          {exporting ? "Exporting…" : "Export .xlsx"}
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2 justify-start"
          onClick={onSchedule}
          disabled
          data-testid="button-schedule-report"
        >
          <Calendar className="h-4 w-4" />Schedule
        </Button>
      </div>

      <Separator />

      {/* Settings */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="rp-description" className="text-xs">Description</Label>
          <Textarea
            id="rp-description"
            data-testid="input-builder-description"
            placeholder="What does this report show?"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Public</p>
            <p className="text-xs text-muted-foreground">Visible to all users</p>
          </div>
          <Switch
            data-testid="switch-builder-public"
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DEFAULT_FIELDS   = ["name", "status", "classification", "state"];
const DEFAULT_FILTERS: FilterRow[] = [
  { id: "default", field: "status", op: "eq", value: "Active" },
];

export default function ReportBuilderWorkspace() {
  const [, navigate] = useLocation();
  const { toast }    = useToast();
  const { role }     = useAuth();
  const queryClient  = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const subject      = searchParams.get("subject") || "General";
  const subjectDef   = frontendRegistry.getSubject(subject.toLowerCase());
  const SubjectIcon  = subjectDef?.icon ?? FileBarChart;

  // URL-param-driven initial values (populated when "Run" fires from Report Library)
  // validFieldKeys comes from the registry so that URL-encoded and config-stored field
  // keys are always validated against the registered catalogue for this subject.
  const validFieldKeys = [
    ...frontendRegistry.getAllFieldKeys(subject.toLowerCase()),
    ...frontendRegistry.getAllRelatedFieldKeys(subject.toLowerCase()),
  ];
  const urlFields = searchParams.get("fields")
    ?.split(",")
    .filter(f => validFieldKeys.includes(f));
  const initFields = urlFields?.length ? urlFields : DEFAULT_FIELDS;
  // Filters — prefer new JSON param; fall back to legacy filterField/filterValue; else default
  const initFilters: FilterRow[] = (() => {
    try {
      const raw = searchParams.get("filters");
      if (raw) {
        const parsed = JSON.parse(raw) as FilterRow[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    const legacyField = searchParams.get("filterField");
    const legacyValue = searchParams.get("filterValue");
    if (legacyField) return [{ id: "default", field: legacyField, op: "eq", value: legacyValue || "" }];
    return DEFAULT_FILTERS;
  })();
  const initGroupLevels: string[] = (searchParams.get("groupBy") ?? "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 2);
  const initGroupBy1 = initGroupLevels[0] ?? "";
  const initGroupBy2 = initGroupLevels[1] ?? "";
  const initName        = searchParams.get("reportName") || "Untitled Report";
  // reportId is set when opening an existing saved report from the library
  const initReportId    = searchParams.get("reportId") || null;

  // ── Report details ─────────────────────────────────────────────────────────
  const [name,          setName]          = useState(initName);
  const [description,   setDescription]   = useState("");
  const [isPublic,      setIsPublic]      = useState(false);
  const [isFavorited,   setIsFavorited]   = useState(false);
  // Tracks the saved report ID — null = unsaved new report
  const [savedReportId, setSavedReportId] = useState<string | null>(initReportId);
  // Save modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [isSaveAs,      setIsSaveAs]      = useState(false);

  // ── Config (live, drives debounce) ─────────────────────────────────────────
  const [selectedFields,   setSelectedFields]   = useState<string[]>(initFields);
  const [filters,          setFilters]           = useState<FilterRow[]>(initFilters);
  const [groupLevels,      setGroupLevels]       = useState<string[]>(initGroupLevels);
  // Derived scalars — keep for backward compat with all derived/drill logic below
  const groupBy1 = groupLevels[0] ?? "";
  const groupBy2 = groupLevels[1] ?? "";
  const [includedModules,  setIncludedModules]   = useState<string[]>([]);
  const [moduleGrainModes, setModuleGrainModes] = useState<Record<string, RelationshipMode>>({});
  // Sort state — ordered list of sort levels
  const [sortLevels, setSortLevels] = useState<SortLevel[]>([]);
  // Financial options
  const [includeRideshare, setIncludeRideshare] = useState(true);

  const setModuleGrainMode = (moduleId: string, mode: RelationshipMode) =>
    setModuleGrainModes(prev => ({ ...prev, [moduleId]: mode }));

  // ── Resizable left panel ───────────────────────────────────────────────────
  // Min 180 px / max 520 px; persisted to localStorage across sessions.
  const panelWidthRef = useRef<number>(208);
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem("rb-panel-width") ?? "0", 10);
      const clamped = v >= 180 && v <= 520 ? v : 208;
      panelWidthRef.current = clamped;
      return clamped;
    } catch { return 208; }
  });
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidthRef.current;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(Math.max(startW + ev.clientX - startX, 180), 520);
      panelWidthRef.current = next;
      setPanelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try { localStorage.setItem("rb-panel-width", String(panelWidthRef.current)); } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ── Pagination offset ──────────────────────────────────────────────────────
  const [offset, setOffset] = useState(0);

  // ── Drill-down state ────────────────────────────────────────────────────────
  // Restored from sessionStorage when user navigates Back from Driver Detail.
  // Written to sessionStorage by handleDrillRow before navigating away.
  // The stored state is tagged with the reportId so stale drill state from a
  // different report session is never applied to a freshly opened report.
  const [_savedDrill] = useState<{ level: number; filters: DrillFilter[]; path: string[] } | null>(() => {
    try {
      const raw = sessionStorage.getItem("reportBuilder.drillState");
      if (raw) {
        sessionStorage.removeItem("reportBuilder.drillState");
        const parsed = JSON.parse(raw);
        // Only restore if the drill state belongs to this exact report
        if (parsed.reportId && parsed.reportId !== initReportId) return null;
        return parsed;
      }
    } catch { /* ignore */ }
    return null;
  });

  // Level 0 = full grouped view, Level 1 = drilled into L1 group (shows L2 only),
  // Level 2 = drilled into L2 (shows flat detail rows)
  const [drillLevel,   setDrillLevel]   = useState(_savedDrill?.level   ?? 0);
  const [drillFilters, setDrillFilters] = useState<DrillFilter[]>(_savedDrill?.filters ?? []);
  // drillPath: human-readable labels for breadcrumb ["IC", "OK"]
  const [drillPath,    setDrillPath]    = useState<string[]>(_savedDrill?.path ?? []);

  // Effective groupBy overrides the left-panel groupBy1/2 during drill
  // L0: both fields  L1: only groupBy2 (one level left)  L2: none (row mode)
  const effectiveGroupBy1 = drillLevel === 0 ? groupBy1 : drillLevel === 1 ? groupBy2 : "";
  const effectiveGroupBy2 = drillLevel === 0 ? groupBy2 : "";

  // ── Drill handlers ──────────────────────────────────────────────────────────
  const handleDrillGroup1 = (g0Val: string) => {
    setDrillFilters([{ field: groupBy1, value: g0Val === "—" ? null : g0Val }]);
    setDrillLevel(1);
    setDrillPath([g0Val]);
    setOffset(0);
  };

  const handleDrillGroup2 = (g0Val: string, g1Val: string) => {
    setDrillFilters([
      { field: groupBy1, value: g0Val === "—" ? null : g0Val },
      { field: groupBy2, value: g1Val === "—" ? null : g1Val },
    ]);
    setDrillLevel(2);
    setDrillPath([g0Val, g1Val]);
    setOffset(0);
  };

  const handleDrillSingleRow = (gVal: string) => {
    setDrillFilters(prev => [...prev, { field: groupBy2, value: gVal === "—" ? null : gVal }]);
    setDrillLevel(2);
    setDrillPath(prev => [...prev, gVal]);
    setOffset(0);
  };

  // Single-level grouped view (only groupBy1 set) — clicking a row goes straight to detail
  const handleDrillSingleGroup = (gVal: string) => {
    setDrillFilters([{ field: groupBy1, value: gVal === "—" ? null : gVal }]);
    setDrillLevel(2);
    setDrillPath([gVal]);
    setOffset(0);
  };

  const handleDrillBack = (toLevel: number) => {
    if (toLevel === 0) {
      setDrillFilters([]);
      setDrillLevel(0);
      setDrillPath([]);
    } else if (toLevel === 1) {
      setDrillFilters(f => f.slice(0, 1));
      setDrillLevel(1);
      setDrillPath(p => p.slice(0, 1));
    }
    setOffset(0);
  };

  // ── Browser Back interception ───────────────────────────────────────────────
  // Keep stable refs so the popstate listener always reads the latest values
  // without being re-registered on every render.
  const drillLevelRef     = useRef(drillLevel);
  drillLevelRef.current   = drillLevel;
  const handleDrillBackRef = useRef<(toLevel: number) => void>(handleDrillBack);
  handleDrillBackRef.current = handleDrillBack;

  // Track the previous drillLevel so we only push a sentinel when drilling IN.
  const prevDrillLevelRef = useRef(drillLevel);
  useEffect(() => {
    const prev = prevDrillLevelRef.current;
    prevDrillLevelRef.current = drillLevel;
    if (drillLevel > prev) {
      // Push a history sentinel so the browser Back button can be intercepted.
      window.history.pushState({ drillSentinel: true, level: drillLevel }, "");
    }
  }, [drillLevel]);

  // Intercept browser Back while inside the report builder.
  // Each popstate pops one drill level; when the stack is empty the browser
  // navigates naturally (exits the report).
  useEffect(() => {
    const onPopState = (_e: PopStateEvent) => {
      const level = drillLevelRef.current;
      if (level > 0) {
        // Consume the back press: go up one drill level.
        handleDrillBackRef.current(level - 1);
        // Do NOT re-push here — the next drill-in effect will push if needed,
        // and the remaining sentinels in history cover the remaining levels.
      }
      // level === 0: allow the browser to continue navigating away.
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []); // register once on mount, unregister on unmount

  // ── Debounced query config (500ms) ─────────────────────────────────────────
  // Compute initial effective groupBy considering restored drill level
  const _initDrillLevel   = _savedDrill?.level   ?? 0;
  const _initDrillFilters = _savedDrill?.filters ?? ([] as DrillFilter[]);
  const _initEffGb1 = _initDrillLevel === 0 ? initGroupBy1 : _initDrillLevel === 1 ? initGroupBy2 : "";
  const _initEffGb2 = _initDrillLevel === 0 ? initGroupBy2 : "";
  const [debouncedCfg, setDebouncedCfg] = useState<QueryConfig>({
    fields: initFields, filters: initFilters,
    groupBy1: _initEffGb1, groupBy2: _initEffGb2, offset: 0,
    drillFilters: _initDrillFilters,
    sortLevels: [],
    includedModules: [],
    moduleGrainModes: {},
    includeRideshare: true,
  });

  useEffect(() => {
    // Reset offset (and drill) when the base config changes
    setOffset(0);
    setDrillLevel(0);
    setDrillFilters([]);
    setDrillPath([]);
  }, [selectedFields, filters, groupLevels, includedModules]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedCfg({
        fields: selectedFields, filters,
        groupBy1: effectiveGroupBy1, groupBy2: effectiveGroupBy2,
        offset, drillFilters,
        sortLevels,
        includedModules,
        moduleGrainModes,
        includeRideshare,
      });
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFields, filters, effectiveGroupBy1, effectiveGroupBy2, offset, drillFilters, sortLevels, includedModules, moduleGrainModes, includeRideshare]);

  // ── Preview query ──────────────────────────────────────────────────────────
  const { data: previewData, isLoading, isError, isFetching } = useQuery<PreviewResult>({
    queryKey: ["/api/reports/custom/drivers/preview", debouncedCfg],
    queryFn: () =>
      fetch(buildPreviewUrl(debouncedCfg), { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error("Preview failed"); return r.json(); }),
    enabled: subject === "Drivers" && debouncedCfg.fields.length > 0,
    placeholderData: prev => prev,
  });

  // ── Saved report fetch (when opening an existing report from the library) ───
  // Fetches the definitive report data and applies it to builder state.
  const {
    data:    savedReport,
    isLoading: reportLoading,
    isError:   reportLoadError,
  } = useQuery<{
    id: string; name: string; description: string | null; subject: string;
    isPublic: boolean; isSystem: boolean; config: Record<string, unknown> | null;
    isFavorite: boolean;
  }>({
    queryKey: ["/api/reports/custom", initReportId],
    queryFn: () =>
      fetch(`/api/reports/custom/${initReportId}`, { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    enabled: !!initReportId,
    staleTime: 30_000,
    retry: 1,
  });

  // Apply the fetched report's data to builder state exactly once.
  const reportAppliedRef = useRef(false);
  useEffect(() => {
    if (!savedReport || reportAppliedRef.current) return;
    reportAppliedRef.current = true;

    setName(savedReport.name || "Untitled Report");
    setDescription(savedReport.description || "");
    setIsPublic(savedReport.isPublic ?? false);
    setIsFavorited(savedReport.isFavorite ?? false);

    const cfg = (savedReport.config ?? {}) as Record<string, unknown>;

    // Restore saved fields — filter against the known catalogue so stale or
    // renamed keys are silently dropped, but always fall back to DEFAULT_FIELDS
    // if nothing valid remains rather than leaving the builder empty.
    const cfgFields = Array.isArray(cfg.fields)
      ? (cfg.fields as string[]).filter(f => validFieldKeys.includes(f))
      : [];
    setSelectedFields(cfgFields.length ? cfgFields : DEFAULT_FIELDS);

    // Restore filter state — new filters array format with backward-compat fallback
    if (Array.isArray(cfg.filters) && (cfg.filters as FilterRow[]).length > 0) {
      setFilters(cfg.filters as FilterRow[]);
    } else if (cfg.filterField) {
      // Legacy single-filter format
      setFilters([{ id: "default", field: String(cfg.filterField), op: "eq", value: cfg.filterValue ? String(cfg.filterValue) : "" }]);
    } else {
      setFilters([]);
    }

    // Always restore groupBy state (including when cleared)
    const cfgGroupBy = Array.isArray(cfg.groupBy) ? (cfg.groupBy as string[]).filter(Boolean).slice(0, 2) : [];
    setGroupLevels(cfgGroupBy);

    // Restore sort state — new sortLevels array format with backward-compat fallback
    if (Array.isArray(cfg.sortLevels)) {
      setSortLevels((cfg.sortLevels as SortLevel[]).filter(sl => sl.field));
    } else {
      const lvls: SortLevel[] = [];
      const cfgSortBy1 = typeof cfg.sortBy1 === "string" ? cfg.sortBy1 : "";
      if (cfgSortBy1) lvls.push({ field: cfgSortBy1, dir: cfg.sortDir1 === "desc" ? "desc" : "asc" });
      const cfgSortBy2 = typeof cfg.sortBy2 === "string" ? cfg.sortBy2 : "";
      if (cfgSortBy2) lvls.push({ field: cfgSortBy2, dir: cfg.sortDir2 === "desc" ? "desc" : "asc" });
      setSortLevels(lvls);
    }

    // Restore included related modules + grain modes
    const cfgModules = Array.isArray(cfg.includedModules) ? (cfg.includedModules as string[]) : [];
    setIncludedModules(cfgModules);
    const cfgGrainModes = cfg.moduleGrainModes && typeof cfg.moduleGrainModes === "object" && !Array.isArray(cfg.moduleGrainModes)
      ? (cfg.moduleGrainModes as Record<string, RelationshipMode>)
      : {};
    setModuleGrainModes(cfgGrainModes);

    // Restore financial options
    setIncludeRideshare(cfg.includeRideshare !== false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedReport]);

  // ── Save ───────────────────────────────────────────────────────────────────
  // Helper: build the base config payload (always the base state, never drill position)
  const buildReportConfig = () => ({
    fields:           selectedFields,
    filters:          filters.filter(f => f.field && f.op).length > 0 ? filters.filter(f => f.field && f.op) : null,
    groupBy:          groupLevels.filter(Boolean),
    sortLevels:       sortLevels.filter(sl => sl.field).length > 0 ? sortLevels.filter(sl => sl.field) : null,
    includedModules:  includedModules.length > 0 ? includedModules : null,
    moduleGrainModes: Object.keys(moduleGrainModes).length > 0 ? moduleGrainModes : null,
    includeRideshare: includeRideshare ? undefined : false,
  });

  // CREATE — new report (first save or Save As)
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/reports/custom", data).then(r => r.json()),
    onSuccess: (result: any) => {
      const newId: string = result.id;
      setSavedReportId(newId);
      setSaveModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/reports/custom"] });
      toast({ title: "Report saved", description: "Available in My Reports." });
      // Reflect the reportId in the URL (replaceState — no new history entry)
      const p = new URLSearchParams(window.location.search);
      p.set("reportId", newId);
      window.history.replaceState(null, "", `/reports/custom/builder?${p.toString()}`);
    },
    onError: () => toast({ title: "Failed to save report", variant: "destructive" }),
  });

  // UPDATE — existing report (subsequent Save presses)
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/reports/custom/${id}`, data),
    onSuccess: (_data, variables) => {
      // Invalidate both the list and the individual report so stale config
      // is never served when the user navigates back within the staleTime window.
      queryClient.invalidateQueries({ queryKey: ["/api/reports/custom"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/custom", variables.id] });
      toast({ title: "Report updated" });
    },
    onError: () => toast({ title: "Failed to update report", variant: "destructive" }),
  });

  // Called when the Save modal submits (first save or Save As)
  const handleModalSave = (data: { name: string; description: string | null; isPublic: boolean }) => {
    setName(data.name);
    setDescription(data.description || "");
    setIsPublic(data.isPublic);
    createMutation.mutate({
      name:        data.name,
      description: data.description,
      subject,
      isPublic:    data.isPublic,
      config:      buildReportConfig(),
    });
  };

  // Save button click handler
  const handleSave = () => {
    if (savedReportId) {
      // Existing report — update directly (validate name in right panel)
      const trimmed = name.trim();
      if (!trimmed) {
        toast({ title: "Report name is required", variant: "destructive" });
        return;
      }
      updateMutation.mutate({
        id:   savedReportId,
        data: { name: trimmed, description: description || null, subject, isPublic, config: buildReportConfig() },
      });
    } else {
      // New report — open Save modal
      setIsSaveAs(false);
      setSaveModalOpen(true);
    }
  };

  // Save As — always opens modal, creates a new copy
  const handleSaveAs = () => {
    setIsSaveAs(true);
    setSaveModalOpen(true);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ── Export ─────────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting || selectedFields.length === 0) return;
    setExporting(true);
    try {
      const p = new URLSearchParams();
      p.set("fields",      selectedFields.join(","));
      p.set("reportName",  name.trim() || "Report");
      const activeExportFilters = filters.filter(f => f.field && f.op);
      if (activeExportFilters.length > 0) p.set("filters", JSON.stringify(activeExportFilters));
      // In grouped view: pass both groupBy fields (unless drilled past them)
      const exportGroupBy = [
        drillLevel === 0 ? groupBy1 : drillLevel === 1 ? groupBy2 : "",
        drillLevel === 0 ? groupBy2 : "",
      ].filter(Boolean);
      if (exportGroupBy.length) p.set("groupBy", exportGroupBy.join(","));
      // Drill filters carry the active sub-selection context
      if (drillFilters.length) p.set("drillFilters", JSON.stringify(drillFilters));
      const activeSorts = sortLevels.filter(sl => sl.field);
      if (activeSorts.length > 0) p.set("sort", JSON.stringify(activeSorts));
      // Related module data + grain modes
      if (includedModules.length > 0) p.set("includedModules", includedModules.join(","));
      if (Object.keys(moduleGrainModes).length > 0) p.set("grainModes", JSON.stringify(moduleGrainModes));

      const res = await fetch(`/api/reports/custom/drivers/export?${p.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);

      // Trigger browser download
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const cd   = res.headers.get("Content-Disposition") || "";
      const fnMatch = cd.match(/filename="([^"]+)"/);
      a.href     = url;
      a.download = fnMatch ? fnMatch[1] : "Report.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // ── Pagination ─────────────────────────────────────────────────────────────
  const handleLoadMore = () => {
    if (previewData?.mode === "rows") setOffset(previewData.offset + previewData.limit);
  };

  // ── Level 4: row click → Driver Detail page ────────────────────────────────
  // Save full drill context to sessionStorage so remounting on Back restores Level 3.
  const handleDrillRow = (driverId: string) => {
    try {
      sessionStorage.setItem("reportBuilder.drillState", JSON.stringify({
        reportId: savedReportId || initReportId || null, // tag so stale state from another report is discarded
        level:    drillLevel,
        filters:  drillFilters,
        path:     drillPath,
      }));
      // Store the builder's full URL so Driver Detail's error page can offer
      // "Back to Report" instead of "Back to Drivers".
      sessionStorage.setItem("reportBuilder.returnUrl", window.location.pathname + window.location.search);
    } catch { /* ignore quota errors */ }
    navigate(`/drivers/${driverId}`);
  };

  // ── Result stats ───────────────────────────────────────────────────────────
  const resultCount = previewData?.rows.length ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 h-12 border-b bg-background flex-wrap">
        <Link href="/reports/custom">
          <Button variant="ghost" size="sm" className="shrink-0 -ml-1">
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
        </Link>

        {reportLoading && initReportId ? (
          <Skeleton className="h-5 w-48" />
        ) : (
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="h-7 text-sm font-semibold border-0 shadow-none focus-visible:ring-1 w-52 sm:w-64 bg-transparent px-2"
            data-testid="input-report-name"
            onFocus={e => { if (e.target.value === "Untitled Report") e.target.select(); }}
          />
        )}

        {subjectDef && (
          <Badge variant="secondary" className="gap-1.5 shrink-0" data-testid="badge-selected-subject">
            <SubjectIcon className={`h-3 w-3 ${subjectDef.color}`} />
            {subject}
          </Badge>
        )}

        {savedReportId && (
          <Badge
            variant="outline"
            className="gap-1 shrink-0 text-xs text-muted-foreground"
            data-testid="badge-saved-report"
          >
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            Saved
          </Badge>
        )}

        {/* Fetching indicator */}
        <div className="ml-auto shrink-0">
          {(isFetching || reportLoading) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* ── 3-panel body ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left — resizable; drag the right edge to resize */}
        <div
          className="relative shrink-0 border-r flex flex-col overflow-hidden"
          style={{ width: panelWidth }}
          data-testid="panel-left"
        >
          <div className="shrink-0 px-4 py-2 border-b">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configuration</p>
          </div>
          <LeftPanel
            subject={subject}
            selectedFields={selectedFields} setSelectedFields={setSelectedFields}
            filters={filters}               setFilters={setFilters}
            groupLevels={groupLevels}       setGroupLevels={setGroupLevels}
            sortLevels={sortLevels}         setSortLevels={setSortLevels}
            includedModules={includedModules} setIncludedModules={setIncludedModules}
            moduleGrainModes={moduleGrainModes} setModuleGrainMode={setModuleGrainMode}
            userRole={role}
            includeRideshare={includeRideshare} setIncludeRideshare={setIncludeRideshare}
          />
          {/* Drag handle — sits on top of the right border */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 group"
            onMouseDown={startResize}
            data-testid="resize-handle-panel"
          >
            <div className="absolute inset-y-0 right-0 w-px group-hover:bg-primary/40 group-active:bg-primary/60 transition-colors" />
          </div>
        </div>

        {/* Center */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Report load error — shown when the saved report could not be fetched */}
          {reportLoadError && initReportId && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <FileBarChart className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <p className="font-semibold text-sm">Report could not be loaded</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This report may have been deleted or you may not have access to it.
                </p>
              </div>
              <Link href="/reports/custom">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-1" />Return to Report Library
                </Button>
              </Link>
            </div>
          )}

          {/* Normal center content — hidden while report load error is showing */}
          {!(reportLoadError && initReportId) && <>

          {/* Center header: title + badges + breadcrumb + filter chip */}
          <div className="shrink-0 px-4 py-2 border-b flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Report Preview</p>
            {previewData && resultCount > 0 && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {resultCount} {previewData.mode === "grouped" ? "groups" : "rows"}
              </Badge>
            )}

            {/* Drill breadcrumb */}
            {drillLevel > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* ← Back button — moves up one level */}
                <button
                  onClick={() => handleDrillBack(drillLevel - 1)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="btn-drill-back-one"
                  aria-label="Go back one level"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </button>
                <span className="text-muted-foreground/40 text-xs select-none">|</span>

                {/* Breadcrumb path */}
                <div className="flex items-center gap-1 text-xs flex-wrap">
                  <button
                    onClick={() => handleDrillBack(0)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    data-testid="btn-drill-back-root"
                  >
                    {subject}
                  </button>
                  {drillPath.map((label, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                      {i < drillPath.length - 1 ? (
                        <button
                          onClick={() => handleDrillBack(i + 1)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          data-testid={`btn-drill-back-${i + 1}`}
                        >
                          {label}
                        </button>
                      ) : (
                        <span className="font-semibold text-foreground">{label}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Active filter chips */}
            {drillLevel === 0 && filters.filter(f => f.field && f.op).map((fr, i) => {
              const labelMap = frontendRegistry.getLabelMap(subject.toLowerCase());
              const opLabel  = FILTER_OPS.find(o => o.value === fr.op)?.label ?? fr.op;
              const opDef    = FILTER_OPS.find(o => o.value === fr.op);
              return (
                <Badge key={fr.id ?? i} variant="outline" className="text-xs gap-1 shrink-0">
                  {labelMap[fr.field] ?? fr.field} {opLabel.toLowerCase()}{opDef?.hasValue && fr.value ? `: ${fr.value}` : ""}
                </Badge>
              );
            })}
          </div>

          {/* Grain indicator — shown when any related module is in "all_records" mode */}
          {(() => {
            const allRecordsModules = includedModules.filter(
              m => (moduleGrainModes[m] ?? "all_records") === "all_records" &&
                   frontendRegistry.getRelationship(subject.toLowerCase(), m)?.supportsPrimaryOnly,
            );
            if (allRecordsModules.length === 0) return null;
            const labels = allRecordsModules.map(m => {
              const s = frontendRegistry.getSubject(m);
              return s?.label ?? m;
            });
            const grainLabel = [subject, ...labels].join(" × ");
            return (
              <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Row grain changed to {grainLabel}
                </span>
                <span className="text-[10px] text-amber-600/70 dark:text-amber-500/70">
                  — driver rows may be duplicated
                </span>
              </div>
            );
          })()}

          <div className="flex-1 overflow-hidden">
            <CenterPanel
              subject={subject}
              selectedFields={selectedFields}
              previewData={previewData}
              isLoading={isLoading || (!!initReportId && reportLoading)}
              isError={isError}
              onLoadMore={handleLoadMore}
              onDrillGroup1={groupBy1 && groupBy2 ? handleDrillGroup1 : undefined}
              onDrillGroup2={groupBy1 && groupBy2 ? handleDrillGroup2 : undefined}
              onDrillSingleRow={
                drillLevel === 0 && groupBy1 && !groupBy2 ? handleDrillSingleGroup :
                drillLevel === 1 && groupBy2 ? handleDrillSingleRow :
                undefined
              }
              onDrillRow={handleDrillRow}
              sortLevels={sortLevels}
              includedModules={includedModules}
            />
          </div>

          </>}
        </div>

        {/* Right */}
        <div className="w-44 shrink-0 border-l flex flex-col overflow-hidden">
          <div className="shrink-0 px-4 py-2 border-b">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
          </div>
          <RightPanel
            name={name}               setName={setName}
            description={description} setDescription={setDescription}
            isPublic={isPublic}       setIsPublic={setIsPublic}
            onSave={handleSave}       saving={isSaving}
            saveDisabled={selectedFields.length === 0}
            hasSavedReport={!!savedReportId}
            onSaveAs={handleSaveAs}
            onExport={handleExport}   exporting={exporting}
            isFavorited={isFavorited} onToggleFavorite={() => setIsFavorited(f => !f)}
            onSchedule={() => toast({ title: "Schedule coming soon" })}
          />
        </div>

      </div>

      {/* Save Report Modal */}
      <SaveReportModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleModalSave}
        saving={createMutation.isPending}
        isSaveAs={isSaveAs}
      />
    </div>
  );
}
