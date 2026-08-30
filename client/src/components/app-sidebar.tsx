import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Shield,
  ShieldCheck,
  Truck,
  CreditCard,
  FileBarChart,
  Receipt,
  Building2,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Route,
  AlertTriangle,
  ShieldAlert,
  Wallet,
  FileText,
  MessageSquare,
  Calendar,
  UserSearch,
  Bell,
  Share2,
  DollarSign,
  Link2,
  History,
  Activity,
  PlayCircle,
  XCircle,
  Database,
  ClipboardCheck,
  KeyRound,
  TrendingUp,
  BrainCircuit,
  Cable,
  HeartPulse,
  FileSpreadsheet,
  ClipboardList,
  Upload,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Palmtree,
  BarChart,
  Timer,
  Package,
  Settings2,
  Layers,
  Wrench,
  Mail,
  GitGraph,
  Globe,
  Sparkles,
  Landmark,
  Calculator,
  FileStack,
  ListChecks,
  GitMerge,
  Briefcase,
  Megaphone,
  BarChart2,
  SlidersHorizontal,
  Map,
  PenLine,
  FolderLock,
  Banknote,
  Zap,
  UserCog,
  MapPinned,
  MapPin,
  FileClock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useFinancePermissions } from "@/hooks/useFinancePermissions";
import { cn } from "@/lib/utils";

interface ExpenseAlert {
  hasOpenExpenses: boolean;
  overdueCount: number;
  message: string;
  userType: "driver" | "employee";
}
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLocation } from "wouter";

// ── Static sub-item arrays ─────────────────────────────────────────────────────
const dashboardSubItems = [
  { title: "Overview",                  url: "/",                        icon: LayoutDashboard },
  { title: "Drivers",                   url: "/dashboard/drivers",       icon: Users           },
  { title: "Accounts",                  url: "/dashboard/customers",     icon: Building2       },
  { title: "Claims",                    url: "/dashboard/claims",        icon: AlertTriangle   },
  { title: "Carrier Intelligence",      url: "/carrier",                 icon: Shield          },
  { title: "Moves",                     url: "/dashboard/moves",         icon: Truck           },
  { title: "Insights",                  url: "/dashboard/insights",      icon: TrendingUp      },
  { title: "Exceptions & Compliance",   url: "/exceptions",              icon: ShieldCheck     },
  { title: "Revenue Dashboard",         url: "/revenue-reports",         icon: TrendingUp      },
  { title: "Financial Intelligence",    url: "/financial-intelligence",  icon: BrainCircuit    },
];

const schedulingSubItems = [
  { title: "Scheduling Workspace", url: "/scheduling",                  icon: Calendar        },
  { title: "Calendar",             url: "/scheduling/calendar",         icon: CalendarDays    },
  { title: "Needs Coverage",       url: "/scheduling/needs-coverage",   icon: AlertTriangle   },
  { title: "Time Clock",           url: "/scheduling/time-clock",       icon: Timer           },
  { title: "Time Off",             url: "/scheduling/time-off",         icon: Palmtree        },
  { title: "Driver Time Off",     url: "/scheduling/driver-time-off",  icon: CalendarOff     },
  { title: "Holidays",             url: "/scheduling/holidays",         icon: CalendarDays    },
  { title: "Scheduling Reports",   url: "/scheduling/reports",          icon: BarChart        },
  { title: "WIW Reconciliation",   url: "/scheduling/wiw-reconciliation", icon: GitGraph      },
  { title: "WIW Governance",       url: "/scheduling/wiw-governance",   icon: Shield          },
  { title: "WIW Imports",          url: "/scheduling/wiw-imports",      icon: FileSpreadsheet },
  { title: "WIW Import Wizard",    url: "/scheduling/wiw-import",       icon: FileSpreadsheet },
];

// ── Nav item types ─────────────────────────────────────────────────────────────
type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  hasSubmenu?: boolean;
  isAMR?: boolean;        // shows actionable badge
};

type FlyoutEntry =
  | { kind: "link";    title: string; url: string; icon: React.ComponentType<{ className?: string }>; testId?: string; badge?: React.ReactNode; activeWhen?: (loc: string) => boolean }
  | { kind: "section"; label: string };

