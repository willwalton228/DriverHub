import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { TICKET_TYPES, TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, AMR_APPLICATION_SCOPES, TICKET_MODULE_DEFINITIONS } from "@shared/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Brain, Bug, Gauge, HelpCircle, Layers, Lightbulb, Loader2, RefreshCw, Shield, Sparkles, UserCircle, X, Zap } from "lucide-react";
import { AttachmentDropZone } from "@/components/AttachmentDropZone";
import { AmrEpicPicker } from "@/components/amr/AmrEpicPicker";
import { useAuth } from "@/hooks/useAuth";

const TYPE_LABELS: Record<string, string> = {
  architectural_changes:   "Architectural Changes",
  artificial_intelligence: "Artificial Intelligence",
  bug:                     "Bug",
  enhancement:             "Enhancement",
  epic:                    "Epic",
  feature_request:         "Feature Request",
  performance:             "Performance",
  security_compliance:     "Security / Compliance",
  synchronization:         "Synchronization",
  user_experience:         "User Experience",
};

const TYPE_ICONS: Record<string, typeof Bug> = {
  architectural_changes:   Layers,
  artificial_intelligence: Brain,
  bug:                     Bug,
  enhancement:             Zap,
  epic:                    Layers,
  feature_request:         Lightbulb,
  performance:             Gauge,
  security_compliance:     Shield,
  synchronization:         RefreshCw,
  user_experience:         Sparkles,
};

const TYPE_PROMPTS: Record<string, string> = {
  architectural_changes:   "What architectural pattern, structure, or system design needs to change?",
  artificial_intelligence: "What AI or machine learning capability should be added or improved?",
  bug:                     "What is broken and how should it behave?",
  enhancement:             "What improvement would make this feature better?",
  epic:                    "Describe the initiative. What theme or goal will this Epic track?",
  feature_request:         "What new capability should the system provide?",
  performance:             "What is slow, resource-intensive, or inefficient — and what is the target?",
  security_compliance:     "What security risk, vulnerability, or compliance gap needs to be addressed?",
  synchronization:         "What data or systems are out of sync, and what is the expected behavior?",
  user_experience:         "What interaction, flow, or visual element should be improved for users?",
};

const SYSTEM_MODULES = TICKET_MODULE_DEFINITIONS.filter(m => m.category === "system");
const OPERATIONAL_MODULES = TICKET_MODULE_DEFINITIONS.filter(m => m.category === "operational");

const PRIORITY_DEFINITIONS = [
  { level: "P0", name: "Critical", description: "System-blocking issue or major defect that stops operations and requires immediate fix." },
  { level: "P1", name: "High", description: "Serious issue impacting workflow or data accuracy that should be fixed in the next release." },
  { level: "P2", name: "Medium", description: "Important improvement or non-blocking bug scheduled in normal development." },
  { level: "P3", name: "Low", description: "Minor enhancement or usability improvement with low operational impact." },
  { level: "P4", name: "Future", description: "Idea captured for the roadmap but not scheduled for development." },
];

interface SubmitTicketDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillTitle?: string;
  /** Pre-populate the Desired Outcome field (e.g. Quick Idea notes on conversion). */
  prefillDesiredOutcome?: string;
  onSubmitted?: (ticket: { id: string; ticketNumber: string }) => void;
}

