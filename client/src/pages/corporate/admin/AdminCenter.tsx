import { useState, useMemo } from "react";
import type { ElementType } from "react";
import { useLocation, Link } from "wouter";
import {
  Search,
  ChevronRight,
  ArrowLeft,
  Truck,
  Globe,
  MessageSquare,
  Plug,
  BarChart2,
  ShieldCheck,
  Settings,
  Settings2,
  Map,
  FileText,
  Bell,
  StretchHorizontal,
  Users,
  KeyRound,
  ClipboardList,
  Mail,
  MessageCircle,
  User,
  Lock,
  Database,
  Flag,
  Code2,
  PieChart,
  Download,
  CalendarClock,
  SlidersHorizontal,
  Zap,
  CreditCard,
  Phone,
  Building2,
  Car,
  Route,
  AlarmClock,
  Share2,
  PackageOpen,
  Workflow,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ── Category & Section definitions ────────────────────────────────────────────

interface Section {
  id: string;
  label: string;
  icon: ElementType;
  description?: string;
}

interface Category {
  id: string;
  icon: ElementType;
  label: string;
  description: string;
  sections: Section[];
  tags?: string[];
}

const CATEGORIES: Category[] = [
  {
    id: "booking-moves",
    icon: Truck,
    label: "Booking & Moves",
    description:
      "Configure booking workflows, move types, scheduling rules, assignment logic, and service settings.",
    tags: ["booking", "moves", "scheduling", "assignment", "service", "workflow"],
    sections: [
      { id: "general", label: "General", icon: Settings2, description: "General booking configuration and defaults." },
      { id: "move-types", label: "Move Types", icon: Truck, description: "Define and manage move type categories." },
      { id: "service-types", label: "Service Types", icon: PackageOpen, description: "Configure available service offerings." },
      { id: "scheduling-rules", label: "Scheduling Rules", icon: AlarmClock, description: "Set rules that govern how moves are scheduled." },
      { id: "assignment-rules", label: "Assignment Rules", icon: Route, description: "Define how drivers are matched and assigned to moves." },
      { id: "notifications", label: "Notifications", icon: Bell, description: "Configure booking-related notification triggers." },
    ],
  },
  {
    id: "networks",
    icon: Globe,
    label: "Networks",
    description:
      "Manage territories, coverage areas, network assignments, and capacity rules.",
    tags: ["networks", "territories", "coverage", "capacity", "areas"],
    sections: [
      { id: "territories", label: "Territories", icon: Map, description: "Define geographic territories for service delivery." },
      { id: "coverage-areas", label: "Coverage Areas", icon: Globe, description: "Set active coverage zones and boundaries." },
      { id: "network-assignments", label: "Network Assignments", icon: Share2, description: "Assign accounts and drivers to networks." },
      { id: "capacity-rules", label: "Capacity Rules", icon: SlidersHorizontal, description: "Configure capacity limits and overflow rules." },
    ],
  },
  {
    id: "communications",
    icon: MessageSquare,
    label: "Communications",
    description:
      "Manage email templates, SMS templates, notifications, and customer communications.",
    tags: ["email", "sms", "templates", "notifications", "communications", "messages"],
    sections: [
      { id: "email-templates", label: "Email Templates", icon: Mail, description: "Create and manage outbound email templates." },
      { id: "sms-templates", label: "SMS Templates", icon: MessageCircle, description: "Configure SMS message templates." },
      { id: "notifications", label: "Notifications", icon: Bell, description: "Manage system-wide notification settings." },
      { id: "customer-comms", label: "Customer Communications", icon: Building2, description: "Settings for customer-facing communications." },
    ],
  },
  {
    id: "integrations",
    icon: Plug,
    label: "Integrations",
    description:
      "Manage Stripe, Twilio, Microsoft 365, CDK, Reynolds, DealerTrack, and future integrations.",
    tags: ["stripe", "twilio", "microsoft", "cdk", "reynolds", "dealertrack", "integrations", "api"],
    sections: [
      { id: "stripe", label: "Stripe", icon: CreditCard, description: "Configure Stripe payment processing." },
      { id: "twilio", label: "Twilio", icon: Phone, description: "Manage Twilio SMS and voice settings." },
      { id: "microsoft-365", label: "Microsoft 365", icon: Mail, description: "Connect Microsoft 365 for email and identity." },
      { id: "cdk", label: "CDK", icon: Plug, description: "Configure CDK dealership integration." },
      { id: "reynolds", label: "Reynolds & Reynolds", icon: Plug, description: "Manage Reynolds & Reynolds connector." },
      { id: "dealertrack", label: "DealerTrack", icon: Plug, description: "Connect and configure DealerTrack." },
    ],
  },
  {
    id: "reporting",
    icon: BarChart2,
    label: "Reporting",
    description:
      "Manage dashboards, exports, scheduled reports, and reporting preferences.",
    tags: ["reports", "dashboards", "exports", "analytics", "scheduled"],
    sections: [
      { id: "dashboards", label: "Dashboards", icon: PieChart, description: "Configure report dashboards and layouts." },
      { id: "exports", label: "Exports", icon: Download, description: "Manage data export formats and permissions." },
      { id: "scheduled-reports", label: "Scheduled Reports", icon: CalendarClock, description: "Set up automated report delivery." },
      { id: "preferences", label: "Reporting Preferences", icon: SlidersHorizontal, description: "Global reporting preferences and defaults." },
    ],
  },
  {
    id: "users-security",
    icon: ShieldCheck,
    label: "Users & Security",
    description:
      "Manage users, roles, permissions, MFA, and audit logs.",
    tags: ["users", "roles", "permissions", "security", "mfa", "audit", "access"],
    sections: [
      { id: "users", label: "Users", icon: Users, description: "Manage platform users and their access." },
      { id: "roles-permissions", label: "Roles & Permissions", icon: KeyRound, description: "Define roles and granular permissions." },
      { id: "mfa", label: "MFA Settings", icon: Lock, description: "Configure multi-factor authentication policies." },
      { id: "audit-logs", label: "Audit Logs", icon: ClipboardList, description: "Review system access and change history." },
    ],
  },
  {
    id: "system",
    icon: Settings,
    label: "System",
    description:
      "Manage global application settings and feature configuration.",
    tags: ["system", "global", "features", "api", "configuration", "data"],
    sections: [
      { id: "general", label: "General Settings", icon: Settings2, description: "Global application configuration." },
      { id: "feature-flags", label: "Feature Flags", icon: Flag, description: "Enable or disable platform features." },
      { id: "api-config", label: "API Configuration", icon: Code2, description: "Manage API keys, rate limits, and access." },
      { id: "data-management", label: "Data Management", icon: Database, description: "Data retention, purge, and archive policies." },
    ],
  },
];

// ── Landing Page ──────────────────────────────────────────────────────────────

function LandingView() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter(
      c =>
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags?.some(t => t.includes(q)) ||
        c.sections.some(s => s.label.toLowerCase().includes(q))
    );
  }, [search]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Page header */}
      <div className="space-y-1 pt-2">
        <h1 className="text-2xl font-bold tracking-tight">Administration Center</h1>
        <p className="text-muted-foreground text-sm">
          Manage DriverConnect configuration, users, communications, integrations, workflows, and system settings.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search settings…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-admin-center-search"
        />
      </div>

      {/* Category cards */}
      {filteredCategories.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No settings found for &ldquo;{search}&rdquo;</p>
          <p className="text-sm mt-1">Try a different keyword.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map(cat => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.id}
                className="rounded-lg border border-border bg-card p-5 flex flex-col gap-3 hover-elevate transition-colors"
                data-testid={`card-admin-category-${cat.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 rounded-md bg-primary/10 p-2">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm leading-snug">{cat.label}</h3>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                  {cat.description}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1"
                  onClick={() =>
                    setLocation(`/admin-center/${cat.id}/${cat.sections[0].id}`)
                  }
                  data-testid={`btn-open-settings-${cat.id}`}
                >
                  Open Settings
                  <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Workspace: section placeholder ────────────────────────────────────────────

function SectionPlaceholder({
  category,
  section,
}: {
  category: Category;
  section: Section;
}) {
  const Icon = section.icon;
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] text-center px-8 py-16 space-y-4">
      <div className="rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="font-semibold text-base">{section.label}</h3>
        {section.description && (
          <p className="text-sm text-muted-foreground">{section.description}</p>
        )}
      </div>
      <Badge variant="secondary" className="text-xs">
        Coming Soon
      </Badge>
      <p className="text-xs text-muted-foreground max-w-xs">
        This settings panel is part of the Administration Center framework and will be configured in a future update.
      </p>
    </div>
  );
}

// ── Workspace view ─────────────────────────────────────────────────────────────

function WorkspaceView({
  category,
  sectionId,
}: {
  category: Category;
  sectionId: string;
}) {
  const [, setLocation] = useLocation();
  const CategoryIcon = category.icon;

  const currentSection =
    category.sections.find(s => s.id === sectionId) ?? category.sections[0];

  return (
    <div className="flex flex-col gap-0 -mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6 min-h-[calc(100vh-4rem)]">
      {/* Breadcrumb bar */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b bg-muted/30 text-sm">
        <button
          onClick={() => setLocation("/admin-center")}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="btn-admin-center-back"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Administration Center
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="font-medium text-foreground">{category.label}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-muted-foreground">{currentSection.label}</span>
      </div>

      {/* Content: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <aside className="w-56 shrink-0 border-r bg-background flex flex-col">
          {/* Category header */}
          <div className="flex items-center gap-2.5 px-4 py-4 border-b">
            <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
              <CategoryIcon className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm truncate">{category.label}</span>
          </div>

          {/* Section nav */}
          <nav className="flex-1 overflow-y-auto py-2">
            {category.sections.map(section => {
              const SectionIcon = section.icon;
              const isActive = section.id === currentSection.id;
              return (
                <button
                  key={section.id}
                  onClick={() =>
                    setLocation(`/admin-center/${category.id}/${section.id}`)
                  }
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                  data-testid={`nav-section-${section.id}`}
                >
                  <SectionIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="px-6 py-6 max-w-3xl">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">{currentSection.label}</h2>
              {currentSection.description && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {currentSection.description}
                </p>
              )}
            </div>
            <Separator className="mb-8" />
            <SectionPlaceholder category={category} section={currentSection} />
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function AdminCenter() {
  const [location, setLocation] = useLocation();

  const pathAfterBase = location.replace(/^\/admin-center/, "");
  const parts = pathAfterBase.split("/").filter(Boolean);
  const categoryId = parts[0] || null;
  const sectionId = parts[1] || null;

  if (!categoryId) {
    return <LandingView />;
  }

  const currentCategory = CATEGORIES.find(c => c.id === categoryId);
  if (!currentCategory) {
    setLocation("/admin-center");
    return null;
  }

  const resolvedSectionId =
    sectionId && currentCategory.sections.find(s => s.id === sectionId)
      ? sectionId
      : currentCategory.sections[0].id;

  return (
    <WorkspaceView category={currentCategory} sectionId={resolvedSectionId} />
  );
}
