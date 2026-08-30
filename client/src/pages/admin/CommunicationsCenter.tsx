import type { ElementType } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Mail,
  FileText,
  Zap,
  ScrollText,
  Server,
  Send,
  CheckCircle2,
  Eye,
  XCircle,
  Play,
  Clock,
  AlertTriangle,
  MessageSquare,
  ExternalLink,
  Activity,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import Microsoft365AdminView from "@/pages/admin/Microsoft365AdminView";
import { AutomationsView } from "@/pages/admin/AutomationsView";
import { EmailAccountsView } from "@/pages/admin/EmailAccountsView";
import { TemplatesView } from "@/pages/admin/TemplatesView";
import { CommLogsView } from "@/pages/admin/CommLogsView";

// ── Section definitions ────────────────────────────────────────────────────────

interface CommSection {
  id: string;
  label: string;
  icon: ElementType;
  description: string;
}

const SECTIONS: CommSection[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Overview of email and automation activity.",
  },
  {
    id: "email-accounts",
    label: "Email Accounts",
    icon: Mail,
    description: "Manage sending accounts, SMTP configurations, and reply-to addresses.",
  },
  {
    id: "templates",
    label: "Templates",
    icon: FileText,
    description: "Create and manage email, SMS, and document communication templates.",
  },
  {
    id: "automations",
    label: "Automations",
    icon: Zap,
    description: "Configure automated communication workflows and trigger-based messaging.",
  },
  {
    id: "logs",
    label: "Communication Logs",
    icon: ScrollText,
    description: "Audit log of all outbound communication events across all channels.",
  },
  {
    id: "microsoft-365",
    label: "Microsoft 365",
    icon: Mail,
    description: "Microsoft 365 email integration, sender configuration, and health status.",
  },
  {
    id: "infrastructure",
    label: "Infrastructure Health",
    icon: Server,
    description: "Monitor the health and status of communication infrastructure and providers.",
  },
];

// ── Stat tile ──────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon: Icon,
  muted,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", muted ? "text-muted-foreground" : "")}>
        {value}
      </div>
    </div>
  );
}

// ── Dashboard view ─────────────────────────────────────────────────────────────

function DashboardView() {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Email Activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary/10 p-1.5">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Email Activity</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Outbound email performance for today
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Sent Today" value="—" icon={Send} muted />
            <StatTile label="Delivered" value="—" icon={CheckCircle2} muted />
            <StatTile label="Opened" value="—" icon={Eye} muted />
            <StatTile label="Failed" value="—" icon={XCircle} muted />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Live metrics will appear here once the email activity pipeline is connected.
          </p>
        </CardContent>
      </Card>

      {/* Automation Activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary/10 p-1.5">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Automation Activity</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Status of communication automations
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile label="Active Automations" value="—" icon={Play} muted />
            <StatTile label="Scheduled Deliveries" value="—" icon={Clock} muted />
            <StatTile label="Failed Automations" value="—" icon={AlertTriangle} muted />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Automation metrics will appear here once the automation engine is configured.
          </p>
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Access</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SECTIONS.filter(s => s.id !== "dashboard").map(section => {
              const Icon = section.icon;
              return (
                <a
                  key={section.id}
                  href={`/admin/communications/${section.id}`}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  data-testid={`quick-link-${section.id}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </a>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Microsoft 365 — full consolidated admin view ───────────────────────────────

function Microsoft365View() {
  return <Microsoft365AdminView />;
}

// ── Generic placeholder ────────────────────────────────────────────────────────

function PlaceholderView({ section }: { section: CommSection }) {
  const Icon = section.icon;
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] text-center px-8 py-12 space-y-4">
      <div className="rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="font-semibold text-base">{section.label}</h3>
        <p className="text-sm text-muted-foreground">{section.description}</p>
      </div>
      <Badge variant="secondary" className="text-xs">
        Coming Soon
      </Badge>
      <p className="text-xs text-muted-foreground max-w-xs">
        This panel is part of the Communications Center framework and will be built out in a future update.
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CommunicationsCenter() {
  const [location, setLocation] = useLocation();

  const pathAfterBase = location.replace(/^\/admin\/communications/, "");
  const tabId = pathAfterBase.split("/").filter(Boolean)[0] || "dashboard";

  const currentSection = SECTIONS.find(s => s.id === tabId) || SECTIONS[0];

  function navigate(sectionId: string) {
    if (sectionId === "dashboard") {
      setLocation("/admin/communications");
    } else {
      setLocation(`/admin/communications/${sectionId}`);
    }
  }

  function renderContent() {
    switch (currentSection.id) {
      case "dashboard":
        return <DashboardView />;
      case "microsoft-365":
        return <Microsoft365View />;
      case "automations":
        return <AutomationsView />;
      case "email-accounts":
        return <EmailAccountsView />;
      case "templates":
        return <TemplatesView />;
      case "logs":
        return <CommLogsView />;
      default:
        return <PlaceholderView section={currentSection} />;
    }
  }

  return (
    <div className="flex flex-col -mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6 min-h-[calc(100vh-4rem)]">
      {/* Page header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b bg-background shrink-0">
        <div className="rounded-md bg-primary/10 p-2 shrink-0">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">Communications Center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Centralized management for all outbound communication configuration, templates, automations, and infrastructure.
          </p>
        </div>
      </div>

      {/* Body: left sidebar + main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <aside className="w-56 shrink-0 border-r bg-background flex flex-col">
          <nav className="flex-1 overflow-y-auto py-2">
            {SECTIONS.map(section => {
              const Icon = section.icon;
              const isActive = section.id === currentSection.id;
              return (
                <button
                  key={section.id}
                  onClick={() => navigate(section.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                  data-testid={`nav-comm-${section.id}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          {/* Section header */}
          <div className="px-6 py-5 border-b">
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = currentSection.icon;
                return <Icon className="h-4 w-4 text-muted-foreground" />;
              })()}
              <h2 className="text-base font-semibold">{currentSection.label}</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{currentSection.description}</p>
          </div>

          <div className="px-6 py-6">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