// ── Primary nav order ─────────────────────────────────────────────────────────
const primaryNavItems: NavItem[] = [
  { title: "Ops Work Plan",         url: "/ops-work-plan",  icon: ClipboardList   },
  { title: "Daily Work Plan",       url: "/work-plan",      icon: CalendarCheck   },
  { title: "Accounts",              url: "/customers",       icon: Building2       },
  { title: "Claims",                url: "/claims",          icon: Shield,          hasSubmenu: true },
  { title: "Drivers",               url: "/drivers",         icon: Users,           hasSubmenu: true },
  { title: "Finance",               url: "/finance",         icon: TrendingUp,      hasSubmenu: true },
  { title: "Invoicing",              url: "/invoices",        icon: Receipt         },
  { title: "Moves",                 url: "/trips",           icon: Truck           },
  { title: "Payments",              url: "/payment",         icon: CreditCard,      hasSubmenu: true },
  { title: "Recruiting",            url: "/recruiting",      icon: UserSearch,      hasSubmenu: true },
  { title: "Scheduling",            url: "/scheduling",      icon: Calendar,        hasSubmenu: true },
  { title: "Social Media",          url: "/social-media",    icon: Share2          },
  { title: "Reports & Analytics",   url: "/reports",         icon: BarChart3,       hasSubmenu: true },
  { title: "Modification Requests", url: "/amr",             icon: PenLine,         isAMR: true      },
];

const secondaryNavItems: NavItem[] = [
  { title: "Dashboard",           url: "/",                icon: LayoutDashboard, hasSubmenu: true },
  { title: "Users",               url: "/users",           icon: UserCog         },
  { title: "Billing & Accounting",url: "/billing",         icon: Landmark,        hasSubmenu: true },
  { title: "Data Ops",            url: "/data-imports",    icon: Layers,          hasSubmenu: true },
  { title: "Secure File Drop",    url: "/reports/file-drop", icon: FolderLock    },
  { title: "Markets",             url: "/markets",         icon: MapPinned       },
  { title: "Payroll",             url: "/payroll",         icon: Banknote        },
  { title: "Accounting",          url: "/admin/accounting",icon: Calculator      },
  { title: "Sales & Quotes",       url: "/admin/products",  icon: Package         },
  { title: "Sales",                url: "/sales/market-pricing-overview", icon: DollarSign, hasSubmenu: true },
  { title: "Billing Engine",      url: "/billing-engine",  icon: Zap             },
];

// ── Scroll preservation ────────────────────────────────────────────────────────
let _navScrollY = 0;
let _isRestoring = false;

