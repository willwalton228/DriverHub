import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, CalendarOff, UserX } from "lucide-react";
import { Link } from "wouter";
import { SchedulingModuleNav } from "@/components/scheduling/SchedulingModuleNav";
import { createReportSessionHref } from "@/components/scheduling/SchedulingReportSession";

export default function SchedulingReports() {
  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto" data-testid="scheduling-reports-library">
      <SchedulingModuleNav active="reports" />

      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Scheduling Reports</h1>
        <p className="mt-1 text-muted-foreground">
          Operational reports for attendance, time off, and dispatch follow-up.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ReportCard
          href="/scheduling/reports/time-off"
          testId="card-driver-time-off-report"
          icon={<CalendarOff className="h-5 w-5 text-primary" />}
          title="Drivers with Most Time Off"
          description="Rank drivers by approved time-off days, with filters for period, network, account, and classification."
          source="When I Work time-off data"
        />
        <ReportCard
          href="/scheduling/reports/no-show"
          testId="card-no-show-report"
          icon={<UserX className="h-5 w-5 text-primary" />}
          title="No Show Monitor"
          description="Review assigned shifts that need Dispatch attention, including live clock-in status and exception history."
          source="Live When I Work attendance"
        />
      </div>
    </div>
  );
}

function ReportCard({
  href,
  testId,
  icon,
  title,
  description,
  source,
}: {
  href: string;
  testId: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  source: string;
}) {
  const reportHref = createReportSessionHref(href);

  return (
    <Link href={reportHref}>
      <Card
        className="h-full cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/20"
        data-testid={testId}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {icon}
              {title}
            </CardTitle>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Data source:</span> {source}
          </p>
          <p className="mt-3 text-sm font-medium text-primary">Open report</p>
        </CardContent>
      </Card>
    </Link>
  );
}
