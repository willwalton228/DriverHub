import { useState, useEffect, useRef, Component, type ReactNode, type ErrorInfo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { Ticket, TicketComment, TicketAttachment, TicketWorkLog, QuickIdea, ProductMilestone, MilestoneDeliverable } from "@shared/schema";
import { MILESTONE_STATUS_LABELS } from "@shared/schema";
import { SubmitTicketDrawer } from "@/components/SubmitTicketDrawer";
import { AmrEpicPicker } from "@/components/amr/AmrEpicPicker";
import { AttachmentDropZone } from "@/components/AttachmentDropZone";
import { TICKET_STATUSES, TICKET_TYPES, TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, TICKET_ACTIVE_STATUSES, TICKET_STATUS_LABELS, TICKET_AGING_THRESHOLDS, TICKET_DAYS_WARNING, TICKET_DAYS_CRITICAL, TICKET_GOVERNANCE_TERMINAL, AMR_APPLICATION_SCOPES, AMR_DEV_TEAMS, AMR_PLANNING_STATUSES, AMR_PLANNING_STATUS_LABELS, AMR_PLANNING_STATUS_COLORS, TICKET_MODULE_DEFINITIONS, TICKET_MODULE_LABELS } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// Tooltip removed — Priority help uses Popover only in compact detail layout
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Bug,
  Lightbulb,
  Zap,
  Clock,
  MessageSquare,
  Paperclip,
  Calendar as CalendarIcon,
  Send,
  ClipboardList,
  User,
  ChevronRight,
  Trash2,
  X,
  Search,
  AlertCircle,
  CheckCircle,
  Copy,
  Package,
  Plus,
  Eye,
  Pencil,
  FileText,
  Rocket,
  CalendarClock,
  AlertTriangle,
  Activity,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  XCircle,
  LayoutGrid,
  List,
  Star,
  ShieldCheck,
  Trophy,
  HelpCircle,
  Sparkles,
  Archive,
  CheckCheck,
  StickyNote,
  Download,
  ExternalLink,
  Lock,
  Crown,
  Users,
  User as UserIcon,
  Layers,
  Brain,
  Gauge,
  RefreshCw,
  Shield,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { ProductImprovementScore } from "@/components/amr/ProductImprovementScore";
import { RoadmapReliability } from "@/components/amr/RoadmapReliability";
import { format, parseISO } from "date-fns";

type EnrichedTicketAttachment = TicketAttachment & { uploadedByUsername?: string | null };

type CcUserEntry = {
  id: string;
  userId: string;
  addedAt: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

type TesterEntry = {
  id: string;
  userId: string;
  assignedAt: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

type TicketWithDetails = Ticket & {
  comments: TicketComment[];
  attachments: EnrichedTicketAttachment[];
  workLogs: TicketWorkLog[];
  assignedToUsername?: string | null;
  productOwnerUsername?: string | null;
  developerUsername?: string | null;
  scheduledDevelopmentDate?: string | null;
  scheduledDeploymentDate?: string | null;
  firstScheduledDevelopmentDate?: string | null;
  firstScheduledDeploymentDate?: string | null;
  releaseCheckpoint?: string | null;
  planningStatus?: string | null;
  phaseId?: string | null;
  ccUsers?: CcUserEntry[];
  testers?: TesterEntry[];
};

type ReleaseItem = {
  id: string;
  releaseId: string;
  ticketId: string;
  ticketNumber: string;
  ticketTitle: string;
  ticketType: string;
  ticketModule: string;
  groupLabel: string;
  epicId: string | null;
  epicName: string | null;
  noteOverride: string | null;
  sortOrder: number;
};

type EpicSummary = {
  epicId: string | null;
  epicName: string;
  summary: string;
};

type ReleaseWithItems = {
  id: string;
  version: string;
  title: string;
  summary: string | null;
  epicSummaries: EpicSummary[] | null;
  status: string;
  publishedAt: string | null;
  releaseDate: string | null;
  releaseCheckpoint: string | null;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
  items: ReleaseItem[];
};

type PhaseOption = {
  id: string;
  name: string;
  epicId?: string | null;
  description?: string | null;
  targetDate?: string | null;
};

async function fetchPhaseOptions(url: string): Promise<PhaseOption[]> {
  const response = await fetch(url, { credentials: "include" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Failed to load phases");
  }
  // The endpoint returns an array. Keep the detail page resilient if an
  // intermediary or older deployment returns an error envelope instead.
  return Array.isArray(payload) ? payload : [];
}

const TICKET_ADMIN_ROLES = ['super_user', 'super_admin', 'admin', 'ops_manager', 'corporate_admin'];

const STATUS_LABELS: Record<string, string> = TICKET_STATUS_LABELS;

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  reviewed: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  sent_back_for_info: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  prioritizing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  in_queue: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  in_development: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  in_production: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  needs_testing: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  user_accepts: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  user_declines: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  received: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  sent_back_for_feedback: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  complete: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  on_roadmap: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  product_decision_required: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  duplicate: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  P1: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  P2: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  P3: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  P4: "bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400",
};

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

const PRIORITY_DEFINITIONS = [
  { level: "P0", name: "Critical", description: "System-blocking issue or major defect that stops operations and requires immediate fix." },
  { level: "P1", name: "High", description: "Serious issue impacting workflow or data accuracy that should be fixed in the next release." },
  { level: "P2", name: "Medium", description: "Important improvement or non-blocking bug scheduled in normal development." },
  { level: "P3", name: "Low", description: "Minor enhancement or usability improvement with low operational impact." },
  { level: "P4", name: "Future", description: "Idea captured for the roadmap but not scheduled for development." },
];

class TicketDetailErrorBoundary extends Component<{ children: ReactNode; onBack: () => void }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode; onBack: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[TicketDetail crash]", error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-4 p-6">
          <Button variant="ghost" size="sm" onClick={this.props.onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
          </Button>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="font-medium">This ticket failed to load</p>
            <p className="text-sm text-muted-foreground max-w-sm">{this.state.error?.message || "An unexpected error occurred rendering the ticket detail."}</p>
            <Button onClick={() => this.setState({ hasError: false, error: null })}>Try Again</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TYPE_ICONS: Record<string, typeof Bug> = {
  architectural_changes:  Layers,
  artificial_intelligence: Brain,
  bug:                    Bug,
  enhancement:            Zap,
  epic:                   Layers,
  feature_request:        Lightbulb,
  performance:            Gauge,
  security_compliance:    Shield,
  synchronization:        RefreshCw,
  user_experience:        Sparkles,
};

const TYPE_LABELS: Record<string, string> = {
  architectural_changes:  "Architectural Changes",
  artificial_intelligence: "Artificial Intelligence",
  bug:                    "Bug",
  enhancement:            "Enhancement",
  epic:                   "Epic",
  feature_request:        "Feature Request",
  performance:            "Performance",
  security_compliance:    "Security / Compliance",
  synchronization:        "Synchronization",
  user_experience:        "User Experience",
};

function formatModuleLabel(key: string | null | undefined): string {
  if (!key) return "";
  return TICKET_MODULE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(d: string | Date | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function formatDateTime(d: string | Date | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ── Roadmap Dashboard View ─────────────────────────────────────────────────────
// Ticket requirement items 10, 11, 12, 14

function RoadmapView({ isAdmin, onSwitchTab, initialView = "all" }: { isAdmin: boolean; onSwitchTab: (tab: any) => void; initialView?: string }) {
  const { toast } = useToast();

  // Planning-status filter — shared by both the planning tiles and the Planning Status dropdown.
  // Initialized from `initialView` so the Roadmapped KPI on the main list pre-selects "roadmapped".
  const [filterPlanningStatus, setFilterPlanningStatus] = useState<string>(initialView);
  // Date-based operational view — driven only by the date/operational tiles.
  const [selectedDateView, setSelectedDateView] = useState<string>("all");
  // Additional stacking filters
  const [filterEpic, setFilterEpic] = useState<string>("all");
  const [filterPhase, setFilterPhase] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterSchedDevFrom, setFilterSchedDevFrom] = useState<string>("");
  const [filterSchedDevTo, setFilterSchedDevTo] = useState<string>("");
  const [filterSchedDeployFrom, setFilterSchedDeployFrom] = useState<string>("");
  const [filterSchedDeployTo, setFilterSchedDeployTo] = useState<string>("");

  const { data: amrMetrics } = useQuery<{
    planningBacklog?: number; planningRoadmapped?: number; planningUnscheduled?: number;
    planningScheduled?: number; planningStartingSoon?: number; planningDeployDueSoon?: number;
    planningAtRisk?: number; planningOverdue?: number; planningCompletedRoadmap?: number;
    roadmap?: number;
    dueTodayAll?: number; dueTodayRoadmap?: number;
    dueThisWeekAll?: number; dueThisWeekRoadmap?: number;
  }>({ queryKey: ["/api/tickets/amr-metrics"], refetchInterval: 30000 });

  const { data: epicsList = [] } = useQuery<{ id: string; name: string; amrCount: number }[]>({
    queryKey: ['/api/epics'],
  });
  const { data: phasesList = [] } = useQuery<{ id: string; name: string; epicId: string | null }[]>({
    queryKey: ['/api/amr/phases', filterEpic],
    queryFn: () =>
      filterEpic !== "all"
        ? fetchPhaseOptions(`/api/amr/phases?epicId=${encodeURIComponent(filterEpic)}`)
        : Promise.resolve([]),
    enabled: filterEpic !== "all",
  });

  // ── Product Milestones ──────────────────────────────────────────────────────
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<any>(null);
  const [milestoneForm, setMilestoneForm] = useState({ name: '', description: '', targetDate: '', status: 'not_started' });
  const [showDeliverableForm, setShowDeliverableForm] = useState(false);
  const [editingDeliverable, setEditingDeliverable] = useState<any>(null);
  const [deliverableForm, setDeliverableForm] = useState({ name: '', targetDate: '', status: 'not_started', notes: '' });
  // Deliverable link dialogs
  const [activeDeliverable, setActiveDeliverable]     = useState<any>(null);
  const [showEpicLinkDialog, setShowEpicLinkDialog]   = useState(false);
  const [showAmrLinkDialog, setShowAmrLinkDialog]     = useState(false);
  const [showEpicSpecDialog, setShowEpicSpecDialog]   = useState(false);
  const [epicSpecText, setEpicSpecText]               = useState('');
  const [linkSearch, setLinkSearch]                   = useState('');

  const { data: milestones = [], isLoading: milestonesLoading } = useQuery<any[]>({
    queryKey: ['/api/product-milestones'],
    staleTime: 30_000,
  });

  const createMilestoneMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/product-milestones', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }); setShowMilestoneForm(false); setEditingMilestone(null); },
    onError: () => toast({ title: 'Error', description: 'Failed to save milestone.', variant: 'destructive' }),
  });
  const updateMilestoneMut = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/product-milestones/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }); setShowMilestoneForm(false); setEditingMilestone(null); },
    onError: () => toast({ title: 'Error', description: 'Failed to save milestone.', variant: 'destructive' }),
  });
  const deleteMilestoneMut = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/product-milestones/${id}`),
    onSuccess: (_d, id) => { queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }); if (selectedMilestoneId === id) setSelectedMilestoneId(null); },
    onError: () => toast({ title: 'Error', description: 'Failed to delete milestone.', variant: 'destructive' }),
  });
  const createDeliverableMut = useMutation({
    mutationFn: ({ milestoneId, ...data }: any) => apiRequest('POST', `/api/product-milestones/${milestoneId}/deliverables`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }); setShowDeliverableForm(false); setEditingDeliverable(null); },
    onError: () => toast({ title: 'Error', description: 'Failed to save deliverable.', variant: 'destructive' }),
  });
  const updateDeliverableMut = useMutation({
    mutationFn: ({ milestoneId, id, ...data }: any) => apiRequest('PUT', `/api/product-milestones/${milestoneId}/deliverables/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }); setShowDeliverableForm(false); setEditingDeliverable(null); },
    onError: () => toast({ title: 'Error', description: 'Failed to save deliverable.', variant: 'destructive' }),
  });
  const deleteDeliverableMut = useMutation({
    mutationFn: ({ milestoneId, id }: any) => apiRequest('DELETE', `/api/product-milestones/${milestoneId}/deliverables/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }),
    onError: () => toast({ title: 'Error', description: 'Failed to delete deliverable.', variant: 'destructive' }),
  });
  const linkDeliverableEpicMut = useMutation({
    mutationFn: ({ milestoneId, deliverableId, epicId }: any) => apiRequest('POST', `/api/product-milestones/${milestoneId}/deliverables/${deliverableId}/epics`, { epicId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }); },
    onError: () => toast({ title: 'Error', description: 'Failed to link epic.', variant: 'destructive' }),
  });
  const unlinkDeliverableEpicMut = useMutation({
    mutationFn: ({ milestoneId, deliverableId, epicId }: any) => apiRequest('DELETE', `/api/product-milestones/${milestoneId}/deliverables/${deliverableId}/epics/${epicId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }); },
    onError: () => toast({ title: 'Error', description: 'Failed to unlink epic.', variant: 'destructive' }),
  });
  const linkDeliverableAmrMut = useMutation({
    mutationFn: ({ milestoneId, deliverableId, ticketId }: any) => apiRequest('POST', `/api/product-milestones/${milestoneId}/deliverables/${deliverableId}/amrs`, { ticketId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }); },
    onError: () => toast({ title: 'Error', description: 'Failed to link AMR.', variant: 'destructive' }),
  });
  const unlinkDeliverableAmrMut = useMutation({
    mutationFn: ({ milestoneId, deliverableId, ticketId }: any) => apiRequest('DELETE', `/api/product-milestones/${milestoneId}/deliverables/${deliverableId}/amrs/${ticketId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/product-milestones'] }); },
    onError: () => toast({ title: 'Error', description: 'Failed to unlink AMR.', variant: 'destructive' }),
  });

  // AMR picker — load all non-cancelled tickets when link dialog opens
  const { data: allAmrsForPicker = [] } = useQuery<any[]>({
    queryKey: ['/api/tickets?excludeCompleted=false'],
    enabled: showAmrLinkDialog,
    staleTime: 60_000,
  });

  const today = new Date().toISOString().split("T")[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  // Tomorrow and end-of-current-week (Sunday) for Due This Week views.
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const _todayDate = new Date();
  const _daysToSunday = _todayDate.getDay() === 0 ? 0 : 7 - _todayDate.getDay();
  const _sundayDate = new Date(_todayDate); _sundayDate.setDate(_todayDate.getDate() + _daysToSunday);
  const endOfWeekSunday = _sundayDate.toISOString().split("T")[0];

  // Build query params from all active filters.
  const listParams = new URLSearchParams();
  listParams.set("excludeCompleted", "false");

  // Planning status from tile or dropdown
  if (filterPlanningStatus !== "all") listParams.set("planningStatus", filterPlanningStatus);

  // Date-based tile params (override date-range inputs when a tile is active)
  if (selectedDateView === "startingSoon")        { listParams.set("schedDevFrom", today);    listParams.set("schedDevTo", in7Days);  listParams.set("excludeCompleted", "true"); }
  if (selectedDateView === "deployDueSoon")       { listParams.set("schedDeployFrom", today); listParams.set("schedDeployTo", in7Days); listParams.set("excludeCompleted", "true"); }
  if (selectedDateView === "atRisk")              { listParams.set("schedDevTo", yesterday);           listParams.set("excludeCompleted", "true"); }
  if (selectedDateView === "overdue")             { listParams.set("schedDeployTo", yesterday);        listParams.set("excludeCompleted", "true"); }
  if (selectedDateView === "completed")           { listParams.set("status", "completed"); }
  // Due Today / Due This Week — use OR-date params added in server
  if (selectedDateView === "dueToday")            { listParams.set("dueOnDate", today);      listParams.set("excludeCompleted", "true"); }
  if (selectedDateView === "dueTodayRoadmap")     { listParams.set("dueOnDate", today);      listParams.set("excludeCompleted", "true"); listParams.set("planningStatus", "roadmapped"); }
  // Due This Week: today through Sunday (inclusive). Today is intentionally included so this is
  // a superset of Due Today, matching the Mon–Sun week definition.
  if (selectedDateView === "dueThisWeek")         { listParams.set("dueInRangeFrom", today); listParams.set("dueInRangeTo", endOfWeekSunday); listParams.set("excludeCompleted", "true"); }
  if (selectedDateView === "dueThisWeekRoadmap")  { listParams.set("dueInRangeFrom", today); listParams.set("dueInRangeTo", endOfWeekSunday); listParams.set("excludeCompleted", "true"); listParams.set("planningStatus", "roadmapped"); }

  // Additional stacking filters
  if (filterEpic !== "all")    listParams.set("epic", filterEpic);
  if (filterPhase !== "all")   listParams.set("phase", filterPhase);
  if (filterPriority !== "all") listParams.set("priority", filterPriority);
  if (filterModule !== "all")  listParams.set("module", filterModule);
  // Date range inputs only apply when no date tile is active
  if (selectedDateView === "all") {
    if (filterSchedDevFrom)    listParams.set("schedDevFrom",    filterSchedDevFrom);
    if (filterSchedDevTo)      listParams.set("schedDevTo",      filterSchedDevTo);
    if (filterSchedDeployFrom) listParams.set("schedDeployFrom", filterSchedDeployFrom);
    if (filterSchedDeployTo)   listParams.set("schedDeployTo",   filterSchedDeployTo);
  }

  const listUrl = `/api/tickets?${listParams.toString()}`;
  const { data: roadmapTickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: [listUrl],
    staleTime: 30_000,
  });

  const DUE_DATE_VIEWS = ["dueToday", "dueTodayRoadmap", "dueThisWeek", "dueThisWeekRoadmap"] as const;
  type DueDateView = typeof DUE_DATE_VIEWS[number];

  const hasActiveFilters =
    filterPlanningStatus !== "all" || selectedDateView !== "all" ||
    filterEpic !== "all" || filterPhase !== "all" || filterPriority !== "all" ||
    filterModule !== "all" || filterSchedDevFrom !== "" || filterSchedDevTo !== "" ||
    filterSchedDeployFrom !== "" || filterSchedDeployTo !== "";

  function clearFilters() {
    setFilterPlanningStatus("all");
    setSelectedDateView("all");
    setFilterEpic("all");
    setFilterPhase("all");
    setFilterPriority("all");
    setFilterModule("all");
    setFilterSchedDevFrom("");
    setFilterSchedDevTo("");
    setFilterSchedDeployFrom("");
    setFilterSchedDeployTo("");
  }

  type RdmTile = {
    id: string; label: string; description: string;
    count: number; dot: string; countColor: string; urgent?: boolean;
    tileType: "planning" | "date";
  };

  const tiles: RdmTile[] = [
    { id: "backlog",       label: "Backlog",            description: "Known work retained but not yet committed to roadmap",        count: amrMetrics?.planningBacklog ?? 0,       dot: "bg-slate-400",   countColor: "text-slate-700 dark:text-slate-300",   tileType: "planning" },
    { id: "roadmapped",   label: "Roadmapped",          description: "Committed to roadmap, development dates may not be set",      count: amrMetrics?.planningRoadmapped ?? 0,    dot: "bg-fuchsia-400", countColor: "text-fuchsia-700 dark:text-fuchsia-300", tileType: "planning" },
    { id: "unscheduled",  label: "Unscheduled",         description: "Approved work awaiting a committed development date",         count: amrMetrics?.planningUnscheduled ?? 0,   dot: "bg-amber-400",   countColor: "text-amber-700 dark:text-amber-300",   tileType: "planning" },
    { id: "scheduled",    label: "Scheduled",           description: "Work with an established development date",                   count: amrMetrics?.planningScheduled ?? 0,     dot: "bg-teal-400",    countColor: "text-teal-700 dark:text-teal-300",     tileType: "planning" },
    { id: "startingSoon", label: "Starting Soon",       description: "Development date within the next 7 days, not yet in dev",    count: amrMetrics?.planningStartingSoon ?? 0,  dot: "bg-blue-400",    countColor: "text-blue-700 dark:text-blue-300",     tileType: "date" },
    { id: "deployDueSoon",label: "Deployment Due Soon", description: "Deployment date within the next 7 days",                     count: amrMetrics?.planningDeployDueSoon ?? 0, dot: "bg-violet-400",  countColor: "text-violet-700 dark:text-violet-300", tileType: "date" },
    { id: "atRisk",       label: "At Risk",             description: "Development date has passed, AMR not yet in development",     count: amrMetrics?.planningAtRisk ?? 0,        dot: "bg-orange-500",  countColor: "text-orange-700 dark:text-orange-400", urgent: true, tileType: "date" },
    { id: "overdue",      label: "Deploy Overdue",      description: "Deployment date has passed, AMR not yet completed",          count: amrMetrics?.planningOverdue ?? 0,        dot: "bg-red-500",     countColor: "text-red-700 dark:text-red-400",       urgent: true, tileType: "date" },
    { id: "completed",    label: "Completed",           description: "Roadmapped work that has been delivered",                    count: amrMetrics?.planningCompletedRoadmap ?? 0, dot: "bg-emerald-400", countColor: "text-emerald-700 dark:text-emerald-300", tileType: "date" },
  ];

  function handleTileClick(tile: RdmTile) {
    if (tile.tileType === "planning") {
      setFilterPlanningStatus(filterPlanningStatus === tile.id ? "all" : tile.id);
      setSelectedDateView("all");
    } else {
      setSelectedDateView(selectedDateView === tile.id ? "all" : tile.id);
    }
  }

  function isTileActive(tile: RdmTile): boolean {
    return tile.tileType === "planning" ? filterPlanningStatus === tile.id : selectedDateView === tile.id;
  }

  const activeDateTile = tiles.find(t => t.tileType === "date" && t.id === selectedDateView);
  const activePlanningTile = tiles.find(t => t.tileType === "planning" && t.id === filterPlanningStatus);

  const ROADMAP_STATUS_CHIP: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    reviewed: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    prioritizing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    in_queue: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
    in_development: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
    in_production: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
    needs_testing: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    user_accepts: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  };

  const PLANNING_CHIP: Record<string, string> = {
    backlog:      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    roadmapped:   "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
    unscheduled:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    scheduled:    "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  };

  function isReadyForQueue(t: any): boolean {
    const TERMINAL = ['completed','cancelled','user_accepts','user_declines','complete','duplicate','in_queue','in_development','in_production'];
    return (
      (t.planningStatus === 'scheduled') &&
      !!t.scheduledDevelopmentDate &&
      !TERMINAL.includes(t.status)
    );
  }

  const MILESTONE_STATUS_CHIP: Record<string, string> = {
    not_started: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    active:      'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    at_risk:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    completed:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  };

  // ── Milestone Detail sub-view ────────────────────────────────────────────────
  if (selectedMilestoneId) {
    const m = milestones.find((x: any) => x.id === selectedMilestoneId);
    if (!m) return (
      <div className="space-y-4 pb-8">
        <Button variant="ghost" size="sm" onClick={() => setSelectedMilestoneId(null)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />Roadmap Dashboard
        </Button>
        <p className="text-sm text-muted-foreground">Milestone not found.</p>
      </div>
    );
    return (
      <div className="space-y-4 pb-8" data-testid="milestone-detail">
        {/* Breadcrumb header */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setSelectedMilestoneId(null)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />Roadmap Dashboard
          </Button>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="font-semibold text-sm">{m.name}</span>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${MILESTONE_STATUS_CHIP[m.status] ?? 'bg-muted text-muted-foreground'}`}>
              {MILESTONE_STATUS_LABELS[m.status] ?? m.status}
            </span>
            {isAdmin && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                  setEditingMilestone(m);
                  setMilestoneForm({ name: m.name, description: m.description ?? '', targetDate: m.targetDate ?? '', status: m.status });
                  setShowMilestoneForm(true);
                }}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => {
                  if (confirm(`Delete milestone "${m.name}"? This will also delete all its deliverables.`)) deleteMilestoneMut.mutate(m.id);
                }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[
            { label: 'Target Date', value: m.targetDate ? format(parseISO(m.targetDate), 'MMM d, yyyy') : '—' },
            { label: 'Days Remaining', value: (() => {
              if (!m.targetDate) return '—';
              const days = Math.ceil((parseISO(m.targetDate).getTime() - Date.now()) / 86400000);
              return <span className={days < 0 ? 'text-red-600 font-semibold' : days <= 14 ? 'text-amber-600 font-semibold' : ''}>{days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}</span>;
            })() },
            { label: 'Deliverables', value: `${m.deliverableCompleted} / ${m.deliverableTotal}` },
            { label: 'AMR Progress', value: m.amrTotal > 0 ? `${m.amrCompleted} / ${m.amrTotal}` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="border rounded-md px-3 py-2.5">
              <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
              <p className="font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {m.description && (
          <p className="text-sm text-muted-foreground border rounded-md px-3 py-2">{m.description}</p>
        )}

        {/* Deliverables checklist */}
        <div className="border rounded-md" data-testid="milestone-deliverables">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
            <span className="text-sm font-semibold">Deliverables</span>
            {isAdmin && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => {
                setDeliverableForm({ name: '', targetDate: '', status: 'not_started', notes: '', epicId: '' });
                setEditingDeliverable(null);
                setShowDeliverableForm(true);
              }}>
                <Plus className="h-3.5 w-3.5" />Add
              </Button>
            )}
          </div>
          {m.deliverables.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-5 text-center">No deliverables defined. {isAdmin && 'Use Add to create one.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[800px]">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground">
                    <th className="px-3 py-2 w-8" />
                    <th className="px-3 py-2 text-left font-medium">Deliverable</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Target Date</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Linked Epic(s)</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">AMRs</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Progress</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Completed Date</th>
                    {isAdmin && <th className="px-2 w-36" />}
                  </tr>
                </thead>
                <tbody>
                  {[...m.deliverables].sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((d: any) => {
                    const isCompleted = d.status === 'completed';
                    const pct = d.amrTotal > 0 ? Math.round((d.amrCompleted / d.amrTotal) * 100) : null;
                    return (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        {/* Checkbox / completion indicator */}
                        <td className="px-3 py-2.5 text-center">
                          {isAdmin ? (
                            <input
                              type="checkbox"
                              checked={isCompleted}
                              onChange={() => updateDeliverableMut.mutate({ milestoneId: m.id, id: d.id, status: isCompleted ? 'not_started' : 'completed' })}
                              className="h-3.5 w-3.5 cursor-pointer accent-primary"
                            />
                          ) : (
                            isCompleted
                              ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                              : <div className="h-3.5 w-3.5 rounded border border-muted-foreground/40 mx-auto" />
                          )}
                        </td>
                        {/* Name + notes */}
                        <td className="px-3 py-2.5 max-w-[220px]">
                          <span className={isCompleted ? 'line-through text-muted-foreground' : 'font-medium'}>{d.name}</span>
                          {d.notes && <p className="text-muted-foreground mt-0.5 leading-snug truncate">{d.notes}</p>}
                        </td>
                        {/* Target date */}
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {d.targetDate ? format(parseISO(d.targetDate), 'MMM d, yyyy') : '—'}
                        </td>
                        {/* Status chip */}
                        <td className="px-3 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${MILESTONE_STATUS_CHIP[d.status] ?? 'bg-muted text-muted-foreground'}`}>
                            {MILESTONE_STATUS_LABELS[d.status] ?? d.status}
                          </span>
                        </td>
                        {/* Linked Epics */}
                        <td className="px-3 py-2.5 max-w-[180px]">
                          {d.linkedEpics?.length > 0 ? (
                            <div className="flex flex-wrap gap-0.5">
                              {d.linkedEpics.map((e: any) => (
                                <span key={e.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 text-[10px] font-medium">
                                  {e.name}
                                  {isAdmin && (
                                    <button
                                      onClick={() => unlinkDeliverableEpicMut.mutate({ milestoneId: m.id, deliverableId: d.id, epicId: e.id })}
                                      className="ml-0.5 hover:text-red-500"
                                    ><X className="h-2.5 w-2.5" /></button>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {/* AMR completed / total */}
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {d.amrTotal > 0 ? (
                            <span className={d.amrCompleted === d.amrTotal ? 'text-emerald-600 font-semibold' : ''}>
                              {d.amrCompleted} / {d.amrTotal}
                            </span>
                          ) : (
                            d.directAmrs?.length > 0
                              ? <span className="text-muted-foreground">{d.directAmrs.length} direct</span>
                              : '—'
                          )}
                        </td>
                        {/* Progress bar */}
                        <td className="px-3 py-2.5 min-w-[80px]">
                          {pct !== null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 bg-muted rounded-full h-1.5 min-w-[48px]">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-muted-foreground tabular-nums">{pct}%</span>
                            </div>
                          ) : '—'}
                        </td>
                        {/* Completed date */}
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {d.completedDate ? format(parseISO(d.completedDate), 'MMM d, yyyy') : '—'}
                        </td>
                        {/* Admin actions */}
                        {isAdmin && (
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-0.5 flex-wrap">
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit deliverable" onClick={() => {
                                setEditingDeliverable({ ...d, milestoneId: m.id });
                                setDeliverableForm({ name: d.name, targetDate: d.targetDate ?? '', status: d.status, notes: d.notes ?? '' });
                                setShowDeliverableForm(true);
                              }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="Link Epic" onClick={() => {
                                setActiveDeliverable({ ...d, milestoneId: m.id });
                                setLinkSearch('');
                                setShowEpicLinkDialog(true);
                              }}>
                                <Layers className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="Link AMR" onClick={() => {
                                setActiveDeliverable({ ...d, milestoneId: m.id });
                                setLinkSearch('');
                                setShowAmrLinkDialog(true);
                              }}>
                                <ClipboardList className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="Create Epic for Agent" onClick={() => {
                                const spec = [
                                  `EPIC REQUEST — ${d.name}`,
                                  '',
                                  `Product Milestone: ${m.name}`,
                                  ...(m.description ? [`Milestone Objective: ${m.description}`] : []),
                                  ...(m.targetDate ? [`Milestone Target Date: ${format(parseISO(m.targetDate), 'MMM d, yyyy')}`] : []),
                                  '',
                                  `Deliverable: ${d.name}`,
                                  ...(d.notes ? [`Deliverable Description: ${d.notes}`] : []),
                                  ...(d.targetDate ? [`Deliverable Target Date: ${format(parseISO(d.targetDate), 'MMM d, yyyy')}`] : []),
                                  `Deliverable Status: ${MILESTONE_STATUS_LABELS[d.status] ?? d.status}`,
                                  ...(d.linkedEpics?.length || d.directAmrs?.length ? [
                                    '',
                                    'Existing Linked Work:',
                                    ...(d.linkedEpics?.length ? [`- Linked Epics: ${d.linkedEpics.map((e: any) => e.name).join(', ')}`] : []),
                                    ...(d.directAmrs?.length ? [`- Direct AMRs: ${d.directAmrs.map((a: any) => `#${a.ticketNumber} ${a.title}`).join(', ')}`] : []),
                                  ] : []),
                                  '',
                                  'Please create a new Epic for this Deliverable. The Epic should include appropriate Phases and AMRs to fully deliver the outcome described above.',
                                  '',
                                  'Once created, link the resulting Epic back to this Deliverable in DriverHub (use the Link Epic button on the Deliverable row).',
                                ].join('\n');
                                setEpicSpecText(spec);
                                setShowEpicSpecDialog(true);
                              }}>
                                <Sparkles className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" title="Delete deliverable" onClick={() => {
                                if (confirm('Delete this deliverable?')) deleteDeliverableMut.mutate({ milestoneId: m.id, id: d.id });
                              }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Deliverable create/edit dialog */}
        <Dialog open={showDeliverableForm} onOpenChange={v => { setShowDeliverableForm(v); if (!v) setEditingDeliverable(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingDeliverable ? 'Edit Deliverable' : 'Add Deliverable'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input value={deliverableForm.name} onChange={e => setDeliverableForm(f => ({ ...f, name: e.target.value }))} placeholder="Deliverable name" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Target Date</label>
                  <Input type="date" value={deliverableForm.targetDate} onChange={e => setDeliverableForm(f => ({ ...f, targetDate: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select value={deliverableForm.status} onValueChange={v => setDeliverableForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['not_started','active','at_risk','completed'].map(s => (
                        <SelectItem key={s} value={s}>{MILESTONE_STATUS_LABELS[s] ?? s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <Textarea value={deliverableForm.notes} onChange={e => setDeliverableForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes or description" rows={2} className="mt-1" />
              </div>
              {editingDeliverable && (
                <p className="text-xs text-muted-foreground pt-1">
                  Use the <Layers className="inline h-3 w-3" /> and <ClipboardList className="inline h-3 w-3" /> buttons in the table row to link Epics or AMRs to this deliverable.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeliverableForm(false)}>Cancel</Button>
              <Button
                disabled={!deliverableForm.name.trim() || createDeliverableMut.isPending || updateDeliverableMut.isPending}
                onClick={() => {
                  const payload = {
                    name: deliverableForm.name.trim(),
                    targetDate: deliverableForm.targetDate || null,
                    status: deliverableForm.status,
                    notes: deliverableForm.notes || null,
                  };
                  if (editingDeliverable) {
                    updateDeliverableMut.mutate({ milestoneId: editingDeliverable.milestoneId, id: editingDeliverable.id, ...payload });
                  } else {
                    createDeliverableMut.mutate({ milestoneId: m.id, ...payload });
                  }
                }}
              >
                {editingDeliverable ? 'Save Changes' : 'Add Deliverable'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Epic Link Dialog ───────────────────────────────────────────────── */}
        <Dialog open={showEpicLinkDialog} onOpenChange={v => { setShowEpicLinkDialog(v); if (!v) { setActiveDeliverable(null); setLinkSearch(''); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Link Epics — {activeDeliverable?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {/* Currently linked */}
              {activeDeliverable?.linkedEpics?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Currently linked</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeDeliverable.linkedEpics.map((e: any) => (
                      <span key={e.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 text-xs font-medium">
                        {e.name}
                        <button
                          onClick={() => {
                            unlinkDeliverableEpicMut.mutate({ milestoneId: activeDeliverable.milestoneId, deliverableId: activeDeliverable.id, epicId: e.id });
                            setActiveDeliverable((prev: any) => prev ? { ...prev, linkedEpics: prev.linkedEpics.filter((x: any) => x.id !== e.id) } : prev);
                          }}
                          className="hover:text-red-500 ml-0.5"
                        ><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Search + add */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Add Epic</label>
                <Input
                  className="mt-1"
                  placeholder="Search epics…"
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                />
              </div>
              <div className="max-h-52 overflow-y-auto border rounded-md divide-y">
                {[...epicsList]
                  .filter((e: any) => {
                    const already = activeDeliverable?.linkedEpics?.some((x: any) => x.id === e.id);
                    if (already) return false;
                    if (!linkSearch) return true;
                    return e.name.toLowerCase().includes(linkSearch.toLowerCase());
                  })
                  .sort((a: any, b: any) => a.name.localeCompare(b.name))
                  .map((e: any) => (
                    <button
                      key={e.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        linkDeliverableEpicMut.mutate({ milestoneId: activeDeliverable.milestoneId, deliverableId: activeDeliverable.id, epicId: e.id });
                        setActiveDeliverable((prev: any) => prev ? { ...prev, linkedEpics: [...(prev.linkedEpics ?? []), { id: e.id, name: e.name }] } : prev);
                        setLinkSearch('');
                      }}
                    >
                      {e.name}
                      {e.amrCount > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({e.amrCount} AMRs)</span>}
                    </button>
                  ))
                }
                {epicsList.filter((e: any) => !activeDeliverable?.linkedEpics?.some((x: any) => x.id === e.id) && (!linkSearch || e.name.toLowerCase().includes(linkSearch.toLowerCase()))).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No matching epics</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEpicLinkDialog(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── AMR Link Dialog ─────────────────────────────────────────────────── */}
        <Dialog open={showAmrLinkDialog} onOpenChange={v => { setShowAmrLinkDialog(v); if (!v) { setActiveDeliverable(null); setLinkSearch(''); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Link AMRs Directly — {activeDeliverable?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {/* Currently linked */}
              {activeDeliverable?.directAmrs?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Currently linked</p>
                  <div className="space-y-1">
                    {activeDeliverable.directAmrs.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between px-2 py-1 rounded bg-muted/40 text-xs">
                        <span className="font-medium">#{a.ticketNumber}</span>
                        <span className="mx-2 flex-1 truncate text-muted-foreground">{a.title}</span>
                        <button
                          onClick={() => {
                            unlinkDeliverableAmrMut.mutate({ milestoneId: activeDeliverable.milestoneId, deliverableId: activeDeliverable.id, ticketId: a.id });
                            setActiveDeliverable((prev: any) => prev ? { ...prev, directAmrs: prev.directAmrs.filter((x: any) => x.id !== a.id) } : prev);
                          }}
                          className="hover:text-red-500 ml-1"
                        ><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Search + add */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Add AMR (search by # or title)</label>
                <Input
                  className="mt-1"
                  placeholder="e.g. 1234 or invoice…"
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                />
              </div>
              <div className="max-h-52 overflow-y-auto border rounded-md divide-y">
                {allAmrsForPicker
                  .filter((t: any) => {
                    const already = activeDeliverable?.directAmrs?.some((x: any) => x.id === t.id);
                    if (already) return false;
                    if (!linkSearch) return false; // require search term
                    const q = linkSearch.toLowerCase();
                    return String(t.ticketNumber).includes(q) || t.title?.toLowerCase().includes(q);
                  })
                  .slice(0, 25)
                  .map((t: any) => (
                    <button
                      key={t.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        linkDeliverableAmrMut.mutate({ milestoneId: activeDeliverable.milestoneId, deliverableId: activeDeliverable.id, ticketId: t.id });
                        setActiveDeliverable((prev: any) => prev ? {
                          ...prev,
                          directAmrs: [...(prev.directAmrs ?? []), { id: t.id, ticketNumber: t.ticketNumber, title: t.title, status: t.status }],
                        } : prev);
                        setLinkSearch('');
                      }}
                    >
                      <span className="font-medium">#{t.ticketNumber}</span>
                      <span className="ml-2 text-muted-foreground truncate">{t.title}</span>
                    </button>
                  ))
                }
                {linkSearch && allAmrsForPicker.filter((t: any) => {
                  const already = activeDeliverable?.directAmrs?.some((x: any) => x.id === t.id);
                  if (already) return false;
                  const q = linkSearch.toLowerCase();
                  return String(t.ticketNumber).includes(q) || t.title?.toLowerCase().includes(q);
                }).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No matching AMRs</p>
                )}
                {!linkSearch && (
                  <p className="text-xs text-muted-foreground text-center py-4">Type a ticket number or keyword to search</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAmrLinkDialog(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Epic Spec Dialog ────────────────────────────────────────────────── */}
        <Dialog open={showEpicSpecDialog} onOpenChange={setShowEpicSpecDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Epic Request — Ready to Copy
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground">Copy this text and paste it into the development agent to create an Epic for this Deliverable. Once the Epic is created, come back and use the <Layers className="inline h-3 w-3" /> link button to associate it.</p>
              <div className="relative">
                <pre className="bg-muted rounded-md p-3 text-xs whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto font-mono">
                  {epicSpecText}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2 h-7 text-xs gap-1"
                  onClick={() => {
                    navigator.clipboard.writeText(epicSpecText);
                    toast({ title: 'Copied!', description: 'Epic request copied to clipboard.' });
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />Copy
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEpicSpecDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Milestone edit dialog (accessible from detail view) */}
        <Dialog open={showMilestoneForm} onOpenChange={v => { setShowMilestoneForm(v); if (!v) setEditingMilestone(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Milestone</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Milestone Name *</label>
                <Input value={milestoneForm.name} onChange={e => setMilestoneForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. DriverHub Sales Ready" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Target Date</label>
                  <Input type="date" value={milestoneForm.targetDate} onChange={e => setMilestoneForm(f => ({ ...f, targetDate: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select value={milestoneForm.status} onValueChange={v => setMilestoneForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['not_started','active','at_risk','completed'].map(s => (
                        <SelectItem key={s} value={s}>{MILESTONE_STATUS_LABELS[s] ?? s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description / Objective</label>
                <Textarea value={milestoneForm.description} onChange={e => setMilestoneForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" rows={3} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMilestoneForm(false)}>Cancel</Button>
              <Button
                disabled={!milestoneForm.name.trim() || updateMilestoneMut.isPending}
                onClick={() => updateMilestoneMut.mutate({ id: editingMilestone.id, name: milestoneForm.name.trim(), description: milestoneForm.description || null, targetDate: milestoneForm.targetDate || null, status: milestoneForm.status })}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => onSwitchTab("tickets")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          AMRs
        </Button>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
            Roadmap Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">Planning status is independent of workflow status. Click a tile or use the filters below to narrow the list.</p>
        </div>
      </div>

      {/* ── Product Milestones ─────────────────────────────────────────────── */}
      <div className="border rounded-md" data-testid="product-milestones-section">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
          <span className="text-sm font-semibold flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            Product Milestones
          </span>
          {isAdmin && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => {
              setEditingMilestone(null);
              setMilestoneForm({ name: '', description: '', targetDate: '', status: 'not_started' });
              setShowMilestoneForm(true);
            }} data-testid="button-add-milestone">
              <Plus className="h-3.5 w-3.5" />Add Milestone
            </Button>
          )}
        </div>
        {milestonesLoading ? (
          <div className="py-4 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div>
        ) : milestones.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-5 text-center">No product milestones defined. {isAdmin && 'Use Add Milestone to create one.'}</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/10 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Milestone</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden sm:table-cell">Target Date</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden sm:table-cell">Days Remaining</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Deliverables</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden md:table-cell">AMR Progress</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m: any) => {
                const targetDate = m.targetDate ? parseISO(m.targetDate) : null;
                const daysRemaining = targetDate ? Math.ceil((targetDate.getTime() - Date.now()) / 86400000) : null;
                return (
                  <tr key={m.id} className="border-b last:border-0 cursor-pointer hover:bg-primary/5 transition-colors" onClick={() => setSelectedMilestoneId(m.id)} data-testid={`milestone-row-${m.id}`}>
                    <td className="px-3 py-2.5 font-medium">{m.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                      {targetDate ? format(targetDate, 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap hidden sm:table-cell">
                      {daysRemaining !== null ? (
                        <span className={daysRemaining < 0 ? 'text-red-600 font-semibold' : daysRemaining <= 14 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}>
                          {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d`}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={m.deliverableCompleted === m.deliverableTotal && m.deliverableTotal > 0 ? 'text-emerald-600 font-semibold' : ''}>
                        {m.deliverableCompleted} / {m.deliverableTotal}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap hidden md:table-cell">
                      {m.amrTotal > 0 ? `${m.amrCompleted} / ${m.amrTotal}` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${MILESTONE_STATUS_CHIP[m.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {MILESTONE_STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Planning metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
        {tiles.map(tile => {
          const isActive = isTileActive(tile);
          return (
            <button
              key={tile.id}
              type="button"
              title={tile.description}
              onClick={() => handleTileClick(tile)}
              className={[
                "flex flex-col items-start gap-1 px-3 py-2.5 rounded-md border text-left transition-colors",
                isActive ? "border-primary bg-primary/5 shadow-sm" : "bg-card hover-elevate",
                tile.urgent && tile.count > 0 ? "border-l-4 border-l-red-400" : "",
              ].join(" ")}
              data-testid={`rdm-tile-${tile.id}`}
            >
              <div className="flex items-center gap-1.5 w-full">
                <span className={`h-2 w-2 rounded-full shrink-0 ${tile.dot}`} />
                <span className="text-[11px] text-muted-foreground truncate leading-tight">{tile.label}</span>
              </div>
              <span className={`text-xl font-bold tabular-nums leading-none ${tile.countColor}`}>
                {tile.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Planning Status */}
        <Select value={filterPlanningStatus} onValueChange={(v) => { setFilterPlanningStatus(v); setSelectedDateView("all"); }}>
          <SelectTrigger className="h-8 text-sm w-[160px]" data-testid="rdm-filter-planning-status">
            <SelectValue placeholder="Planning Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Planning</SelectItem>
            {AMR_PLANNING_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{AMR_PLANNING_STATUS_LABELS[s as keyof typeof AMR_PLANNING_STATUS_LABELS] || s}</SelectItem>
            ))}
            <SelectItem value="none">Not Set</SelectItem>
          </SelectContent>
        </Select>

        {/* Epic */}
        <Select value={filterEpic} onValueChange={(v) => { setFilterEpic(v); setFilterPhase("all"); }}>
          <SelectTrigger className="h-8 text-sm w-[175px]" data-testid="rdm-filter-epic">
            <SelectValue placeholder="Epic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Epics</SelectItem>
            {[...epicsList].sort((a, b) => a.name.localeCompare(b.name)).map(e => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Phase — only when an Epic is selected */}
        {filterEpic !== "all" && phasesList.length > 0 && (
          <Select value={filterPhase} onValueChange={setFilterPhase}>
            <SelectTrigger className="h-8 text-sm w-[175px]" data-testid="rdm-filter-phase">
              <SelectValue placeholder="Phase / Milestone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Phases</SelectItem>
              {[...phasesList].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Priority */}
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-8 text-sm w-[130px]" data-testid="rdm-filter-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {TICKET_PRIORITIES.map(p => (
              <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p as keyof typeof TICKET_PRIORITY_LABELS] || p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Module */}
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="h-8 text-sm w-[160px]" data-testid="rdm-filter-module">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
             {[...TICKET_MODULE_DEFINITIONS].sort((a, b) => a.label.localeCompare(b.label)).map(m => (
               <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Scheduled Development date range */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Dev:</span>
          <input
            type="date"
            value={filterSchedDevFrom}
            onChange={e => setFilterSchedDevFrom(e.target.value)}
            disabled={selectedDateView !== "all"}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm disabled:opacity-50"
            data-testid="rdm-filter-sched-dev-from"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={filterSchedDevTo}
            onChange={e => setFilterSchedDevTo(e.target.value)}
            disabled={selectedDateView !== "all"}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm disabled:opacity-50"
            data-testid="rdm-filter-sched-dev-to"
          />
        </div>

        {/* Scheduled Deployment date range */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Deploy:</span>
          <input
            type="date"
            value={filterSchedDeployFrom}
            onChange={e => setFilterSchedDeployFrom(e.target.value)}
            disabled={selectedDateView !== "all"}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm disabled:opacity-50"
            data-testid="rdm-filter-sched-deploy-from"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={filterSchedDeployTo}
            onChange={e => setFilterSchedDeployTo(e.target.value)}
            disabled={selectedDateView !== "all"}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm disabled:opacity-50"
            data-testid="rdm-filter-sched-deploy-to"
          />
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
            <X className="h-3 w-3" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Ready for Queue banner */}
      {(() => {
        const rfq = roadmapTickets.filter(t => isReadyForQueue(t));
        if (!rfq.length) return null;
        return (
          <div className="flex items-start gap-2.5 rounded-md border border-teal-200 bg-teal-50/50 dark:bg-teal-900/10 dark:border-teal-800 px-3 py-2.5 text-sm">
            <CheckCircle className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-teal-800 dark:text-teal-300">
                {rfq.length} AMR{rfq.length !== 1 ? "s" : ""} Ready for Queue
              </p>
              <p className="text-xs text-teal-700 dark:text-teal-400 mt-0.5">
                {rfq.map((t: any) => `${t.ticketNumber} — ${t.title}`).slice(0, 3).join(" · ")}
                {rfq.length > 3 && ` · +${rfq.length - 3} more`}
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Due Today / Due This Week execution section ── */}
      {(() => {
        const dueTodayAllCount     = amrMetrics?.dueTodayAll     ?? 0;
        const dueTodayRmapCount    = amrMetrics?.dueTodayRoadmap  ?? 0;
        const dueThisWeekAllCount  = amrMetrics?.dueThisWeekAll   ?? 0;
        const dueThisWeekRmapCount = amrMetrics?.dueThisWeekRoadmap ?? 0;
        const cellBase = "flex items-center justify-center py-2.5 text-xl font-bold tabular-nums transition-colors cursor-pointer select-none";
        const isActive = (v: string) => selectedDateView === v;
        const activeCls = "bg-primary/8 text-primary ring-1 ring-inset ring-primary/30";
        const cellCls = (v: string) =>
          `${cellBase} ${isActive(v) ? activeCls : "hover:bg-muted/60"} rounded`;
        return (
          <div className="border rounded-md overflow-hidden text-xs" data-testid="rdm-due-section">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_1fr_1fr] border-b bg-muted/30">
              <div className="px-3 py-1.5 font-medium text-muted-foreground" />
              <div className="px-3 py-1.5 font-medium text-muted-foreground text-center border-l">All Tickets</div>
              <div className="px-3 py-1.5 font-medium text-muted-foreground text-center border-l">Roadmap</div>
            </div>
            {/* Due Today row */}
            <div className="grid grid-cols-[1fr_1fr_1fr]">
              <div className="px-3 py-2.5 flex items-center font-medium border-r">Due Today</div>
              <button
                type="button"
                className={cellCls("dueToday")}
                onClick={() => { setSelectedDateView(isActive("dueToday") ? "all" : "dueToday"); setFilterPlanningStatus("all"); }}
                data-testid="rdm-due-today-all"
              >
                <span className={dueTodayAllCount > 0 ? "text-sky-700 dark:text-sky-400" : "text-muted-foreground"}>{dueTodayAllCount}</span>
              </button>
              <button
                type="button"
                className={`${cellCls("dueTodayRoadmap")} border-l`}
                onClick={() => { setSelectedDateView(isActive("dueTodayRoadmap") ? "all" : "dueTodayRoadmap"); setFilterPlanningStatus("all"); }}
                data-testid="rdm-due-today-roadmap"
              >
                <span className={dueTodayRmapCount > 0 ? "text-fuchsia-700 dark:text-fuchsia-400" : "text-muted-foreground"}>{dueTodayRmapCount}</span>
              </button>
            </div>
            {/* Due This Week row */}
            <div className="grid grid-cols-[1fr_1fr_1fr] border-t">
              <div className="px-3 py-2.5 flex items-center font-medium border-r">Due This Week</div>
              <button
                type="button"
                className={cellCls("dueThisWeek")}
                onClick={() => { setSelectedDateView(isActive("dueThisWeek") ? "all" : "dueThisWeek"); setFilterPlanningStatus("all"); }}
                data-testid="rdm-due-week-all"
              >
                <span className={dueThisWeekAllCount > 0 ? "text-sky-700 dark:text-sky-400" : "text-muted-foreground"}>{dueThisWeekAllCount}</span>
              </button>
              <button
                type="button"
                className={`${cellCls("dueThisWeekRoadmap")} border-l`}
                onClick={() => { setSelectedDateView(isActive("dueThisWeekRoadmap") ? "all" : "dueThisWeekRoadmap"); setFilterPlanningStatus("all"); }}
                data-testid="rdm-due-week-roadmap"
              >
                <span className={dueThisWeekRmapCount > 0 ? "text-fuchsia-700 dark:text-fuchsia-400" : "text-muted-foreground"}>{dueThisWeekRmapCount}</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Filtered AMR list */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">
              {selectedDateView === "dueToday"           ? "Due Today — All Tickets"
               : selectedDateView === "dueTodayRoadmap"  ? "Due Today — Roadmap"
               : selectedDateView === "dueThisWeek"      ? "Due This Week — All Tickets"
               : selectedDateView === "dueThisWeekRoadmap" ? "Due This Week — Roadmap"
               : activeDateTile
                ? `${activeDateTile.label} — ${activeDateTile.description}`
                : activePlanningTile
                ? `Planning: ${activePlanningTile.label}`
                : "All AMRs"}
              {hasActiveFilters && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  · {roadmapTickets.length} result{roadmapTickets.length !== 1 ? "s" : ""}
                </span>
              )}
            </CardTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
                <X className="h-3 w-3 mr-1" />Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
              <RefreshCw className="h-4 w-4 animate-spin" />Loading…
            </div>
          )}
          {!isLoading && roadmapTickets.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8 italic">No AMRs match this view.</p>
          )}
          {!isLoading && roadmapTickets.length > 0 && (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b">
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">AMR #</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Title</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">Workflow Status</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">Planning Status</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">Sched Dev</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">Sched Deploy</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">Priority</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">Ready for Queue</th>
                  </tr>
                </thead>
                <tbody>
                  {(roadmapTickets as any[]).map((t, idx) => {
                    const devOverdue = t.scheduledDevelopmentDate &&
                      new Date(t.scheduledDevelopmentDate) < new Date() &&
                      !['completed','user_accepts','in_development','in_production','cancelled','duplicate','complete'].includes(t.status);
                    const deployOverdue = t.scheduledDeploymentDate &&
                      new Date(t.scheduledDeploymentDate) < new Date() &&
                      !['completed','user_accepts','cancelled','duplicate','complete'].includes(t.status);
                    const rfq = isReadyForQueue(t);
                    return (
                      <tr
                        key={t.id}
                        className={`border-b last:border-0 cursor-pointer hover:bg-primary/5 transition-colors ${idx % 2 === 1 ? "bg-muted/15" : ""}`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('a')) return;
                          history.replaceState({}, '', `/amr?ticket=${t.ticketNumber}`);
                          onSwitchTab("tickets");
                        }}
                      >
                        <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                          <a
                            href={`/amr?ticket=${t.ticketNumber}`}
                            className="hover:underline"
                            onClick={(e) => { if (e.ctrlKey || e.metaKey || e.button !== 0) return; e.preventDefault(); history.replaceState({}, '', `/amr?ticket=${t.ticketNumber}`); onSwitchTab("tickets"); }}
                          >{t.ticketNumber}</a>
                        </td>
                        <td className="px-2 py-2 max-w-[200px]">
                          <a
                            href={`/amr?ticket=${t.ticketNumber}`}
                            className="line-clamp-2 leading-tight font-medium hover:underline block"
                            onClick={(e) => { if (e.ctrlKey || e.metaKey || e.button !== 0) return; e.preventDefault(); history.replaceState({}, '', `/amr?ticket=${t.ticketNumber}`); onSwitchTab("tickets"); }}
                          >{t.title}</a>
                        </td>
                        <td className="px-2 py-2">
                          <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${ROADMAP_STATUS_CHIP[t.status] ?? "bg-muted text-muted-foreground"}`}>
                            {STATUS_LABELS[t.status as keyof typeof STATUS_LABELS] ?? t.status?.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {t.planningStatus ? (
                            <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${PLANNING_CHIP[t.planningStatus] ?? "bg-muted text-muted-foreground"}`}>
                              {AMR_PLANNING_STATUS_LABELS[t.planningStatus as keyof typeof AMR_PLANNING_STATUS_LABELS] || t.planningStatus}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {t.scheduledDevelopmentDate ? (
                            <span className={devOverdue ? "text-orange-600 dark:text-orange-400 font-semibold flex items-center gap-0.5" : "text-muted-foreground"}>
                              {devOverdue && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                              {format(parseISO(t.scheduledDevelopmentDate), "MMM d, yyyy")}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {t.scheduledDeploymentDate ? (
                            <span className={deployOverdue ? "text-red-600 dark:text-red-400 font-semibold flex items-center gap-0.5" : "text-muted-foreground"}>
                              {deployOverdue && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                              {format(parseISO(t.scheduledDeploymentDate), "MMM d, yyyy")}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2">
                          <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${
                            t.priority === 'p0' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                            t.priority === 'p1' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                            t.priority === 'p2' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {(TICKET_PRIORITY_LABELS as any)[t.priority] ?? t.priority}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {rfq ? (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 whitespace-nowrap">
                              <CheckCircle className="h-2.5 w-2.5 shrink-0" />Ready
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product analytics widgets — Product Improvement Score + Roadmap Reliability */}
      {isAdmin && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ProductImprovementScore />
          <RoadmapReliability />
        </div>
      )}

      {/* Reminders note */}
      <div className="text-xs text-muted-foreground border rounded-md px-3 py-2.5 bg-muted/20">
        <span className="font-semibold">Planning Reminders</span> — Automated reminders for approaching development dates, missed milestones, and unscheduled roadmapped items are pending implementation.
        Use the At Risk and Deploy Overdue tiles above to identify items needing attention today.
      </div>

      {/* Milestone create/edit dialog (dashboard-level) */}
      <Dialog open={showMilestoneForm} onOpenChange={v => { setShowMilestoneForm(v); if (!v) setEditingMilestone(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMilestone ? 'Edit Milestone' : 'Add Product Milestone'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Milestone Name *</label>
              <Input value={milestoneForm.name} onChange={e => setMilestoneForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. DriverHub Sales Ready" className="mt-1" data-testid="input-milestone-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Target Date</label>
                <Input type="date" value={milestoneForm.targetDate} onChange={e => setMilestoneForm(f => ({ ...f, targetDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={milestoneForm.status} onValueChange={v => setMilestoneForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['not_started','active','at_risk','completed'].map(s => (
                      <SelectItem key={s} value={s}>{MILESTONE_STATUS_LABELS[s] ?? s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description / Objective</label>
              <Textarea value={milestoneForm.description} onChange={e => setMilestoneForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional — describe what this milestone represents" rows={3} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMilestoneForm(false)}>Cancel</Button>
            <Button
              disabled={!milestoneForm.name.trim() || createMilestoneMut.isPending || updateMilestoneMut.isPending}
              onClick={() => {
                const payload = { name: milestoneForm.name.trim(), description: milestoneForm.description || null, targetDate: milestoneForm.targetDate || null, status: milestoneForm.status };
                if (editingMilestone) {
                  updateMilestoneMut.mutate({ id: editingMilestone.id, ...payload });
                } else {
                  createMilestoneMut.mutate(payload);
                }
              }}
              data-testid="button-save-milestone"
            >
              {editingMilestone ? 'Save Changes' : 'Create Milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TicketPortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role ? TICKET_ADMIN_ROLES.includes(user.role) : false;
  // Read ?tab= from URL on first render so external links (e.g. the Dashboard
  // Roadmap metric tile) can land directly on the correct tab.
  const [topTab, setTopTab] = useState<"tickets" | "releases" | "contributions" | "ideas" | "epics" | "roadmap">(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    if (p === "roadmap" || p === "releases" || p === "contributions" || p === "ideas" || p === "epics") return p;
    return "tickets";
  });
  // Preserves which planning-status tile (or "all") to pre-select when navigating to the Roadmap Dashboard.
  const [roadmapInitialView, setRoadmapInitialView] = useState<string>("all");
  const handleNavToRoadmap = (initialView: string) => {
    setRoadmapInitialView(initialView);
    setTopTab("roadmap");
  };

  if (topTab === "releases") {
    return <ReleasesView isAdmin={isAdmin} onSwitchTab={setTopTab} />;
  }

  if (topTab === "contributions") {
    return <ContributionMetricsView isAdmin={isAdmin} onSwitchTab={setTopTab} />;
  }

  if (topTab === "ideas") {
    return <QuickIdeasView isAdmin={isAdmin} onSwitchTab={setTopTab} />;
  }

  if (topTab === "epics") {
    return <EpicsView isAdmin={isAdmin} onSwitchTab={setTopTab} />;
  }

  if (topTab === "roadmap") {
    return <RoadmapView isAdmin={isAdmin} onSwitchTab={setTopTab} initialView={roadmapInitialView} />;
  }

  return <TicketListView isAdmin={isAdmin} onSwitchTab={setTopTab} onNavToRoadmap={handleNavToRoadmap} />;
}




type MyContributions = {
  ideasSubmitted: number;
  ideasImplemented: number;
  enhancementsAccepted: number;
  bugsFixed: number;
};

// ── Tiered Achievement System ─────────────────────────────────────────────────

type AchievementTier = { name: string; threshold: number };

type AchievementTrack = {
  id: string;
  label: string;
  Icon: React.ElementType;
  metric: (c: MyContributions) => number;
  metricLabel: string;
  tiers: AchievementTier[];
  iconColor: string;
  iconBg: string;
  barColor: string;
  cardBg: string;
  cardBorder: string;
  earnedBg: string;
};

const ACHIEVEMENT_TRACKS: AchievementTrack[] = [
  {
    id: "ideas",
    label: "Idea Submission",
    Icon: Lightbulb,
    metric: (c) => c.ideasSubmitted,
    metricLabel: "submitted",
    tiers: [
      { name: "Contributor",       threshold: 1   },
      { name: "Idea Generator",    threshold: 10  },
      { name: "Innovator",         threshold: 25  },
      { name: "Innovation Leader", threshold: 50  },
      { name: "Product Visionary", threshold: 100 },
    ],
    iconColor: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    barColor: "bg-amber-500",
    cardBg: "bg-amber-50/60 dark:bg-amber-950/20",
    cardBorder: "border-amber-200 dark:border-amber-900/60",
    earnedBg: "bg-amber-100/80 dark:bg-amber-900/30",
  },
  {
    id: "implementation",
    label: "Implementation",
    Icon: Rocket,
    metric: (c) => c.ideasImplemented,
    metricLabel: "implemented",
    tiers: [
      { name: "Builder",             threshold: 1  },
      { name: "Product Contributor", threshold: 5  },
      { name: "Product Influencer",  threshold: 15 },
      { name: "Product Champion",    threshold: 30 },
    ],
    iconColor: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-100 dark:bg-violet-900/40",
    barColor: "bg-violet-500",
    cardBg: "bg-violet-50/60 dark:bg-violet-950/20",
    cardBorder: "border-violet-200 dark:border-violet-900/60",
    earnedBg: "bg-violet-100/80 dark:bg-violet-900/30",
  },
  {
    id: "quality",
    label: "Quality",
    Icon: ShieldCheck,
    metric: (c) => c.bugsFixed,
    metricLabel: "bugs confirmed & fixed",
    tiers: [
      { name: "Quality Reporter",  threshold: 1  },
      { name: "Quality Advocate",  threshold: 5  },
      { name: "Quality Champion",  threshold: 15 },
      { name: "Quality Leader",    threshold: 30 },
    ],
    iconColor: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    barColor: "bg-emerald-500",
    cardBg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    cardBorder: "border-emerald-200 dark:border-emerald-900/60",
    earnedBg: "bg-emerald-100/80 dark:bg-emerald-900/30",
  },
  {
    id: "direction",
    label: "Product Direction",
    Icon: Crown,
    metric: (c) => c.enhancementsAccepted,
    metricLabel: "enhancements accepted",
    tiers: [
      { name: "Product Thinker",   threshold: 1  },
      { name: "Product Shaper",    threshold: 5  },
      { name: "Product Director",  threshold: 15 },
      { name: "Product Architect", threshold: 30 },
    ],
    iconColor: "text-orange-600 dark:text-orange-400",
    iconBg: "bg-orange-100 dark:bg-orange-900/40",
    barColor: "bg-orange-500",
    cardBg: "bg-orange-50/60 dark:bg-orange-950/20",
    cardBorder: "border-orange-200 dark:border-orange-900/60",
    earnedBg: "bg-orange-100/80 dark:bg-orange-900/30",
  },
];

// Consistent tier level styles — applied by index (0=Bronze, 1=Silver, 2=Gold, 3=Platinum, 4=Diamond)
// regardless of category, so achievement level is the primary visual hierarchy.
const BADGE_TIER_STYLES = [
  { label: "Bronze",   icon: "text-amber-700 dark:text-amber-600",  badge: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900", text: "text-amber-800 dark:text-amber-500"  },
  { label: "Silver",   icon: "text-slate-500 dark:text-slate-400",  badge: "bg-slate-50 border-slate-200 dark:bg-slate-900/30 dark:border-slate-700", text: "text-slate-700 dark:text-slate-300"  },
  { label: "Gold",     icon: "text-amber-500 dark:text-amber-400",  badge: "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700", text: "text-amber-700 dark:text-amber-400"  },
  { label: "Platinum", icon: "text-cyan-600 dark:text-cyan-400",    badge: "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/20 dark:border-cyan-800",    text: "text-cyan-700 dark:text-cyan-400"    },
  { label: "Diamond",  icon: "text-violet-600 dark:text-violet-400", badge: "bg-violet-50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800", text: "text-violet-700 dark:text-violet-400" },
];

function getAchievementLevel(value: number, tiers: AchievementTier[]) {
  let currentIdx = -1;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (value >= tiers[i].threshold) { currentIdx = i; break; }
  }
  const current = currentIdx >= 0 ? tiers[currentIdx] : null;
  const next = currentIdx < tiers.length - 1 ? tiers[currentIdx + 1] : null;
  const isMax = currentIdx === tiers.length - 1;
  const from = current ? current.threshold : 0;
  const to = next ? next.threshold : (current ? current.threshold : tiers[0].threshold);
  const pct = isMax ? 100 : next ? Math.min(100, Math.round(((value - from) / (to - from)) * 100)) : 0;
  const remaining = next ? next.threshold - value : 0;
  return { current, next, currentIdx, isMax, pct, remaining };
}

function AchievementBadge({ track, value }: { track: AchievementTrack; value: number }) {
  const { current, next, currentIdx, isMax, pct, remaining } = getAchievementLevel(value, track.tiers);
  const tierStyle = currentIdx >= 0 ? BADGE_TIER_STYLES[Math.min(currentIdx, BADGE_TIER_STYLES.length - 1)] : null;
  const hasStarted = currentIdx >= 0;

  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-2.5 py-2 flex-1 min-w-[140px] transition-colors ${
        tierStyle ? tierStyle.badge : "bg-muted/10 border-border/40"
      }`}
      data-testid={`achievement-card-${track.id}`}
    >
      {/* Trophy icon — tier color */}
      <Trophy className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${tierStyle ? tierStyle.icon : "text-muted-foreground/25"}`} />

      {/* Content */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[11px] font-semibold leading-tight ${tierStyle ? tierStyle.text : "text-muted-foreground/40"}`}>
            {hasStarted ? current?.name : "Not yet earned"}
          </span>
          {isMax && (
            <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide shrink-0">
              Highest Level
            </span>
          )}
        </div>
        <span className="text-[9px] text-muted-foreground leading-tight">{track.label}</span>

        {/* Progress bar toward next tier */}
        {hasStarted && !isMax && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="h-0.5 flex-1 rounded-full bg-border overflow-hidden">
              <div className="h-full rounded-full bg-current opacity-50 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">{remaining} → {next?.name}</span>
          </div>
        )}
        {!hasStarted && (
          <span className="text-[9px] text-muted-foreground/40 mt-0.5">{track.tiers[0].threshold} {track.metricLabel} to unlock</span>
        )}
      </div>

      {/* Level pips — consistent tier progression */}
      <div className="flex gap-0.5 items-center shrink-0 pt-1">
        {Array.from({ length: track.tiers.length }).map((_, i) => (
          <span
            key={i}
            className={`h-1 w-1 rounded-full ${i <= currentIdx ? "bg-current opacity-70" : "bg-border"}`}
          />
        ))}
      </div>
    </div>
  );
}

function ContributionsPanel() {
  const { data, isLoading } = useQuery<MyContributions>({
    queryKey: ["/api/tickets/my-contributions"],
    refetchInterval: 30_000,
  });

  if (isLoading || !data) return null;

  const stats = [
    { label: "Submitted",   value: data.ideasSubmitted,       testId: "contrib-ideas-submitted"       },
    { label: "Implemented", value: data.ideasImplemented,     testId: "contrib-ideas-implemented"     },
    { label: "Accepted",    value: data.enhancementsAccepted, testId: "contrib-enhancements-accepted" },
    { label: "Bugs Fixed",  value: data.bugsFixed,            testId: "contrib-bugs-fixed"            },
  ];

  return (
    <Card data-testid="contributions-panel">
      <CardContent className="pt-3 pb-3">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">

          {/* Left: header + stats */}
          <div className="flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Your Contributions & Achievements</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {stats.map((stat, i) => (
                <div key={stat.testId} className="flex items-center gap-3">
                  <div data-testid={stat.testId} className="text-center">
                    <p className="text-base font-bold tabular-nums leading-tight">{stat.value.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                  </div>
                  {i < stats.length - 1 && <div className="h-6 w-px bg-border" />}
                </div>
              ))}
            </div>
          </div>

          {/* Vertical separator */}
          <div className="w-px bg-border self-stretch hidden sm:block" />

          {/* Right: achievement badges */}
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {ACHIEVEMENT_TRACKS.map((track) => (
              <AchievementBadge key={track.id} track={track} value={track.metric(data)} />
            ))}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

function TicketListView({ isAdmin, onSwitchTab, onNavToRoadmap }: { isAdmin: boolean; onSwitchTab: (tab: "tickets" | "releases" | "contributions" | "ideas" | "epics") => void; onNavToRoadmap?: (view: string) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [pendingTicketNumber, setPendingTicketNumber] = useState<string | null>(null);
  // Show complete AMR history on first load. Users can explicitly narrow this
  // to active work with the existing "Hide Completed" control.
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterSubmittedBy, setFilterSubmittedBy] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"priority" | "date" | "schedDev" | "schedDeploy" | "status" | "submitted" | "module" | "submitter" | "amr" | "type" | "issue" | "owner">("submitted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const WILL_WALTON_USER_ID = '0a520043-f7eb-4944-aefe-9a85de761950';
  const [filterMine, setFilterMine] = useState<boolean>(user?.id !== WILL_WALTON_USER_ID);
  const [filterMyActionItems, setFilterMyActionItems] = useState<boolean>(false);
  const [filterMyTesting, setFilterMyTesting] = useState<boolean>(false);
  const [filterCopiedOn, setFilterCopiedOn] = useState<boolean>(false);
  const [filterNewUpdates, setFilterNewUpdates] = useState<boolean>(false);
  const [filterQuick, setFilterQuick] = useState<"overdue" | "thirtyplus" | "">("")
  // Tracks which pipeline tile the user last clicked, giving it an active highlight.
  // Derived filter state alone cannot do this because two tiles (Submitted / Needs Review)
  // share the same filterStatus value, causing both to appear selected simultaneously.
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const PI_ROLES = ['super_user', 'ops_manager', 'corporate_admin'];
  const isPIAdmin = !!(user?.isRootSuperAdmin || (user?.role && PI_ROLES.includes(user.role)));
  const [filterScope, setFilterScope] = useState<string>("all");
  const [filterProductOwner, setFilterProductOwner] = useState<string>("all");
  const [filterDeveloper, setFilterDeveloper] = useState<string>("all");
  const [filterDevTeam, setFilterDevTeam] = useState<string>("all");
  const [filterEpic, setFilterEpic] = useState<string>("all");
  const [filterPlanningStatus, setFilterPlanningStatus] = useState<string>("all");
  const [filterPhase, setFilterPhase] = useState<string>("all");
  const [filterDeployFrom, setFilterDeployFrom] = useState<string>("");
  const [filterDeployTo, setFilterDeployTo] = useState<string>("");

  // Sticky filter bar — measure height so the table thead can stick directly beneath it.
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  useEffect(() => {
    const el = filterBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setFilterBarHeight(el.offsetHeight);
    });
    observer.observe(el);
    setFilterBarHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);

  const { data: epicsList = [] } = useQuery<{ id: string; name: string; amrCount: number }[]>({
    queryKey: ['/api/epics'],
  });
  const { data: phasesList = [] } = useQuery<{ id: string; name: string; epicId: string | null }[]>({
    queryKey: ['/api/amr/phases', filterEpic],
    queryFn: () =>
      fetchPhaseOptions(filterEpic !== "all" ? `/api/amr/phases?epicId=${encodeURIComponent(filterEpic)}` : '/api/amr/phases'),
    enabled: filterEpic !== "all",
    staleTime: 60_000,
  });
  // Read URL params on mount to support deep-linking from dashboard widget
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get("status");
    const quickParam = params.get("quickFilter");
    const ticketParam = params.get("ticket");

    if (ticketParam) {
      // Deep-link to a specific ticket by number (e.g. ?ticket=DH-000023)
      setPendingTicketNumber(ticketParam);
      setFilterStatus("all");   // include all statuses so the ticket is visible
      setFilterMine(false);     // show all tickets, not just mine
    } else if (quickParam === "overdue") {
      setFilterStatus("active");
      setFilterQuick("overdue");
    } else if (quickParam === "thirtyplus") {
      setFilterStatus("active");
      setFilterQuick("thirtyplus");
      setActiveWidgetId("thirty-plus");
    } else if (statusParam) {
      setFilterStatus(statusParam);
      // Map the status URL param back to the tile id so it highlights on arrival
      const urlStatusToTile: Record<string, string> = {
        submitted: "submitted",
        reviewed: "reviewed",
        prioritizing: "prioritizing",
        in_development: "in-development",
        user_declines: "user-declines",
        needs_testing: "needs-testing",
        in_queue: "in-queue",
        sent_back_for_info: "need-more-info",
        // on_roadmap is now a planning status, not a workflow status — no tile mapping needed
        completed: "completed",
      };
      if (urlStatusToTile[statusParam]) setActiveWidgetId(urlStatusToTile[statusParam]);
      if (statusParam === "needs_testing") setFilterMyTesting(true);
    }
    if (params.get("copiedOn") === "true") { setFilterCopiedOn(true); setActiveWidgetId("copied-on"); }
    if (params.get("newUpdates") === "true") { setFilterNewUpdates(true); setActiveWidgetId("new-updates"); }
    // Deep-link from Team Activity widget: filter list to a specific submitter (by userId)
    const submitterParam = params.get("submitter");
    if (submitterParam) {
      setFilterSubmittedBy(submitterParam);
      setFilterStatus("all");
      setFilterMine(false);
    }
  }, []);

  const { data: myActionItemsData } = useQuery<{ count: number }>({
    queryKey: ["/api/tickets/my-action-items-count"],
    refetchInterval: 30000,
  });
  const myActionItemsCount = myActionItemsData?.count ?? 0;

  const hasActiveFilters = filterSearch !== "" || filterStatus !== "all" || filterType !== "all" || filterModule !== "all" || filterPriority.length > 0 || filterSubmittedBy !== "" || filterDateFrom !== "" || filterDateTo !== "" || filterMyActionItems || filterMyTesting || filterCopiedOn || filterNewUpdates || filterQuick !== "" || filterScope !== "all" || filterProductOwner !== "all" || filterDeveloper !== "all" || filterDevTeam !== "all" || filterEpic !== "all" || filterPhase !== "all" || filterDeployFrom !== "" || filterDeployTo !== "";
  // Search scope is described directly beneath the search field. Keep it out of
  // the narrowing-filter badge so "1 Filter Active" cannot imply that the
  // default Active/Completed list preference is suppressing search results.
  const activeFilterCount = [filterStatus !== "all", filterType !== "all", filterModule !== "all", filterPriority.length > 0, filterSubmittedBy !== "", filterDateFrom !== "", filterDateTo !== "", filterMyActionItems, filterMyTesting, filterCopiedOn, filterNewUpdates, filterQuick !== "", filterScope !== "all", filterProductOwner !== "all", filterDeveloper !== "all", filterDevTeam !== "all", filterEpic !== "all", filterPhase !== "all", filterDeployFrom !== "", filterDeployTo !== ""].filter(Boolean).length;

  const clearFilters = () => {
    setFilterSearch("");
    setFilterStatus("all");
    setFilterType("all");
    setFilterModule("all");
    setFilterPriority([]);
    setFilterSubmittedBy("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterMyActionItems(false);
    setFilterMyTesting(false);
    setFilterCopiedOn(false);
    setFilterNewUpdates(false);
    setFilterQuick("");
    setFilterScope("all");
    setFilterProductOwner("all");
    setFilterDeveloper("all");
    setFilterDevTeam("all");
    setFilterEpic("all");
    setFilterPlanningStatus("all");
    setFilterPhase("all");
    setFilterDeployFrom("");
    setFilterDeployTo("");
    setActiveWidgetId(null);
  };

  const togglePriority = (p: string) => {
    setFilterPriority(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const queryParams = new URLSearchParams();
  const isSearching = filterSearch.trim().length > 0;
  if (isSearching) {
    // Global search starts from the complete authorized scope, including
    // Completed AMRs. A status selected through the filter control may narrow
    // the result; a dashboard widget selection never does.
    queryParams.set("excludeCompleted", "false");
    if (filterStatus !== "active" && filterStatus !== "all" && !activeWidgetId) {
      queryParams.set("status", filterStatus);
    }
  } else if (filterStatus === "active") {
    // When a global search is active, include Completed AMRs — searching is an
    // explicit request to find any AMR, not just the default active view.
    queryParams.set("excludeCompleted", isSearching ? "false" : "true");
  } else if (filterStatus === "all") {
    queryParams.set("excludeCompleted", "false");
  } else {
    queryParams.set("status", filterStatus);
  }
  if (filterType !== "all") queryParams.set("type", filterType);
  if (filterModule !== "all") queryParams.set("module", filterModule);
  if (filterPriority.length > 0) queryParams.set("priority", filterPriority.join(","));
  if (filterSubmittedBy) queryParams.set("submittedBy", filterSubmittedBy);
  if (filterDateFrom) queryParams.set("schedDevFrom", filterDateFrom);
  if (filterDateTo) queryParams.set("schedDevTo", filterDateTo);
  if (filterScope !== "all") queryParams.set("scope", filterScope);
  if (filterProductOwner !== "all") queryParams.set("productOwnerUserId", filterProductOwner);
  if (filterDeveloper !== "all") queryParams.set("developerUserId", filterDeveloper);
  if (filterDevTeam !== "all") queryParams.set("devTeam", filterDevTeam);
  if (filterEpic !== "all") queryParams.set("epicId", filterEpic);
  if (filterPlanningStatus !== "all") queryParams.set("planningStatus", filterPlanningStatus);
  if (filterPhase !== "all") queryParams.set("phaseId", filterPhase);
  if (filterDeployFrom) queryParams.set("schedDeployFrom", filterDeployFrom);
  if (filterDeployTo) queryParams.set("schedDeployTo", filterDeployTo);
  if (filterMine) queryParams.set("mine", "true");
  if (!isSearching && filterMyActionItems && user?.id) queryParams.set("ownerUserId", user.id);
  if (!isSearching && filterMyTesting) queryParams.set("myTesting", "true");
  if (!isSearching && filterCopiedOn) queryParams.set("copiedOn", "true");
  if (!isSearching && filterNewUpdates) queryParams.set("newUpdates", "true");
  if (filterSearch.trim()) queryParams.set("search", filterSearch.trim());
  queryParams.set("sortBy", sortBy === "submitted" ? "submittedAt" : sortBy);
  queryParams.set("sortDir", sortDir);

  const ticketListUrl = `/api/tickets?${queryParams.toString()}`;
  const { data: ticketList = [], isLoading: listLoading } = useQuery<Ticket[]>({
    queryKey: [ticketListUrl],
    queryFn: async () => {
      const response = await fetch(ticketListUrl, {
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) throw new Error("Failed to fetch AMRs");
      return response.json();
    },
  });

  // When in Mine mode + searching and the Mine results are empty, fetch a count of matching
  // AMRs across All so we can surface "X matching AMRs exist in All." instead of a silent zero.
  const allScopeCountParams = new URLSearchParams();
  if (filterSearch.trim()) allScopeCountParams.set("search", filterSearch.trim());
  // mine=false means no Mine constraint → searches entire dataset
  const { data: allScopeCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/tickets/count", `?${allScopeCountParams.toString()}`],
    enabled: isSearching && filterMine && !listLoading && ticketList.length === 0,
  });
  const allScopeCount = allScopeCountData?.count ?? 0;

  // Auto-select ticket when deep-linked via ?ticket=DH-000023
  useEffect(() => {
    if (!pendingTicketNumber || ticketList.length === 0) return;
    const match = ticketList.find(t => t.ticketNumber === pendingTicketNumber);
    if (match) {
      setSelectedTicketId(match.id);
      setPendingTicketNumber(null);
    }
  }, [pendingTicketNumber, ticketList]);

  const { data: portalAdminUsers = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; email: string | null }[]>({
    queryKey: ["/api/admin/users/list-admins"],
    enabled: isAdmin,
  });

  function dateMs(val: string | null | undefined): number | null {
    if (!val) return null;
    const d = new Date(val + (val.includes('T') ? '' : 'T00:00:00'));
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  const sortedTicketList = [...ticketList].sort((a, b) => {
    if (sortBy === "priority") {
      const oa = PRIORITY_ORDER[a.priority] ?? 99;
      const ob = PRIORITY_ORDER[b.priority] ?? 99;
      if (oa !== ob) return sortDir === "asc" ? oa - ob : ob - oa;
      const da = dateMs((a as any).scheduledDevelopmentDate);
      const db2 = dateMs((b as any).scheduledDevelopmentDate);
      if (da === null && db2 === null) return 0;
      if (da === null) return 1;
      if (db2 === null) return -1;
      return da - db2;
    }
    if (sortBy === "schedDev" || sortBy === "schedDeploy") {
      const field = sortBy === "schedDev" ? "scheduledDevelopmentDate" : "scheduledDeploymentDate";
      const da = dateMs((a as any)[field]);
      const db2 = dateMs((b as any)[field]);
      if (da === null && db2 === null) return 0;
      if (da === null) return 1;
      if (db2 === null) return -1;
      return sortDir === "asc" ? da - db2 : db2 - da;
    }
    if (sortBy === "status") {
      return sortDir === "asc"
        ? (a.status ?? "").localeCompare(b.status ?? "")
        : (b.status ?? "").localeCompare(a.status ?? "");
    }
    if (sortBy === "module") {
      return sortDir === "asc"
        ? formatModuleLabel(a.module).localeCompare(formatModuleLabel(b.module))
        : formatModuleLabel(b.module).localeCompare(formatModuleLabel(a.module));
    }
    if (sortBy === "submitter") {
      const as2 = (a as any).submittedByUsername ?? "";
      const bs2 = (b as any).submittedByUsername ?? "";
      return sortDir === "asc" ? as2.localeCompare(bs2) : bs2.localeCompare(as2);
    }
    if (sortBy === "submitted") {
      const da = dateMs(a.submittedAt as any);
      const db2 = dateMs(b.submittedAt as any);
      if (da === null && db2 === null) return 0;
      if (da === null) return 1;
      if (db2 === null) return -1;
      return sortDir === "asc" ? da - db2 : db2 - da;
    }
    if (sortBy === "amr") {
      const an = (a as any).ticketNumber ?? "";
      const bn = (b as any).ticketNumber ?? "";
      return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
    }
    if (sortBy === "type") {
      return sortDir === "asc"
        ? (a.type ?? "").localeCompare(b.type ?? "")
        : (b.type ?? "").localeCompare(a.type ?? "");
    }
    if (sortBy === "issue") {
      return sortDir === "asc"
        ? (a.title ?? "").localeCompare(b.title ?? "")
        : (b.title ?? "").localeCompare(a.title ?? "");
    }
    if (sortBy === "owner") {
      const ao = (a as any).assignedToUsername ?? "";
      const bo = (b as any).assignedToUsername ?? "";
      return sortDir === "asc" ? ao.localeCompare(bo) : bo.localeCompare(ao);
    }
    return 0;
  }).filter(ticket => {
    if (filterQuick === "overdue") {
      const threshold = TICKET_AGING_THRESHOLDS[(ticket as any).status];
      if (!threshold) return false;
      const lastChange = (ticket as any).lastStatusChangeAt ? new Date((ticket as any).lastStatusChangeAt) : null;
      if (!lastChange) return false;
      return (Date.now() - lastChange.getTime()) / (1000 * 60 * 60) >= threshold;
    }
    if (filterQuick === "thirtyplus") {
      const isTerminal = (TICKET_GOVERNANCE_TERMINAL as readonly string[]).includes(ticket.status);
      if (isTerminal) return false;
      const sub = ticket.submittedAt ? new Date(ticket.submittedAt) : null;
      if (!sub) return false;
      return Math.floor((Date.now() - sub.getTime()) / (1000 * 60 * 60 * 24)) >= TICKET_DAYS_CRITICAL;
    }
    return true;
  });

  const QUICK_FILTER_LABELS: Record<string, string> = {
    overdue: "Overdue (past aging threshold)",
    thirtyplus: "30+ Days Open (governance limit)",
  };

  function handleSortColumn(col: typeof sortBy) {
    if (sortBy === col) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        // Third click → reset to default (newest first)
        setSortBy("submitted");
        setSortDir("desc");
      }
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  const { data: ticketDetail, isLoading: detailLoading } = useQuery<TicketWithDetails>({
    queryKey: ["/api/tickets", selectedTicketId],
    enabled: !!selectedTicketId,
  });

  const { data: amrMetrics } = useQuery<{
    // Primary workflow/planning metrics (scope-aware)
    submitted: number;
    needMoreInfo: number;
    prioritizing: number;
    roadmap: number;
    inDevelopment: number;
    needsTesting: number;
    userDeclines: number;
    completedTotal: number;
    // Priority counts (active AMRs only, scope-aware)
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    p4: number;
    // Legacy aliases
    needsReview: number;
    reviewed: number;
    blocked: number;
    inQueue: number;
    isPersonalized: boolean;
    planningBacklog?: number;
    planningRoadmapped?: number;
    planningUnscheduled?: number;
    planningScheduled?: number;
    planningStartingSoon?: number;
    planningDeployDueSoon?: number;
    planningAtRisk?: number;
    planningOverdue?: number;
    planningCompletedRoadmap?: number;
  }>({
    queryKey: ["/api/tickets/amr-metrics", filterMine],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/amr-metrics?mine=${filterMine ? 'true' : 'false'}`, {
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error("Failed to fetch AMR metrics");
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (selectedTicketId && ticketDetail) {
    const handleBack = () => {
      setSelectedTicketId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
    };
    return (
      <TicketDetailErrorBoundary onBack={handleBack}>
        <TicketDetail
          ticket={ticketDetail}
          isAdmin={isAdmin}
          onBack={handleBack}
          onNavToRoadmap={onNavToRoadmap}
        />
      </TicketDetailErrorBoundary>
    );
  }

  return (
    <div className="space-y-4 pt-4 sm:pt-6" data-testid="ticket-portal">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" data-testid="text-ticket-portal-title">App Modification Request</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onSwitchTab("ideas")} data-testid="button-switch-ideas">
              <Sparkles className="h-4 w-4 mr-1" />
              Quick Ideas
            </Button>
            <Button variant="outline" size="sm" onClick={() => onSwitchTab("epics")} data-testid="button-switch-epics">
              <Layers className="h-4 w-4 mr-1" />
              Epics
            </Button>
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => onSwitchTab("roadmap")} data-testid="button-switch-roadmap">
                  <CalendarClock className="h-4 w-4 mr-1" />
                  Roadmap
                </Button>
                <Button variant="outline" size="sm" onClick={() => onSwitchTab("releases")} data-testid="button-switch-releases">
                  <Package className="h-4 w-4 mr-1" />
                  Releases
                </Button>
                <Button variant="outline" size="sm" onClick={() => onSwitchTab("contributions")} data-testid="button-switch-contributions">
                  <Trophy className="h-4 w-4 mr-1" />
                  Contributions
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center border rounded-md divide-x overflow-hidden" data-testid="view-scope-toggle">
          <button
            className={`text-xs px-3 py-1.5 flex items-center gap-1.5 transition-colors ${filterMine ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
            onClick={() => setFilterMine(true)}
            data-testid="button-scope-mine"
          >
            <UserIcon className="h-3.5 w-3.5" />
            Mine
          </button>
          <button
            className={`text-xs px-3 py-1.5 flex items-center gap-1.5 transition-colors ${!filterMine ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
            onClick={() => setFilterMine(false)}
            data-testid="button-scope-all"
          >
            <Users className="h-3.5 w-3.5" />
            All
          </button>
        </div>
      </div>

      <ContributionsPanel />

      {amrMetrics && (
        <div data-testid="amr-pipeline-tiles" className="flex flex-wrap items-start gap-x-4 gap-y-3">

          {/* ── Status / Planning group — flex-1 fills available width ── */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Status / Planning
            </span>
            <div className="flex flex-wrap gap-2">
              {([
                {
                  id: "submitted", label: "Submitted",
                  count: amrMetrics.submitted ?? amrMetrics.needsReview,
                  dot: null,
                  countColor: "text-foreground",
                  onClick: () => { setFilterStatus("submitted"); setFilterPriority([]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "need-more-info", label: "Need More Info",
                  count: amrMetrics.needMoreInfo ?? amrMetrics.blocked,
                  dot: (amrMetrics.needMoreInfo ?? amrMetrics.blocked ?? 0) > 0 ? "bg-orange-400" : null,
                  countColor: (amrMetrics.needMoreInfo ?? amrMetrics.blocked ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
                  onClick: () => { setFilterStatus("sent_back_for_info"); setFilterPriority([]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "prioritizing", label: "Prioritizing",
                  count: amrMetrics.prioritizing,
                  dot: null,
                  countColor: "text-foreground",
                  onClick: () => { setFilterStatus("prioritizing"); setFilterPriority([]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "roadmap", label: "Roadmapped",
                  count: amrMetrics.roadmap,
                  dot: null,
                  countColor: "text-foreground",
                  onClick: () => { onNavToRoadmap?.("roadmapped"); },
                },
                {
                  id: "in-development", label: "In Dev / Deploy",
                  count: amrMetrics.inDevelopment,
                  dot: null,
                  countColor: "text-foreground",
                  onClick: () => { setFilterStatus("in_development"); setFilterPriority([]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "needs-testing", label: "Needs Testing",
                  count: amrMetrics.needsTesting,
                  dot: null,
                  countColor: "text-foreground",
                  onClick: () => { setFilterStatus("needs_testing"); setFilterPriority([]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "user-declines", label: "User Declines",
                  count: amrMetrics.userDeclines,
                  dot: amrMetrics.userDeclines > 0 ? "bg-red-500" : null,
                  countColor: amrMetrics.userDeclines > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                  onClick: () => { setFilterStatus("user_declines"); setFilterPriority([]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "completed", label: "Completed",
                  count: amrMetrics.completedTotal,
                  dot: amrMetrics.completedTotal > 0 ? "bg-emerald-500" : null,
                  countColor: amrMetrics.completedTotal > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                  onClick: () => { setFilterStatus("completed"); setFilterPriority([]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
              ] as const).map((tile: any) => {
                const isActive = tile.id === activeWidgetId;
                return (
                  <button
                    key={tile.id}
                    onClick={() => { tile.onClick(); setActiveWidgetId(tile.id); }}
                    className={[
                      "flex flex-col justify-between gap-2 px-3 py-2.5 rounded-md border cursor-pointer text-left transition-colors flex-1 min-w-[80px]",
                      isActive ? "border-primary bg-primary/5 shadow-sm" : "bg-card hover-elevate",
                    ].join(" ")}
                    data-testid={`tile-amr-${tile.id}`}
                    aria-pressed={isActive}
                  >
                    <div className="flex items-center gap-1.5">
                      {tile.dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tile.dot}`} />}
                      <span className="text-xs text-muted-foreground leading-snug whitespace-nowrap">{tile.label}</span>
                    </div>
                    <span className={`text-lg font-bold tabular-nums leading-none ${tile.countColor}`}>
                      {tile.count != null ? tile.count.toLocaleString() : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Vertical separator ──────────────────────────────── */}
          <div className="w-px bg-border self-stretch hidden sm:block" />

          {/* ── Priority group ──────────────────────────────────── */}
          <div className="flex flex-col gap-1.5 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Priority
            </span>
            <div className="flex flex-wrap gap-2">
              {([
                {
                  id: "priority-p0", code: "P0", desc: "Critical",
                  count: amrMetrics.p0,
                  dot: amrMetrics.p0 > 0 ? "bg-red-500" : null,
                  countColor: amrMetrics.p0 > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                  onClick: () => { setFilterStatus("active"); setFilterPriority(["P0"]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "priority-p1", code: "P1", desc: "High",
                  count: amrMetrics.p1,
                  dot: amrMetrics.p1 > 0 ? "bg-orange-400" : null,
                  countColor: amrMetrics.p1 > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
                  onClick: () => { setFilterStatus("active"); setFilterPriority(["P1"]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "priority-p2", code: "P2", desc: "Medium",
                  count: amrMetrics.p2,
                  dot: null,
                  countColor: "text-foreground",
                  onClick: () => { setFilterStatus("active"); setFilterPriority(["P2"]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "priority-p3", code: "P3", desc: "Low",
                  count: amrMetrics.p3,
                  dot: null,
                  countColor: "text-foreground",
                  onClick: () => { setFilterStatus("active"); setFilterPriority(["P3"]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
                {
                  id: "priority-p4", code: "P4", desc: "Future",
                  count: amrMetrics.p4,
                  dot: null,
                  countColor: "text-muted-foreground",
                  onClick: () => { setFilterStatus("active"); setFilterPriority(["P4"]); setFilterPlanningStatus("all"); setFilterMyActionItems(false); setFilterMyTesting(false); setFilterCopiedOn(false); setFilterNewUpdates(false); setFilterQuick(""); },
                },
              ] as const).map((tile: any) => {
                const isActive = tile.id === activeWidgetId;
                return (
                  <button
                    key={tile.id}
                    onClick={() => { tile.onClick(); setActiveWidgetId(tile.id); }}
                    className={[
                      "flex flex-col justify-between gap-2 px-3 py-2.5 rounded-md border cursor-pointer text-left transition-colors min-w-[80px]",
                      isActive ? "border-primary bg-primary/5 shadow-sm" : "bg-card hover-elevate",
                    ].join(" ")}
                    data-testid={`tile-amr-${tile.id}`}
                    aria-pressed={isActive}
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        {tile.dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tile.dot}`} />}
                        <span className="text-xs font-medium text-muted-foreground leading-tight">{tile.code}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground/70 leading-tight">{tile.desc}</span>
                    </div>
                    <span className={`text-lg font-bold tabular-nums leading-none ${tile.countColor}`}>
                      {tile.count != null ? tile.count.toLocaleString() : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      )}

      <>
      {/* ── Sticky pinned area: search + filters + (thead offset measured separately) ── */}
      <div
        ref={filterBarRef}
        className="sticky top-0 z-20 bg-background pt-1 border-b border-border/50"
      >
      <div className="px-1 pb-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder='Search AMRs — use "exact phrase", AND, or OR'
            className="pl-8 pr-8"
            data-testid="input-amr-search"
          />
          {filterSearch && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-2"
              onClick={() => setFilterSearch("")}
              tabIndex={-1}
              data-testid="button-clear-amr-search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {isSearching && (
          <p className="mt-1 px-1 text-xs text-muted-foreground" data-testid="amr-global-search-scope">
            Global search: <strong>{filterMine ? "Mine" : "All authorized AMRs"}</strong>
            {" "}— includes Completed AMRs and ignores dashboard/widget list filters. Use quotes for an exact phrase; AND / OR are supported.
          </p>
        )}
      </div>
      <div data-testid="filter-bar" className="space-y-1.5 py-1">
        {/* Row 1: Status · Type · Priority · Module · Scope · Product Owner · Developer · Team · Epic */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={filterStatus} onValueChange={(value) => {
            setFilterStatus(value);
            setActiveWidgetId(null);
          }}>
            <SelectTrigger className="h-8 text-sm w-[165px]" data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (excl. Completed)</SelectItem>
              <SelectItem value="all">All (incl. Completed)</SelectItem>
              {TICKET_ACTIVE_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-sm w-[135px]" data-testid="select-filter-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TICKET_TYPES.map(t => (
                <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-[155px] justify-between font-normal text-sm"
                data-testid="select-filter-priority"
              >
                <span className="truncate">
                  {filterPriority.length === 0
                    ? "All Priorities"
                    : filterPriority.length === 1
                    ? TICKET_PRIORITY_LABELS[filterPriority[0]] || filterPriority[0]
                    : `${filterPriority.length} Priorities`}
                </span>
                <ChevronsUpDown className="h-3 w-3 opacity-50 flex-shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-2" align="start">
              <div className="space-y-0.5">
                {TICKET_PRIORITIES.map(p => (
                  <div
                    key={p}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate"
                    onClick={() => togglePriority(p)}
                    data-testid={`filter-priority-option-${p}`}
                  >
                    <Checkbox
                      checked={filterPriority.includes(p)}
                      onCheckedChange={() => togglePriority(p)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span className="text-sm">{TICKET_PRIORITY_LABELS[p] || p}</span>
                  </div>
                ))}
              </div>
              {filterPriority.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setFilterPriority([])}>
                    Clear
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="h-8 text-sm w-[155px]" data-testid="select-filter-module">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {[...TICKET_MODULE_DEFINITIONS]
                .sort((a, b) => a.label.localeCompare(b.label))
                .map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Select value={filterScope} onValueChange={setFilterScope}>
            <SelectTrigger className="h-8 text-sm w-[145px]" data-testid="select-filter-scope">
              <SelectValue placeholder="App Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              {[...AMR_APPLICATION_SCOPES].sort().map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isAdmin && (
            <Select value={filterProductOwner} onValueChange={setFilterProductOwner}>
              <SelectTrigger className="h-8 text-sm w-[160px]" data-testid="select-filter-product-owner">
                <SelectValue placeholder="Product Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Product Owners</SelectItem>
                {[...portalAdminUsers]
                  .sort((a, b) => `${a.lastName ?? ""} ${a.firstName ?? ""}`.localeCompare(`${b.lastName ?? ""} ${b.firstName ?? ""}`))
                  .map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          {isAdmin && (
            <Select value={filterDeveloper} onValueChange={setFilterDeveloper}>
              <SelectTrigger className="h-8 text-sm w-[155px]" data-testid="select-filter-developer">
                <SelectValue placeholder="Developer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Developers</SelectItem>
                {[...portalAdminUsers]
                  .sort((a, b) => `${a.lastName ?? ""} ${a.firstName ?? ""}`.localeCompare(`${b.lastName ?? ""} ${b.firstName ?? ""}`))
                  .map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filterDevTeam} onValueChange={setFilterDevTeam}>
            <SelectTrigger className="h-8 text-sm w-[145px]" data-testid="select-filter-dev-team">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {[...AMR_DEV_TEAMS].sort().map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {epicsList.length > 0 && (
            <AmrEpicPicker
              epics={epicsList}
              value={filterEpic === "all" ? null : filterEpic}
              onValueChange={(value) => {
                setFilterEpic(value || "all");
                if (!value) setFilterPhase("all");
              }}
              includeUnassigned
              placeholder="All Epics"
              unassignedLabel="All Epics"
              className="h-8 w-[155px] text-sm"
              testId="select-filter-epic"
            />
          )}

          {/* Phase / Milestone — only visible when a specific Epic is selected */}
          {filterEpic !== "all" && phasesList.length > 0 && (
            <Select value={filterPhase} onValueChange={setFilterPhase}>
              <SelectTrigger className="h-8 text-sm w-[175px]" data-testid="select-filter-phase">
                <SelectValue placeholder="Phase / Milestone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Phases</SelectItem>
                {[...phasesList]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Row 2: Submitted By · Date Range · My Action Items · Clear · Count · Hide Completed */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Submitted by..."
              value={filterSubmittedBy}
              onChange={(e) => setFilterSubmittedBy(e.target.value)}
              className="h-8 text-sm w-[150px] pl-7"
              data-testid="input-filter-submitted-by"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none px-0.5">
              Sched Dev From
            </span>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              autoComplete="off"
              className="h-8 text-sm w-[140px]"
              data-testid="input-filter-date-from"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none px-0.5">
              Sched Dev To
            </span>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              autoComplete="off"
              className="h-8 text-sm w-[140px]"
              data-testid="input-filter-date-to"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none px-0.5">
              Sched Deploy From
            </span>
            <Input
              type="date"
              value={filterDeployFrom}
              onChange={(e) => setFilterDeployFrom(e.target.value)}
              autoComplete="off"
              className="h-8 text-sm w-[140px]"
              data-testid="input-filter-deploy-from"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none px-0.5">
              Sched Deploy To
            </span>
            <Input
              type="date"
              value={filterDeployTo}
              onChange={(e) => setFilterDeployTo(e.target.value)}
              autoComplete="off"
              className="h-8 text-sm w-[140px]"
              data-testid="input-filter-deploy-to"
            />
          </div>

          <Button
            variant={filterMyActionItems ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterMyActionItems(!filterMyActionItems)}
            className="h-8 flex items-center gap-1.5 whitespace-nowrap"
            data-testid="button-filter-my-action-items"
          >
            My Action Items
            {myActionItemsCount > 0 && (
              <Badge
                className={`ml-0.5 text-xs px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center no-default-hover-elevate no-default-active-elevate ${filterMyActionItems ? "bg-white/20 text-white" : "bg-orange-500 text-white"}`}
                data-testid="badge-my-action-items-count"
              >
                {myActionItemsCount.toLocaleString()}
              </Badge>
            )}
          </Button>

          {isAdmin && (
            <Button
              variant={filterMine ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setFilterMine(!filterMine)}
              data-testid="button-filter-mine"
            >
              {filterMine ? "Mine" : "All"}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            data-testid="button-clear-filters"
          >
            <X className="h-3 w-3 mr-1" />
            Clear Filters
          </Button>

          {activeFilterCount > 0 && (
            <Badge className="bg-orange-500 text-white no-default-hover-elevate no-default-active-elevate" data-testid="badge-active-filter-count">
              {activeFilterCount} Filter{activeFilterCount !== 1 ? "s" : ""} Active
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground whitespace-nowrap"
            onClick={() => setFilterStatus(filterStatus === "active" ? "all" : "active")}
            data-testid="button-toggle-completed"
          >
            {filterStatus === "active" ? "Show Completed" : "Hide Completed"}
          </Button>

          {filterQuick !== "" && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 whitespace-nowrap">
              {QUICK_FILTER_LABELS[filterQuick]}
              <button
                onClick={() => setFilterQuick("")}
                className="ml-0.5 hover:text-amber-600"
                title="Clear quick filter"
                data-testid="button-clear-quick-filter"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          <span className="text-xs text-muted-foreground whitespace-nowrap ml-auto" data-testid="text-ticket-count">
            {isSearching
              ? `Search Results: ${sortedTicketList.length.toLocaleString()} AMR${sortedTicketList.length !== 1 ? "s" : ""}`
              : `${sortedTicketList.length.toLocaleString()} ticket${sortedTicketList.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>
      {/* Aging / status legend — lives inside the sticky bar so its height is
          included in filterBarHeight and the thead sticks flush below it. */}
      {ticketList.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-1.5 border-t border-border/40 text-xs text-muted-foreground bg-background">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-yellow-100 dark:bg-yellow-900/40 border border-yellow-300 dark:border-yellow-700 flex-shrink-0" />
            Aging (past status threshold)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 flex-shrink-0" />
            Escalated (2× threshold)
          </span>
          <span className="flex items-center gap-1.5 border-l border-border pl-4">
            <Clock className="h-3 w-3 text-amber-500 flex-shrink-0" />
            Approaching 30-day limit ({TICKET_DAYS_WARNING}+ days open)
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
            30-day limit reached — action required
          </span>
        </div>
      )}
      </div>{/* end sticky filter bar */}

      {listLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : ticketList.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          {isSearching && filterMine ? (
            <div className="space-y-1">
              <p className="text-[13px]">No matching AMRs found in Mine.</p>
              {allScopeCount > 0 ? (
                <p className="text-[13px]">
                  {allScopeCount.toLocaleString()} matching AMR{allScopeCount !== 1 ? "s" : ""} exist{allScopeCount === 1 ? "s" : ""} in All.{" "}
                  <button
                    className="underline text-primary hover:text-primary/80"
                    onClick={() => setFilterMine(false)}
                  >
                    Switch to All
                  </button>
                </p>
              ) : allScopeCountData !== undefined ? (
                <p className="text-[13px]">{`No AMRs found matching "${filterSearch.trim()}".`}</p>
              ) : null}
            </div>
          ) : isSearching ? (
            <p className="text-[13px]">{`No AMRs found matching "${filterSearch.trim()}".`}</p>
          ) : filterMyTesting ? (
            <p className="text-[13px]">No AMRs currently require your testing or sign-off.</p>
          ) : (filterCopiedOn || filterNewUpdates) ? (
            <p className="text-[13px]">No AMRs currently match this category.</p>
          ) : (
            <p className="text-[13px]">No modification requests found. Use the &ldquo;Submit Mod Request&rdquo; button to create one.</p>
          )}
        </div>
      ) : (
        <>
        <div className="border rounded-md overflow-x-clip" data-testid="amr-list-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider sticky z-10" style={{ top: filterBarHeight }} data-testid="amr-list-header">
                <th className="px-3 py-2 text-left font-medium">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("amr")} data-testid="button-sort-amr">
                    AMR# <SortIcon col="amr" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("submitted")} data-testid="button-sort-submitted">
                    Date <SortIcon col="submitted" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium hidden xl:table-cell">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("type")} data-testid="button-sort-type">
                    Type <SortIcon col="type" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("module")} data-testid="button-sort-module">
                    Module <SortIcon col="module" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium hidden xl:table-cell">App Scope</th>
                <th className="px-3 py-2 text-left font-medium">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("issue")} data-testid="button-sort-issue">
                    Issue / Idea <SortIcon col="issue" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("priority")} data-testid="button-sort-priority">
                    Priority <SortIcon col="priority" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium hidden xl:table-cell">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("submitter")} data-testid="button-sort-submitter">
                    Submitter <SortIcon col="submitter" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("status")} data-testid="button-sort-status">
                    Status <SortIcon col="status" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("schedDev")} data-testid="button-sort-sched-dev">
                    Sched Dev <SortIcon col="schedDev" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSortColumn("schedDeploy")} data-testid="button-sort-sched-deploy">
                    Sched Deploy <SortIcon col="schedDeploy" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedTicketList.map((ticket) => {
                const t = ticket as TicketWithDetails;
                const today = new Date(); today.setHours(0,0,0,0);
                const schedDevDate = t.scheduledDevelopmentDate ? new Date(t.scheduledDevelopmentDate + 'T00:00:00') : null;
                const schedDeployDate = (t as any).scheduledDeploymentDate ? new Date((t as any).scheduledDeploymentDate + 'T00:00:00') : null;
                const OVERDUE_STATUSES = ['submitted','reviewed','sent_back_for_info','prioritizing','in_queue','in_development'];
                const isDevOverdue = schedDevDate && schedDevDate < today && OVERDUE_STATUSES.includes(ticket.status);
                const deployDaysOut = schedDeployDate ? Math.ceil((schedDeployDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                const isDeployUpcoming = deployDaysOut !== null && deployDaysOut >= 0 && deployDaysOut <= 3;
                const formatShortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

                const agingThresholdHours = TICKET_AGING_THRESHOLDS[(ticket as any).status];
                const lastStatusChange = (ticket as any).lastStatusChangeAt ? new Date((ticket as any).lastStatusChangeAt) : null;
                const staleHours = lastStatusChange ? (Date.now() - lastStatusChange.getTime()) / (1000 * 60 * 60) : 0;
                const isAging = !!agingThresholdHours && staleHours >= agingThresholdHours;
                const isEscalated = !!agingThresholdHours && staleHours >= agingThresholdHours * 2;
                const agingRowClass = isEscalated
                  ? "bg-red-50 dark:bg-red-950/20"
                  : isAging
                  ? "bg-yellow-50 dark:bg-yellow-950/20"
                  : "";

                const isGovernanceTerminal = (TICKET_GOVERNANCE_TERMINAL as readonly string[]).includes(ticket.status);
                const submittedDate = ticket.submittedAt ? new Date(ticket.submittedAt) : null;
                const daysOpen = submittedDate ? Math.floor((Date.now() - submittedDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                const isGovernanceWarning = !isGovernanceTerminal && daysOpen >= TICKET_DAYS_WARNING && daysOpen < TICKET_DAYS_CRITICAL;
                const isGovernanceCritical = !isGovernanceTerminal && daysOpen >= TICKET_DAYS_CRITICAL;

                return (
                  <tr
                    key={ticket.id}
                    className={`cursor-pointer hover-elevate ${agingRowClass}`}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) setSelectedTicketId(ticket.id); }}
                    data-testid={`row-ticket-${ticket.id}`}
                  >
                    <td className="px-3 py-2.5" data-testid={`text-ticket-number-${ticket.id}`}>
                      {/* Real <a> so Ctrl/Cmd/Middle-click opens in new tab; left-click stays in-page */}
                      <a
                        href={`/amr?ticket=${ticket.ticketNumber}`}
                        className="text-xs font-mono text-muted-foreground whitespace-nowrap hover:underline"
                        onClick={(e) => { if (e.ctrlKey || e.metaKey || e.button !== 0) return; e.preventDefault(); setSelectedTicketId(ticket.id); }}
                      >{ticket.ticketNumber}</a>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(ticket.submittedAt)}</span>
                        {isGovernanceCritical && (
                          <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 flex items-center gap-0.5 whitespace-nowrap" title={`Critical: ${daysOpen} days open — action required (30-day limit reached)`}>
                            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />{daysOpen}d limit
                          </span>
                        )}
                        {isGovernanceWarning && (
                          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-0.5 whitespace-nowrap" title={`Warning: ${daysOpen} days open — approaching 30-day governance limit`}>
                            <Clock className="h-2.5 w-2.5 shrink-0" />{daysOpen}d open
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs hidden xl:table-cell">
                      <span className="whitespace-nowrap">{TYPE_LABELS[ticket.type] || ticket.type}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs hidden lg:table-cell">
                      <span className="whitespace-nowrap">{formatModuleLabel(ticket.module)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs hidden xl:table-cell" data-testid={`text-ticket-scope-${ticket.id}`}>
                      <span className="whitespace-nowrap">{(ticket as any).applicationScope || 'DriverHub'}</span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[240px]" data-testid={`text-ticket-title-${ticket.id}`}>
                      <a
                        href={`/amr?ticket=${ticket.ticketNumber}`}
                        className="text-sm line-clamp-2 leading-snug block hover:underline"
                        title={ticket.title}
                        onClick={(e) => { if (e.ctrlKey || e.metaKey || e.button !== 0) return; e.preventDefault(); setSelectedTicketId(ticket.id); }}
                      >{ticket.title}</a>
                      {/* Ready for Queue indicator (item 12): planning=scheduled + dev date set + not yet queued/in-dev */}
                      {(t as any).planningStatus === 'scheduled' &&
                        !!t.scheduledDevelopmentDate &&
                        !['completed','cancelled','user_accepts','user_declines','complete','duplicate','in_queue','in_development','in_production','needs_testing'].includes(ticket.status) && (
                        <span
                          className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400 whitespace-nowrap"
                          title="This AMR is scheduled with a development date and is eligible to enter the queue"
                          data-testid={`badge-ready-for-queue-${ticket.id}`}
                        >
                          <CheckCircle className="h-2.5 w-2.5 shrink-0" />
                          Ready for Queue
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={`text-xs whitespace-nowrap ${PRIORITY_COLORS[ticket.priority] || ''} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-priority-${ticket.id}`}>
                        {TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground hidden xl:table-cell">
                      <span className="whitespace-nowrap">{ticket.submittedByUsername || "\u2014"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {isEscalated && (
                          <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" title={`Escalated: in "${ticket.status.replace(/_/g, ' ')}" for ${Math.floor(staleHours)}h (threshold: ${agingThresholdHours}h)`} />
                        )}
                        {isAging && !isEscalated && (
                          <AlertTriangle className="h-3 w-3 text-yellow-500 flex-shrink-0" title={`Aging: in "${ticket.status.replace(/_/g, ' ')}" for ${Math.floor(staleHours)}h (threshold: ${agingThresholdHours}h)`} />
                        )}
                        <Badge className={`text-xs whitespace-nowrap ${STATUS_COLORS[ticket.status]} no-default-hover-elevate no-default-active-elevate`}>
                          {STATUS_LABELS[ticket.status]}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell" data-testid={`text-sched-dev-${ticket.id}`}>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {isDevOverdue && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                        <span className="whitespace-nowrap">{schedDevDate ? formatShortDate(schedDevDate) : "\u2014"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell" data-testid={`text-sched-deploy-${ticket.id}`}>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {isDeployUpcoming && <AlertTriangle className="h-3 w-3 text-yellow-500 flex-shrink-0" />}
                        <span className="whitespace-nowrap">{schedDeployDate ? formatShortDate(schedDeployDate) : "\u2014"}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      </>
    </div>
  );
}

function TicketDetail({ ticket, isAdmin, onBack, onNavToRoadmap }: {
  ticket: TicketWithDetails;
  isAdmin: boolean;
  onBack: () => void;
  onNavToRoadmap?: (view: string) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("details");
  const [commentText, setCommentText] = useState("");
  // Per-comment expand/collapse — set of comment IDs the user has expanded.
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const toggleComment = (id: string) =>
    setExpandedComments(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [declineCommentError, setDeclineCommentError] = useState("");
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Set to true before calling addCommentMut for a decline flow; cleared in onSuccess.
  const pendingDeclineRef = useRef(false);
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
  const [workNote, setWorkNote] = useState("");
  const [workStatusAfter, setWorkStatusAfter] = useState<string>("");
  const [detailUploadFiles, setDetailUploadFiles] = useState<File[]>([]);
  const [confirmDeleteAttachId, setConfirmDeleteAttachId] = useState<string | null>(null);
  const headerFileInputRef = useRef<HTMLInputElement>(null);
  const isSubmitter = user?.id === ticket.submittedByUserId;
  const workflowStatuses = TICKET_ACTIVE_STATUSES;
  const SUBMITTER_EDITABLE_STATUSES = ['submitted', 'reviewed', 'sent_back_for_info'];
  const canSubmitterEdit = isSubmitter && SUBMITTER_EDITABLE_STATUSES.includes(ticket.status);

  const isRootScheduler = user?.isRootSuperAdmin === true;
  // Will Walton — can edit Name / Type / Module on any AMR, any status
  const isRootAdmin = user?.isRootSuperAdmin === true;
  // True when Will Walton is making an admin classification edit (not a submitter edit)
  const isAdminClassEdit = isRootAdmin && !canSubmitterEdit;

  const [isEditing, setIsEditing] = useState(false);
  const [editAttempted, setEditAttempted] = useState(false);
  const [editTitle, setEditTitle] = useState(ticket.title);
  const [editDesiredOutcome, setEditDesiredOutcome] = useState(ticket.desiredOutcome || '');
  const [editBusinessImpact, setEditBusinessImpact] = useState(ticket.businessImpact || '');
  const [editModule, setEditModule] = useState(ticket.module);
  const [editType, setEditType] = useState(ticket.type);

  const [schedDevDate, setSchedDevDate] = useState<string>(ticket.scheduledDevelopmentDate || '');
  const [schedDepDate, setSchedDepDate] = useState<string>(ticket.scheduledDeploymentDate || '');
  const [inQueueDateError, setInQueueDateError] = useState(false);
  const [releaseCheckpoint, setReleaseCheckpoint] = useState<string>(ticket.releaseCheckpoint || '');
  const [releaseCheckpointDraft, setReleaseCheckpointDraft] = useState<string>(ticket.releaseCheckpoint || '');
  const [devPickerOpen, setDevPickerOpen] = useState(false);
  const [depPickerOpen, setDepPickerOpen] = useState(false);

  // Planning Status must be declared before the governance computation below uses it.
  const [planningStatus, setPlanningStatus] = useState<string>((ticket as any).planningStatus || '');

  const TypeIcon = TYPE_ICONS[ticket.type] || Bug;

  // Governance computation (total days since submission)
  const governanceTerminal = (TICKET_GOVERNANCE_TERMINAL as readonly string[]).includes(ticket.status);
  const detailSubmittedDate = ticket.submittedAt ? new Date(ticket.submittedAt) : null;
  const detailDaysOpen = detailSubmittedDate ? Math.floor((Date.now() - detailSubmittedDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  // Roadmapped / Scheduled AMRs are governed by roadmap dates, not ticket age.
  // Suppress the standard 30-day warning when a formal planning disposition exists.
  const isRoadmapPlanned = planningStatus === 'roadmapped' || planningStatus === 'scheduled';
  const isDetailGovernanceWarning = !governanceTerminal && !isRoadmapPlanned && detailDaysOpen >= TICKET_DAYS_WARNING && detailDaysOpen < TICKET_DAYS_CRITICAL;
  const isDetailGovernanceCritical = !governanceTerminal && !isRoadmapPlanned && detailDaysOpen >= TICKET_DAYS_CRITICAL;

  // Roadmap governance — evaluated against scheduled dates (string comparison, ISO YYYY-MM-DD).
  const _todayStr    = new Date().toISOString().split("T")[0];
  const _in7DaysStr  = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
  const _devDateStr  = ticket.scheduledDevelopmentDate  ?? null;
  const _deployDateStr = ticket.scheduledDeploymentDate ?? null;
  // Statuses considered "in / past development" (dev gate cleared)
  const _DEV_TERMINAL    = ['in_development','in_production','needs_testing','completed','user_accepts','cancelled','duplicate','complete'];
  // Statuses considered "delivered" (deploy gate cleared)
  const _DEPLOY_TERMINAL = ['completed','user_accepts','cancelled','duplicate','complete'];
  const isDevStartingSoon  = isRoadmapPlanned && !!_devDateStr   && _devDateStr  > _todayStr && _devDateStr  <= _in7DaysStr && !_DEV_TERMINAL.includes(ticket.status);
  const isDevOverdue       = isRoadmapPlanned && !!_devDateStr   && _devDateStr  < _todayStr && !_DEV_TERMINAL.includes(ticket.status);
  const isDeployDueSoon    = isRoadmapPlanned && !!_deployDateStr && _deployDateStr > _todayStr && _deployDateStr <= _in7DaysStr && !_DEPLOY_TERMINAL.includes(ticket.status);
  const isDeployOverdue    = isRoadmapPlanned && !!_deployDateStr && _deployDateStr < _todayStr && !_DEPLOY_TERMINAL.includes(ticket.status);
  const hasRoadmapGovernance = isDevStartingSoon || isDevOverdue || isDeployDueSoon || isDeployOverdue;

  const showGovernancePanel = ((isDetailGovernanceWarning || isDetailGovernanceCritical) || (isRoadmapPlanned && hasRoadmapGovernance)) && isAdmin;

  const { data: adminUsers = [] } = useQuery<{ id: string; firstName: string; lastName: string; email: string; role: string }[]>({
    queryKey: ["/api/admin/users/list-admins"],
    enabled: isAdmin || isSubmitter,
  });

  // All active DriverHub users — used exclusively for the CC picker so any
  // active user (not just admins) can be CC'd on a ticket.
  const { data: activeUsers = [] } = useQuery<{ id: string; firstName: string; lastName: string; email: string; role: string }[]>({
    queryKey: ["/api/admin/users/list-active"],
    enabled: isAdmin || isSubmitter,
  });

  // CC Users — local state driven from ticket prop; mutated via PUT
  const [ccUserIds, setCcUserIds] = useState<string[]>((ticket.ccUsers || []).map(u => u.userId));
  const [ccSelectValue, setCcSelectValue] = useState("");
  const setCcMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("PUT", `/api/tickets/${ticket.id}/cc`, { userIds: ids });
      return res.json();
    },
    onSuccess: (data: CcUserEntry[]) => {
      setCcUserIds(data.map(u => u.userId));
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      toast({ title: "CC list updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const canManageCc = isAdmin || isSubmitter;

  const [testerSelectValue, setTesterSelectValue] = useState("");
  const addTesterMut = useMutation({
    mutationFn: async (uid: string) => {
      const res = await apiRequest("POST", `/api/tickets/${ticket.id}/testers`, { userId: uid });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      toast({ title: "Tester assigned" });
    },
    onError: (e: any) => toast({ title: "Failed to assign tester", description: e.message, variant: "destructive" }),
  });
  const removeTesterMut = useMutation({
    mutationFn: async (uid: string) => {
      await apiRequest("DELETE", `/api/tickets/${ticket.id}/testers/${uid}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      toast({ title: "Tester removed" });
    },
    onError: (e: any) => toast({ title: "Failed to remove tester", description: e.message, variant: "destructive" }),
  });
  const canManageTesters = isAdmin;

  const addCommentMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/tickets/${ticket.id}/comments`, { commentText });
    },
    onSuccess: () => {
      setCommentText("");
      setDeclineCommentError("");
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      // If this comment was submitted as part of a decline flow, now fire the status change.
      if (pendingDeclineRef.current) {
        pendingDeclineRef.current = false;
        updateStatusMut.mutate({ status: "user_declines" });
      } else {
        toast({ title: "Comment added" });
      }
    },
    onError: (e: any) => {
      pendingDeclineRef.current = false;
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteCommentMut = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest("DELETE", `/api/tickets/${ticket.id}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      toast({ title: "Comment deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (commentText.trim() && !addCommentMut.isPending) {
        addCommentMut.mutate();
      }
    }
  };

  const updatePriorityMut = useMutation({
    mutationFn: async (priority: string) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { priority });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Priority updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update priority", description: e.message, variant: "destructive" }),
  });

  const updateScheduledDatesMut = useMutation({
    mutationFn: async (payload: { scheduledDevelopmentDate?: string | null; scheduledDeploymentDate?: string | null }) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setInQueueDateError(false);
      toast({ title: "Planning dates updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update dates", description: e.message, variant: "destructive" }),
  });

  const updateReleaseCheckpointMut = useMutation({
    mutationFn: async (value: string | null) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { releaseCheckpoint: value });
    },
    onSuccess: (_data, value) => {
      setReleaseCheckpoint(value || '');
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Release checkpoint saved" });
    },
    onError: (e: any) => toast({ title: "Failed to save checkpoint", description: e.message, variant: "destructive" }),
  });

  const addWorkLogMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/tickets/${ticket.id}/worklog`, {
        workDate,
        note: workNote || null,
        statusAfter: workStatusAfter && workStatusAfter !== "none" ? workStatusAfter : null,
      });
    },
    onSuccess: () => {
      setWorkNote("");
      setWorkStatusAfter("");
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/badge-count"] });
      toast({ title: "Work log entry added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatusMut = useMutation({
    mutationFn: async (params: { status: string; adminOverride?: boolean; overrideNote?: string; scheduledDevelopmentDate?: string }) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, {
        status: params.status,
        ...(params.scheduledDevelopmentDate !== undefined ? { scheduledDevelopmentDate: params.scheduledDevelopmentDate } : {}),
        ...(params.adminOverride ? { adminOverride: true, overrideNote: params.overrideNote } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/badge-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/my-action-items-count"] });
      // Refresh epic progress — a completed/uncompleted AMR changes percentComplete on its parent epic
      queryClient.invalidateQueries({ queryKey: ["/api/epics"] });
      const epicId = (ticket as any).epicId || (ticket as any).epicTicketId;
      if (epicId) queryClient.invalidateQueries({ queryKey: ["/api/epics", epicId] });
      toast({ title: "Status updated" });
    },
    onError: (e: any) => toast({ title: "Status change failed", description: e.message, variant: "destructive" }),
  });

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'in_queue') {
      // Gate: a Scheduled Development Date must exist (saved OR pending in this session)
      const effectiveDate = ticket.scheduledDevelopmentDate || schedDevDate;
      if (!effectiveDate) {
        setInQueueDateError(true);
        return;
      }
      setInQueueDateError(false);
      // Include the pending date in the PATCH body so the backend saves it atomically with the
      // status change. This covers two scenarios:
      //   (a) Race condition — the date auto-save and status change fire near-simultaneously;
      //       sending the date here guarantees the backend gate has a value to check.
      //   (b) Same-session entry — the user entered a date and immediately changed status
      //       before the date mutation's onSuccess invalidation cycle completed.
      updateStatusMut.mutate({
        status: newStatus,
        ...(schedDevDate ? { scheduledDevelopmentDate: schedDevDate } : {}),
      });
      return;
    }

    if (newStatus === 'user_declines') {
      // Require a non-blank comment before allowing the decline status to be saved.
      // The existing comment field is the sole collection point — no modal or separate form.
      if (!commentText.trim()) {
        setDeclineCommentError(
          "A comment is required when testing is declined. Please describe what is not working or what needs to be corrected."
        );
        // Scroll to and focus the comment textarea so the user can act immediately.
        commentTextareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        commentTextareaRef.current?.focus();
        return;
      }
      // Has qualifying comment — submit it first; the status change fires in addCommentMut.onSuccess.
      pendingDeclineRef.current = true;
      addCommentMut.mutate();
      return;
    }

    setInQueueDateError(false);
    updateStatusMut.mutate({ status: newStatus });
  };

  const assignOwnerMut = useMutation({
    mutationFn: async (assignedToUserId: string | null) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}/assign`, { assignedToUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/my-action-items-count"] });
      toast({ title: "Owner updated" });
    },
    onError: (e: any) => toast({ title: "Failed to assign owner", description: e.message, variant: "destructive" }),
  });

  const assignProductOwnerMut = useMutation({
    mutationFn: async (productOwnerUserId: string | null) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}/product-owner`, { productOwnerUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Product Owner updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update Product Owner", description: e.message, variant: "destructive" }),
  });

  const updateScopeMut = useMutation({
    mutationFn: async (applicationScope: string) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { applicationScope });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Application Scope updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update Application Scope", description: e.message, variant: "destructive" }),
  });

  const updateDeveloperMut = useMutation({
    mutationFn: async (developerUserId: string | null) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { developerUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Developer updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update Developer", description: e.message, variant: "destructive" }),
  });

  const updateDevTeamMut = useMutation({
    mutationFn: async (devTeam: string | null) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { devTeam });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Team updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update Team", description: e.message, variant: "destructive" }),
  });

  const updateEpicMut = useMutation({
    mutationFn: async (epicId: string | null) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}/epic`, { epicId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epics"] });
      toast({ title: "Epic updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update Epic", description: e.message, variant: "destructive" }),
  });

  const updateIsEpicMut = useMutation({
    mutationFn: async (isEpic: boolean) => {
      // Sync type: flagging as epic sets type='epic'; unflagging reverts type to 'enhancement' if it was 'epic'
      const typeSync = isEpic ? 'epic' : ((ticket as any).type === 'epic' ? 'enhancement' : undefined);
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { isEpic, ...(typeSync ? { type: typeSync } : {}) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epics"] });
      toast({ title: (ticket as any).isEpic ? "Epic flag removed" : "AMR flagged as Epic", description: (ticket as any).isEpic ? "This AMR will no longer appear in the Epic picklist." : "This AMR now appears in the Epic picklist." });
    },
    onError: (e: any) => toast({ title: "Failed to update Epic flag", description: e.message, variant: "destructive" }),
  });

  const { data: epicsForDetail = [] } = useQuery<{ id: string; name: string; amrCount: number }[]>({
    queryKey: ['/api/epics'],
  });

  // Planning Status — useState moved to before the governance computation (line ~2260).
  // const [planningStatus, setPlanningStatus] is declared earlier in this function.
  const [phaseId, setPhaseId] = useState<string>((ticket as any).phaseId || '');
  const epicTicketId = (ticket as any).epicId || (ticket as any).epicTicketId;

  const updatePlanningStatusMut = useMutation({
    mutationFn: async (newStatus: string | null) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { planningStatus: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/amr-metrics"] });
      toast({ title: "Planning Status updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update Planning Status", description: e.message, variant: "destructive" }),
  });

  const updatePhaseIdMut = useMutation({
    mutationFn: async (newPhaseId: string | null) => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, { phaseId: newPhaseId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      toast({ title: "Phase updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update Phase", description: e.message, variant: "destructive" }),
  });

  const { data: availablePhases = [] } = useQuery<PhaseOption[]>({
    queryKey: ['/api/amr/phases', epicTicketId || 'none'],
    queryFn: async () => {
      const url = epicTicketId ? `/api/amr/phases?epicId=${epicTicketId}` : '/api/amr/phases';
      return fetchPhaseOptions(url);
    },
    enabled: isAdmin,
  });

  const editTicketMut = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/tickets/${ticket.id}`, {
        title: editTitle,
        desiredOutcome: editDesiredOutcome || null,
        businessImpact: editBusinessImpact || null,
        module: editModule,
        type: editType,
      });
    },
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/badge-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/my-action-items-count"] });
      // If type changed to/from 'epic', refresh epic list and parent epic detail
      queryClient.invalidateQueries({ queryKey: ["/api/epics"] });
      const epicId = (ticket as any).epicId || (ticket as any).epicTicketId;
      if (epicId) queryClient.invalidateQueries({ queryKey: ["/api/epics", epicId] });
      const wasReset = SUBMITTER_EDITABLE_STATUSES.includes(ticket.status) && ticket.status !== 'submitted';
      toast({
        title: "AMR updated",
        description: wasReset ? "Your changes were saved and the status was reset to Submitted." : "Your changes were saved.",
      });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const isImageAttachment = (fileType: string | null) => fileType?.startsWith('image/');

  const uploadAttachmentMut = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file, file.name);
        const res = await fetch(`/api/tickets/${ticket.id}/attachments`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ message: "Upload failed" }));
          throw new Error(`${file.name}: ${errBody.message || "Upload failed"}`);
        }
      }
    },
    onSuccess: () => {
      setDetailUploadFiles([]);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      toast({ title: "Attachments uploaded" });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const deleteAttachmentMut = useMutation({
    mutationFn: async (attachId: string) => {
      const res = await fetch(`/api/tickets/${ticket.id}/attachments/${attachId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete" }));
        throw new Error(err.message);
      }
    },
    onSuccess: () => {
      setConfirmDeleteAttachId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticket.id] });
      toast({ title: "Attachment deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const copyForAgent = () => {
    const lines: string[] = [];
    lines.push(`# Ticket: ${ticket.ticketNumber}`);
    lines.push(`**Title:** ${ticket.title}`);
    lines.push(`**Type:** ${TYPE_LABELS[ticket.type] || ticket.type}`);
    lines.push(`**Module:** ${formatModuleLabel(ticket.module)}`);
    lines.push(`**Priority:** ${TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}`);
    lines.push(`**Status:** ${STATUS_LABELS[ticket.status] || ticket.status}`);
    lines.push(`**Submitted By:** ${ticket.submittedByUsername}`);
    if (ticket.assignedToUsername) lines.push(`**Owner:** ${ticket.assignedToUsername}`);
    lines.push(`**Submitted:** ${formatDateTime(ticket.submittedAt)}`);
    lines.push(`**Last Updated:** ${formatDateTime(ticket.updatedAt)}`);
    lines.push('');
    if (ticket.title) {
      lines.push('## Issue / Idea');
      lines.push(ticket.title);
      lines.push('');
    }
    if (ticket.desiredOutcome) {
      lines.push('## Desired Outcome');
      lines.push(ticket.desiredOutcome);
      lines.push('');
    }
    if (ticket.businessImpact) {
      lines.push('## Business Impact');
      lines.push(ticket.businessImpact);
      lines.push('');
    }
    if (ticket.attachments && ticket.attachments.length > 0) {
      lines.push('## Attachments');
      ticket.attachments.forEach((a: TicketAttachment) => {
        const url = a.fileUrl ? `${window.location.origin}${a.fileUrl}` : 'N/A';
        lines.push(`- ${a.fileName} (${url})`);
      });
      lines.push('');
    }
    if (ticket.comments && ticket.comments.length > 0) {
      lines.push('## Comments');
      ticket.comments.forEach((c: TicketComment) => {
        lines.push(`- [${formatDateTime(c.createdAt)}] ${c.createdByUsername}: ${c.commentText}`);
      });
      lines.push('');
    }
    if (ticket.workLogs && ticket.workLogs.length > 0) {
      lines.push('## Work Log');
      ticket.workLogs.forEach((w: TicketWorkLog) => {
        const statusChange = w.statusFrom && w.statusTo
          ? ` (${STATUS_LABELS[w.statusFrom] || w.statusFrom} \u2192 ${STATUS_LABELS[w.statusTo] || w.statusTo})`
          : '';
        lines.push(`- [${w.workDate}] ${w.createdByUsername}: ${w.note}${statusChange}`);
      });
      lines.push('');
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast({ title: "Copied to clipboard" });
    }).catch(() => {
      toast({ title: "Copy failed", description: "Could not access clipboard", variant: "destructive" });
    });
  };

  const getNextStepForStatus = (status: string): string => {
    const steps: Record<string, string> = {
      submitted: 'Awaiting admin review',
      reviewed: 'Pending prioritization or additional info request',
      sent_back_for_info: 'Submitter to provide additional information',
      prioritizing: 'Assign priority and move to queue',
      in_queue: 'Ready for development assignment',
      in_development: 'In active development, awaiting deployment',
      in_production: 'Deployed, awaiting user testing',
      needs_testing: 'User sign-off required \u2014 accept or decline',
      user_accepts: 'User accepted, completing',
      user_declines: 'User declined \u2014 review comments and re-enter development',
      completed: 'No action needed \u2014 ticket closed',
    };
    return steps[status] || 'Review ticket status';
  };

  const copyUATScript = () => {
    const lines: string[] = [];
    lines.push(`${ticket.ticketNumber} | ${STATUS_LABELS[ticket.status] || ticket.status}`);
    lines.push('');
    lines.push(ticket.desiredOutcome || ticket.title || 'N/A');
    lines.push('');
    lines.push(`Priority: ${TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}`);
    lines.push(`Module: ${formatModuleLabel(ticket.module)}`);
    lines.push('');
    lines.push(getNextStepForStatus(ticket.status));
    lines.push('');

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast({ title: "UAT Script Copied" });
    }).catch(() => {
      toast({ title: "Copy failed", description: "Could not access clipboard", variant: "destructive" });
    });
  };

  return (
    <div className="space-y-4" data-testid="ticket-detail-view">
      {/* ── Sticky AMR Detail header — MUST be the first DOM child so space-y-4
           never adds margin-top to it, eliminating the gap above the pinned header. ── */}
      <div className="sticky top-0 z-20 bg-background py-1.5 border-b border-border/50">
        {/* Hidden file input lives here so the ref still works; display:none, no layout impact */}
        {ticket.status !== "completed" && (
          <input
            ref={headerFileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,.log,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            data-testid="input-header-attach-files"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                setDetailUploadFiles(prev => [...prev, ...files]);
                setActiveTab("attachments");
                uploadAttachmentMut.mutate(files);
              }
              e.target.value = "";
            }}
          />
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-list">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <TypeIcon className="h-5 w-5 text-muted-foreground" />
          <span className="font-mono text-sm text-muted-foreground">{ticket.ticketNumber}</span>
          <h2 className="text-xl font-bold flex-1 min-w-0 truncate" data-testid="text-detail-title">{ticket.title}</h2>
          {ticket.status !== "completed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => headerFileInputRef.current?.click()}
              disabled={uploadAttachmentMut.isPending}
              data-testid="button-attach-file"
            >
              <Paperclip className="h-3.5 w-3.5 mr-1" />
              {uploadAttachmentMut.isPending ? "Uploading..." : "Attach File"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={copyForAgent} data-testid="button-copy-for-agent">
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy for Agent
          </Button>
          <Button variant="outline" size="sm" onClick={copyUATScript} data-testid="button-copy-uat-script">
            <ClipboardList className="h-3.5 w-3.5 mr-1" />
            Copy UAT Script
          </Button>
          <Badge className={`${STATUS_COLORS[ticket.status]} no-default-hover-elevate no-default-active-elevate`}>
            {STATUS_LABELS[ticket.status]}
          </Badge>
        </div>
      </div>

      {/* Governance Action Panel — context-sensitive: standard aging for unplanned AMRs,
           roadmap-date governance for Roadmapped / Scheduled AMRs. */}
      {showGovernancePanel && (
        <div
          className={`rounded-md border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
            isDetailGovernanceCritical || isDevOverdue || isDeployOverdue
              ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
              : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
          }`}
          data-testid="governance-action-panel"
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {(isDetailGovernanceCritical || isDevOverdue || isDeployOverdue) ? (
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            ) : (
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 space-y-0.5">

              {/* ── Standard 30-day governance (unplanned AMRs only) ── */}
              {(isDetailGovernanceWarning || isDetailGovernanceCritical) && (
                <>
                  <p className={`text-sm font-semibold ${isDetailGovernanceCritical ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {isDetailGovernanceCritical
                      ? `30-Day Governance Limit Reached (${detailDaysOpen} days open) — Action Required`
                      : `Approaching 30-Day Governance Limit (${detailDaysOpen} days open)`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isDetailGovernanceCritical
                      ? "This AMR must be assigned a development date, added to the roadmap, or closed."
                      : `This AMR will reach the 30-day limit in ${TICKET_DAYS_CRITICAL - detailDaysOpen} day${TICKET_DAYS_CRITICAL - detailDaysOpen === 1 ? "" : "s"}. Schedule a development date, add to the roadmap, or close.`}
                  </p>
                </>
              )}

              {/* ── Roadmap governance (Roadmapped / Scheduled AMRs) ── */}
              {isRoadmapPlanned && hasRoadmapGovernance && (
                <>
                  {isDevOverdue && (
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                      Roadmap Development Date Missed — Action Required
                      {_devDateStr && (
                        <span className="font-normal text-xs ml-1">
                          (was {format(parseISO(_devDateStr), "MMM d, yyyy")})
                        </span>
                      )}
                    </p>
                  )}
                  {isDeployOverdue && (
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                      Roadmap Deployment Overdue — Action Required
                      {_deployDateStr && (
                        <span className="font-normal text-xs ml-1">
                          (was {format(parseISO(_deployDateStr), "MMM d, yyyy")})
                        </span>
                      )}
                    </p>
                  )}
                  {isDevStartingSoon && !isDevOverdue && (
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      Roadmap Development Starting Soon
                      {_devDateStr && (
                        <span className="font-normal text-xs ml-1">
                          — {format(parseISO(_devDateStr), "MMM d, yyyy")}
                        </span>
                      )}
                    </p>
                  )}
                  {isDeployDueSoon && !isDeployOverdue && (
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      Roadmap Deployment Due Soon
                      {_deployDateStr && (
                        <span className="font-normal text-xs ml-1">
                          — {format(parseISO(_deployDateStr), "MMM d, yyyy")}
                        </span>
                      )}
                    </p>
                  )}
                </>
              )}

            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">

            {/* ── Actions for unplanned aging AMRs ── */}
            {!isRoadmapPlanned && (
              <>
                {isRootScheduler ? (
                  <Button size="sm" variant="outline"
                    onClick={() => { setActiveTab("details"); setTimeout(() => { setDevPickerOpen(true); }, 100); }}
                    data-testid="governance-btn-set-dev-date"
                    className={isDetailGovernanceCritical ? "border-red-300 dark:border-red-700" : "border-amber-300 dark:border-amber-700"}
                  >
                    <CalendarClock className="h-3.5 w-3.5 mr-1" />Set Dev Date
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled
                    title="Only the root administrator can assign development dates"
                    data-testid="governance-btn-set-dev-date-disabled" className="opacity-50"
                  >
                    <CalendarClock className="h-3.5 w-3.5 mr-1" />Set Dev Date
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  onClick={() => {
                    if (confirm(`Add "${ticket.title}" to the Roadmap? Planning Status will be set to "Roadmapped" — Workflow Status is not changed.`)) {
                      setPlanningStatus('roadmapped');
                      updatePlanningStatusMut.mutate('roadmapped');
                    }
                  }}
                  disabled={updatePlanningStatusMut.isPending}
                  data-testid="governance-btn-add-to-roadmap"
                  className={isDetailGovernanceCritical ? "border-red-300 dark:border-red-700" : "border-amber-300 dark:border-amber-700"}
                >
                  <Zap className="h-3.5 w-3.5 mr-1" />Add to Roadmap
                </Button>
              </>
            )}

            {/* ── Actions for overdue roadmap items ── */}
            {isRoadmapPlanned && (isDevOverdue || isDeployOverdue) && (
              <>
                {isRootScheduler ? (
                  <Button size="sm" variant="outline"
                    onClick={() => { setActiveTab("details"); setTimeout(() => { setDevPickerOpen(true); }, 100); }}
                    data-testid="governance-btn-update-schedule"
                    className="border-red-300 dark:border-red-700"
                  >
                    <CalendarClock className="h-3.5 w-3.5 mr-1" />Update Schedule
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled
                    title="Only the root administrator can update development dates"
                    className="opacity-50"
                  >
                    <CalendarClock className="h-3.5 w-3.5 mr-1" />Update Schedule
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  onClick={() => onNavToRoadmap?.("all")}
                  data-testid="governance-btn-open-roadmap"
                  className="border-red-300 dark:border-red-700"
                >
                  <CalendarClock className="h-3.5 w-3.5 mr-1" />Open Roadmap
                </Button>
              </>
            )}

            {/* ── Close AMR — always available in any governance state ── */}
            <Button size="sm" variant="outline"
              onClick={() => {
                if (confirm(`Close and cancel "${ticket.title}"? This will mark the AMR as Cancelled. This action is logged.`)) {
                  updateStatusMut.mutate({ status: "cancelled" });
                }
              }}
              disabled={updateStatusMut.isPending}
              data-testid="governance-btn-cancel"
              className={isDetailGovernanceCritical || isDevOverdue || isDeployOverdue ? "border-red-300 dark:border-red-700" : "border-amber-300 dark:border-amber-700"}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />Close AMR
            </Button>

          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_288px] gap-4 items-start">
        <div className="space-y-3 min-w-0">
          <Card>
            <CardHeader className="pb-1.5 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Details</CardTitle>
              {(canSubmitterEdit || isRootAdmin) && !isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditTitle(ticket.title);
                    setEditDesiredOutcome(ticket.desiredOutcome || '');
                    setEditBusinessImpact(ticket.businessImpact || '');
                    setEditModule(ticket.module);
                    setEditType(ticket.type);
                    setEditAttempted(false);
                    setIsEditing(true);
                  }}
                  data-testid="button-edit-ticket"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  {isAdminClassEdit ? "Admin Edit" : "Edit"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-1 space-y-4 text-sm">
              {/* ── EDIT FORM ─────────────────────────────────────────────── */}
              {isEditing && (canSubmitterEdit || isRootAdmin) ? (
                <div className="space-y-3 pb-2 border-b">
                  {isAdminClassEdit ? (
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                      <span className="font-semibold shrink-0">Admin Classification Edit</span>
                      <span>— Corrects Name, Type, and Module for any AMR. Status will not change. Every change is logged to the Activity Timeline.</span>
                    </div>
                  ) : (
                    <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs text-muted-foreground">
                      Editing will reset the status to <span className="font-medium text-foreground">Submitted</span> if it is currently Reviewed or Sent Back for Info.
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      {isAdminClassEdit ? "AMR Name" : "Issue / Idea *"}
                    </label>
                    <Input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className={`mt-1${editAttempted && !editTitle.trim() ? " border-destructive" : ""}${editAttempted && !isAdminClassEdit && editTitle.trim() && editTitle.trim().length < 20 ? " border-destructive" : ""}`}
                      data-testid="input-edit-title"
                    />
                    {!isAdminClassEdit && (
                      <p className="text-xs text-muted-foreground mt-1">Describe what is happening now or what you would like to see.</p>
                    )}
                    {editAttempted && !editTitle.trim() && (
                      <p className="text-xs text-destructive mt-0.5" data-testid="text-edit-title-error">AMR Name is required.</p>
                    )}
                    {editAttempted && !isAdminClassEdit && editTitle.trim() && editTitle.trim().length < 20 && (
                      <p className="text-xs text-destructive mt-0.5" data-testid="text-edit-title-length-error">Please provide a more detailed description.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Type</label>
                      <Select value={editType} onValueChange={setEditType}>
                        <SelectTrigger className="mt-1" data-testid="select-edit-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TICKET_TYPES.map(t => (<SelectItem key={t} value={t}>{TYPE_LABELS[t] || t}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Module</label>
                      <Select value={editModule} onValueChange={setEditModule}>
                        <SelectTrigger className="mt-1" data-testid="select-edit-module"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[...TICKET_MODULE_DEFINITIONS].sort((a, b) => a.label.localeCompare(b.label)).map(({ value, label }) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {!isAdminClassEdit && (
                    <>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Desired Outcome *</label>
                        <Textarea value={editDesiredOutcome} onChange={e => setEditDesiredOutcome(e.target.value)}
                          className={`mt-1 resize-none${editAttempted && editDesiredOutcome.trim().length < 20 ? " border-destructive" : ""}`}
                          rows={3} data-testid="input-edit-outcome" />
                        {editAttempted && !editDesiredOutcome.trim() && (<p className="text-xs text-destructive mt-0.5" data-testid="text-edit-outcome-error">Desired Outcome is required.</p>)}
                        {editAttempted && editDesiredOutcome.trim() && editDesiredOutcome.trim().length < 20 && (<p className="text-xs text-destructive mt-0.5" data-testid="text-edit-outcome-length-error">Please provide a more detailed description.</p>)}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Business Impact <span className="font-normal">(optional)</span></label>
                        <Textarea value={editBusinessImpact} onChange={e => setEditBusinessImpact(e.target.value)}
                          className="mt-1 resize-none" rows={3} data-testid="input-edit-impact" />
                        <p className="text-xs text-muted-foreground mt-1">Explain how this affects productivity, revenue, compliance, or risk.</p>
                      </div>
                    </>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button onClick={() => { setEditAttempted(true); if (isAdminClassEdit) { if (!editTitle.trim()) return; } else { if (!editTitle.trim() || editTitle.trim().length < 20 || editDesiredOutcome.trim().length < 20) return; } editTicketMut.mutate(); }} disabled={editTicketMut.isPending} size="sm" data-testid="button-save-edit">
                      {editTicketMut.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setEditAttempted(false); }} disabled={editTicketMut.isPending} data-testid="button-cancel-edit">Cancel</Button>
                  </div>
                </div>
              ) : null}

              {/* ── REQUEST ────────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">Request</span>
                  <div className="flex-1 border-t border-dashed" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Type</div>
                    <div className="font-medium">{TYPE_LABELS[ticket.type]}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Module</div>
                    <div className="font-medium">{formatModuleLabel(ticket.module)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">App Scope</div>
                    {isAdmin && ticket.status !== 'completed' ? (
                      <Select value={(ticket as any).applicationScope || 'DriverHub'} onValueChange={(v) => updateScopeMut.mutate(v)} disabled={updateScopeMut.isPending}>
                        <SelectTrigger className="h-7 text-xs w-full" data-testid="select-ticket-app-scope"><SelectValue /></SelectTrigger>
                        <SelectContent>{AMR_APPLICATION_SCOPES.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : (
                      <div className="font-medium" data-testid="text-ticket-app-scope">{(ticket as any).applicationScope || 'DriverHub'}</div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-2 pt-2 border-t border-dashed">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Submitted By</div>
                    <div className="font-medium">{ticket.submittedByUsername}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Submitted</div>
                    <div>{formatDateTime(ticket.submittedAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Last Updated</div>
                    <div>{formatDateTime(ticket.updatedAt)}</div>
                  </div>
                </div>
              </div>

              {/* ── OWNERSHIP ──────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">Ownership</span>
                  <div className="flex-1 border-t border-dashed" />
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Owner</div>
                    {isAdmin ? (
                      <Select value={ticket.assignedToUserId || ""} onValueChange={(v) => { if (v) assignOwnerMut.mutate(v); }}>
                        <SelectTrigger className="h-7 text-xs w-full" data-testid="select-ticket-owner"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>{adminUsers.map(u => (<SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : (<div className="font-medium" data-testid="text-ticket-owner">{ticket.assignedToUsername || "—"}</div>)}
                    {assignOwnerMut.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Product Owner</div>
                    {(isAdmin || ticket.productOwnerUserId === user?.id) ? (
                      <Select value={ticket.productOwnerUserId || ""} onValueChange={(v) => { if (v) assignProductOwnerMut.mutate(v); }}>
                        <SelectTrigger className="h-7 text-xs w-full" data-testid="select-ticket-product-owner"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>{adminUsers.map(u => (<SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : (<div className="font-medium" data-testid="text-ticket-product-owner">{ticket.productOwnerUsername || "—"}</div>)}
                    {assignProductOwnerMut.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Developer</div>
                    {isAdmin ? (
                      <Select value={ticket.developerUserId || "__none__"} onValueChange={(v) => updateDeveloperMut.mutate(v === "__none__" ? null : v)}>
                        <SelectTrigger className="h-7 text-xs w-full" data-testid="select-ticket-developer"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Unassigned</SelectItem>
                          {adminUsers.map(u => (<SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    ) : (<div className="font-medium" data-testid="text-ticket-developer">{ticket.developerUsername || "—"}</div>)}
                    {updateDeveloperMut.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Team</div>
                    {isAdmin ? (
                      <Select value={(ticket as any).devTeam || "__none__"} onValueChange={(v) => updateDevTeamMut.mutate(v === "__none__" ? null : v)}>
                        <SelectTrigger className="h-7 text-xs w-full" data-testid="select-ticket-dev-team"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {AMR_DEV_TEAMS.map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    ) : (<div className="font-medium" data-testid="text-ticket-dev-team">{(ticket as any).devTeam || "—"}</div>)}
                    {updateDevTeamMut.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-2 pt-2 border-t border-dashed">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">Assigned Testers</div>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {(ticket.testers || []).length === 0 && <span className="text-xs text-muted-foreground/60 italic">None assigned</span>}
                      {(ticket.testers || []).map(t => {
                        const name = [t.firstName, t.lastName].filter(Boolean).join(" ") || t.email || t.userId;
                        return (
                          <Badge key={t.userId} variant="secondary" className="flex items-center gap-1 pr-1 text-xs">
                            {name}
                            {canManageTesters && (
                              <button onClick={() => removeTesterMut.mutate(t.userId)} className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors" aria-label={`Remove ${name} as tester`} data-testid={`button-remove-tester-${t.userId}`}>
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </Badge>
                        );
                      })}
                    </div>
                    {canManageTesters && activeUsers.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Select value={testerSelectValue} onValueChange={(v) => { if (v && !(ticket.testers || []).some(t => t.userId === v)) { addTesterMut.mutate(v); } setTesterSelectValue(""); }}>
                          <SelectTrigger className="w-full h-7 text-xs" data-testid="select-add-tester"><SelectValue placeholder="Add tester…" /></SelectTrigger>
                          <SelectContent>{activeUsers.filter(u => !(ticket.testers || []).some(t => t.userId === u.id)).map(u => (<SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>))}</SelectContent>
                        </Select>
                        {(addTesterMut.isPending || removeTesterMut.isPending) && <span className="text-xs text-muted-foreground">Saving…</span>}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">CC'd Users</div>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {ccUserIds.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                      {ccUserIds.map((uid) => {
                        const u = activeUsers.find(a => a.id === uid) || adminUsers.find(a => a.id === uid) || (ticket.ccUsers || []).find(c => c.userId === uid);
                        const name = u ? `${(u as any).firstName || ''} ${(u as any).lastName || ''}`.trim() || (u as any).email || uid : uid;
                        return (
                          <Badge key={uid} variant="secondary" className="flex items-center gap-1 text-xs no-default-hover-elevate no-default-active-elevate" data-testid={`badge-cc-user-${uid}`}>
                            {name}
                            {canManageCc && (
                              <button type="button" onClick={() => { const next = ccUserIds.filter(id => id !== uid); setCcUserIds(next); setCcMut.mutate(next); }} className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors" aria-label={`Remove ${name} from CC`} data-testid={`button-remove-cc-${uid}`}>
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </Badge>
                        );
                      })}
                    </div>
                    {canManageCc && activeUsers.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Select value={ccSelectValue} onValueChange={(v) => { if (v && !ccUserIds.includes(v)) { const next = [...ccUserIds, v]; setCcUserIds(next); setCcMut.mutate(next); } setCcSelectValue(""); }}>
                          <SelectTrigger className="w-full h-7 text-xs" data-testid="select-add-cc-user"><SelectValue placeholder="Add CC…" /></SelectTrigger>
                          <SelectContent>{activeUsers.filter(u => !ccUserIds.includes(u.id) && u.id !== ticket.submittedByUserId).map(u => (<SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>))}</SelectContent>
                        </Select>
                        {setCcMut.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── PLANNING ───────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-fuchsia-600 dark:text-fuchsia-400 shrink-0">Planning</span>
                  <div className="flex-1 border-t border-dashed" />
                </div>
                {/* Row 1: Epic (+ Flag as Epic) | Phase/Milestone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-muted-foreground">Epic</span>
                      {isAdmin && (
                        <div className="flex items-center gap-1.5 ml-auto shrink-0">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Flag as Epic</span>
                          <button type="button" role="switch" aria-checked={(ticket as any).isEpic ? "true" : "false"} onClick={() => !updateIsEpicMut.isPending && updateIsEpicMut.mutate(!(ticket as any).isEpic)} disabled={updateIsEpicMut.isPending}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${(ticket as any).isEpic ? "bg-primary" : "bg-input"}`}
                            data-testid="toggle-is-epic">
                            <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-lg ring-0 transition-transform ${(ticket as any).isEpic ? "translate-x-3" : "translate-x-0"}`} />
                          </button>
                          {(ticket as any).isEpic && <Badge className="text-[10px] no-default-hover-elevate no-default-active-elevate bg-primary/10 text-primary">Epic</Badge>}
                          {updateIsEpicMut.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
                        </div>
                      )}
                    </div>
                    {!(ticket as any).isEpic ? (
                      isAdmin ? (
                        <AmrEpicPicker
                          epics={epicsForDetail}
                          value={(ticket as any).epicId || null}
                          onValueChange={(value) => updateEpicMut.mutate(value)}
                          includeUnassigned
                          unassignedLabel="Not assigned"
                          className="h-7 text-xs"
                          testId="select-ticket-epic"
                        />
                      ) : (<div className="font-medium" data-testid="text-ticket-epic">{(ticket as any).epicName || "—"}</div>)
                    ) : (<div className="text-xs text-primary font-medium">This AMR is an Epic</div>)}
                    {updateEpicMut.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Phase / Milestone</div>
                    {!(ticket as any).isEpic && epicTicketId ? (
                      isAdmin ? (
                        <Select value={phaseId || "__none__"} onValueChange={(v) => { const val = v === "__none__" ? null : v; setPhaseId(val || ''); updatePhaseIdMut.mutate(val); }} disabled={updatePhaseIdMut.isPending}>
                          <SelectTrigger className="h-7 text-xs w-full" data-testid="select-ticket-phase"><SelectValue placeholder="Select phase…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {availablePhases.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      ) : (<div className="font-medium" data-testid="text-ticket-phase">{availablePhases.find(p => p.id === phaseId)?.name || "—"}</div>)
                    ) : (<div className="text-muted-foreground">—</div>)}
                    {updatePhaseIdMut.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
                  </div>
                </div>
                {/* Row 2: Planning Status | Priority */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 pt-2 border-t border-dashed">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Planning Status</div>
                    {isAdmin ? (
                      <Select value={planningStatus || "__none__"} onValueChange={(v) => { const val = v === "__none__" ? null : v; setPlanningStatus(val || ''); updatePlanningStatusMut.mutate(val); }} disabled={updatePlanningStatusMut.isPending}>
                        <SelectTrigger className="h-7 text-xs w-full" data-testid="select-ticket-planning-status"><SelectValue placeholder="Not set…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Not set</SelectItem>
                          {AMR_PLANNING_STATUSES.map(s => (<SelectItem key={s} value={s}>{AMR_PLANNING_STATUS_LABELS[s] || s}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div data-testid="text-ticket-planning-status">
                        {planningStatus ? (
                          <Badge className={`${AMR_PLANNING_STATUS_COLORS[planningStatus] || ''} no-default-hover-elevate no-default-active-elevate`}>{AMR_PLANNING_STATUS_LABELS[planningStatus] || planningStatus}</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </div>
                    )}
                    {updatePlanningStatusMut.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-xs text-muted-foreground" data-testid="label-detail-priority">Priority</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-priority-help-detail" aria-label="Priority definitions">
                            <HelpCircle className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-80">
                          <h4 className="font-semibold text-sm mb-3">Priority Definitions</h4>
                          <div className="space-y-2.5">
                            {PRIORITY_DEFINITIONS.map(d => (
                              <div key={d.level}>
                                <div className="text-sm font-medium">{d.level} <span className="text-muted-foreground">— {d.name}</span></div>
                                <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {isRootScheduler ? (
                      <Select value={ticket.priority} onValueChange={(v) => updatePriorityMut.mutate(v)} disabled={updatePriorityMut.isPending}>
                        <SelectTrigger className="h-7 text-xs w-full" data-testid="select-ticket-priority"><SelectValue /></SelectTrigger>
                        <SelectContent>{TICKET_PRIORITIES.map(p => (<SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p] || p}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : (
                      <Badge className={`${PRIORITY_COLORS[ticket.priority] || ''} no-default-hover-elevate no-default-active-elevate`} data-testid="badge-ticket-priority">
                        {TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}
                      </Badge>
                    )}
                    {updatePriorityMut.isPending && <span className="text-xs text-muted-foreground">Updating…</span>}
                  </div>
                </div>
                {/* Row 3: Sched Dev Date | Sched Deploy Date */}
                {(() => {
                  const now = new Date(); now.setHours(0,0,0,0);
                  const devDate = schedDevDate ? new Date(schedDevDate + 'T00:00:00') : null;
                  const depDate = schedDepDate ? new Date(schedDepDate + 'T00:00:00') : null;
                  const OVERDUE_STATUSES = ['submitted','reviewed','sent_back_for_info','prioritizing','in_queue','in_development'];
                  const isDevOverdue = devDate && devDate < now && OVERDUE_STATUSES.includes(ticket.status);
                  const threeDays = 3 * 24 * 60 * 60 * 1000;
                  const isDepUpcoming = depDate && depDate >= now && depDate.getTime() - now.getTime() <= threeDays;
                  return (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 pt-2 border-t border-dashed">
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-xs text-muted-foreground">Sched. Dev Date</span>
                          {isDevOverdue && <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium"><AlertTriangle className="h-3 w-3" />Overdue</span>}
                        </div>
                        {isRootScheduler ? (
                          <Popover open={devPickerOpen} onOpenChange={setDevPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal h-7 text-xs" data-testid="input-sched-dev-date">
                                <CalendarIcon className="mr-1.5 h-3 w-3 text-muted-foreground shrink-0" />
                                {schedDevDate ? format(parseISO(schedDevDate), 'MM/dd/yyyy') : <span className="text-muted-foreground">Pick a date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={schedDevDate ? parseISO(schedDevDate) : undefined} onSelect={(date) => { const val = date ? format(date, 'yyyy-MM-dd') : ''; setSchedDevDate(val); setDevPickerOpen(false); updateScheduledDatesMut.mutate({ scheduledDevelopmentDate: val || null }); }} initialFocus />
                              {schedDevDate && (<div className="p-2 border-t"><Button variant="ghost" size="sm" className="w-full text-muted-foreground" data-testid="button-clear-sched-dev-date" onClick={() => { setSchedDevDate(''); setDevPickerOpen(false); updateScheduledDatesMut.mutate({ scheduledDevelopmentDate: null }); }}><X className="h-3 w-3 mr-1" /> Clear date</Button></div>)}
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <div className="font-medium" data-testid="text-sched-dev-date">{devDate ? format(devDate, 'MM/dd/yyyy') : <span className="text-muted-foreground">—</span>}</div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-xs text-muted-foreground">Sched. Deploy Date</span>
                          {isDepUpcoming && <span className="flex items-center gap-0.5 text-xs text-yellow-600 dark:text-yellow-400 font-medium"><AlertCircle className="h-3 w-3" />Upcoming</span>}
                        </div>
                        {isRootScheduler ? (
                          <Popover open={depPickerOpen} onOpenChange={setDepPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal h-7 text-xs" data-testid="input-sched-dep-date">
                                <CalendarIcon className="mr-1.5 h-3 w-3 text-muted-foreground shrink-0" />
                                {schedDepDate ? format(parseISO(schedDepDate), 'MM/dd/yyyy') : <span className="text-muted-foreground">Pick a date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={schedDepDate ? parseISO(schedDepDate) : undefined} onSelect={(date) => { const val = date ? format(date, 'yyyy-MM-dd') : ''; setSchedDepDate(val); setDepPickerOpen(false); updateScheduledDatesMut.mutate({ scheduledDeploymentDate: val || null }); }} initialFocus />
                              {schedDepDate && (<div className="p-2 border-t"><Button variant="ghost" size="sm" className="w-full text-muted-foreground" data-testid="button-clear-sched-dep-date" onClick={() => { setSchedDepDate(''); setDepPickerOpen(false); updateScheduledDatesMut.mutate({ scheduledDeploymentDate: null }); }}><X className="h-3 w-3 mr-1" /> Clear date</Button></div>)}
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <div className="font-medium" data-testid="text-sched-dep-date">{depDate ? format(depDate, 'MM/dd/yyyy') : <span className="text-muted-foreground">—</span>}</div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {!isRootScheduler && <p className="text-xs text-muted-foreground mt-1">Planning dates are managed by the Root Super Admin.</p>}
              </div>

              {/* ── WORKFLOW ───────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">Workflow</span>
                  <div className="flex-1 border-t border-dashed" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Workflow Status</div>
                    <Select value={ticket.status} onValueChange={handleStatusChange} disabled={updateStatusMut.isPending}>
                      <SelectTrigger className="h-7 text-xs w-full" data-testid="select-ticket-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {!workflowStatuses.includes(ticket.status as typeof workflowStatuses[number]) && (
                          <SelectItem value={ticket.status}>{STATUS_LABELS[ticket.status] || ticket.status}</SelectItem>
                        )}
                        {workflowStatuses.map(s => (<SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    {updateStatusMut.isPending && <span className="text-xs text-muted-foreground">Updating…</span>}
                    {inQueueDateError && (
                      <div className="flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300 mt-1.5" data-testid="callout-inqueue-date-required">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>A Scheduled Development Date is required before an AMR can be moved to In Queue. Only Will Walton can assign this date — contact him before advancing to In Queue.</span>
                      </div>
                    )}
                    {ticket.status === "product_decision_required" && (
                      <div className="flex items-start gap-1.5 rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 px-2 py-1.5 text-xs text-purple-800 dark:text-purple-300 mt-1.5" data-testid="callout-product-decision">
                        <ClipboardList className="h-3.5 w-3.5 mt-0.5 shrink-0 text-purple-600 dark:text-purple-400" />
                        <span>Development is blocked pending product leadership direction. This AMR cannot proceed until a product decision is provided and status is updated by an admin.</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Release / Publish Checkpoint</div>
                    {isAdmin ? (
                      <div className="flex gap-1 items-center">
                        <input type="text" className="flex-1 min-w-0 border rounded px-2 py-1 text-xs bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Commit hash, checkpoint ID, or deploy URL" value={releaseCheckpointDraft} onChange={e => setReleaseCheckpointDraft(e.target.value)} data-testid="input-release-checkpoint" />
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2 shrink-0" disabled={updateReleaseCheckpointMut.isPending || releaseCheckpointDraft === releaseCheckpoint} onClick={() => updateReleaseCheckpointMut.mutate(releaseCheckpointDraft || null)} data-testid="button-save-release-checkpoint">Save</Button>
                        {releaseCheckpoint && (<Button size="sm" variant="ghost" className="h-7 text-xs px-2 shrink-0" disabled={updateReleaseCheckpointMut.isPending} onClick={() => { setReleaseCheckpointDraft(''); updateReleaseCheckpointMut.mutate(null); }} data-testid="button-clear-release-checkpoint">Clear</Button>)}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">{releaseCheckpoint || <span className="italic">Not set</span>}</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── DESIRED OUTCOME + BUSINESS IMPACT ─────────────────────────── */}
          {(ticket.desiredOutcome || ticket.businessImpact) && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                {ticket.desiredOutcome && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Desired Outcome</p>
                    <p className="text-sm whitespace-pre-wrap">{ticket.desiredOutcome}</p>
                  </div>
                )}
                {ticket.businessImpact && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Business Impact</p>
                    <p className="text-sm whitespace-pre-wrap">{ticket.businessImpact}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── TABS (Comments / Attachments / Work Log) ───────────────────── */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="details" data-testid="tab-comments">
                <MessageSquare className="h-4 w-4 mr-1" />
                Comments ({ticket.comments.length})
              </TabsTrigger>
              <TabsTrigger value="attachments" data-testid="tab-attachments">
                <Paperclip className="h-4 w-4 mr-1" />
                Attachments ({ticket.attachments.length})
              </TabsTrigger>
              <TabsTrigger value="worklog" data-testid="tab-worklog">
                <ClipboardList className="h-4 w-4 mr-1" />
                Work Log ({ticket.workLogs.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-3">
              {/* Add Comment box always at the top */}
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <Textarea
                    ref={commentTextareaRef}
                    placeholder="Add a comment... (Enter to send, Shift+Enter for new line)"
                    value={commentText}
                    onChange={(e) => { setCommentText(e.target.value); if (declineCommentError) setDeclineCommentError(""); }}
                    onKeyDown={handleCommentKeyDown}
                    className={`flex-1${declineCommentError ? " border-destructive ring-1 ring-destructive" : ""}`}
                    data-testid="input-comment-text"
                  />
                  <Button size="icon" onClick={() => addCommentMut.mutate()} disabled={!commentText.trim() || addCommentMut.isPending} data-testid="button-submit-comment">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {declineCommentError && (
                  <p className="text-sm text-destructive font-medium" data-testid="decline-comment-error">{declineCommentError}</p>
                )}
              </div>
              {ticket.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No comments yet. Be the first to comment.</p>
              ) : (
                <div className="space-y-2">
                  {[...ticket.comments]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map(c => {
                      const isExpanded = expandedComments.has(c.id);
                      // A comment is "long" if it has many lines or is large — needs Show More/Less.
                      const lineCount = (c.commentText.match(/\n/g) || []).length;
                      const isLong = lineCount > 7 || c.commentText.length > 400;
                      return (
                        <Card key={c.id}>
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm font-medium" data-testid={`text-comment-author-${c.id}`}>{c.createdByUsername}</span>
                              <span className="text-xs text-muted-foreground" data-testid={`text-comment-date-${c.id}`}>{formatDateTime(c.createdAt)}</span>
                              <div className="flex-1" />
                              {isAdmin && (
                                <Button variant="ghost" size="icon" onClick={() => deleteCommentMut.mutate(c.id)} disabled={deleteCommentMut.isPending} data-testid={`button-delete-comment-${c.id}`}>
                                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                            <div className={!isExpanded && isLong ? "max-h-[14em] overflow-hidden" : undefined}>
                              <p className="text-sm whitespace-pre-wrap" data-testid={`text-comment-${c.id}`}>{c.commentText}</p>
                            </div>
                            {isLong && (
                              <button
                                type="button"
                                onClick={() => toggleComment(c.id)}
                                className="mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                data-testid={`button-toggle-comment-${c.id}`}
                              >
                                {isExpanded ? "Show Less" : "Show More"}
                              </button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="attachments" className="space-y-4">
              {ticket.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No attachments yet.</p>
              ) : (
                <div className="space-y-2">
                  {ticket.attachments.map(a => (
                    <Card key={a.id} data-testid={`card-attachment-${a.id}`}>
                      <CardContent className="p-3">
                        <div className="flex gap-3">
                          {isImageAttachment(a.fileType) ? (
                            <a href={`/api/tickets/${ticket.id}/attachments/${a.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0" data-testid={`link-img-preview-${a.id}`}>
                              <img src={`/api/tickets/${ticket.id}/attachments/${a.id}/download?inline=1`} alt={a.fileName} className="h-16 w-16 object-cover rounded-md border" data-testid={`img-attachment-${a.id}`} />
                            </a>
                          ) : (
                            <div className="flex-shrink-0 h-16 w-16 rounded-md bg-muted flex items-center justify-center border">
                              <FileText className="h-7 w-7 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm font-medium truncate" data-testid={`text-attachment-name-${a.id}`}>{a.fileName}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                              {a.fileType && <span className="capitalize" data-testid={`text-attachment-type-${a.id}`}>{a.fileType.split('/')[1]?.toUpperCase() || a.fileType}</span>}
                              {a.fileSize && <span data-testid={`text-attachment-size-${a.id}`}>{(a.fileSize / 1024).toFixed(1)} KB</span>}
                              <span data-testid={`text-attachment-date-${a.id}`}>{formatDateTime(a.uploadedAt)}</span>
                            </div>
                            {a.uploadedByUsername && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <UserIcon className="h-3 w-3" />
                                <span data-testid={`text-attachment-uploader-${a.id}`}>{a.uploadedByUsername}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-1">
                            <a href={`/api/tickets/${ticket.id}/attachments/${a.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" data-testid={`button-view-attachment-${a.id}`}><Button variant="ghost" size="icon" type="button" tabIndex={-1}><Eye className="h-4 w-4" /></Button></a>
                            <a href={`/api/tickets/${ticket.id}/attachments/${a.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" data-testid={`button-open-new-tab-${a.id}`}><Button variant="ghost" size="icon" type="button" tabIndex={-1}><ExternalLink className="h-4 w-4" /></Button></a>
                            <a href={`/api/tickets/${ticket.id}/attachments/${a.id}/download`} download={a.fileName} data-testid={`button-download-attachment-${a.id}`}><Button variant="ghost" size="icon" type="button" tabIndex={-1}><Download className="h-4 w-4" /></Button></a>
                            {(isAdmin || user?.id === a.uploadedByUserId || isSubmitter) && (
                              confirmDeleteAttachId === a.id ? (
                                <div className="flex items-center gap-1 ml-1">
                                  <Button variant="destructive" size="sm" onClick={() => deleteAttachmentMut.mutate(a.id)} disabled={deleteAttachmentMut.isPending} data-testid={`button-confirm-delete-attachment-${a.id}`}>{deleteAttachmentMut.isPending ? "..." : "Delete"}</Button>
                                  <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteAttachId(null)} data-testid={`button-cancel-delete-attachment-${a.id}`}>Cancel</Button>
                                </div>
                              ) : (
                                <Button variant="ghost" size="icon" type="button" onClick={() => setConfirmDeleteAttachId(a.id)} data-testid={`button-delete-attachment-${a.id}`}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                              )
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {ticket.status === "completed" ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 px-3 rounded-md bg-muted/50 border">
                  <Lock className="h-4 w-4 flex-shrink-0" />
                  <span>This ticket is completed. Existing attachments are viewable but no new uploads are allowed.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Add Attachments</p>
                  <AttachmentDropZone files={detailUploadFiles} onFilesAdded={(files) => setDetailUploadFiles(prev => [...prev, ...files])} onFileRemoved={(index) => setDetailUploadFiles(prev => prev.filter((_, i) => i !== index))} ticketNumber={ticket.ticketNumber} disabled={uploadAttachmentMut.isPending} />
                  {detailUploadFiles.length > 0 && (
                    <Button size="sm" onClick={() => uploadAttachmentMut.mutate(detailUploadFiles)} disabled={uploadAttachmentMut.isPending} data-testid="button-upload-attachments">
                      {uploadAttachmentMut.isPending ? "Uploading..." : `Upload ${detailUploadFiles.length} file${detailUploadFiles.length !== 1 ? "s" : ""}`}
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="worklog" className="space-y-3">
              {ticket.workLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No work log entries yet.</p>
              ) : (
                ticket.workLogs.map(w => (
                  <Card key={w.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium">{formatDate(w.workDate)}</span>
                        <span className="text-xs text-muted-foreground">by {w.createdByUsername}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(w.createdAt)}</span>
                      </div>
                      {w.statusFrom && w.statusTo && (
                        <div className="flex items-center gap-1 mb-1">
                          <Badge className={`${STATUS_COLORS[w.statusFrom]} no-default-hover-elevate no-default-active-elevate text-xs`}>{STATUS_LABELS[w.statusFrom]}</Badge>
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          <Badge className={`${STATUS_COLORS[w.statusTo]} no-default-hover-elevate no-default-active-elevate text-xs`}>{STATUS_LABELS[w.statusTo]}</Badge>
                        </div>
                      )}
                      {w.note && <p className="text-sm whitespace-pre-wrap">{w.note}</p>}
                    </CardContent>
                  </Card>
                ))
              )}
              {isAdmin && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Add Work Log Entry</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex-1 min-w-[140px]">
                        <label className="text-xs text-muted-foreground">Date of Work *</label>
                        <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} data-testid="input-worklog-date" />
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <label className="text-xs text-muted-foreground">Status After (optional)</label>
                        <Select value={workStatusAfter} onValueChange={setWorkStatusAfter}>
                          <SelectTrigger data-testid="select-worklog-status"><SelectValue placeholder="No change" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No change</SelectItem>
                            {TICKET_ACTIVE_STATUSES.map(s => (<SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Textarea placeholder="Notes about work done..." value={workNote} onChange={(e) => setWorkNote(e.target.value)} data-testid="input-worklog-note" />
                    <Button size="sm" onClick={() => addWorkLogMut.mutate()} disabled={!workDate || addWorkLogMut.isPending} data-testid="button-submit-worklog">
                      <ClipboardList className="h-4 w-4 mr-1" />Add Entry
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── STICKY ACTIVITY TIMELINE ────────────────────────────────────── */}
        <div className="lg:sticky lg:top-6 max-h-[calc(100vh-8rem)] flex flex-col">
          <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-sm">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto flex-1 pb-4 pr-2">
              {ticket.workLogs.length === 0 && ticket.comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {[
                    ...ticket.workLogs.map(w => ({ type: 'worklog' as const, date: w.createdAt, data: w })),
                    ...ticket.comments.map(c => ({ type: 'comment' as const, date: c.createdAt, data: c })),
                  ]
                    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
                    .map((item) => {
                      if (item.type === 'worklog') {
                        const w = item.data as typeof ticket.workLogs[0];
                        return (
                          <div key={`wl-${w.id}`} className="flex items-start gap-2">
                            <Clock className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                            <div className="text-xs min-w-0">
                              <span className="font-medium">{w.createdByUsername}</span>
                              {w.statusTo ? <span> → <strong>{STATUS_LABELS[w.statusTo] || w.statusTo}</strong></span> : <span> logged work</span>}
                              {w.note && <div className="text-muted-foreground truncate mt-0.5">{w.note.length > 70 ? w.note.substring(0, 70) + '…' : w.note}</div>}
                              <div className="text-muted-foreground">{formatDate(w.createdAt)}{w.createdAt ? ` — ${new Date(w.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</div>
                            </div>
                          </div>
                        );
                      } else {
                        const c = item.data as typeof ticket.comments[0];
                        return (
                          <div key={`cm-${c.id}`} className="flex items-start gap-2">
                            <MessageSquare className="h-3 w-3 mt-0.5 text-blue-400 flex-shrink-0" />
                            <div className="text-xs min-w-0">
                              <span className="font-medium">{c.createdByUsername}</span>
                              <span> commented</span>
                              <div className="text-muted-foreground truncate mt-0.5">{c.commentText.length > 70 ? c.commentText.substring(0, 70) + '…' : c.commentText}</div>
                              <div className="text-muted-foreground">{formatDateTime(c.createdAt)}</div>
                            </div>
                          </div>
                        );
                      }
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const TYPE_GROUP_ICONS: Record<string, typeof Bug> = {
  "New Features": Lightbulb,
  "Improvements": Zap,
  "Bug Fixes": Bug,
};

function ReleasesView({ isAdmin, onSwitchTab }: { isAdmin: boolean; onSwitchTab: (tab: "tickets" | "releases" | "contributions" | "ideas" | "epics") => void }) {
  const { toast } = useToast();
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [genReleaseDate, setGenReleaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [genCheckpoint, setGenCheckpoint] = useState("");
  const [editingRelease, setEditingRelease] = useState<ReleaseWithItems | null>(null);

  const { data: releasesList, isLoading } = useQuery<ReleaseWithItems[]>({
    queryKey: ["/api/releases"],
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/releases/generate", {
        releaseDate: genReleaseDate || undefined,
        releaseCheckpoint: genCheckpoint || undefined,
      });
      return res.json();
    },
    onSuccess: (data: ReleaseWithItems) => {
      queryClient.invalidateQueries({ queryKey: ["/api/releases"] });
      setSelectedReleaseId(data.id);
      setShowGenerateDialog(false);
      toast({ title: "Release draft generated", description: `${data.version} with ${data.items.length} items — AI notes applied` });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message || "No eligible tickets found", variant: "destructive" });
    },
  });

  if (selectedReleaseId) {
    return (
      <ReleaseDetail
        releaseId={selectedReleaseId}
        isAdmin={isAdmin}
        onBack={() => {
          setSelectedReleaseId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/releases"] });
        }}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="releases-view">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => onSwitchTab("tickets")} data-testid="button-back-to-tickets">
            <ArrowLeft className="h-4 w-4 mr-1" />
            AMR
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-releases-title">Release Notes</h1>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-create-release">
              <Plus className="h-4 w-4 mr-1" />
              Manual Release
            </Button>
            <Button size="sm" variant="default" onClick={() => setShowGenerateDialog(true)} data-testid="button-generate-release">
              <Rocket className="h-4 w-4 mr-1" />
              Auto-Generate
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="py-6"><div className="h-4 bg-muted animate-pulse rounded w-1/3" /></CardContent></Card>
          ))}
        </div>
      ) : !releasesList || releasesList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">No releases yet</p>
            {isAdmin && (
              <p className="text-sm text-muted-foreground">Click "Auto-Generate" to create release notes from completed AMRs.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3" data-testid="releases-list">
          {releasesList.map(rel => {
            const groups = groupItems(rel.items);
            const gOrder = getGroupOrder(rel.items);
            const epicCount = gOrder.filter(g => g !== "Other Changes").length;
            const otherCount = groups["Other Changes"]?.length || 0;
            return (
              <Card key={rel.id} className="cursor-pointer hover-elevate" onClick={() => setSelectedReleaseId(rel.id)} data-testid={`card-release-${rel.id}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={rel.status === "published" ? "default" : "secondary"} data-testid={`badge-release-status-${rel.id}`}>
                        {rel.status === "published" ? "Published" : "Draft"}
                      </Badge>
                      <span className="font-semibold" data-testid={`text-release-version-${rel.id}`}>{rel.version}</span>
                      <span className="text-muted-foreground">{rel.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{rel.items.length} items</span>
                      <span>{formatDate(rel.publishedAt || rel.createdAt)}</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {epicCount > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {epicCount} {epicCount === 1 ? "Epic" : "Epics"}
                      </span>
                    )}
                    {otherCount > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {otherCount} Other
                      </span>
                    )}
                    {rel.items.length === 0 && (
                      <span className="text-xs text-muted-foreground">No items</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreateDialog && (
        <CreateReleaseDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={(id) => {
            setShowCreateDialog(false);
            setSelectedReleaseId(id);
            queryClient.invalidateQueries({ queryKey: ["/api/releases"] });
          }}
        />
      )}

      {showGenerateDialog && (
        <Dialog open onOpenChange={() => setShowGenerateDialog(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                Auto-Generate Release
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                This will collect all completed AMRs since the last published release, group them by Epic, and use AI to write clean release notes and an Epic-level summary for each group. AMRs without an Epic appear under "Other Changes."
              </p>
              <div>
                <label className="text-sm font-medium">Release Date *</label>
                <Input
                  type="date"
                  value={genReleaseDate}
                  onChange={e => setGenReleaseDate(e.target.value)}
                  data-testid="input-gen-release-date"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Release Checkpoint</label>
                <Input
                  placeholder="e.g. commit hash, branch, or tag"
                  value={genCheckpoint}
                  onChange={e => setGenCheckpoint(e.target.value)}
                  data-testid="input-gen-checkpoint"
                />
                <p className="text-xs text-muted-foreground mt-1">Optional — commit hash or version tag for this release.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
              <Button
                onClick={() => generateMut.mutate()}
                disabled={!genReleaseDate || generateMut.isPending}
                data-testid="button-confirm-generate-release"
              >
                {generateMut.isPending ? "Generating with AI..." : "Generate Release Notes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function groupItems(items: ReleaseItem[]): Record<string, ReleaseItem[]> {
  const groups: Record<string, ReleaseItem[]> = {};
  for (const item of items) {
    if (!groups[item.groupLabel]) groups[item.groupLabel] = [];
    groups[item.groupLabel].push(item);
  }
  return groups;
}

// Returns ordered group labels: named epics first, "Other Changes" last
function getGroupOrder(items: ReleaseItem[]): string[] {
  const seen: string[] = [];
  const other: string[] = [];
  for (const item of items) {
    const label = item.groupLabel;
    if (label === "Other Changes") {
      if (!other.includes(label)) other.push(label);
    } else {
      if (!seen.includes(label)) seen.push(label);
    }
  }
  return [...seen, ...other];
}

function CreateReleaseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/releases", { version, title, ticketIds: [] });
      return res.json();
    },
    onSuccess: (data: ReleaseWithItems) => {
      toast({ title: "Release created" });
      onCreated(data.id);
    },
    onError: () => toast({ title: "Failed to create release", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Manual Release</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Version</label>
            <Input value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 2.1.0" data-testid="input-release-version" />
          </div>
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. January 2026 Release" data-testid="input-release-title" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createMut.mutate()} disabled={!version || !title || createMut.isPending} data-testid="button-confirm-create-release">
            {createMut.isPending ? "Creating..." : "Create Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseDetail({ releaseId, isAdmin, onBack }: { releaseId: string; isAdmin: boolean; onBack: () => void }) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editVersion, setEditVersion] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editReleaseDate, setEditReleaseDate] = useState("");
  const [editCheckpoint, setEditCheckpoint] = useState("");

  const { data: release, isLoading } = useQuery<ReleaseWithItems>({
    queryKey: ["/api/releases", releaseId],
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/releases/${releaseId}/publish`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
      toast({ title: "Release published" });
    },
    onError: () => toast({ title: "Publish failed", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/releases/${releaseId}`, {
        version: editVersion,
        title: editTitle,
        summary: editSummary,
        releaseDate: editReleaseDate || null,
        releaseCheckpoint: editCheckpoint || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
      setIsEditing(false);
      toast({ title: "Release updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const aiRegenerateMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/releases/${releaseId}/ai-generate-notes`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
      toast({ title: "AI notes regenerated", description: `${data.updatedCount} items updated.` });
    },
    onError: () => toast({ title: "AI regeneration failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/releases/${releaseId}`);
    },
    onSuccess: () => {
      toast({ title: "Release deleted" });
      onBack();
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const removeItemMut = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/releases/${releaseId}/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
    },
  });

  if (isLoading || !release) {
    return <div className="p-8 text-center text-muted-foreground">Loading release...</div>;
  }

  const isDraft = release.status === "draft";
  const groups = groupItems(release.items);
  const groupOrder = getGroupOrder(release.items);
  const epicSummariesMap = new Map<string, string>(
    (release.epicSummaries || []).map(e => [e.epicName, e.summary])
  );

  const startEditing = () => {
    setEditVersion(release.version);
    setEditTitle(release.title);
    setEditSummary(release.summary || "");
    setEditReleaseDate(release.releaseDate || "");
    setEditCheckpoint(release.releaseCheckpoint || "");
    setIsEditing(true);
  };

  const copyMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# ${release.title}`);
    lines.push(`**Version:** ${release.version}`);
    if (release.publishedAt) lines.push(`**Published:** ${formatDate(release.publishedAt)}`);
    lines.push("");
    for (const g of groupOrder) {
      if (groups[g] && groups[g].length > 0) {
        lines.push(`## ${g}`);
        const epicSum = epicSummariesMap.get(g);
        if (epicSum) lines.push(`*${epicSum}*`);
        lines.push("");
        for (const item of groups[g]) {
          lines.push(`- **${item.ticketNumber}**: ${item.noteOverride || item.ticketTitle}`);
        }
        lines.push("");
      }
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-4" data-testid="release-detail">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-releases">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Releases
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isDraft ? "secondary" : "default"} data-testid="badge-release-status">
              {isDraft ? "Draft" : "Published"}
            </Badge>
            <CardTitle data-testid="text-release-version">{release.version}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyMarkdown} data-testid="button-copy-release">
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            {isDraft && isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (release.items.length === 0) {
                      toast({ title: "No items", description: "Add tickets before regenerating notes.", variant: "destructive" });
                      return;
                    }
                    if (confirm(`Re-generate AI notes for all ${release.items.length} item(s)? Existing notes will be replaced.`)) {
                      aiRegenerateMut.mutate();
                    }
                  }}
                  disabled={aiRegenerateMut.isPending}
                  data-testid="button-ai-regenerate-notes"
                >
                  <Zap className="h-4 w-4 mr-1" />
                  {aiRegenerateMut.isPending ? "Regenerating..." : "AI Notes"}
                </Button>
                <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-release">
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button size="sm" onClick={() => publishMut.mutate()} disabled={publishMut.isPending} data-testid="button-publish-release">
                  <Rocket className="h-4 w-4 mr-1" />
                  {publishMut.isPending ? "Publishing..." : "Publish"}
                </Button>
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => {
                  if (confirm("Delete this draft release?")) deleteMut.mutate();
                }} data-testid="button-delete-release">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p data-testid="text-release-title">{release.title}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {release.releaseDate && (
              <span data-testid="text-release-date">Release Date: <span className="text-foreground font-medium">{release.releaseDate}</span></span>
            )}
            {release.releaseCheckpoint && (
              <span data-testid="text-release-checkpoint">Checkpoint: <code className="text-foreground bg-muted px-1 rounded text-xs">{release.releaseCheckpoint}</code></span>
            )}
          </div>
          <p>Created by {release.createdByUsername} on {formatDate(release.createdAt)}</p>
          {release.publishedAt && <p>Published on {formatDateTime(release.publishedAt)}</p>}
        </CardContent>
      </Card>

      {release.summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans" data-testid="text-release-summary">{release.summary}</pre>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {groupOrder.map(g => {
          const items = groups[g];
          if (!items || items.length === 0) return null;
          const isOther = g === "Other Changes";
          const Icon = isOther ? (TYPE_GROUP_ICONS["Bug Fixes"] || Zap) : Layers;
          const epicSummary = epicSummariesMap.get(g);
          return (
            <Card key={g}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    {g}
                    <Badge variant="secondary">{items.length.toLocaleString()}</Badge>
                  </CardTitle>
                </div>
                {epicSummary && (
                  <p className="text-sm text-muted-foreground mt-1" data-testid={`text-epic-summary-${g}`}>{epicSummary}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-b-0" data-testid={`release-item-${item.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="text-xs flex-shrink-0">{item.ticketNumber}</Badge>
                        <span className="text-sm truncate">{item.noteOverride || item.ticketTitle}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{item.ticketModule}</span>
                      </div>
                      {isDraft && isAdmin && (
                        <Button variant="ghost" size="icon" onClick={() => removeItemMut.mutate(item.id)} data-testid={`button-remove-item-${item.id}`}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {release.items.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No items in this release. Add tickets manually or auto-generate.
          </CardContent>
        </Card>
      )}

      {isEditing && (
        <Dialog open onOpenChange={() => setIsEditing(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Release</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Version</label>
                  <Input value={editVersion} onChange={e => setEditVersion(e.target.value)} data-testid="input-edit-version" />
                </div>
                <div>
                  <label className="text-sm font-medium">Release Date</label>
                  <Input type="date" value={editReleaseDate} onChange={e => setEditReleaseDate(e.target.value)} data-testid="input-edit-release-date" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} data-testid="input-edit-title" />
              </div>
              <div>
                <label className="text-sm font-medium">Release Checkpoint</label>
                <Input placeholder="e.g. commit hash or tag" value={editCheckpoint} onChange={e => setEditCheckpoint(e.target.value)} data-testid="input-edit-checkpoint" />
              </div>
              <div>
                <label className="text-sm font-medium">Summary (Markdown)</label>
                <Textarea value={editSummary} onChange={e => setEditSummary(e.target.value)} rows={8} data-testid="input-edit-summary" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending} data-testid="button-save-release">
                {updateMut.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

type ContribRow = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  ideasSubmitted: number;
  ideasImplemented: number;
  enhancementsAccepted: number;
  implementationRate: number;
  avgCompletionDays: number | null;
};

type ContribSortKey = keyof Omit<ContribRow, "id" | "email">;

const CONTRIB_ROLE_OPTIONS = ["super_user", "admin", "ops_manager", "corporate_admin", "driver", "viewer"];

function ContributionMetricsView({ isAdmin, onSwitchTab }: {
  isAdmin: boolean;
  onSwitchTab: (tab: "tickets" | "releases" | "contributions" | "ideas" | "epics") => void;
}) {
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sortKey, setSortKey] = useState<ContribSortKey>("ideasSubmitted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const params = new URLSearchParams();
  if (roleFilter !== "all") params.set("role", roleFilter);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = params.toString();

  const { data = [], isLoading } = useQuery<ContribRow[]>({
    queryKey: ["/api/tickets/contribution-metrics", roleFilter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/contribution-metrics${qs ? "?" + qs : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function handleSort(key: ContribSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const hasFilters = roleFilter !== "all" || !!dateFrom || !!dateTo;

  const columns: { key: ContribSortKey; label: string; center?: boolean }[] = [
    { key: "name", label: "User" },
    { key: "role", label: "Role" },
    { key: "ideasSubmitted", label: "Submitted", center: true },
    { key: "ideasImplemented", label: "Implemented", center: true },
    { key: "enhancementsAccepted", label: "Accepted", center: true },
    { key: "implementationRate", label: "Impl. Rate", center: true },
    { key: "avgCompletionDays", label: "Avg Days", center: true },
  ];

  return (
    <div className="space-y-4" data-testid="contribution-metrics-view">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => onSwitchTab("tickets")} data-testid="button-back-to-tickets-from-contrib">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-contribution-title">AMR Contribution Metrics</h1>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[170px]" data-testid="select-contrib-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {CONTRIB_ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Submitted From</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" data-testid="input-contrib-date-from" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Submitted To</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" data-testid="input-contrib-date-to" />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setRoleFilter("all"); setDateFrom(""); setDateTo(""); }} data-testid="button-contrib-clear-filters">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No contribution data found for the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="contribution-table">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-4 py-3 text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap ${col.center ? "text-center" : "text-left"}`}
                        onClick={() => handleSort(col.key)}
                        data-testid={`th-contrib-${col.key}`}
                      >
                        <div className={`flex items-center gap-1 ${col.center ? "justify-center" : ""}`}>
                          {col.label}
                          {sortKey === col.key ? (
                            sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-b last:border-0 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}
                      data-testid={`contrib-row-${row.id}`}
                    >
                      <td className="px-4 py-3 font-medium">{row.name || row.email || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] capitalize no-default-hover-elevate no-default-active-elevate">
                          {row.role.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-center">{row.ideasSubmitted}</td>
                      <td className="px-4 py-3 tabular-nums text-center">{row.ideasImplemented}</td>
                      <td className="px-4 py-3 tabular-nums text-center">{row.enhancementsAccepted}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-semibold tabular-nums ${
                          row.implementationRate >= 50 ? "text-emerald-600 dark:text-emerald-400" :
                          row.implementationRate >= 25 ? "text-amber-600 dark:text-amber-500" :
                          "text-muted-foreground"
                        }`}>
                          {row.implementationRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-center text-muted-foreground text-xs">
                        {row.avgCompletionDays != null ? `${row.avgCompletionDays}d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                {sorted.length.toLocaleString()} contributor{sorted.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Quick Ideas ───────────────────────────────────────────────────────────────

const IDEA_STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewed: "Reviewed",
  converted: "Converted",
  archived: "Archived",
};

function QuickIdeasView({ isAdmin, onSwitchTab }: {
  isAdmin: boolean;
  onSwitchTab: (tab: "tickets" | "releases" | "contributions" | "ideas" | "epics") => void;
}) {
  const { toast } = useToast();
  const [newText, setNewText] = useState("");
  const [statusFilter, setStatusFilter] = useState("new");
  const [viewAll, setViewAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [convertIdeaId, setConvertIdeaId] = useState<string | null>(null);
  const [showConvertDrawer, setShowConvertDrawer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const qp = new URLSearchParams();
  if (statusFilter !== "all") qp.set("status", statusFilter);
  if (isAdmin && viewAll) qp.set("userId", "all");

  const { data: ideas = [], isLoading } = useQuery<(QuickIdea & { submitterName?: string })[]>({
    queryKey: ["/api/quick-ideas", statusFilter, viewAll ? "all" : "mine"],
    queryFn: async () => {
      const qs = qp.toString();
      const res = await fetch(`/api/quick-ideas${qs ? "?" + qs : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ideas");
      return res.json();
    },
  });

  const createMut = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/quick-ideas", { text });
      return res.json();
    },
    onSuccess: () => {
      setNewText("");
      queryClient.invalidateQueries({ queryKey: ["/api/quick-ideas"] });
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    onError: (e: any) => toast({ title: "Failed to save idea", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, text, notes, status }: { id: string; text?: string; notes?: string; status?: string }) => {
      const res = await apiRequest("PATCH", `/api/quick-ideas/${id}`, { text, notes, status });
      return res.json();
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quick-ideas"] });
    },
    onError: (e: any) => toast({ title: "Failed to update idea", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/quick-ideas/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/quick-ideas"] }),
    onError: (e: any) => toast({ title: "Failed to delete idea", description: e.message, variant: "destructive" }),
  });

  const convertMut = useMutation({
    mutationFn: async ({ id, ticketId, ticketNumber }: { id: string; ticketId: string; ticketNumber: string }) => {
      const res = await apiRequest("POST", `/api/quick-ideas/${id}/convert`, { ticketId, ticketNumber });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quick-ideas"] });
      toast({ title: "Idea converted", description: "The idea has been linked to the new AMR." });
    },
    onError: (e: any) => toast({ title: "Failed to mark idea as converted", description: e.message, variant: "destructive" }),
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newText.trim()) createMut.mutate(newText.trim());
  };

  const toggleNotes = (id: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startEdit = (idea: QuickIdea) => {
    setEditingId(idea.id);
    setEditText(idea.text);
    setEditNotes(idea.notes || "");
  };

  const convertIdea = ideas.find(i => i.id === convertIdeaId);
  const STATUS_TABS = ["all", "new", "reviewed", "converted", "archived"];

  return (
    <div className="space-y-4" data-testid="quick-ideas-view">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => onSwitchTab("tickets")} data-testid="button-back-to-tickets-from-ideas">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Quick Ideas</h1>
        </div>
        {isAdmin && (
          <div className="ml-auto">
            <Button
              variant={viewAll ? "default" : "outline"}
              size="sm"
              onClick={() => setViewAll(!viewAll)}
              data-testid="button-toggle-view-all-ideas"
            >
              {viewAll ? "All Users" : "My Ideas"}
            </Button>
          </div>
        )}
      </div>

      {/* Quick entry */}
      <div className="relative">
        <StickyNote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type an idea and press Enter to save..."
          className="w-full pl-9 pr-24 h-10 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          disabled={createMut.isPending}
          autoFocus
          data-testid="input-new-idea"
        />
        {newText.trim() && (
          <Button
            size="sm"
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
            onClick={() => createMut.mutate(newText.trim())}
            disabled={createMut.isPending}
            data-testid="button-save-idea"
          >
            Save
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Press <kbd className="px-1 py-0.5 rounded bg-muted text-xs font-mono border">Enter</kbd> to save and immediately start a new entry.
      </p>

      {/* Status filter tabs */}
      <div className="flex items-center gap-0 border-b" data-testid="ideas-status-tabs">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              statusFilter === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-ideas-${tab}`}
          >
            {tab === "all" ? "All" : IDEA_STATUS_LABELS[tab] || tab}
          </button>
        ))}
      </div>

      {/* Ideas list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
        </div>
      ) : ideas.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm" data-testid="text-no-ideas">
          {statusFilter === "all"
            ? "No ideas yet. Type one above and press Enter to get started."
            : `No ${IDEA_STATUS_LABELS[statusFilter]?.toLowerCase() || statusFilter} ideas.`}
        </div>
      ) : (
        <div className="space-y-2">
          {ideas.map(idea => (
            <div key={idea.id} className="border rounded-md bg-card p-3 space-y-2" data-testid={`idea-card-${idea.id}`}>
              {editingId === idea.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") updateMut.mutate({ id: idea.id, text: editText, notes: editNotes }); if (e.key === "Escape") setEditingId(null); }}
                    className="w-full px-3 h-9 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    autoFocus
                    data-testid={`input-edit-idea-${idea.id}`}
                  />
                  <textarea
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Optional notes..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    data-testid={`input-edit-notes-${idea.id}`}
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => updateMut.mutate({ id: idea.id, text: editText, notes: editNotes })} disabled={updateMut.isPending || !editText.trim()} data-testid={`button-save-edit-idea-${idea.id}`}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-idea-${idea.id}`}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug" data-testid={`text-idea-${idea.id}`}>{idea.text}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {idea.createdAt ? format(new Date(idea.createdAt), "MMM d, yyyy") : ""}
                        </span>
                        {isAdmin && (idea as any).submitterName && (
                          <span className="text-xs text-muted-foreground">· {(idea as any).submitterName}</span>
                        )}
                        {idea.linkedTicketNumber && (
                          <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1" data-testid={`text-linked-ticket-${idea.id}`}>
                            <CheckCheck className="h-3 w-3" />
                            AMR: {idea.linkedTicketNumber}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge
                      className={`text-xs shrink-0 no-default-hover-elevate no-default-active-elevate ${
                        idea.status === "new" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        : idea.status === "reviewed" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : idea.status === "converted" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                      }`}
                      data-testid={`badge-idea-status-${idea.id}`}
                    >
                      {IDEA_STATUS_LABELS[idea.status] || idea.status}
                    </Badge>
                  </div>

                  {idea.notes && (
                    <div>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={() => toggleNotes(idea.id)}
                        data-testid={`button-toggle-notes-${idea.id}`}
                      >
                        <ChevronDown className={`h-3 w-3 transition-transform ${expandedNotes.has(idea.id) ? "rotate-180" : ""}`} />
                        Notes
                      </button>
                      {expandedNotes.has(idea.id) && (
                        <p className="text-xs text-muted-foreground mt-1 pl-4 whitespace-pre-line" data-testid={`text-idea-notes-${idea.id}`}>{idea.notes}</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    {isAdmin && idea.status === "new" && (
                      <Button size="sm" variant="outline" onClick={() => updateMut.mutate({ id: idea.id, status: "reviewed" })} disabled={updateMut.isPending} data-testid={`button-mark-reviewed-${idea.id}`}>
                        Mark Reviewed
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => startEdit(idea)} data-testid={`button-edit-idea-${idea.id}`}>
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    {idea.status !== "converted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setConvertIdeaId(idea.id); setShowConvertDrawer(true); }}
                        data-testid={`button-convert-idea-${idea.id}`}
                      >
                        <Lightbulb className="h-3 w-3 mr-1" />
                        Convert to AMR
                      </Button>
                    )}
                    {idea.status !== "archived" && (
                      <Button size="sm" variant="ghost" onClick={() => updateMut.mutate({ id: idea.id, status: "archived" })} disabled={updateMut.isPending} data-testid={`button-archive-idea-${idea.id}`}>
                        <Archive className="h-3 w-3 mr-1" />
                        Archive
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => { if (window.confirm("Delete this idea? This cannot be undone.")) deleteMut.mutate(idea.id); }}
                      disabled={deleteMut.isPending}
                      data-testid={`button-delete-idea-${idea.id}`}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <SubmitTicketDrawer
        open={showConvertDrawer}
        onOpenChange={(open) => { setShowConvertDrawer(open); if (!open) setConvertIdeaId(null); }}
        prefillDesiredOutcome={convertIdea?.text ?? undefined}
        onSubmitted={(ticket) => {
          if (convertIdeaId) convertMut.mutate({ id: convertIdeaId, ticketId: ticket.id, ticketNumber: ticket.ticketNumber });
          setConvertIdeaId(null);
        }}
      />
    </div>
  );
}

// ─── Epics Dashboard ──────────────────────────────────────────────────────────
// Epics are AMR tickets flagged with is_epic = true.
// The picklist is derived dynamically from those tickets.

type Epic = {
  id: string;
  ticketNumber: string;
  name: string;
  title: string;
  description: string | null;
  status: string;
  applicationScope: string | null;
  releaseCheckpoint: string | null;
  scheduledDeploymentDate: string | null;
  targetRelease: string | null;
  amrCount: number;
  completedAmrCount: number;
  inDevelopmentCount: number;
  needsTestingCount: number;
  onRoadmapCount: number;
  blockedCount: number;
  overdueCount: number;
  percentComplete: number;
  health: 'green' | 'yellow' | 'red';
  createdAt: string;
};

type EpicLinkedAMR = {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  module: string | null;
  applicationScope: string | null;
  releaseCheckpoint: string | null;
  assignedToUserId: string | null;
  ownerName: string | null;
  developerUserId: string | null;
  developerName: string | null;
  productOwnerUserId: string | null;
  productOwnerName: string | null;
  scheduledDevelopmentDate: string | null;
  submittedAt: string;
};

type EpicTimelineEvent = { event: string; date: string; label: string };

type EpicDetail = Epic & {
  linkedAMRs: EpicLinkedAMR[];
  total: number;
  completed: number;
  inDevelopment: number;
  needsTesting: number;
  onRoadmap: number;
  blocked: number;
  overdue: number;
  percentComplete: number;
  timeline: EpicTimelineEvent[];
};

const EPIC_AMR_STATUS_CHIP: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
  reviewed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  received: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  open: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  in_development: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  in_production: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  needs_testing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  on_roadmap: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  prioritizing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  in_queue: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  complete: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  user_accepts: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  user_declines: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  sent_back_for_info: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  sent_back_for_feedback: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  product_decision_required: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  duplicate: "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400",
  closed: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400",
};

function EpicProgressBar({ pct, height = "h-2" }: { pct: number; height?: string }) {
  const color = pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-primary" : pct >= 30 ? "bg-amber-500" : "bg-rose-400";
  return (
    <div className={`w-full rounded-full bg-muted overflow-hidden ${height}`}>
      <div className={`${height} ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function EpicHealthBadge({ health }: { health?: 'green' | 'yellow' | 'red' | string }) {
  if (!health) return null;
  const cfg: Record<string, { cls: string; label: string; dot: string }> = {
    green:  { cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",   label: "On Track",  dot: "bg-green-500"  },
    yellow: { cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",   label: "Attention", dot: "bg-amber-500"  },
    red:    { cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",           label: "Blocked",   dot: "bg-red-500"    },
  };
  const c = cfg[health];
  if (!c) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

type SortField = 'name' | 'progress' | 'totalAmrs' | 'completed' | 'targetRelease' | 'health';

function EpicsView({ isAdmin, onSwitchTab }: {
  isAdmin: boolean;
  onSwitchTab: (tab: "tickets" | "releases" | "contributions" | "ideas" | "epics") => void;
}) {
  const { toast } = useToast();
  const [selectedEpicId, setSelectedEpicId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showUnflagConfirm, setShowUnflagConfirm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Dashboard filters
  const [filterApp, setFilterApp] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRelease, setFilterRelease] = useState<string>("all");

  // Dashboard sort
  const [sortBy, setSortBy] = useState<SortField>("progress");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Drill-down AMR filters
  const [drillStatus, setDrillStatus] = useState("all");
  const [drillPriority, setDrillPriority] = useState("all");
  const [drillModule, setDrillModule] = useState("all");
  const [drillDeveloper, setDrillDeveloper] = useState("all");
  const [drillOwner, setDrillOwner] = useState("all");
  const [drillApp, setDrillApp] = useState("all");
  const [drillRelease, setDrillRelease] = useState("all");

  const { data: epics = [], isLoading } = useQuery<Epic[]>({
    queryKey: ['/api/epics'],
  });

  const { data: epicDetail, isLoading: isDetailLoading } = useQuery<EpicDetail>({
    queryKey: ['/api/epics', selectedEpicId],
    enabled: !!selectedEpicId,
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/epics", { name: newName.trim(), description: newDesc.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epics"] });
      setShowCreateDialog(false);
      setNewName(""); setNewDesc("");
      toast({ title: "Epic AMR created", description: "The AMR has been created and flagged as an Epic." });
    },
    onError: (e: any) => toast({ title: "Failed to create epic", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/epics/${selectedEpicId}`, { name: editName.trim(), description: editDesc.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epics", selectedEpicId] });
      setShowEditDialog(false);
      toast({ title: "Epic updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update epic", description: e.message, variant: "destructive" }),
  });

  const markCompleteMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/epics/${selectedEpicId}`, { status: 'complete' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epics", selectedEpicId] });
      toast({ title: "Epic marked complete" });
    },
    onError: (e: any) => toast({ title: "Failed to mark complete", description: e.message, variant: "destructive" }),
  });

  const unflagMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/epics/${selectedEpicId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setSelectedEpicId(null);
      setShowUnflagConfirm(false);
      toast({ title: "Epic unflagged", description: "The AMR is no longer marked as an Epic. All associations have been cleared." });
    },
    onError: (e: any) => toast({ title: "Failed to remove epic flag", description: e.message, variant: "destructive" }),
  });

  const selectedEpic = epics.find(e => e.id === selectedEpicId);

  // Reset drill filters when epic changes
  useEffect(() => {
    setDrillStatus("all"); setDrillPriority("all"); setDrillModule("all");
    setDrillDeveloper("all"); setDrillOwner("all"); setDrillApp("all"); setDrillRelease("all");
  }, [selectedEpicId]);

  // Derived filter options
  const releaseOptions = Array.from(new Set(epics.map(e => e.targetRelease).filter(Boolean))) as string[];
  const appOptions = Array.from(new Set(epics.map(e => e.applicationScope).filter(Boolean))) as string[];

  // Apply filters + sort
  const HEALTH_ORDER: Record<string, number> = { green: 0, yellow: 1, red: 2 };
  const filteredEpics = epics.filter(e => {
    if (filterApp !== "all" && e.applicationScope !== filterApp) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (filterRelease !== "all" && e.targetRelease !== filterRelease) return false;
    return true;
  });
  const sortedEpics = [...filteredEpics].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (sortBy === "progress") cmp = a.percentComplete - b.percentComplete;
    else if (sortBy === "totalAmrs") cmp = a.amrCount - b.amrCount;
    else if (sortBy === "completed") cmp = a.completedAmrCount - b.completedAmrCount;
    else if (sortBy === "targetRelease") cmp = (a.targetRelease ?? "").localeCompare(b.targetRelease ?? "");
    else if (sortBy === "health") cmp = (HEALTH_ORDER[a.health] ?? 1) - (HEALTH_ORDER[b.health] ?? 1);
    return sortDir === "asc" ? cmp : -cmp;
  });

  // KPI summary from filtered epics
  const totalEpics = filteredEpics.length;
  const activeEpics = filteredEpics.filter(e => !['complete', 'closed'].includes(e.status)).length;
  const completeEpics = filteredEpics.filter(e => e.percentComplete === 100).length;
  const avgProgress = totalEpics > 0
    ? Math.round(filteredEpics.reduce((sum, e) => sum + e.percentComplete, 0) / totalEpics)
    : 0;

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return String(d); }
  };

  // Sortable header helper
  const SortHeader = ({ field, label, center }: { field: SortField; label: string; center?: boolean }) => {
    const active = sortBy === field;
    const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
      <th
        className={`px-3 py-2.5 font-semibold text-[13px] text-muted-foreground/80 whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors ${center ? "text-center" : "text-left"}`}
        onClick={() => { if (active) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(field); setSortDir("desc"); } }}
        data-testid={`sort-epic-${field}`}
      >
        <span className={`flex items-center gap-1 ${center ? "justify-center" : ""}`}>
          {label}
          <Icon className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/40"}`} />
        </span>
      </th>
    );
  };

  // Drill-down derived option lists
  const drillModuleOptions   = Array.from(new Set((epicDetail?.linkedAMRs ?? []).map(a => a.module).filter(Boolean))) as string[];
  const drillDevOptions      = Array.from(new Set((epicDetail?.linkedAMRs ?? []).map(a => a.developerName).filter(Boolean))) as string[];
  const drillOwnerOptions    = Array.from(new Set((epicDetail?.linkedAMRs ?? []).map(a => a.productOwnerName).filter(Boolean))) as string[];
  const drillAppOptions      = Array.from(new Set((epicDetail?.linkedAMRs ?? []).map(a => a.applicationScope).filter(Boolean))) as string[];
  const drillReleaseOptions  = Array.from(new Set((epicDetail?.linkedAMRs ?? []).map(a => a.releaseCheckpoint).filter(Boolean))) as string[];

  const filteredLinkedAmrs = (epicDetail?.linkedAMRs ?? []).filter(a => {
    if (drillStatus   !== "all" && a.status           !== drillStatus)   return false;
    if (drillPriority !== "all" && a.priority         !== drillPriority) return false;
    if (drillModule   !== "all" && a.module           !== drillModule)   return false;
    if (drillDeveloper !== "all" && a.developerName   !== drillDeveloper) return false;
    if (drillOwner    !== "all" && a.productOwnerName !== drillOwner)    return false;
    if (drillApp      !== "all" && a.applicationScope !== drillApp)      return false;
    if (drillRelease  !== "all" && a.releaseCheckpoint !== drillRelease) return false;
    return true;
  });

  // Epic completion gate (Req 13)
  const detail = epicDetail;
  const allAmrsDone  = (detail?.total ?? 0) > 0 && (detail?.percentComplete ?? 0) === 100;
  const epicIsComplete = ['complete', 'closed', 'completed'].includes(detail?.status ?? '');
  const showReadyBanner = allAmrsDone && !epicIsComplete;

  return (
    <div className="flex flex-col h-full" data-testid="epics-dashboard">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => onSwitchTab("tickets")} data-testid="button-back-to-tickets-from-epics">
            <ArrowLeft className="h-4 w-4 mr-1" />Back to AMRs
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-epics-title">
              <Layers className="h-5 w-5 text-primary" />Epic Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">Initiative progress across all AMR epics</p>
          </div>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => { setNewName(""); setNewDesc(""); setShowCreateDialog(true); }} data-testid="button-create-epic">
            <Plus className="h-4 w-4 mr-1" />New Epic AMR
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 pt-4 pb-2">
          {[
            { label: "Total Epics",    value: totalEpics,     cls: "",                                              testid: "kpi-total-epics"    },
            { label: "In Progress",    value: activeEpics,    cls: "text-primary",                                  testid: "kpi-active-epics"   },
            { label: "Fully Complete", value: completeEpics,  cls: "text-green-600 dark:text-green-400",            testid: "kpi-complete-epics" },
          ].map(k => (
            <Card key={k.testid} data-testid={k.testid}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${k.cls}`}>{k.value.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
          <Card data-testid="kpi-avg-progress">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Avg Progress</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-kpi-avg">{avgProgress}%</p>
              <EpicProgressBar pct={avgProgress} height="h-1" />
            </CardContent>
          </Card>
        </div>

        {/* ── Filters ── */}
        <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
          <Select value={filterApp} onValueChange={setFilterApp}>
            <SelectTrigger className="w-44" data-testid="filter-epic-app"><SelectValue placeholder="Application" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Applications</SelectItem>
              {appOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40" data-testid="filter-epic-status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {TICKET_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          {releaseOptions.length > 0 && (
            <Select value={filterRelease} onValueChange={setFilterRelease}>
              <SelectTrigger className="w-44" data-testid="filter-epic-release"><SelectValue placeholder="Target Release" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Releases</SelectItem>
                {releaseOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {(filterApp !== "all" || filterStatus !== "all" || filterRelease !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterApp("all"); setFilterStatus("all"); setFilterRelease("all"); }} data-testid="button-clear-epic-filters">
              <X className="h-3 w-3 mr-1" />Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filteredEpics.length.toLocaleString()} epic{filteredEpics.length !== 1 ? "s" : ""}</span>
        </div>

        {/* ── Main content: Table + Detail Panel ── */}
        <div className={`grid gap-4 px-4 pb-4 ${selectedEpicId ? "grid-cols-1 xl:grid-cols-5" : "grid-cols-1"}`}>

          {/* ── Dashboard Table ── */}
          <div className={selectedEpicId ? "xl:col-span-3" : "col-span-1"}>
            {isLoading && <div className="text-sm text-muted-foreground py-8 text-center">Loading epics...</div>}
            {!isLoading && sortedEpics.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Layers className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p className="font-medium">No epics found</p>
                <p className="text-xs mt-1">{epics.length === 0 ? "Flag an AMR as an Epic or create a new Epic AMR to get started." : "Try adjusting your filters."}</p>
              </div>
            )}
            {!isLoading && sortedEpics.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm" data-testid="table-epics">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <SortHeader field="name" label="Epic" />
                      <th className="text-left px-3 py-2.5 font-semibold text-[13px] text-muted-foreground/80 whitespace-nowrap">Application</th>
                      <SortHeader field="targetRelease" label="Release" />
                      <SortHeader field="totalAmrs"    label="Total"    center />
                      <SortHeader field="completed"    label="Done"     center />
                      <SortHeader field="health"       label="Health"   />
                      <SortHeader field="progress"     label="Progress" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEpics.map((epic, idx) => (
                      <tr
                        key={epic.id}
                        onClick={() => setSelectedEpicId(selectedEpicId === epic.id ? null : epic.id)}
                        className={`border-b last:border-0 cursor-pointer transition-colors hover-elevate ${selectedEpicId === epic.id ? "bg-primary/5 dark:bg-primary/10" : idx % 2 === 1 ? "bg-muted/20" : ""}`}
                        data-testid={`row-epic-${epic.id}`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-sm truncate" data-testid={`text-epic-name-${epic.id}`}>{epic.name}</span>
                              {selectedEpicId === epic.id && <ChevronRight className="h-3 w-3 text-primary shrink-0" />}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[10px] text-muted-foreground">{epic.ticketNumber}</span>
                              <span className={`text-[10px] px-1.5 py-0 rounded font-medium ${EPIC_AMR_STATUS_CHIP[epic.status] ?? "bg-muted text-muted-foreground"}`}>
                                {STATUS_LABELS[epic.status] ?? epic.status.replace(/_/g, " ")}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{epic.applicationScope || "—"}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          {epic.targetRelease ? <span className="font-medium">{epic.targetRelease}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center text-sm font-medium" data-testid={`text-total-amrs-${epic.id}`}>{epic.amrCount.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center text-sm" data-testid={`text-completed-amrs-${epic.id}`}>
                          <span className={epic.completedAmrCount > 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-muted-foreground"}>
                            {epic.completedAmrCount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5"><EpicHealthBadge health={epic.health} /></td>
                        <td className="px-3 py-2.5 min-w-[120px]">
                          {epic.amrCount > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1"><EpicProgressBar pct={epic.percentComplete} /></div>
                              <span className="text-xs font-semibold w-9 text-right shrink-0" data-testid={`text-progress-${epic.id}`}>{epic.percentComplete}%</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">No AMRs</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Detail Panel ── */}
          {selectedEpicId && (
            <div className="xl:col-span-2 flex flex-col gap-3" data-testid="panel-epic-detail">

              {/* Summary + Meta card */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-[10px] text-muted-foreground">{selectedEpic?.ticketNumber ?? epicDetail?.ticketNumber}</span>
                        <span className={`text-[10px] px-1.5 py-0 rounded font-medium ${EPIC_AMR_STATUS_CHIP[(selectedEpic?.status ?? epicDetail?.status) ?? "open"] ?? ""}`}>
                          {STATUS_LABELS[(selectedEpic?.status ?? epicDetail?.status) ?? "open"] ?? (selectedEpic?.status ?? epicDetail?.status)}
                        </span>
                        <EpicHealthBadge health={(selectedEpic?.health ?? epicDetail?.health) as any} />
                      </div>
                      <CardTitle className="text-base leading-tight" data-testid="text-detail-epic-name">{selectedEpic?.name ?? epicDetail?.title}</CardTitle>
                      {(selectedEpic?.description || epicDetail?.description) && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{selectedEpic?.description ?? epicDetail?.description}</p>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setSelectedEpicId(null)} data-testid="button-close-epic-detail">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                    <div><span className="text-muted-foreground">Application</span>
                      <p className="font-medium">{(selectedEpic?.applicationScope ?? epicDetail?.applicationScope) || "—"}</p></div>
                    <div><span className="text-muted-foreground">Target Release</span>
                      <p className="font-medium">{(selectedEpic?.targetRelease ?? epicDetail?.targetRelease) || "—"}</p></div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2 mt-3 pt-2 border-t flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => { setEditName(selectedEpic?.name ?? epicDetail?.title ?? ""); setEditDesc(selectedEpic?.description ?? epicDetail?.description ?? ""); setShowEditDialog(true); }} data-testid="button-edit-epic">
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowUnflagConfirm(true)} data-testid="button-unflag-epic">
                        <Trash2 className="h-3 w-3 mr-1" />Remove Flag
                      </Button>
                      {showReadyBanner && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => markCompleteMut.mutate()} disabled={markCompleteMut.isPending} data-testid="button-mark-epic-complete">
                          <CheckCheck className="h-3 w-3 mr-1" />{markCompleteMut.isPending ? "Marking…" : "Mark Complete"}
                        </Button>
                      )}
                    </div>
                  )}
                </CardHeader>

                <CardContent className="pt-0 space-y-3">
                  {/* Ready for Completion banner (Req 13) */}
                  {showReadyBanner && (
                    <div className="rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 px-3 py-2 flex items-start gap-2" data-testid="banner-epic-ready">
                      <Trophy className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-green-800 dark:text-green-300">Ready for Epic Completion</p>
                        <p className="text-[11px] text-green-700 dark:text-green-400 mt-0.5">All child AMRs complete. Product Owner must manually mark this Epic as done.</p>
                      </div>
                    </div>
                  )}

                  {/* 8-stat summary grid (Req 6) */}
                  {isDetailLoading ? (
                    <p className="text-xs text-muted-foreground text-center py-2">Loading summary…</p>
                  ) : detail ? (
                    <>
                      <div className="grid grid-cols-4 gap-1.5" data-testid="section-epic-summary-stats">
                        {([
                          { label: "Total AMRs",    value: detail.total,          cls: "text-foreground",                                               testid: "stat-total"         },
                          { label: "Completed",     value: detail.completed,      cls: "text-green-600 dark:text-green-400",                            testid: "stat-completed"     },
                          { label: "In Dev",        value: detail.inDevelopment,  cls: "text-amber-600 dark:text-amber-400",                            testid: "stat-in-dev"        },
                          { label: "Testing",       value: detail.needsTesting,   cls: "text-purple-600 dark:text-purple-400",                          testid: "stat-needs-testing" },
                          { label: "Roadmap",       value: detail.onRoadmap,      cls: "text-indigo-600 dark:text-indigo-400",                          testid: "stat-roadmap"       },
                          { label: "Blocked",       value: detail.blocked,        cls: detail.blocked > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",   testid: "stat-blocked"   },
                          { label: "Overdue",       value: detail.overdue,        cls: detail.overdue > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground", testid: "stat-overdue" },
                          { label: "Progress",      value: `${detail.percentComplete}%`, cls: detail.percentComplete >= 80 ? "text-green-600 dark:text-green-400" : detail.percentComplete >= 40 ? "text-primary" : "text-amber-600 dark:text-amber-400", testid: "stat-progress" },
                        ] as const).map(s => (
                          <div key={s.label} className="rounded border bg-muted/20 px-1.5 py-1 text-center" data-testid={s.testid}>
                            <p className="text-[10px] text-muted-foreground leading-none">{s.label}</p>
                            <p className={`text-sm font-bold mt-0.5 ${s.cls}`}>{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <EpicProgressBar pct={detail.percentComplete} />
                        <span className="text-xs font-semibold w-9 text-right shrink-0">{detail.percentComplete}%</span>
                      </div>
                    </>
                  ) : null}

                  {/* Timeline (Req 11) */}
                  {detail?.timeline && detail.timeline.length > 0 && (
                    <div data-testid="section-epic-timeline">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                        <Activity className="h-3 w-3" />Timeline
                      </p>
                      <div className="relative pl-4 space-y-2">
                        {detail.timeline.map((evt, idx) => (
                          <div key={idx} className="relative flex items-start gap-2 text-xs">
                            <span className="absolute -left-[1px] top-1.5 w-2 h-2 rounded-full border-2 border-primary bg-background" />
                            {idx < detail.timeline.length - 1 && <span className="absolute left-[3px] top-4 bottom-0 w-px bg-border" />}
                            <div className="pl-2">
                              <span className="font-medium">{evt.label}</span>
                              <span className="ml-2 text-muted-foreground">{formatDate(evt.date)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Linked AMRs with drill-down (Req 10) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Linked AMRs ({isDetailLoading ? "…" : `${filteredLinkedAmrs.length} of ${epicDetail?.linkedAMRs?.length ?? 0}`})
                  </CardTitle>

                  {(epicDetail?.linkedAMRs?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Select value={drillStatus} onValueChange={setDrillStatus}>
                        <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          {Array.from(new Set((epicDetail?.linkedAMRs ?? []).map(a => a.status))).map(s => (
                            <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={drillPriority} onValueChange={setDrillPriority}>
                        <SelectTrigger className="h-7 text-xs w-24"><SelectValue placeholder="Priority" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          {TICKET_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {drillModuleOptions.length > 0 && (
                        <Select value={drillModule} onValueChange={setDrillModule}>
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Module" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Modules</SelectItem>
                            {drillModuleOptions
                              .sort((a, b) => formatModuleLabel(a).localeCompare(formatModuleLabel(b)))
                              .map(m => <SelectItem key={m} value={m}>{formatModuleLabel(m)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {drillDevOptions.length > 0 && (
                        <Select value={drillDeveloper} onValueChange={setDrillDeveloper}>
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Developer" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Devs</SelectItem>
                            {drillDevOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {drillOwnerOptions.length > 0 && (
                        <Select value={drillOwner} onValueChange={setDrillOwner}>
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Owner" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Owners</SelectItem>
                            {drillOwnerOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {drillAppOptions.length > 0 && (
                        <Select value={drillApp} onValueChange={setDrillApp}>
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="App" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Apps</SelectItem>
                            {drillAppOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {drillReleaseOptions.length > 0 && (
                        <Select value={drillRelease} onValueChange={setDrillRelease}>
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="Release" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Releases</SelectItem>
                            {drillReleaseOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {(drillStatus !== "all" || drillPriority !== "all" || drillModule !== "all" || drillDeveloper !== "all" || drillOwner !== "all" || drillApp !== "all" || drillRelease !== "all") && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setDrillStatus("all"); setDrillPriority("all"); setDrillModule("all"); setDrillDeveloper("all"); setDrillOwner("all"); setDrillApp("all"); setDrillRelease("all"); }} data-testid="button-clear-drill-filters">
                          <X className="h-3 w-3 mr-1" />Clear
                        </Button>
                      )}
                    </div>
                  )}
                </CardHeader>

                <CardContent className="pt-0">
                  {isDetailLoading && <p className="text-xs text-muted-foreground py-3 text-center">Loading...</p>}
                  {!isDetailLoading && epicDetail && filteredLinkedAmrs.length === 0 && (
                    <p className="text-xs text-muted-foreground py-3 text-center">
                      {epicDetail.linkedAMRs.length === 0 ? "No AMRs linked to this epic yet." : "No AMRs match the current filters."}
                    </p>
                  )}
                  {!isDetailLoading && epicDetail && filteredLinkedAmrs.length > 0 && (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/40 border-b">
                            <th className="text-left px-2 py-2 font-semibold text-muted-foreground">AMR #</th>
                            <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Title</th>
                            <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Status</th>
                            <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Priority</th>
                            <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Owner</th>
                            <th className="text-left px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">Dev Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLinkedAmrs.map((amr, idx) => {
                            const overdueRow = amr.scheduledDevelopmentDate &&
                              new Date(amr.scheduledDevelopmentDate) < new Date() &&
                              !['complete','closed','completed','user_accepts','cancelled','duplicate'].includes(amr.status);
                            return (
                              <tr
                                key={amr.id}
                                className={`border-b last:border-0 cursor-pointer hover:bg-primary/5 transition-colors ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                                onClick={(e) => { if ((e.target as HTMLElement).closest('a')) return; history.replaceState({}, '', `/amr?ticket=${amr.ticketNumber}`); onSwitchTab("tickets"); }}
                                data-testid={`row-linked-amr-${amr.id}`}
                              >
                                <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                                  <a
                                    href={`/amr?ticket=${amr.ticketNumber}`}
                                    className="hover:underline"
                                    onClick={(e) => { if (e.ctrlKey || e.metaKey || e.button !== 0) return; e.preventDefault(); history.replaceState({}, '', `/amr?ticket=${amr.ticketNumber}`); onSwitchTab("tickets"); }}
                                  >{amr.ticketNumber}</a>
                                </td>
                                <td className="px-2 py-2 max-w-[140px]">
                                  <a
                                    href={`/amr?ticket=${amr.ticketNumber}`}
                                    className="line-clamp-2 leading-tight hover:underline block"
                                    onClick={(e) => { if (e.ctrlKey || e.metaKey || e.button !== 0) return; e.preventDefault(); history.replaceState({}, '', `/amr?ticket=${amr.ticketNumber}`); onSwitchTab("tickets"); }}
                                  >{amr.title}</a>
                                </td>
                                <td className="px-2 py-2">
                                  <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${EPIC_AMR_STATUS_CHIP[amr.status] ?? "bg-muted text-muted-foreground"}`}>
                                    {STATUS_LABELS[amr.status] ?? amr.status.replace(/_/g, " ")}
                                  </span>
                                </td>
                                <td className="px-2 py-2">
                                  <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${PRIORITY_COLORS[amr.priority] ?? "bg-muted text-muted-foreground"}`}>
                                    {amr.priority}
                                  </span>
                                </td>
                                <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{amr.ownerName || "—"}</td>
                                <td className="px-2 py-2 whitespace-nowrap">
                                  {amr.scheduledDevelopmentDate ? (
                                    <span className={overdueRow ? "text-orange-600 dark:text-orange-400 font-medium flex items-center gap-0.5" : "text-muted-foreground"}>
                                      {overdueRow && <Clock className="h-2.5 w-2.5 shrink-0" />}
                                      {formatDate(amr.scheduledDevelopmentDate)}
                                    </span>
                                  ) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Create Epic AMR Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent data-testid="dialog-create-epic">
          <DialogHeader><DialogTitle>New Epic AMR</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">Creates a new AMR ticket and automatically flags it as an Epic.</p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Epic Title *</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Revenue Engine Q3" data-testid="input-epic-name" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Describe the scope or goal of this initiative..." rows={3} data-testid="input-epic-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={!newName.trim() || createMut.isPending} data-testid="button-create-epic-submit">
              {createMut.isPending ? "Creating..." : "Create Epic AMR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Epic Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent data-testid="dialog-edit-epic">
          <DialogHeader><DialogTitle>Edit Epic</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Title *</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Epic title..." data-testid="input-edit-epic-name" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
              <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} data-testid="input-edit-epic-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate()} disabled={!editName.trim() || updateMut.isPending} data-testid="button-edit-epic-submit">
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unflag Confirm Dialog */}
      <Dialog open={showUnflagConfirm} onOpenChange={setShowUnflagConfirm}>
        <DialogContent data-testid="dialog-unflag-epic">
          <DialogHeader><DialogTitle>Remove Epic Flag?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the Epic flag from <strong>{selectedEpic?.name}</strong> and unlink all associated AMRs. The AMR ticket itself will remain. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnflagConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => unflagMut.mutate()} disabled={unflagMut.isPending} data-testid="button-unflag-epic-confirm">
              {unflagMut.isPending ? "Removing..." : "Remove Epic Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
