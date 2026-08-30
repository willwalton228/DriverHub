import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  UserPlus,
  AlertTriangle,
  FileWarning,
  CheckCircle,
  Search,
  Plus,
  ChevronDown,
  Lock,
  Globe,
  User,
  Trash2,
  Copy,
  MoreHorizontal,
  Bookmark,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SavedViewFilters = {
  market?: string;
  stage?: string;
  readinessStatus?: string;
  slaBreached?: boolean;
  tags?: string[];
  requisitionId?: string;
  assignedTo?: string;
  includeArchived?: boolean;
  dateRange?: {
    field: string;
    start?: string;
    end?: string;
  };
  searchQuery?: string;
};

export type SavedView = {
  id: string;
  name: string;
  description?: string | null;
  type: "private" | "shared" | "system";
  icon?: string | null;
  color?: string | null;
  filters: SavedViewFilters;
  sortBy?: string | null;
  sortOrder?: string | null;
  createdBy?: string | null;
  market?: string | null;
  displayOrder?: number | null;
  usageCount?: number | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
};

const iconMap: Record<string, LucideIcon> = {
  Users: Users,
  UserPlus: UserPlus,
  AlertTriangle: AlertTriangle,
  FileWarning: FileWarning,
  CheckCircle: CheckCircle,
  Search: Search,
  Bookmark: Bookmark,
};

const colorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

interface SavedViewsSelectorProps {
  selectedViewId: string | null;
  onSelectView: (view: SavedView | null) => void;
  currentFilters: SavedViewFilters;
}