export function SubmitTicketDrawer({ open, onOpenChange, prefillTitle, prefillDesiredOutcome, onSubmitted }: SubmitTicketDrawerProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [type, setType] = useState<string>("bug");
  const [module, setModule] = useState<string>("");
  const [applicationScope, setApplicationScope] = useState<string>("DriverHub");
  const [title, setTitle] = useState(prefillTitle || "");
  const [desiredOutcome, setDesiredOutcome] = useState(prefillDesiredOutcome || "");
  const [businessImpact, setBusinessImpact] = useState("");
  const [priority, setPriority] = useState<string>("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [moduleError, setModuleError] = useState(false);
  const [priorityError, setPriorityError] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [ccUserIds, setCcUserIds] = useState<string[]>([]);
  const [ccSelectValue, setCcSelectValue] = useState("");
  const [epicId, setEpicId] = useState<string>("");

  // ── Idempotency token ─────────────────────────────────────────────────────
  // Generated fresh each time the drawer opens.  Sent with every POST so the
  // server can detect duplicate submissions (double-click, network retry,
  // browser retry, mobile double-tap) and return the already-created ticket
  // instead of inserting another one.
  const submissionTokenRef = useRef<string>(crypto.randomUUID());

  const { data: allUsers = [] } = useQuery<{ id: string; firstName: string; lastName: string; email: string }[]>({
    queryKey: ["/api/admin/users/list-active"],
    enabled: open,
  });

  const { data: epicsList = [] } = useQuery<{ id: string; name: string; status: string }[]>({
    queryKey: ["/api/epics"],
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      // Refresh the idempotency token every time the drawer opens so each
      // new submission session is independent.  Retries within the same open
      // session intentionally reuse the same token (see server idempotency check).
      submissionTokenRef.current = crypto.randomUUID();
      if (prefillTitle !== undefined) {
        setTitle(prefillTitle);
      }
      if (prefillDesiredOutcome !== undefined) {
        setDesiredOutcome(prefillDesiredOutcome);
      }
    }
  }, [open, prefillTitle, prefillDesiredOutcome]);

  const resetForm = () => {
    setType("bug");
    setModule("");
    setApplicationScope("DriverHub");
    setTitle("");
    setDesiredOutcome("");
    setBusinessImpact("");
    setPriority("");
    setPendingFiles([]);
    setModuleError(false);
    setPriorityError(false);
    setAttempted(false);
    setCcUserIds([]);
    setCcSelectValue("");
    setEpicId("");
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tickets", {
        type, module, title,
        desiredOutcome: desiredOutcome || null,
        businessImpact: businessImpact || null,
        priority,
        applicationScope,
        // If type is 'epic', auto-flag as epic and don't assign to another epic
        isEpic: type === "epic" ? true : undefined,
        epicId: type !== "epic" ? (epicId || null) : null,
        // Idempotency token — prevents duplicate AMRs from double-clicks,
        // network retries, browser retries, and mobile double-taps.
        submissionToken: submissionTokenRef.current,
      });
      const ticket = await res.json();

      // Set CC users if any were selected
      if (ccUserIds.length > 0) {
        await apiRequest("PUT", `/api/tickets/${ticket.id}/cc`, { userIds: ccUserIds });
      }

      for (const file of pendingFiles) {
        const formData = new FormData();
        formData.append("file", file, file.name);
        const attachRes = await fetch(`/api/tickets/${ticket.id}/attachments`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!attachRes.ok) {
          const errBody = await attachRes.json().catch(() => ({ message: "Upload failed" }));
          toast({
            title: "Attachment upload failed",
            description: `${file.name}: ${errBody.message || "Could not be uploaded. The ticket was still created."}`,
            variant: "destructive",
          });
        }
      }

      return ticket;
    },
    onSuccess: (ticket) => {
      toast({ title: "Ticket submitted", description: `Ticket ${ticket.ticketNumber} created successfully.` });
      onSubmitted?.({ id: ticket.id, ticketNumber: ticket.ticketNumber });
      resetForm();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/badge-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/my-action-items-count"] });
    },
    onError: (e: any) => {
      const rawMsg = e.message || "An unexpected error occurred.";

      // SESSION_EXPIRED sentinel is set by queryClient when the auth proxy
      // returns an HTML page (401/403) instead of a JSON error — happens when
      // the user's session has expired while the page was open.
      if (rawMsg.startsWith("SESSION_EXPIRED:") || rawMsg.startsWith("401:") || rawMsg.match(/^403:/)) {
        toast({
          title: "Session expired",
          description: "Your session has expired. Please log in again to submit.",
          variant: "destructive",
          action: (
            <ToastAction altText="Go to login" onClick={() => { window.location.href = "/login"; }}>
              Log in
            </ToastAction>
          ),
        });
        return;
      }

      const statusMatch = rawMsg.match(/^(\d+):/);
      const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : null;

      if (statusCode === 401 || statusCode === 403) {
        toast({
          title: "Session expired",
          description: "Your session has expired. Please log in again to submit.",
          variant: "destructive",
          action: (
            <ToastAction altText="Go to login" onClick={() => { window.location.href = "/login"; }}>
              Log in
            </ToastAction>
          ),
        });
        return;
      }

      let description = rawMsg;
      const match = rawMsg.match(/^\d+:\s*(\{.+\})$/s);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          const msg = parsed.message || parsed.error || "";
          const detail = parsed.detail || "";
          description = detail ? `${msg}: ${detail}` : (msg || description);
        } catch {}
      }
      toast({ title: "Ticket submission failed", description, variant: "destructive" });
    },
  });

  const handleSubmit = async () => {
    // Belt-and-suspenders guard — the Submit button is already disabled while
    // isPending, but keyboard Enter or programmatic calls can bypass that.
    if (createMut.isPending) return;

    // Hard-check session freshness before firing the mutation.  The React
    // Query cache for /api/auth/me can be stale (CDN-cached 304), so we do a
    // direct no-cache fetch here rather than relying on the cached `user`.
    try {
      const authRes = await fetch("/api/auth/me", {
        credentials: "include",
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
      });
      if (!authRes.ok) {
        toast({
          title: "Session expired",
          description: "Your session has expired. Please log in again to submit.",
          variant: "destructive",
          action: (
            <ToastAction altText="Go to login" onClick={() => { window.location.href = "/login"; }}>
              Log in
            </ToastAction>
          ),
        });
        return;
      }
    } catch {
      // Network error — let the mutation proceed and handle the error there
    }

    setAttempted(true);
    let hasError = false;
    if (!module) { setModuleError(true); hasError = true; }
    if (!priority) { setPriorityError(true); hasError = true; }
    if (!title.trim() || title.trim().length < 20) hasError = true;
    if (desiredOutcome.trim().length < 20) hasError = true;
    if (hasError) return;
    createMut.mutate();
  };

  const TypeIcon = TYPE_ICONS[type] || Bug;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5" />
            Submit Mod Request
          </SheetTitle>
          <SheetDescription>Report a bug, request a feature, or suggest an enhancement.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="text-sm font-medium">Type *</label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" data-testid="icon-type-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs space-y-1.5 text-xs">
                    <p><span className="font-semibold">Bug</span> — Something is broken or not functioning as expected.</p>
                    <p><span className="font-semibold">Enhancement</span> — An improvement to an existing feature or workflow.</p>
                    <p><span className="font-semibold">Feature Request</span> — A brand-new capability that does not currently exist.</p>
                    <p><span className="font-semibold">User Experience</span> — Improve a UI interaction, flow, or visual element.</p>
                    <p><span className="font-semibold">Performance</span> — Address slowness, inefficiency, or resource consumption.</p>
                    <p><span className="font-semibold">Architectural Changes</span> — Structural or design-level system changes.</p>
                    <p><span className="font-semibold">Artificial Intelligence</span> — Add or improve AI/ML capabilities.</p>
                    <p><span className="font-semibold">Synchronization</span> — Fix data or system sync issues.</p>
                    <p><span className="font-semibold">Security / Compliance</span> — Address a security risk or compliance gap.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger data-testid="select-ticket-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {type && TYPE_PROMPTS[type] && (
                <p className="text-xs text-muted-foreground mt-1.5 italic" data-testid="text-type-prompt">{TYPE_PROMPTS[type]}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Module *</label>
              <Select value={module} onValueChange={(v) => { setModule(v); setModuleError(false); }}>
                <SelectTrigger className={moduleError ? "border-destructive" : ""} data-testid="select-ticket-module">
                  <SelectValue placeholder="Select a module..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>System / Platform</SelectLabel>
                    {SYSTEM_MODULES.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Operational Modules</SelectLabel>
                    {OPERATIONAL_MODULES.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {moduleError && (
                <p className="text-xs text-destructive mt-1" data-testid="text-module-error">Module is required.</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Application Scope *</label>
            <Select value={applicationScope} onValueChange={setApplicationScope}>
              <SelectTrigger data-testid="select-ticket-app-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AMR_APPLICATION_SCOPES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Which application does this request impact?</p>
          </div>

          <div>
            <label className="text-sm font-medium">Issue / Idea *</label>
            <Input
              placeholder="Brief description of the issue or idea"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={attempted && (!title.trim() || title.trim().length < 20) ? "border-destructive" : ""}
              data-testid="input-ticket-title"
            />
            <p className="text-xs text-muted-foreground mt-1">Describe what is happening now or what you would like to see.</p>
            {attempted && !title.trim() && (
              <p className="text-xs text-destructive mt-0.5" data-testid="text-title-error">Issue / Idea is required.</p>
            )}
            {attempted && title.trim() && title.trim().length < 20 && (
              <p className="text-xs text-destructive mt-0.5" data-testid="text-title-length-error">Please provide a more detailed description.</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Desired Outcome *</label>
            <Textarea
              placeholder="What would you like to happen?"
              value={desiredOutcome}
              onChange={(e) => setDesiredOutcome(e.target.value)}
              className={attempted && desiredOutcome.trim().length < 20 ? "border-destructive" : ""}
              data-testid="input-ticket-outcome"
            />
            {attempted && !desiredOutcome.trim() && (
              <p className="text-xs text-destructive mt-0.5" data-testid="text-outcome-error">Desired Outcome is required.</p>
            )}
            {attempted && desiredOutcome.trim() && desiredOutcome.trim().length < 20 && (
              <p className="text-xs text-destructive mt-0.5" data-testid="text-outcome-length-error">Please provide a more detailed description.</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">
              Business Impact{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              placeholder="How does this affect your work or the business?"
              value={businessImpact}
              onChange={(e) => setBusinessImpact(e.target.value)}
              data-testid="input-ticket-impact"
            />
            <p className="text-xs text-muted-foreground mt-1">Explain how this affects productivity, revenue, compliance, or risk.</p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="text-sm font-medium cursor-default" data-testid="label-ticket-priority">Priority *</label>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs p-3">
                  <div className="space-y-2">
                    {PRIORITY_DEFINITIONS.map(d => (
                      <div key={d.level} className="text-xs">
                        <span className="font-semibold">{d.level} — {d.name}:</span>{" "}
                        <span>{d.description}</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-priority-help"
                    aria-label="Priority definitions"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" className="w-80">
                  <h4 className="font-semibold text-sm mb-3">Priority Definitions</h4>
                  <div className="space-y-2.5">
                    {PRIORITY_DEFINITIONS.map(d => (
                      <div key={d.level}>
                        <div className="text-sm font-medium">
                          {d.level} <span className="text-muted-foreground">— {d.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Select value={priority} onValueChange={(v) => { setPriority(v); setPriorityError(false); }}>
              <SelectTrigger className={priorityError ? "border-destructive" : ""} data-testid="select-ticket-priority">
                <SelectValue placeholder="Select priority..." />
              </SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map(p => (
                  <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {priorityError && (
              <p className="text-xs text-destructive mt-1" data-testid="text-priority-error">Priority is required.</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Owner</label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/40 text-sm" data-testid="field-ticket-owner">
              <UserCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">
                {user
                  ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'You'
                  : 'Loading...'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Automatically set to you. Reassignable after creation.</p>
          </div>

          {allUsers.length > 0 && (
            <div>
              <label className="text-sm font-medium">CC</label>
              <p className="text-xs text-muted-foreground mb-1.5">Add people who should be able to view and comment on this ticket.</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {ccUserIds.map((uid) => {
                  const u = allUsers.find(a => a.id === uid);
                  const name = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || uid : uid;
                  return (
                    <Badge key={uid} variant="secondary" className="flex items-center gap-1 text-xs no-default-hover-elevate no-default-active-elevate" data-testid={`badge-drawer-cc-${uid}`}>
                      {name}
                      <button
                        type="button"
                        onClick={() => setCcUserIds(prev => prev.filter(id => id !== uid))}
                        className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Remove ${name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
              <Select
                value={ccSelectValue}
                onValueChange={(v) => {
                  if (v && !ccUserIds.includes(v)) {
                    setCcUserIds(prev => [...prev, v]);
                  }
                  setCcSelectValue("");
                }}
              >
                <SelectTrigger data-testid="select-drawer-cc-user">
                  <SelectValue placeholder="Add person to CC..." />
                </SelectTrigger>
                <SelectContent>
                  {allUsers
                    .filter(u => !ccUserIds.includes(u.id) && u.id !== user?.id)
                    .map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type !== "epic" && (
            <div>
              <label className="text-sm font-medium">Epic <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
              <p className="text-xs text-muted-foreground mb-1.5">Group this request under a larger initiative. You can assign or change it later.</p>
              <AmrEpicPicker
                epics={epicsList}
                value={epicId || null}
                onValueChange={(value) => setEpicId(value || "")}
                includeUnassigned
                testId="select-ticket-epic"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Attachments</label>
            <AttachmentDropZone
              files={pendingFiles}
              onFilesAdded={(newFiles) => setPendingFiles(prev => [...prev, ...newFiles])}
              onFileRemoved={(index) => setPendingFiles(prev => prev.filter((_, i) => i !== index))}
              disabled={createMut.isPending}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending}
              className="flex-1"
              data-testid="button-submit-ticket"
            >
              {createMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Mod Request"
              )}
            </Button>
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} data-testid="button-cancel-ticket">
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
