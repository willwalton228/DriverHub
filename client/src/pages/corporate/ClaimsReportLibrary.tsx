import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, FileBarChart, ArrowRight, Clock, Calendar,
  ChevronRight, Play, Download, Settings2,
} from "lucide-react";

const PRIMARY = "#5737f2";

interface ReportDef {
  id: string;
  name: string;
  description: string;
  category: string;
  href: string;
  status: "available" | "coming_soon";
  lastGeneratedKey?: string; // sessionStorage key for last-generated timestamp
}

const REPORTS: ReportDef[] = [
  {
    id: "analysis",
    name: "Claims Analysis Report",
    description:
      "Configurable operational report for analyzing claim activity by Account/Location, Driver, and Market. " +
      "Supports filtering, grouping, drill-down into individual records, and export to CSV or Excel.",
    category: "Operational",
    href: "/claims/reports/analysis",
    status: "available",
  },
  {
    id: "loss_accrual",
    name: "Weekly Loss Accrual Report",
    description:
      "Current snapshot of unpaid claim exposure across all open damage claims. " +
      "Provides Accounting with the data needed to determine whether the loss accrual should be increased or decreased for the reporting period.",
    category: "Financial",
    href: "/claims/reports/loss-accrual",
    status: "available",
    lastGeneratedKey: "claimsReport.lossAccrual.lastGenerated",
  },
];

export default function ClaimsReportLibrary() {
  const [, navigate] = useLocation();

  return (
    <div className="-mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6 bg-[#f7f8fc] dark:bg-background min-h-screen">

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
        <div className="border-b border-border px-6 py-2 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground leading-none">
              Claims /{" "}
              <Link href="/claims/dashboard">
                <span className="hover:underline cursor-pointer font-medium text-foreground/70">Dashboard</span>
              </Link>{" "}
              / <span className="font-medium text-foreground/70">Reports</span>
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[#182039] dark:text-foreground leading-tight mt-0.5">
              Claims Reports
            </h1>
          </div>
          <Link href="/claims/dashboard">
            <Button variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]">
              <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
              Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-10 max-w-[900px] mx-auto space-y-6">

        {/* Section header */}
        <div>
          <p className="text-sm text-muted-foreground">
            Select a report to generate it on demand, export data, or configure scheduled delivery.
          </p>
        </div>

        {/* Report cards */}
        <div className="space-y-3">
          {REPORTS.map((report) => {
            const lastGenerated = (() => {
              if (!report.lastGeneratedKey) return null;
              try { return sessionStorage.getItem(report.lastGeneratedKey); } catch { return null; }
            })();

            return (
              <div
                key={report.id}
                className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl p-5 flex items-start justify-between gap-4 hover:border-[#5737f2]/30 transition-colors"
              >
                {/* Left: info */}
                <div className="flex items-start gap-4 min-w-0">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${PRIMARY}15` }}
                  >
                    <FileBarChart className="h-4.5 w-4.5" style={{ color: PRIMARY }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold text-[#182039] dark:text-foreground">
                        {report.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {report.category}
                      </Badge>
                      {report.status === "coming_soon" && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                          Coming Soon
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-snug">
                      {report.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      {lastGenerated ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Last generated: {lastGenerated}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                          <Clock className="h-3 w-3" />
                          Not yet generated
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: actions */}
                {report.status === "available" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="h-8 text-xs text-white shrink-0"
                      style={{ background: PRIMARY }}
                      onClick={() => navigate(report.href)}
                    >
                      <Play className="h-3 w-3 mr-1.5" />
                      Run Report
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-[#d7dbe4] shrink-0"
                      onClick={() => navigate(`${report.href}?action=schedule`)}
                    >
                      <Calendar className="h-3 w-3 mr-1.5" />
                      Schedule
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                    Coming Soon
                  </Badge>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