export function SavedViewsSelector({
  selectedViewId,
  onSelectView,
  currentFilters,
}: SavedViewsSelectorProps) {
  const { toast } = useToast();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewDescription, setViewDescription] = useState("");
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const [viewToDuplicate, setViewToDuplicate] = useState<string | null>(null);

  const { data: savedViews = [], isLoading } = useQuery<SavedView[]>({
    queryKey: ["/api/recruiting/saved-views"],
  });

  const createViewMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; filters: SavedViewFilters }) => {
      return apiRequest("POST", "/api/recruiting/saved-views", {
        ...data,
        type: "private",
        icon: "Bookmark",
        color: "blue",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/saved-views"] });
      setSaveDialogOpen(false);
      setViewName("");
      setViewDescription("");
      toast({
        title: "View saved",
        description: "Your custom view has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save view.",
        variant: "destructive",
      });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (viewId: string) => {
      return apiRequest("DELETE", `/api/recruiting/saved-views/${viewId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/saved-views"] });
      toast({
        title: "View deleted",
        description: "The view has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete view.",
        variant: "destructive",
      });
    },
  });

  const duplicateViewMutation = useMutation({
    mutationFn: async ({ viewId, name }: { viewId: string; name: string }) => {
      return apiRequest("POST", `/api/recruiting/saved-views/${viewId}/duplicate`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/saved-views"] });
      setDuplicateDialogOpen(false);
      setDuplicateName("");
      setViewToDuplicate(null);
      toast({
        title: "View duplicated",
        description: "The view has been copied to your personal views.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to duplicate view.",
        variant: "destructive",
      });
    },
  });

  const selectedView = savedViews.find((v) => v.id === selectedViewId);

  const systemViews = savedViews.filter((v) => v.type === "system");
  const sharedViews = savedViews.filter((v) => v.type === "shared");
  const privateViews = savedViews.filter((v) => v.type === "private");

  const hasActiveFilters =
    currentFilters.market ||
    currentFilters.stage ||
    currentFilters.readinessStatus ||
    currentFilters.slaBreached ||
    (currentFilters.tags && currentFilters.tags.length > 0) ||
    currentFilters.requisitionId ||
    currentFilters.assignedTo ||
    currentFilters.searchQuery;

  const getIcon = (iconName?: string | null): LucideIcon => {
    if (!iconName) return Bookmark;
    return iconMap[iconName] || Bookmark;
  };

  const getColorClass = (color?: string | null): string => {
    if (!color) return colorMap.blue;
    return colorMap[color] || colorMap.blue;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "system":
        return <Lock className="h-3 w-3" />;
      case "shared":
        return <Globe className="h-3 w-3" />;
      default:
        return <User className="h-3 w-3" />;
    }
  };

  const handleSaveCurrentFilters = () => {
    if (!viewName.trim()) return;
    createViewMutation.mutate({
      name: viewName.trim(),
      description: viewDescription.trim() || undefined,
      filters: currentFilters,
    });
  };

  const handleDuplicate = (viewId: string, originalName: string) => {
    setViewToDuplicate(viewId);
    setDuplicateName(`${originalName} (Copy)`);
    setDuplicateDialogOpen(true);
  };

  const handleConfirmDuplicate = () => {
    if (viewToDuplicate && duplicateName.trim()) {
      duplicateViewMutation.mutate({ viewId: viewToDuplicate, name: duplicateName.trim() });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-9 w-40 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="min-w-[180px] justify-between gap-2"
            data-testid="saved-views-dropdown"
          >
            {selectedView ? (
              <span className="flex items-center gap-2">
                {(() => {
                  const Icon = getIcon(selectedView.icon);
                  return <Icon className="h-4 w-4" />;
                })()}
                {selectedView.name}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                All Applications
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px]">
          <DropdownMenuItem
            onClick={() => onSelectView(null)}
            className="flex items-center justify-between"
            data-testid="view-all-applications"
          >
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              All Applications
            </span>
            {!selectedViewId && <CheckCircle className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>

          {systemViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Work Queues
              </div>
              {systemViews.map((view) => {
                const Icon = getIcon(view.icon);
                return (
                  <DropdownMenuItem
                    key={view.id}
                    onClick={() => onSelectView(view)}
                    className="flex items-center justify-between group"
                    data-testid={`view-${view.name.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <span className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`${getColorClass(view.color)} h-5 w-5 p-0 flex items-center justify-center`}
                      >
                        <Icon className="h-3 w-3" />
                      </Badge>
                      {view.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {selectedViewId === view.id && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleDuplicate(view.id, view.name)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy to My Views
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </>
          )}

          {sharedViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Shared Views
              </div>
              {sharedViews.map((view) => {
                const Icon = getIcon(view.icon);
                return (
                  <DropdownMenuItem
                    key={view.id}
                    onClick={() => onSelectView(view)}
                    className="flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`${getColorClass(view.color)} h-5 w-5 p-0 flex items-center justify-center`}
                      >
                        <Icon className="h-3 w-3" />
                      </Badge>
                      {view.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {selectedViewId === view.id && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleDuplicate(view.id, view.name)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy to My Views
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </>
          )}

          {privateViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                My Views
              </div>
              {privateViews.map((view) => {
                const Icon = getIcon(view.icon);
                return (
                  <DropdownMenuItem
                    key={view.id}
                    onClick={() => onSelectView(view)}
                    className="flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`${getColorClass(view.color)} h-5 w-5 p-0 flex items-center justify-center`}
                      >
                        <Icon className="h-3 w-3" />
                      </Badge>
                      {view.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {selectedViewId === view.id && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleDuplicate(view.id, view.name)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => deleteViewMutation.mutate(view.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </>
          )}

          <DropdownMenuSeparator />
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSaveDialogOpen(true);
                }}
                disabled={!hasActiveFilters}
                className="flex items-center gap-2"
                data-testid="save-current-view"
              >
                <Plus className="h-4 w-4" />
                Save Current Filters
              </DropdownMenuItem>
            </DialogTrigger>
          </Dialog>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Save your current filter configuration as a reusable view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="e.g., My Priority Applications"
                data-testid="input-view-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="view-description">Description (Optional)</Label>
              <Textarea
                id="view-description"
                value={viewDescription}
                onChange={(e) => setViewDescription(e.target.value)}
                placeholder="Describe what this view shows..."
                className="resize-none"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Filters to Save</Label>
              <div className="flex flex-wrap gap-1">
                {currentFilters.market && (
                  <Badge variant="secondary">Market: {currentFilters.market}</Badge>
                )}
                {currentFilters.stage && (
                  <Badge variant="secondary">Stage: {currentFilters.stage}</Badge>
                )}
                {currentFilters.readinessStatus && (
                  <Badge variant="secondary">
                    Readiness: {currentFilters.readinessStatus}
                  </Badge>
                )}
                {currentFilters.slaBreached && (
                  <Badge variant="destructive">SLA Breached</Badge>
                )}
                {currentFilters.searchQuery && (
                  <Badge variant="secondary">
                    Search: "{currentFilters.searchQuery}"
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCurrentFilters}
              disabled={!viewName.trim() || createViewMutation.isPending}
              data-testid="button-confirm-save-view"
            >
              {createViewMutation.isPending ? "Saving..." : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate View</DialogTitle>
            <DialogDescription>
              Create a copy of this view that you can customize.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-name">New View Name</Label>
              <Input
                id="duplicate-name"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                placeholder="Enter a name for the copy"
                data-testid="input-duplicate-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDuplicate}
              disabled={!duplicateName.trim() || duplicateViewMutation.isPending}
              data-testid="button-confirm-duplicate"
            >
              {duplicateViewMutation.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
