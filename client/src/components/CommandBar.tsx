import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "wouter";
import { Search, X, SlidersHorizontal, MoreHorizontal } from "lucide-react";

export interface CommandBarView {
  value: string;
  label: string;
}

export interface CommandBarSortOption {
  value: string;
  label: string;
}

/** Structured item for the tablet overflow (⋯) menu. */
export interface CommandBarMenuItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  testId?: string;
}

export interface CommandBarProps {
  title: string;
  titleExtra?: React.ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  views?: CommandBarView[];
  currentView?: string;
  onViewChange?: (view: string) => void;
  /** Advanced filters — shown in a "Filters" popover button. */
  filtersContent?: React.ReactNode;
  /** Primary filter controls rendered inline between the view selector and the Filters button. */
  quickFilters?: React.ReactNode;
  /** Quick-access filters — always-visible inline row below the bar. */
  inlineFiltersContent?: React.ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
  sortOptions?: CommandBarSortOption[];
  currentSort?: string;
  onSortChange?: (value: string) => void;
  primaryActionLabel?: string;
  primaryActionHref?: string;
  onPrimaryAction?: () => void;
  /** Full button nodes shown inline on desktop (lg+). */
  extraActions?: React.ReactNode;
  /** Structured items collapsed into the ⋯ overflow menu on tablet (<lg). */
  menuItems?: CommandBarMenuItem[];
  className?: string;
  /** Hide the title block (page header owns the title instead). Default: false */
  hideTitle?: boolean;
  /** Whether the bar should be position:sticky. Default: true */
  sticky?: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function CommandBarSearch({
  placeholder = "Search...",
  value,
  onChange,
  debounceMs = 350,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  debounceMs?: number;
}) {
  const [local, setLocal] = useState(value ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value ?? "");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange?.(v), debounceMs);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (timerRef.current) clearTimeout(timerRef.current);
      onChange?.(local);
    }
    if (e.key === "Escape") {
      setLocal("");
      if (timerRef.current) clearTimeout(timerRef.current);
      onChange?.("");
    }
  };

  const handleClear = () => {
    setLocal("");
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange?.("");
  };

  return (
    <div className="relative flex-1 min-w-[180px] max-w-[280px] xl:max-w-xs" data-testid="commandbar-search-wrapper">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <Input
        value={local}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="pl-8 pr-8 h-9 text-sm border-[#cfd4df] dark:border-border"
        data-testid="commandbar-search-input"
      />
      {local && (
        <button
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          data-testid="commandbar-search-clear"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function CommandBarViewSelector({
  views,
  currentView,
  onViewChange,
}: {
  views: CommandBarView[];
  currentView?: string;
  onViewChange?: (v: string) => void;
}) {
  return (
    <Select value={currentView} onValueChange={onViewChange}>
      <SelectTrigger
        className="h-9 text-sm w-[130px] xl:w-[160px] shrink-0 border-[#cfd4df] dark:border-border"
        data-testid="commandbar-view-selector"
      >
        <SelectValue placeholder="Select view" />
      </SelectTrigger>
      <SelectContent>
        {views.map((v) => (
          <SelectItem key={v.value} value={v.value} data-testid={`view-option-${v.value}`}>
            {v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CommandBarFilters({
  children,
  activeFilterCount = 0,
  onClearFilters,
}: {
  children: React.ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="default"
          className="h-9 gap-2 shrink-0 border-[#d7dbe4] dark:border-border"
          data-testid="commandbar-filters-button"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="text-sm">Filters</span>
          {activeFilterCount > 0 && (
            <Badge
              variant="default"
              className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] font-bold no-default-active-elevate"
              data-testid="commandbar-filter-count"
            >
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-4"
        align="start"
        data-testid="commandbar-filters-panel"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">Filters</span>
          {activeFilterCount > 0 && onClearFilters && (
            <button
              onClick={() => { onClearFilters(); setOpen(false); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              data-testid="commandbar-filters-clear"
              type="button"
            >
              <X className="h-3 w-3" />
              Clear all
            </button>
          )}
        </div>
        <div className="space-y-4">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function CommandBarSort({
  options,
  currentSort,
  onSortChange,
}: {
  options: CommandBarSortOption[];
  currentSort?: string;
  onSortChange?: (v: string) => void;
}) {
  return (
    <Select value={currentSort ?? "__none"} onValueChange={(v) => onSortChange?.(v === "__none" ? "" : v)}>
      <SelectTrigger
        className="h-9 text-sm w-[160px] xl:w-[180px] shrink-0 border-[#cfd4df] dark:border-border"
        data-testid="commandbar-sort-selector"
      >
        <SelectValue placeholder="Sort by…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">Default sort</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} data-testid={`sort-option-${o.value}`}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CommandBarPrimaryAction({
  label,
  href,
  onClick,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  if (href) {
    return (
      <Link href={href}>
        <Button className="shrink-0 h-9 bg-[#5737f2] hover:bg-[#4a2bd3] text-white" data-testid="commandbar-primary-action">
          {label}
        </Button>
      </Link>
    );
  }
  return (
    <Button onClick={onClick} className="shrink-0 h-9 bg-[#5737f2] hover:bg-[#4a2bd3] text-white" data-testid="commandbar-primary-action">
      {label}
    </Button>
  );
}

// ─── Main CommandBar ──────────────────────────────────────────────────────────

export function CommandBar({
  title,
  titleExtra,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  views,
  currentView,
  onViewChange,
  filtersContent,
  quickFilters,
  inlineFiltersContent,
  activeFilterCount = 0,
  onClearFilters,
  sortOptions,
  currentSort,
  onSortChange,
  primaryActionLabel,
  primaryActionHref,
  onPrimaryAction,
  extraActions,
  menuItems,
  className,
  hideTitle = false,
  sticky = true,
}: CommandBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryAction = primaryActionLabel ? (
    <CommandBarPrimaryAction
      label={primaryActionLabel}
      href={primaryActionHref}
      onClick={onPrimaryAction}
    />
  ) : null;

  const overflowMenuButton =
    menuItems && menuItems.length > 0 ? (
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            data-testid="commandbar-more-menu"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-48 p-1"
          data-testid="commandbar-more-menu-content"
        >
          {menuItems.map((item) => {
            const inner = (
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm hover:bg-accent cursor-pointer"
                data-testid={item.testId}
              >
                {item.icon && (
                  <span className="shrink-0 opacity-70 [&_svg]:h-4 [&_svg]:w-4">{item.icon}</span>
                )}
                <span>{item.label}</span>
              </div>
            );
            return item.href ? (
              <Link key={item.label} href={item.href} onClick={() => setMoreOpen(false)}>
                {inner}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                className="w-full text-left"
                onClick={() => {
                  item.onClick?.();
                  setMoreOpen(false);
                }}
              >
                {inner}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    ) : null;

  return (
    <div
      className={`${sticky ? "sticky top-0 z-50 " : ""}bg-background border-b border-border ${className ?? ""}`}
      data-testid="commandbar"
    >
      {/*
        ── Responsive layout strategy ─────────────────────────────────────────
        flex-wrap is on the outer div.

        Tablet (<lg):
          • Title div has w-full  → takes full first row, forces controls below
          • Title row shows: [title + extra]  [overflow menu]  [New Claim]
          • Controls (search/views/filters/sort) wrap to their own row below
          • extraActions are hidden; menu items are in the ⋯ overflow menu

        Desktop (lg+):
          • Title div has w-auto  → sits inline with the controls
          • All controls share one row: title | search | views | filters | sort | extra actions | new claim
          • ⋯ overflow button is hidden
      */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">

        {/* ── Title block ── full-width on tablet, auto on desktop ─────────── */}
        {!hideTitle && (
          <div className="w-full xl:w-auto flex items-center justify-between xl:justify-start xl:mr-1 shrink-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-bold tracking-tight text-[#182039] dark:text-foreground" data-testid="commandbar-title">
                {title}
              </h1>
              {titleExtra}
            </div>
            {/* Tablet-only: overflow menu + primary action pinned to right */}
            <div className="flex xl:hidden items-center gap-2">
              {overflowMenuButton}
              {primaryAction}
            </div>
          </div>
        )}
        {/* When title is hidden, tablet still needs the overflow menu */}
        {hideTitle && overflowMenuButton && (
          <div className="flex xl:hidden w-full items-center justify-end gap-2">
            {overflowMenuButton}
          </div>
        )}

        {/* ── Controls (wrap to row 2 on tablet) ─────────────────────────── */}
        {onSearchChange !== undefined && (
          <CommandBarSearch
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={onSearchChange}
          />
        )}

        {views && views.length > 0 && (
          <CommandBarViewSelector
            views={views}
            currentView={currentView}
            onViewChange={onViewChange}
          />
        )}

        {quickFilters}

        {filtersContent && (
          <CommandBarFilters
            activeFilterCount={activeFilterCount}
            onClearFilters={onClearFilters}
          >
            {filtersContent}
          </CommandBarFilters>
        )}

        {sortOptions && sortOptions.length > 0 && (
          <CommandBarSort
            options={sortOptions}
            currentSort={currentSort}
            onSortChange={onSortChange}
          />
        )}

        {/* ── Desktop-only actions (hidden on tablet) ─────────────────────── */}
        {(extraActions || primaryActionLabel) && (
          <div className="hidden xl:flex items-center gap-2 shrink-0 ml-auto">
            {extraActions}
            {primaryAction}
          </div>
        )}
      </div>

      {/* ── Inline quick-access filters row — desktop (xl+) only ─────────── */}
      {/* On tablet (<xl) all filters live in the Filters popover instead  */}
      {inlineFiltersContent && (
        <div
          className="hidden xl:flex border-t border-[#e4e7ee] dark:border-border bg-[#f7f8fc] dark:bg-background px-4 py-2.5 items-end gap-3 flex-wrap"
          data-testid="commandbar-inline-filters"
        >
          {inlineFiltersContent}
          {activeFilterCount > 0 && onClearFilters && (
            <button
              onClick={onClearFilters}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 self-end pb-0.5"
              data-testid="commandbar-inline-filters-clear"
              type="button"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
