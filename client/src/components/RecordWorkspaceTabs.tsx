import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface WorkspaceTab {
  value: string;
  label: string;
  badge?: number;
  hidden?: boolean;
}

interface RecordWorkspaceTabsProps {
  tabs: WorkspaceTab[];
  activeTab: string;
  onTabChange: (value: string) => void;
  className?: string;
}

export function RecordWorkspaceTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
}: RecordWorkspaceTabsProps) {
  const visibleTabs = tabs.filter((t) => !t.hidden);
  const overflowTabs = tabs.filter((t) => t.hidden);

  return (
    <div
      className={cn("overflow-x-auto border-t border-border", className)}
      data-testid="record-workspace-tabs"
    >
      <div className="flex items-center min-w-max">
        {visibleTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            data-testid={`workspace-tab-${tab.value}`}
            className={cn(
              "relative px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
              activeTab === tab.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {tab.badge > 99 ? "99+" : tab.badge}
              </span>
            )}
          </button>
        ))}
        {overflowTabs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "relative px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
                  overflowTabs.some((tab) => tab.value === activeTab)
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                data-testid="workspace-tab-more"
              >
                <MoreHorizontal className="mr-1 inline-block h-3.5 w-3.5" />
                More
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflowTabs.map((tab) => (
                <DropdownMenuItem key={tab.value} onClick={() => onTabChange(tab.value)}>
                  {tab.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