export function AppSidebar() {
  const [location, navigate] = useLocation();
  const scrollElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.querySelector('[data-sidebar="content"]') as HTMLElement | null;
    scrollElRef.current = el;
    const onScroll = () => { if (!_isRestoring) _navScrollY = el!.scrollTop; };
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => el?.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    _isRestoring = true;
    el.scrollTop = _navScrollY;
    const observer = new MutationObserver(() => { if (_isRestoring) el.scrollTop = _navScrollY; });
    observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: false });
    const timer = setTimeout(() => { _isRestoring = false; observer.disconnect(); }, 300);
    return () => { clearTimeout(timer); _isRestoring = false; observer.disconnect(); };
  }, [location]);

  // ── Auth / permissions ───────────────────────────────────────────────────────
  const { isSuperAdmin, isCorporate, user } = useAuth();
  const { isCorporateAccessAdmin } = usePermissions();
  const { hasAccess: hasFinanceModuleAccess } = useFinancePermissions();

  // ── Active-state helpers ─────────────────────────────────────────────────────
  const dataOpsUrls = ["/data-imports", "/reports/moves-import", "/reports/draiver-import", "/admin/integrations/replay", "/admin/integrations/processing", "/admin/integrations/dlq", "/admin/integrations/mapping", "/admin/provider-health", "/admin/data/retention", "/admin/data/date-repair"];
  const platformAdminUtilityUrls = ["/integration-api", "/admin/external-access", "/admin/platform-config", "/admin/transportation-methods", "/admin/move-types", "/admin/communications", "/admin/report-delivery-monitor", "/admin/teams", "/admin/integrations/microsoft-graph", "/integrations/stripe", "/admin/weekly-report-recipients", "/insurance-cards", "/compliance/license-review", "/admin/account-reports", "/admin/finance-permissions", "/admin/vendor-permissions", ...dataOpsUrls];
  const isPlatformAdminUtilityActive = platformAdminUtilityUrls.some(u => location.startsWith(u));
  const isDataOpsActive = dataOpsUrls.some(u => location.startsWith(u));
  const isOnDriverDetailPage = location.startsWith("/drivers/");
  const isDriversRelated = location === "/drivers" || isOnDriverDetailPage || location === "/drivers/mass-import" || location === "/drivers/needs-update" || location === "/drivers/resources" || location === "/corporate/at-risk-drivers";
  const isClaimsRelated = location === "/safety" || location === "/carrier" || location.startsWith("/accidents/") || location === "/claims" || location === "/claims/dashboard" || location === "/claims/import" || location === "/claims/queue" || location === "/claims/case-queue" || location === "/claims/risp-controls" || location === "/claims/risp-insurance-summary";
  const isSchedulingRelated = location.startsWith("/scheduling");

  function isItemActive(item: NavItem): boolean {
    switch (item.title) {
      case "Drivers":             return location === item.url || isDriversRelated;
      case "Claims":              return location === "/claims" || location === "/claims/dashboard" || location === "/safety" || isClaimsRelated;
      case "Scheduling":          return location === "/scheduling" || isSchedulingRelated;
      case "Dashboard":           return location === "/" || location.startsWith("/dashboard") || location.startsWith("/carrier") || location.startsWith("/exceptions") || location.startsWith("/revenue-reports") || location.startsWith("/financial-intelligence");
      case "Payments":            return location.startsWith("/payment") || location.startsWith("/ap-payables") || location.startsWith("/expenses") || location.startsWith("/vendors") || location.startsWith("/admin/bills");
      case "Billing & Accounting":return location.startsWith("/billing") || location.startsWith("/accounting");
      case "Finance":             return location.startsWith("/finance");
      case "Reports & Analytics": return location === "/reports" || location.startsWith("/reports/") || location.startsWith("/ops-map");
      case "Recruiting":          return location.startsWith("/recruiting");
      case "Sales":               return location.startsWith("/sales");
      case "Data Ops":            return dataOpsUrls.some(u => location.startsWith(u));
      default:                    return location === item.url;
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: expenseAlert } = useQuery<ExpenseAlert>({
    queryKey: ["/api/me/expense-alerts"],
    refetchInterval: 30_000,
  });
  const { data: ticketOpenCount } = useQuery<{ count: number }>({
    queryKey: ["/api/tickets/badge-count"],
    refetchInterval: 30_000,
  });

  // ── Flyout state ─────────────────────────────────────────────────────────────
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  const [flyoutX, setFlyoutX] = useState(0);
  const [flyoutY, setFlyoutY] = useState(0);
  const flyoutRef = useRef<HTMLDivElement>(null);
  // Close flyout on navigate
  useEffect(() => { setOpenFlyout(null); }, [location]);

  // Close flyout on click-outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        // Don't close if the click was on the chevron trigger (it handles its own toggle)
        const target = e.target as HTMLElement;
        if (target.closest("[data-flyout-trigger]")) return;
        setOpenFlyout(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close flyout on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenFlyout(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleFlyoutToggle = (title: string, url: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (openFlyout === title) { setOpenFlyout(null); return; }
    const sidebarEl = e.currentTarget.closest('[data-sidebar="sidebar"]');
    const sidebarRect = sidebarEl?.getBoundingClientRect();
    const btnRect = e.currentTarget.getBoundingClientRect();
    const left = sidebarRect ? sidebarRect.right + 4 : btnRect.right + 8;
    const top = Math.min(btnRect.top, window.innerHeight - 300);
    setFlyoutX(left);
    setFlyoutY(Math.max(8, top));
    setOpenFlyout(title);
    // Navigate to the module's landing page when opening the flyout so the
    // main content area always changes — regardless of whether the user clicked
    // the label or the chevron.
    if (url) navigate(url);
  };

  // ── Submenu data ─────────────────────────────────────────────────────────────
  const expenseBadge = expenseAlert?.hasOpenExpenses ? (
    <Badge variant="destructive" className="h-4 px-1 text-xs animate-pulse ml-auto" data-testid="badge-expense-alert">
      <Bell className="h-2.5 w-2.5 mr-0.5" />{expenseAlert.overdueCount}
    </Badge>
  ) : undefined;

  // Must be declared before getSubmenu so the "Data Ops" case can reference it
  // without hitting the const temporal dead zone on re-renders.
  const dataOpsLinks = [
    { url: "/data-imports",                        icon: Upload,      label: "Data Imports",          testId: "sidebar-link-data-imports"       },
    { url: "/reports/moves-import",                icon: Upload,      label: "Moves Import (Legacy)", testId: "sidebar-link-imports"            },
    { url: "/reports/draiver-import",              icon: Upload,      label: "Draiver Import",        testId: "sidebar-link-draiver-import"     },
    { url: "/admin/integrations/replay",           icon: History,     label: "Replay & Backfill",     testId: "sidebar-link-replay"             },
    { url: "/admin/integrations/processing",       icon: PlayCircle,  label: "Processing Queue",      testId: "sidebar-link-processing-queue"   },
    { url: "/admin/integrations/dlq",              icon: XCircle,     label: "Dead Letter Queue",     testId: "sidebar-link-dlq"                },
    { url: "/admin/integrations/mapping",          icon: Link2,       label: "Mapping Health",        testId: "sidebar-link-mapping-health"     },
    { url: "/admin/integrations/microsoft-graph",  icon: Mail,        label: "Microsoft 365 Email",   testId: "sidebar-link-microsoft-graph"    },
    { url: "/admin/provider-health",               icon: HeartPulse,  label: "Provider Health",       testId: "sidebar-link-provider-health"    },
    { url: "/admin/data/retention",                icon: Database,    label: "Retention Policies",    testId: "sidebar-link-retention-policies" },
    { url: "/admin/data/date-repair",              icon: Wrench,      label: "Data Repair",           testId: "sidebar-link-data-repair"        },
  ];

  function getSubmenu(title: string): FlyoutEntry[] {
    switch (title) {
      case "Drivers":
        return [
          { kind: "link", title: "Mass Import",     url: "/drivers/mass-import",          icon: Upload,        testId: "sidebar-driver-mass-import"  },
          { kind: "link", title: "Needs Update",    url: "/drivers/needs-update",          icon: AlertTriangle, testId: "sidebar-driver-needs-update" },
          { kind: "link", title: "Resources",       url: "/drivers/resources",             icon: BookOpen,      testId: "sidebar-driver-resources"    },
          { kind: "link", title: "At Risk Drivers", url: "/corporate/at-risk-drivers",     icon: ShieldAlert,   testId: "sidebar-at-risk-drivers"     },
        ];
      case "Claims":
        return [
          { kind: "link", title: "Claims List",            url: "/claims",                        icon: ListChecks,      testId: "sidebar-claims-list"       },
          { kind: "link", title: "Dashboard",              url: "/claims/dashboard",              icon: LayoutDashboard, testId: "sidebar-claims-dashboard"  },
          ...(isSuperAdmin ? [{ kind: "link" as const, title: "Import Claims",    url: "/claims/import",                icon: Upload,         testId: "sidebar-claims-import"     }] : []),
          { kind: "link", title: "Case Queue",             url: "/claims/case-queue",             icon: Shield,          testId: "sidebar-claims-case-queue" },
          { kind: "link", title: "RISP Controls",          url: "/claims/risp-controls",         icon: ClipboardCheck,  testId: "sidebar-risp-controls"     },
          { kind: "link", title: "RISP Insurance Summary", url: "/claims/risp-insurance-summary", icon: FileBarChart,    testId: "sidebar-risp-summary"      },
        ];
      case "Scheduling":
        return schedulingSubItems.map(s => ({ kind: "link" as const, title: s.title, url: s.url, icon: s.icon, testId: `sidebar-scheduling-${s.title.toLowerCase().replace(/\s+/g, "-")}` }));
      case "Payments":
        return [
          { kind: "link", title: "Payments",   url: "/payment",     icon: Wallet,     testId: "sidebar-payments-payments", activeWhen: (l) => l === "/payment" || l.startsWith("/payment/") || l.startsWith("/payments/") },
          { kind: "link", title: "Bills (AP)", url: "/admin/bills", icon: Receipt,    testId: "sidebar-payments-bills"    },
          { kind: "link", title: "Payables",   url: "/ap-payables", icon: DollarSign, testId: "sidebar-payments-payables" },
          { kind: "link", title: "Expenses",   url: "/expenses",    icon: FileText,   testId: "sidebar-payments-expenses", badge: expenseBadge },
          { kind: "link", title: "Vendors",    url: "/vendors",     icon: Building2,  testId: "sidebar-payments-vendors"  },
        ];
      case "Finance":
        return [
          { kind: "link", title: "Dashboard",       url: "/finance",            icon: LayoutDashboard, testId: "sidebar-finance-dashboard"  },
          { kind: "link", title: "Revenue",         url: "/finance/revenue",    icon: TrendingUp,      testId: "sidebar-finance-revenue"     },
          { kind: "link", title: "Expenses",        url: "/finance/expenses",   icon: Receipt,         testId: "sidebar-finance-expenses"    },
          { kind: "link", title: "Cash Flow",       url: "/finance/cash-flow",  icon: Activity,        testId: "sidebar-finance-cash-flow"   },
          { kind: "link", title: "QB Sync Center",  url: "/finance/qb-sync",    icon: Database,        testId: "sidebar-finance-qb-sync"     },
        ];
      case "Reports & Analytics":
        return [
          { kind: "section", label: "Operational" },
          { kind: "link", title: "Operations Map",                    url: "/ops-map",                         icon: MapPin,          testId: "sidebar-reports-operations-map",           activeWhen: (l) => l.startsWith("/ops-map") },
          { kind: "link", title: "Account Map",                       url: "/reports/account-map",             icon: Globe,           testId: "sidebar-reports-account-map",              activeWhen: (l) => l.startsWith("/reports/account-map") },
          { kind: "link", title: "Driver Utilization vs Rideshare",   url: "/reports/rideshare-optimization",  icon: Activity,        testId: "sidebar-reports-rideshare-optimization",   activeWhen: (l) => l.startsWith("/reports/rideshare-optimization") },
          { kind: "link", title: "Move Profitability",                url: "/reports/move-profitability",      icon: Truck,           testId: "sidebar-reports-move-profitability",        activeWhen: (l) => l.startsWith("/reports/move-profitability") },
          { kind: "link", title: "Move Reports",                     url: "/reports/moves",                   icon: BarChart2,        testId: "sidebar-reports-moves",                    activeWhen: (l) => l.startsWith("/reports/moves") },
          { kind: "link", title: "Driver Intelligence",              url: "/reports/driver-intelligence",     icon: BrainCircuit,    testId: "sidebar-reports-driver-intelligence",      activeWhen: (l) => l.startsWith("/reports/driver-intelligence") },
          { kind: "link", title: "Driver Engagement & Retention",   url: "/reports/driver-engagement",       icon: Activity,        testId: "sidebar-reports-driver-engagement",        activeWhen: (l) => l.startsWith("/reports/driver-engagement") },
          { kind: "section", label: "Financial" },
          { kind: "link", title: "Account Profitability",             url: "/reports/account-profitability",   icon: Building2,       testId: "sidebar-reports-account-profitability",    activeWhen: (l) => l.startsWith("/reports/account-profitability") },
          { kind: "link", title: "Invoice & DR Reconciliation",       url: "/reports/reconciliation",          icon: AlertTriangle,   testId: "sidebar-reports-reconciliation",            activeWhen: (l) => l.startsWith("/reports/reconciliation") },
          { kind: "link", title: "OpenForce Reconciliation",          url: "/reports/openforce",               icon: FileSpreadsheet, testId: "sidebar-reports-openforce",                activeWhen: (l) => l.startsWith("/reports/openforce") },
          { kind: "link", title: "Rideshare Reconciliation",          url: "/reports/rideshare",               icon: Route,           testId: "sidebar-reports-rideshare",                activeWhen: (l) => l === "/reports/rideshare" },
          { kind: "section", label: "Custom" },
          { kind: "link", title: "Custom Reporting & Intelligence",   url: "/reports/custom",                  icon: Sparkles,        testId: "sidebar-reports-custom-intelligence",      activeWhen: (l) => l.startsWith("/reports/custom") },
          { kind: "link", title: "Report Builder",                    url: "/reports",                         icon: FileBarChart,    testId: "sidebar-reports-builder",                  activeWhen: (l) => l === "/reports" },
          { kind: "section", label: "Data" },
          { kind: "link", title: "Data Imports",                      url: "/data-imports",                    icon: Upload,          testId: "sidebar-reports-data-imports",             activeWhen: (l) => l.startsWith("/data-imports") },
        ];
      case "Data Ops":
        return dataOpsLinks.map(l => ({ kind: "link" as const, title: l.label, url: l.url, icon: l.icon, testId: l.testId }));
      case "Recruiting":
        return [
          { kind: "link", title: "Candidates",          url: "/recruiting/candidates",          icon: Users,             testId: "sidebar-recruiting-candidates"          },
          { kind: "link", title: "Pipeline",             url: "/recruiting/pipeline",             icon: GitMerge,          testId: "sidebar-recruiting-pipeline"            },
          { kind: "link", title: "Job Postings",         url: "/recruiting",                      icon: Briefcase,         testId: "sidebar-recruiting-job-postings",        activeWhen: (l) => l === "/recruiting" },
          { kind: "link", title: "Referral Campaigns",   url: "/recruiting/referral-campaigns",   icon: Megaphone,         testId: "sidebar-recruiting-referral-campaigns"   },
          { kind: "link", title: "Referral Analytics",   url: "/recruiting/referral-analytics",   icon: BarChart2,         testId: "sidebar-recruiting-referral-analytics"   },
          { kind: "link", title: "Referral Settings",    url: "/recruiting/referral-settings",    icon: SlidersHorizontal, testId: "sidebar-recruiting-referral-settings"    },
          { kind: "link", title: "Campaign Manager",     url: "/recruiting/campaigns",            icon: Megaphone,         testId: "sidebar-recruiting-campaign-manager"     },
          { kind: "link", title: "Workforce Planning",   url: "/recruiting/workforce-planning",   icon: Map,               testId: "sidebar-recruiting-workforce-planning"   },
          { kind: "link", title: "Recruiting Requests",  url: "/recruiting/requests",             icon: ClipboardList,     testId: "sidebar-recruiting-recruiting-requests"  },
        ];
      case "Dashboard":
        return dashboardSubItems.map(s => ({ kind: "link" as const, title: s.title, url: s.url, icon: s.icon, testId: `sidebar-dashboard-${s.title.toLowerCase().replace(/\s+/g, "-")}`, activeWhen: (l: string) => s.url === "/" ? l === "/" : l === s.url || (s.url !== "/" && l.startsWith(s.url)) }));
      case "Billing & Accounting":
        return [
          { kind: "link", title: "Billing",              url: "/billing",                    icon: Landmark,    testId: "sidebar-billing-billing",      activeWhen: (l) => l === "/billing" },
          ...((isSuperAdmin || isCorporateAccessAdmin) ? [{ kind: "link" as const, title: "Accounting", url: "/accounting", icon: Calculator, testId: "sidebar-billing-accounting", activeWhen: (l: string) => l === "/accounting" }] : []),
          { kind: "link", title: "WIW Invoice Preview",  url: "/billing/wiw-invoice-preview", icon: Timer,       testId: "sidebar-billing-wiw-invoice",  activeWhen: (l) => l === "/billing/wiw-invoice-preview" },
          { kind: "link", title: "QB Expenses",          url: "/accounting/expenses",         icon: Receipt,     testId: "sidebar-billing-qbo-expenses", activeWhen: (l) => l === "/accounting/expenses" },
        ];
      case "Sales":
        return [
          { kind: "link", title: "Market Pricing Overview", url: "/sales/market-pricing-overview", icon: SlidersHorizontal, testId: "sidebar-sales-market-pricing-overview", activeWhen: (l) => l.startsWith("/sales/market-pricing-overview") },
          { kind: "link", title: "Pricing Administration", url: "/sales/pricing", icon: DollarSign, testId: "sidebar-sales-pricing-administration", activeWhen: (l) => l === "/sales/pricing" },
          { kind: "link", title: "Pricing Reference", url: "/sales/pricing/reference", icon: FileText, testId: "sidebar-sales-pricing-reference", activeWhen: (l) => l.startsWith("/sales/pricing/reference") },
        ];
      default: return [];
    }
  }

  const flyoutSubmenu: FlyoutEntry[] = openFlyout ? getSubmenu(openFlyout) : [];

  // ── Render a single nav item ──────────────────────────────────────────────────
  function renderNavItem(item: NavItem) {
    const active = isItemActive(item);
    const hasSubmenu = !!item.hasSubmenu;
    const isFlyoutOpen = openFlyout === item.title;

    // Finance: hide unless permitted
    if (item.title === "Finance" && !hasFinanceModuleAccess && !isSuperAdmin) return null;
    // Data Ops: super admins only
    if (item.title === "Data Ops" && !isSuperAdmin) return null;

    if (item.isAMR) {
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={location === item.url} tooltip="Modification Requests">
            <a href={item.url} data-testid="sidebar-link-amr">
              <item.icon className="h-4 w-4" />
              <span className="flex items-center gap-2">
                Modification Requests
                {(ticketOpenCount?.count ?? 0) > 0 && (
                  <Badge className="h-5 px-1.5 text-xs bg-orange-500 text-white" data-testid="badge-ticket-submitted-count">
                    {ticketOpenCount?.count}
                  </Badge>
                )}
              </span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    if (!hasSubmenu) {
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
            <a href={item.url} data-testid={`sidebar-link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.title}>
        <div className="flex items-center w-full">
          <SidebarMenuButton
            asChild
            isActive={active}
            tooltip={item.title}
            className="flex-1 min-w-0"
          >
            <a href={item.url} data-testid={`sidebar-link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </a>
          </SidebarMenuButton>
          <button
            data-flyout-trigger
            data-touch-target="icon"
            onClick={(e) => handleFlyoutToggle(item.title, item.url, e)}
            className={cn(
              "shrink-0 h-7 w-7 flex items-center justify-center rounded-md transition-colors",
              isFlyoutOpen
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent"
            )}
            aria-label={`Open ${item.title} submenu`}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </SidebarMenuItem>
    );
  }

  // ── Platform Admin flyout items ───────────────────────────────────────────────
  const platformAdminLinks = [
    { url: "/admin/external-access",             icon: KeyRound,      label: "External Access",        testId: "sidebar-link-external-access"           },
    { url: "/admin/finance-permissions",         icon: TrendingUp,    label: "Finance Permissions",    testId: "sidebar-link-finance-permissions"        },
    { url: "/admin/vendor-permissions",          icon: Truck,         label: "Vendor Permissions",     testId: "sidebar-link-vendor-permissions"         },
    { url: "/integration-api",                   icon: Cable,         label: "Integration API",        testId: "sidebar-link-integration-api"            },
    { url: "/admin/platform-config",             icon: Settings2,     label: "Platform Config",        testId: "sidebar-link-platform-config"            },
    { url: "/admin/transportation-methods",      icon: Truck,         label: "Transportation Methods", testId: "sidebar-link-transportation-methods"     },
    { url: "/admin/move-types",                  icon: Route,         label: "Move Types",             testId: "sidebar-link-move-types"                 },
    { url: "/admin/move-templates",              icon: FileStack,     label: "Move Templates",         testId: "sidebar-link-move-templates"             },
    { url: "/admin/move-tasks",                  icon: ListChecks,    label: "Move Tasks",             testId: "sidebar-link-move-tasks"                 },
    { url: "/admin/communications",              icon: MessageSquare, label: "Communications Center",  testId: "sidebar-link-communications-center"      },
    { url: "/admin/user-feedback",               icon: MessageSquare, label: "User Feedback",          testId: "sidebar-link-user-feedback"              },
    { url: "/admin/integrations/microsoft-graph",icon: Mail,          label: "Microsoft 365 Email",    testId: "sidebar-link-microsoft-graph-admin"      },
    { url: "/integrations/stripe",               icon: CreditCard,    label: "Stripe Payments",        testId: "sidebar-link-stripe-settings"            },
    { url: "/admin/report-delivery-monitor",     icon: Activity,      label: "Delivery Status",        testId: "sidebar-link-report-delivery-monitor"    },
    { url: "/admin/weekly-report-recipients",    icon: Users,         label: "Report Recipients",      testId: "sidebar-link-weekly-report-recipients"   },
    { url: "/admin/teams",                       icon: Users,         label: "Team Queues",            testId: "sidebar-link-team-queues"                },
    { url: "/insurance-cards",                   icon: Shield,        label: "Insurance Cards",        testId: "sidebar-link-insurance-cards"            },
    { url: "/compliance/license-review",         icon: ShieldCheck,   label: "License Review",         testId: "sidebar-link-license-review"             },
    { url: "/admin/account-reports",             icon: FileBarChart,  label: "Account Reports",        testId: "sidebar-link-account-reports"            },
  ];

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarRail />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <div className="px-2 pt-[42px] pb-4">
                <h2
                  style={{ color: "#1F1F68" }}
                  className="text-lg font-bold tracking-tight leading-none"
                >
                  Driver Operations
                </h2>
              </div>
            </SidebarGroupLabel>

            {/* Section divider — separates heading from nav items */}
            <div className="mx-3 mb-3 h-px" style={{ background: "hsl(0 0% 82%)" }} />

            <SidebarGroupContent>
              <SidebarMenu>

                {/* Primary nav items (ordered per spec) */}
                {primaryNavItems.map(renderNavItem)}

                {/* Separator between primary and secondary */}
                <div className="my-1 mx-2 border-t border-sidebar-border/50" />

                {/* Secondary nav items */}
                {secondaryNavItems.map(renderNavItem)}

                {/* Account Reports — corporate/corporate_admin only (super admins access via Platform Admin) */}
                {!isSuperAdmin && (user?.role === "corporate" || user?.role === "corporate_admin") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.startsWith("/admin/account-reports")} tooltip="Account Reports">
                      <a href="/admin/account-reports" data-testid="sidebar-link-account-reports-corporate">
                        <FileBarChart className="h-4 w-4" />
                        <span>Account Reports</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Platform Admin — super admin flyout */}
                {isSuperAdmin && (
                  <SidebarMenuItem>
                    <div className="flex items-center w-full">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/platform-admin" || isPlatformAdminUtilityActive}
                        tooltip="Platform Admin"
                        className="flex-1 min-w-0"
                      >
                        <a href="/platform-admin" data-testid="sidebar-link-platform-admin">
                          <ShieldCheck className="h-4 w-4" />
                          <span>Platform Admin</span>
                        </a>
                      </SidebarMenuButton>
                      <button
                        data-flyout-trigger
                        onClick={(e) => handleFlyoutToggle("Platform Admin", "", e)}
                        className={cn(
                          "shrink-0 h-7 w-7 flex items-center justify-center rounded-md transition-colors",
                          openFlyout === "Platform Admin"
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "hover:bg-sidebar-accent"
                        )}
                        aria-label="Open Platform Admin submenu"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </SidebarMenuItem>
                )}

              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      {/* ── Flyout panel ─────────────────────────────────────────────────────── */}
      {openFlyout && (flyoutSubmenu.length > 0 || openFlyout === "Platform Admin") && (
        <div
          ref={flyoutRef}
          className="fixed z-50 w-60 rounded-lg border bg-popover shadow-lg overflow-hidden"
          style={{
            left: flyoutX,
            top: flyoutY,
            maxHeight: "calc(100vh - 32px)",
          }}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b bg-muted/40">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{openFlyout}</p>
          </div>

          {/* Items */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 100px)" }}>
            {openFlyout === "Platform Admin" ? (
              <div className="py-1">
                {platformAdminLinks.map(link => (
                  <a
                    key={link.url}
                    href={link.url}
                    data-testid={link.testId}
                    onClick={() => setOpenFlyout(null)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-sm mx-1 rounded-md hover:bg-accent transition-colors",
                      location.startsWith(link.url) && "bg-accent font-medium"
                    )}
                  >
                    <link.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{link.label}</span>
                  </a>
                ))}

              </div>
            ) : (
              <div className="py-1">
                {flyoutSubmenu.map((entry, i) => {
                  if (entry.kind === "section") {
                    return (
                      <p key={`section-${i}`} className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {entry.label}
                      </p>
                    );
                  }
                  const isActive = entry.activeWhen ? entry.activeWhen(location) : location === entry.url;
                  return (
                    <a
                      key={entry.url + entry.title}
                      href={entry.url}
                      data-testid={entry.testId}
                      onClick={() => setOpenFlyout(null)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 text-sm mx-1 rounded-md hover:bg-accent transition-colors",
                        isActive && "bg-accent font-medium"
                      )}
                    >
                      <entry.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{entry.title}</span>
                      {entry.badge}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
