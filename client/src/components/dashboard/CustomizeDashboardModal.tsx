import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown, Lock, Search, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { WIDGET_COMPONENT_MAP } from "./widgetRegistry";

interface DashboardWidget {
  widgetId: string;
  key: string;
  name: string;
  componentName: string;
  description: string | null;
  position: number;
  size: string;
  isLocked: boolean;
  source: "default" | "user_added";
}

interface EligibleWidget {
  widgetId: string;
  key: string;
  name: string;
  description: string | null;
  componentName: string;
}

interface CustomizeDashboardModalProps {
  moduleKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomizeDashboardModal({ moduleKey, open, onOpenChange }: CustomizeDashboardModalProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: configData, isLoading: configLoading } = useQuery<{ moduleKey: string; widgets: DashboardWidget[] }>({
    queryKey: ["/api/dashboards", moduleKey, "config"],
    enabled: open,
  });

  const { data: eligibleWidgets = [], isLoading: eligibleLoading } = useQuery<EligibleWidget[]>({
    queryKey: [`/api/widgets?moduleKey=${moduleKey}`],
    enabled: open,
  });

  const currentWidgets = configData?.widgets || [];
  const currentWidgetIds = new Set(currentWidgets.map(w => w.widgetId));
  const userAdded = currentWidgets.filter(w => w.source === "user_added");
  const defaults = currentWidgets.filter(w => w.source === "default");

  const availableToAdd = eligibleWidgets.filter(w =>
    !currentWidgetIds.has(w.widgetId) &&
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addMutation = useMutation({
    mutationFn: async (widgetId: string) => {
      await apiRequest("POST", `/api/dashboards/${moduleKey}/widgets`, { widgetId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboards", moduleKey, "config"] });
      toast({ title: "Widget added" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add widget", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (widgetId: string) => {
      await apiRequest("DELETE", `/api/dashboards/${moduleKey}/widgets/${widgetId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboards", moduleKey, "config"] });
      toast({ title: "Widget removed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove widget", description: err.message, variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (widgetOrder: string[]) => {
      await apiRequest("PUT", `/api/dashboards/${moduleKey}/widgets/reorder`, { widgetOrder });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboards", moduleKey, "config"] });
    },
  });

  function moveWidget(widgetId: string, direction: "up" | "down") {
    const idx = userAdded.findIndex(w => w.widgetId === widgetId);
    if (idx === -1) return;
    const newOrder = userAdded.map(w => w.widgetId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    reorderMutation.mutate(newOrder);
  }

  const isLoading = configLoading || eligibleLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Customize Dashboard
          </DialogTitle>
          <DialogDescription>
            Manage your widget layout. Default widgets cannot be removed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            <div>
              <h3 className="text-sm font-semibold mb-3">Current Widgets</h3>
              <div className="space-y-2">
                {defaults.map(widget => (
                  <div
                    key={widget.widgetId}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-md border"
                    data-testid={`customize-widget-default-${widget.key}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{widget.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">Default</Badge>
                  </div>
                ))}

                {userAdded.map((widget, idx) => (
                  <div
                    key={widget.widgetId}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-md border"
                    data-testid={`customize-widget-user-${widget.key}`}
                  >
                    <span className="text-sm font-medium truncate min-w-0">{widget.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveWidget(widget.widgetId, "up")}
                        disabled={idx === 0 || reorderMutation.isPending}
                        data-testid={`button-move-up-${widget.key}`}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveWidget(widget.widgetId, "down")}
                        disabled={idx === userAdded.length - 1 || reorderMutation.isPending}
                        data-testid={`button-move-down-${widget.key}`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeMutation.mutate(widget.widgetId)}
                        disabled={removeMutation.isPending}
                        data-testid={`button-remove-widget-${widget.key}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {currentWidgets.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No widgets on your dashboard yet</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Add Widgets</h3>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search widgets..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-widgets"
                />
              </div>
              <div className="space-y-2">
                {availableToAdd.length > 0 ? availableToAdd.map(widget => {
                  const reg = WIDGET_COMPONENT_MAP[widget.componentName];
                  return (
                    <div
                      key={widget.widgetId}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-md border"
                      data-testid={`customize-available-${widget.key}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{widget.name}</p>
                        {widget.description && (
                          <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addMutation.mutate(widget.widgetId)}
                        disabled={addMutation.isPending}
                        data-testid={`button-add-widget-${widget.key}`}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add
                      </Button>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-muted-foreground py-2">
                    {searchQuery ? "No matching widgets found" : "All available widgets are already added"}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
