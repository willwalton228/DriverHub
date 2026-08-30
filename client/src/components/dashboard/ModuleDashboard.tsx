import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Settings2, Lock, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { WIDGET_COMPONENT_MAP } from "./widgetRegistry";
import { CustomizeDashboardModal } from "./CustomizeDashboardModal";

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

interface DashboardConfigResponse {
  moduleKey: string;
  widgets: DashboardWidget[];
}

interface ModuleDashboardProps {
  moduleKey: string;
  title?: string;
}

function WidgetSizeClass(size: string): string {
  switch (size) {
    case "S": return "col-span-1";
    case "L": return "col-span-1 md:col-span-2";
    default: return "col-span-1";
  }
}

export function ModuleDashboard({ moduleKey, title }: ModuleDashboardProps) {
  const [showCustomize, setShowCustomize] = useState(false);

  const { data, isLoading } = useQuery<DashboardConfigResponse>({
    queryKey: ["/api/dashboards", moduleKey, "config"],
  });

  const widgetList = data?.widgets || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (widgetList.length === 0) {
    return (
      <Card data-testid="mini-dashboard-empty">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <LayoutDashboard className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No widgets configured</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Click Customize to add widgets to your dashboard</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCustomize(true)}
              data-testid="button-customize-empty"
            >
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />
              Customize
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid={`mini-dashboard-${moduleKey}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        {title && (
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCustomize(true)}
          data-testid="button-customize-dashboard"
        >
          <Settings2 className="h-3.5 w-3.5 mr-1.5" />
          Customize
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {widgetList.map((widget) => {
          const reg = WIDGET_COMPONENT_MAP[widget.componentName];
          if (!reg) return null;
          const WidgetComp = reg.component;
          const Icon = reg.icon;

          return (
            <Card key={widget.widgetId} className={WidgetSizeClass(widget.size)} data-testid={`widget-card-${widget.key}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {widget.name}
                  </CardTitle>
                  {widget.isLocked && (
                    <Badge variant="secondary" className="text-xs">
                      <Lock className="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <WidgetComp />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <CustomizeDashboardModal
        moduleKey={moduleKey}
        open={showCustomize}
        onOpenChange={setShowCustomize}
      />
    </div>
  );
}
