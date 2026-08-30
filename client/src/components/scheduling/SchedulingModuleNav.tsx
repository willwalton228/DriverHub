import { BarChart3, LayoutDashboard, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export type SchedulingModuleView = "dashboard" | "reports";

interface SchedulingModuleNavProps {
  active: SchedulingModuleView;
}

export function SchedulingModuleNav({ active }: SchedulingModuleNavProps) {
  return (
    <nav
      aria-label="Scheduling views"
      className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-1"
      data-testid="scheduling-module-nav"
    >
      <Button
        asChild
        size="sm"
        variant={active === "dashboard" ? "default" : "ghost"}
        data-testid="scheduling-nav-dashboard"
      >
        <Link href="/scheduling" aria-current={active === "dashboard" ? "page" : undefined}>
          <LayoutDashboard className="mr-1.5 h-4 w-4" />
          Dashboard
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        variant={active === "reports" ? "default" : "ghost"}
        data-testid="scheduling-nav-reports"
      >
        <Link href="/scheduling/reports" aria-current={active === "reports" ? "page" : undefined}>
          <BarChart3 className="mr-1.5 h-4 w-4" />
          Reports
        </Link>
      </Button>
    </nav>
  );
}

export function SchedulingReportBreadcrumb({ reportName }: { reportName: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="scheduling-report-breadcrumb">
      <Link href="/scheduling/reports" className="hover:text-foreground hover:underline">
        Scheduling Reports
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-foreground">{reportName}</span>
    </div>
  );
}