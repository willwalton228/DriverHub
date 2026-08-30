import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Key, Webhook, Copy, CheckCircle, XCircle, Trash2, Plus, Globe,
  ShieldCheck, ShieldAlert, AlertTriangle, Clock, RefreshCw, ExternalLink, Eye, EyeOff,
  BookOpen, Activity, Send, ChevronDown, ChevronRight, Lock, Unlock,
  FileJson, Zap, Smartphone, KeyRound, ArrowRight, Fingerprint, Info, UserCheck,
  Monitor, Bell,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import EventIngestion from "@/pages/corporate/EventIngestion";

// ─── Types ────────────────────────────────────────────────────────────────
interface ApiKey {
  id: string;
  name: string;
  description?: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  description?: string;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  keyName?: string;
  action: string;
  resource: string;
  resourceId?: string;
  responseStatus?: number;
  ipAddress?: string;
  createdAt: string;
}

interface DeliveryLog {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  responseStatus?: number;
  deliveredAt?: string;
  createdAt: string;
}

const SCOPES = [
  { value: "*", label: "Full Access (*)", group: "admin", color: "bg-destructive/10 text-destructive" },
  // Master Data — Read
  { value: "read:drivers", label: "Read Drivers", group: "master" },
  { value: "read:accounts", label: "Read Accounts", group: "master" },
  { value: "read:locations", label: "Read Locations", group: "master" },
  { value: "read:service-types", label: "Read Service Types", group: "master" },
  { value: "read:moves", label: "Read Moves", group: "master" },
  { value: "read:schedules", label: "Read Schedules", group: "master" },
  { value: "read:users", label: "Read Users", group: "master" },
  // Operations & Events — Read
  { value: "read:execution", label: "Read Execution Events", group: "ops" },
  { value: "read:time", label: "Read Time Events", group: "ops" },
  { value: "read:expenses", label: "Read Expense Events", group: "ops" },
  // Financial — Read
  { value: "read:invoices", label: "Read Invoices", group: "financial" },
  { value: "read:payments", label: "Read Payments", group: "financial" },
  // Documents — Read
  { value: "read:documents", label: "Read Documents", group: "docs" },
  // Webhooks — Read
  { value: "read:webhooks", label: "Read Webhooks", group: "webhook" },
  // Operations — Write
  { value: "write:moves", label: "Write Moves (bookings)", group: "write" },
  { value: "write:dispatch", label: "Write Dispatch", group: "write" },
  { value: "write:execution", label: "Write Execution Events", group: "write" },
  { value: "write:exceptions", label: "Write Exceptions", group: "write" },
  { value: "write:time", label: "Write Time Events", group: "write" },
  { value: "write:expenses", label: "Write Expense Events", group: "write" },
  { value: "write:documents", label: "Write Documents", group: "write" },
  // Webhooks — Manage
  { value: "manage:webhooks", label: "Manage Webhooks", group: "webhook" },
];

const WEBHOOK_EVENTS = [
  "move.created", "move.updated", "move.completed", "move.cancelled",
  "trip.assigned", "trip.unassigned", "driver.status_changed", "trip.completed",
  "invoice.created", "payment.issued", "exception.opened",
  "time_event.created", "expense.created",
];

// ─── CopyButton ───────────────────────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="icon"
      variant="ghost"
      data-testid="button-copy"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    delivered: { label: "Delivered", variant: "default" },
    pending: { label: "Pending", variant: "secondary" },
    failed: { label: "Failed", variant: "outline" },
    dead_letter: { label: "Dead Letter", variant: "destructive" },
  };
  const m = map[status] || { label: status, variant: "outline" };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

// ─── Create API Key Dialog ─────────────────────────────────────────────────
function CreateApiKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["*"]);
  const [expiresInDays, setExpiresInDays] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(true);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/v1/api-keys", data),
    onSuccess: async (res) => {
      const json = await res.json();
      setRawKey(json.data.api_key);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/v1/api-keys"] });
    },
    onError: () => toast({ title: "Failed to create API key", variant: "destructive" }),
  });

  function handleCreate() {
    createMutation.mutate({
      name,
      description,
      scopes: selectedScopes,
      expires_in_days: expiresInDays ? parseInt(expiresInDays) : undefined,
    });
  }

  function toggleScope(scope: string) {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  }

  function handleClose() {
    setName(""); setDescription(""); setSelectedScopes(["*"]);
    setExpiresInDays(""); setRawKey(null); setShowKey(true);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
        </DialogHeader>

        {rawKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Copy this key now. It will not be shown again.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted rounded-md px-3 py-2 text-sm font-mono overflow-hidden">
                {showKey ? rawKey : rawKey.replace(/./g, "•")}
              </code>
              <Button size="icon" variant="ghost" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <CopyButton value={rawKey} />
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label required>Name</Label>
              <Input data-testid="input-key-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. DriverConnect Production" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="space-y-2">
              <Label>Expires In (days)</Label>
              <Input type="number" value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)} placeholder="Leave blank for no expiry" />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="flex flex-wrap gap-2">
                {SCOPES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    data-testid={`scope-${s.value}`}
                    onClick={() => toggleScope(s.value)}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      selectedScopes.includes(s.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover-elevate"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                data-testid="button-create-key"
                onClick={handleCreate}
                disabled={!name || !selectedScopes.length || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Key"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Webhook Dialog ────────────────────────────────────────────────
function CreateWebhookDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["*"]);
  const [secret, setSecret] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/v1/webhooks", data),
    onSuccess: async (res) => {
      const json = await res.json();
      setSecret(json.data.signing_secret);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/v1/webhooks"] });
    },
    onError: () => toast({ title: "Failed to register webhook", variant: "destructive" }),
  });

  function toggleEvent(event: string) {
    if (event === "*") { setSelectedEvents(["*"]); return; }
    setSelectedEvents(prev =>
      prev.includes(event)
        ? prev.filter(e => e !== event && e !== "*")
        : [...prev.filter(e => e !== "*"), event]
    );
  }

  function handleClose() {
    setName(""); setUrl(""); setDescription("");
    setSelectedEvents(["*"]); setSecret(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register Webhook Endpoint</DialogTitle>
        </DialogHeader>

        {secret ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Store this signing secret securely. It will not be shown again.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted rounded-md px-3 py-2 text-sm font-mono break-all">
                {secret}
              </code>
              <CopyButton value={secret} />
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label required>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. DriverConnect Production" />
            </div>
            <div className="space-y-2">
              <Label required>URL</Label>
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.driverconnect.com/webhooks" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="flex flex-wrap gap-2">
                {["*", ...WEBHOOK_EVENTS].map(ev => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleEvent(ev)}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      selectedEvents.includes(ev)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover-elevate"
                    }`}
                  >
                    {ev === "*" ? "All Events (*)" : ev}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate({ name, url, events: selectedEvents, description })}
                disabled={!name || !url || !selectedEvents.length || createMutation.isPending}
              >
                {createMutation.isPending ? "Registering..." : "Register Webhook"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── API Reference Tab ────────────────────────────────────────────────────
const METHOD_COLORS: Record<string, string> = {
  get:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  post:   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  patch:  "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  put:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

interface OAParam { name: string; in: string; required?: boolean; schema?: any; description?: string; }
interface OAOperation {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OAParam[];
  requestBody?: any;
  responses?: Record<string, any>;
  security?: any[];
}

function OperationCard({ op }: { op: OAOperation }) {
  const [expanded, setExpanded] = useState(false);
  const hasBody = !!op.requestBody?.content?.["application/json"]?.schema;
  const bodySchema = hasBody ? op.requestBody.content["application/json"].schema : null;
  const pathParams = (op.parameters || []).filter(p => p.in === "path");
  const queryParams = (op.parameters || []).filter(p => p.in === "query");
  const headerParams = (op.parameters || []).filter(p => p.in === "header");
  const noAuth = op.security && op.security.length === 0;

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover-elevate"
        onClick={() => setExpanded(x => !x)}
        data-testid={`op-${op.operationId || op.method + op.path}`}
      >
        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded font-mono shrink-0 ${METHOD_COLORS[op.method] || "bg-muted text-muted-foreground"}`}>
          {op.method}
        </span>
        <code className="text-sm font-mono text-muted-foreground">{op.path}</code>
        <span className="text-sm text-foreground ml-1">{op.summary}</span>
        {noAuth && <Badge variant="outline" className="ml-auto text-xs shrink-0">Public</Badge>}
        {expanded ? <ChevronDown className="h-4 w-4 ml-auto shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 ml-auto shrink-0 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t p-4 space-y-4 bg-muted/20">
          {op.description && (
            <p className="text-sm text-muted-foreground">{op.description}</p>
          )}
          {pathParams.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Path Parameters</p>
              <div className="space-y-1">
                {pathParams.map(p => (
                  <div key={p.name} className="flex items-start gap-2 text-sm">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{p.name}</code>
                    <span className="text-xs text-muted-foreground">{p.schema?.type}</span>
                    {p.required && <Badge variant="destructive" className="text-xs">required</Badge>}
                    {p.description && <span className="text-xs text-muted-foreground">{p.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {queryParams.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Query Parameters</p>
              <div className="space-y-1">
                {queryParams.map(p => (
                  <div key={p.name} className="flex items-start gap-2 text-sm flex-wrap">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{p.name}</code>
                    <span className="text-xs text-muted-foreground">{p.schema?.type}{p.schema?.format ? ` (${p.schema.format})` : ""}</span>
                    {p.schema?.enum && (
                      <span className="text-xs text-muted-foreground">
                        [{p.schema.enum.join(", ")}]
                      </span>
                    )}
                    {p.description && <span className="text-xs text-muted-foreground">— {p.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {headerParams.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Header Parameters</p>
              <div className="space-y-1">
                {headerParams.map(p => (
                  <div key={p.name} className="flex items-start gap-2 text-sm">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{p.name}</code>
                    {p.description && <span className="text-xs text-muted-foreground">{p.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {bodySchema && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Request Body</p>
              <div className="space-y-1">
                {Object.entries(bodySchema.properties || {}).map(([field, def]: [string, any]) => (
                  <div key={field} className="flex items-start gap-2 text-sm flex-wrap">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{field}</code>
                    <span className="text-xs text-muted-foreground">{def.type}{def.format ? ` (${def.format})` : ""}</span>
                    {(bodySchema.required || []).includes(field) && <Badge variant="destructive" className="text-xs">required</Badge>}
                    {def.description && <span className="text-xs text-muted-foreground">— {def.description}</span>}
                    {def.enum && <span className="text-xs text-muted-foreground">[{def.enum.join(", ")}]</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {op.responses && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Responses</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(op.responses).map(([code, resp]: [string, any]) => (
                  <div key={code} className="flex items-center gap-1.5">
                    <Badge variant={code.startsWith("2") ? "default" : code === "401" || code === "403" ? "destructive" : "secondary"} className="text-xs font-mono">
                      {code}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{resp.description || ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ApiReferenceTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const specQuery = useQuery<any>({
    queryKey: ["/api/v1/openapi.json"],
  });

  const spec = specQuery.data;

  const operations: OAOperation[] = [];
  if (spec?.paths) {
    for (const [path, methods] of Object.entries(spec.paths as Record<string, any>)) {
      for (const [method, op] of Object.entries(methods as Record<string, any>)) {
        if (["get", "post", "patch", "put", "delete"].includes(method)) {
          operations.push({ method, path, ...(op as any) });
        }
      }
    }
  }

  const tags: string[] = spec?.tags?.map((t: any) => t.name) || [];

  const filteredOps = operations.filter(op => {
    const matchTag = !activeTag || (op.tags || []).includes(activeTag);
    const q = searchTerm.toLowerCase();
    const matchSearch = !q ||
      op.path.toLowerCase().includes(q) ||
      (op.summary || "").toLowerCase().includes(q) ||
      (op.operationId || "").toLowerCase().includes(q);
    return matchTag && matchSearch;
  });

  const grouped: Record<string, OAOperation[]> = {};
  for (const op of filteredOps) {
    const tag = (op.tags || ["Other"])[0];
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push(op);
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-48">
              <Input
                placeholder="Search endpoints..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                data-testid="input-api-search"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={activeTag === null ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTag(null)}
                data-testid="filter-all-tags"
              >
                All
              </Button>
              {tags.map(tag => (
                <Button
                  key={tag}
                  variant={activeTag === tag ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTag(tag)}
                  data-testid={`filter-tag-${tag}`}
                >
                  {tag}
                </Button>
              ))}
            </div>
            <a href="/api/v1/openapi.json" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" data-testid="button-download-spec">
                <FileJson className="h-4 w-4 mr-2" />
                Download Spec
                <ExternalLink className="h-3 w-3 ml-2" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Auth info banner */}
      <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border text-sm">
        <Lock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <span className="font-medium">Authentication</span>
          <span className="text-muted-foreground ml-2">All endpoints (except <code className="text-xs bg-muted px-1 py-0.5 rounded">/health</code>) require an <code className="text-xs bg-muted px-1 py-0.5 rounded">X-API-Key</code> header. Rate limit: 600 req/min per key. Response envelope: <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{ success, data, meta }"}</code>.</span>
        </div>
      </div>

      {/* Loading / error state */}
      {specQuery.isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin opacity-40" />
          <p className="text-sm">Loading API specification...</p>
        </div>
      )}
      {specQuery.isError && (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-destructive/60" />
          <p className="text-sm">Could not load OpenAPI specification.</p>
        </div>
      )}

      {/* Endpoint groups */}
      {!specQuery.isLoading && Object.entries(grouped).map(([tag, ops]) => {
        const tagDef = spec?.tags?.find((t: any) => t.name === tag);
        return (
          <div key={tag} className="space-y-2">
            <div>
              <h3 className="font-semibold text-base">{tag}</h3>
              {tagDef?.description && (
                <p className="text-sm text-muted-foreground">{tagDef.description}</p>
              )}
            </div>
            <div className="space-y-1.5">
              {ops.map(op => (
                <OperationCard key={`${op.method}-${op.path}`} op={op} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {!specQuery.isLoading && filteredOps.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No endpoints match your search.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function IntegrationAPI() {
  const { toast } = useToast();
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [createWebhookOpen, setCreateWebhookOpen] = useState(false);

  const keysQuery = useQuery<{ data: ApiKey[]; available_scopes: string[] }>({
    queryKey: ["/api/admin/v1/api-keys"],
  });

  const webhooksQuery = useQuery<{ data: WebhookEndpoint[] }>({
    queryKey: ["/api/admin/v1/webhooks"],
  });

  const auditQuery = useQuery<{ data: AuditEntry[]; meta: any }>({
    queryKey: ["/api/admin/v1/audit-log"],
  });

  const deliveryQuery = useQuery<{ data: DeliveryLog[]; meta: any }>({
    queryKey: ["/api/v1/webhook-deliveries"],
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/v1/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/v1/api-keys"] });
      toast({ title: "API key revoked" });
    },
    onError: () => toast({ title: "Failed to revoke key", variant: "destructive" }),
  });

  const removeWebhookMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/v1/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/v1/webhooks"] });
      toast({ title: "Webhook deactivated" });
    },
    onError: () => toast({ title: "Failed to deactivate webhook", variant: "destructive" }),
  });

  const testWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/v1/webhooks/${id}/test`, {});
      return res.json();
    },
    onSuccess: (data) => {
      const success = data?.data?.status === "delivered";
      toast({
        title: success ? "Test webhook delivered" : "Test webhook failed",
        description: success
          ? `HTTP ${data?.data?.http_status} in ${data?.data?.duration_ms}ms`
          : data?.data?.error || "Endpoint did not respond with a 2xx status.",
        variant: success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/v1/webhook-deliveries"] });
    },
    onError: () => toast({ title: "Failed to send test webhook", variant: "destructive" }),
  });

  const keys = keysQuery.data?.data || [];
  const webhooks = webhooksQuery.data?.data || [];
  const auditLog = auditQuery.data?.data || [];
  const deliveries = deliveryQuery.data?.data || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Integration API</h1>
          <p className="text-muted-foreground mt-1">
            Manage API keys and webhook endpoints for DriverConnect and third-party integrations.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/api/v1/health" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="default" data-testid="button-api-health">
              <Activity className="h-4 w-4 mr-2" />
              API Status
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          </a>
          <Tooltip>
            <TooltipTrigger asChild>
              <a href="/api/v1/health" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="default" data-testid="button-openapi-docs">
                  <BookOpen className="h-4 w-4 mr-2" />
                  API Reference
                  <ExternalLink className="h-3 w-3 ml-2" />
                </Button>
              </a>
            </TooltipTrigger>
            <TooltipContent>View OpenAPI documentation</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active API Keys", value: keys.filter(k => k.isActive).length, icon: Key },
          { label: "Webhook Endpoints", value: webhooks.filter(w => w.isActive).length, icon: Webhook },
          { label: "Audit Events", value: auditQuery.data?.meta?.total || 0, icon: ShieldCheck },
          { label: "Webhook Deliveries", value: deliveryQuery.data?.meta?.total || 0, icon: Globe },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Attention Alerts ─────────────────────────────────────────────── */}
      {(() => {
        const alerts: { level: "error" | "warning"; message: string }[] = [];

        // Expired keys
        const expiredKeys = keys.filter(k => k.isActive && k.expiresAt && new Date(k.expiresAt) < new Date());
        if (expiredKeys.length > 0)
          alerts.push({ level: "error", message: `${expiredKeys.length} API key${expiredKeys.length > 1 ? "s have" : " has"} expired and may be blocking integrations: ${expiredKeys.map(k => k.name).join(", ")}` });

        // Keys expiring within 30 days
        const expiringKeys = keys.filter(k => k.isActive && k.expiresAt && differenceInDays(new Date(k.expiresAt), new Date()) <= 30 && new Date(k.expiresAt) > new Date());
        if (expiringKeys.length > 0)
          alerts.push({ level: "warning", message: `${expiringKeys.length} API key${expiringKeys.length > 1 ? "s are" : " is"} expiring within 30 days: ${expiringKeys.map(k => k.name).join(", ")}` });

        // Inactive webhooks
        const inactiveWebhooks = webhooks.filter(w => !w.isActive);
        if (inactiveWebhooks.length > 0)
          alerts.push({ level: "warning", message: `${inactiveWebhooks.length} webhook endpoint${inactiveWebhooks.length > 1 ? "s are" : " is"} currently inactive: ${inactiveWebhooks.map(w => w.name).join(", ")}` });

        // Failed deliveries
        const failedDeliveries = deliveries.filter(d => d.status === "failed");
        if (failedDeliveries.length > 0)
          alerts.push({ level: "error", message: `${failedDeliveries.length} webhook deliver${failedDeliveries.length > 1 ? "ies have" : "y has"} failed. Check the Delivery Log for details.` });

        if (alerts.length === 0) return null;
        return (
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${
                  alert.level === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                }`}
              >
                {alert.level === "error"
                  ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  : <Bell className="h-4 w-4 shrink-0 mt-0.5" />}
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        );
      })()}

      <Tabs defaultValue="keys">
        <div className="mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Integration API Workspace</p>
        </div>
        <TabsList>
          <TabsTrigger value="keys" data-testid="tab-api-keys">
            <Key className="h-4 w-4 mr-2" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="webhooks" data-testid="tab-webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="deliveries" data-testid="tab-deliveries">
            <Globe className="h-4 w-4 mr-2" />
            Delivery Log
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="reference" data-testid="tab-api-reference">
            <FileJson className="h-4 w-4 mr-2" />
            API Reference
          </TabsTrigger>
          <TabsTrigger value="sso" data-testid="tab-sso">
            <ShieldCheck className="h-4 w-4 mr-2" />
            SSO Identity
          </TabsTrigger>
          <TabsTrigger value="monitoring" data-testid="tab-monitoring">
            <Monitor className="h-4 w-4 mr-2" />
            Monitoring
          </TabsTrigger>
        </TabsList>

        {/* API Keys Tab */}
        <TabsContent value="keys" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>Database-backed API keys with scope-based access control.</CardDescription>
              </div>
              <Button data-testid="button-create-api-key" onClick={() => setCreateKeyOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New API Key
              </Button>
            </CardHeader>
            <CardContent>
              {keysQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : keys.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No API keys yet. Create one to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map(key => (
                      <TableRow key={key.id} data-testid={`row-apikey-${key.id}`}>
                        <TableCell>
                          <div className="font-medium">{key.name}</div>
                          {key.description && (
                            <div className="text-xs text-muted-foreground">{key.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{key.keyPrefix}...</code>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(key.scopes || []).slice(0, 3).map(s => (
                              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                            ))}
                            {(key.scopes || []).length > 3 && (
                              <Badge variant="secondary" className="text-xs">+{key.scopes.length - 3}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={key.isActive ? "default" : "secondary"}>
                            {key.isActive ? "Active" : "Revoked"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {key.lastUsedAt ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true }) : "Never"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {key.expiresAt ? format(new Date(key.expiresAt), "MMM d, yyyy") : "Never"}
                        </TableCell>
                        <TableCell>
                          {key.isActive && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" data-testid={`button-revoke-${key.id}`}>
                                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Revoke <strong>{key.name}</strong>? Any system using this key will immediately lose access.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => revokeKeyMutation.mutate(key.id)}>
                                    Revoke
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>Webhook Endpoints</CardTitle>
                <CardDescription>Outbound webhooks with HMAC-SHA256 signing and automatic retry.</CardDescription>
              </div>
              <Button data-testid="button-add-webhook" onClick={() => setCreateWebhookOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Endpoint
              </Button>
            </CardHeader>
            <CardContent>
              {webhooksQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : webhooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Webhook className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No webhook endpoints registered.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.map(wh => (
                      <TableRow key={wh.id} data-testid={`row-webhook-${wh.id}`}>
                        <TableCell>
                          <div className="font-medium">{wh.name}</div>
                          {wh.description && (
                            <div className="text-xs text-muted-foreground">{wh.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground break-all">{wh.url}</code>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(wh.events || []).slice(0, 2).map(e => (
                              <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                            ))}
                            {(wh.events || []).length > 2 && (
                              <Badge variant="secondary" className="text-xs">+{wh.events.length - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={wh.isActive ? "default" : "secondary"}>
                            {wh.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(wh.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {wh.isActive && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`button-test-webhook-${wh.id}`}
                                    disabled={testWebhookMutation.isPending}
                                    onClick={() => testWebhookMutation.mutate(wh.id)}
                                  >
                                    <Send className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Send test event</TooltipContent>
                              </Tooltip>
                            )}
                            {wh.isActive && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" data-testid={`button-remove-webhook-${wh.id}`}>
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Deactivate Webhook</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Deactivate <strong>{wh.name}</strong>? No further events will be delivered to this endpoint.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => removeWebhookMutation.mutate(wh.id)}>
                                      Deactivate
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delivery Log Tab */}
        <TabsContent value="deliveries" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Delivery Log</CardTitle>
              <CardDescription>Outbound webhook delivery history. Failed deliveries retry up to 3 times with exponential backoff.</CardDescription>
            </CardHeader>
            <CardContent>
              {deliveries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No deliveries yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>HTTP Status</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map(d => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{d.eventType}</code>
                        </TableCell>
                        <TableCell><StatusBadge status={d.status} /></TableCell>
                        <TableCell className="text-sm">{d.attempts}</TableCell>
                        <TableCell className="text-sm">
                          {d.responseStatus ? (
                            <span className={d.responseStatus >= 200 && d.responseStatus < 300 ? "text-green-600" : "text-destructive"}>
                              {d.responseStatus}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {d.deliveredAt ? formatDistanceToNow(new Date(d.deliveredAt), { addSuffix: true }) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>API Audit Log</CardTitle>
              <CardDescription>Immutable record of all write operations performed via the Integration API.</CardDescription>
            </CardHeader>
            <CardContent>
              {auditLog.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No audit events yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLog.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{entry.action}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-muted-foreground">{entry.resource}</span>
                          {entry.resourceId && (
                            <span className="ml-1 text-xs text-muted-foreground/60">#{entry.resourceId.slice(0, 8)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{entry.keyName || "—"}</TableCell>
                        <TableCell>
                          {entry.responseStatus && (
                            <span className={`text-sm font-medium ${entry.responseStatus < 300 ? "text-green-600" : "text-destructive"}`}>
                              {entry.responseStatus}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.ipAddress || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Reference Tab */}
        <TabsContent value="reference" className="mt-4">
          <ApiReferenceTab />
        </TabsContent>

        {/* SSO Identity Tab */}
        <TabsContent value="sso" className="mt-4">
          <div className="space-y-6">
            {/* Overview */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5" />
                  <CardTitle>SSO Identity Foundation</CardTitle>
                </div>
                <CardDescription>
                  DriverHub acts as the identity provider for the DriverConnect platform. When a user authenticates
                  in DriverConnect, it calls DriverHub to validate identity and retrieve app-level entitlements.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex items-start gap-3 p-4 rounded-md border bg-card">
                    <Globe className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">DriverHub</p>
                      <p className="text-xs text-muted-foreground">Identity Provider — manages user accounts, roles, and entitlements</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-1">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">SSO Token / API call</span>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-md border bg-card">
                    <Smartphone className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">DriverConnect</p>
                      <p className="text-xs text-muted-foreground">Relying Party — validates tokens and enforces entitlements</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Endpoint Reference */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  <CardTitle>SSO Endpoints</CardTitle>
                </div>
                <CardDescription>
                  All endpoints under <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">/api/v1/sso</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Auth</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { method: "GET",  path: "/api/v1/sso/me",                       auth: "Session cookie",            desc: "Returns full identity payload for the currently logged-in DriverHub user" },
                      { method: "GET",  path: "/api/v1/sso/identity",                 auth: "API key (read:sso-identity)", desc: "Look up a user identity by ?userId= or ?email=. Supports ?requireDriverConnectAccess=true" },
                      { method: "POST", path: "/api/v1/sso/token",                    auth: "Session cookie",            desc: "Issues a short-lived (5 min) one-time SSO token for DriverConnect handoff. Enforces DriverConnect entitlement." },
                      { method: "POST", path: "/api/v1/sso/token/exchange",           auth: "API key (read:sso-identity)", desc: "Exchanges a one-time SSO token for the full identity payload. Token is marked used immediately (one-time guarantee)." },
                      { method: "POST", path: "/api/v1/sso/provision",               auth: "API key (read:sso-identity)", desc: "JIT provisioning: DriverConnect calls this after token exchange to create or update its local user record. Returns the provisioning record." },
                      { method: "GET",  path: "/api/v1/sso/provision/:driverHubUserId", auth: "API key (read:sso-identity)", desc: "Get the provisioning record for a DriverHub user. Returns 404 if the user has not yet been provisioned in DriverConnect." },
                      { method: "GET",  path: "/api/v1/sso/role-mapping",            auth: "None (public)",             desc: "Returns the canonical DriverHub→DriverConnect role mapping table. DriverConnect uses this as the default role mapping seed." },
                      { method: "GET",  path: "/api/v1/sso/audit-log",              auth: "API key (read:sso-identity)", desc: "Returns recent SSO audit events: logins, denials, token exchange, provisioning. Paginated by ?limit=&offset=." },
                    ].map((ep, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`font-mono text-xs ${ep.method === "POST" ? "border-orange-500 text-orange-600 dark:text-orange-400" : "border-blue-500 text-blue-600 dark:text-blue-400"}`}
                          >
                            {ep.method}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{ep.path}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ep.auth}</TableCell>
                        <TableCell className="text-sm">{ep.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Identity Payload Schema */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileJson className="h-5 w-5" />
                  <CardTitle>Identity Payload Schema</CardTitle>
                </div>
                <CardDescription>
                  The standard identity object returned by all SSO endpoints
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted text-sm rounded-md p-4 overflow-auto text-muted-foreground font-mono">
{`{
  "driverHubUserId": "uuid",
  "userId":          "uuid (backward compat alias)",
  "email":           "jane@example.com",
  "firstName":       "Jane",
  "lastName":        "Smith",
  "fullName":        "Jane Smith",
  "displayName":     "Jane Smith",
  "active":      true,
  "orgId":       "uuid | null",
  "ssoSubjectId": "ext-id | null",
  "roleClassification": "SUPER_ADMIN | ADMIN | MANAGER | DISPATCHER | DRIVER | READ_ONLY | CUSTOMER_ADMIN",
  "ssoRole":     "(same as roleClassification — backward compat alias)",
  "company": {
    "orgId":   "uuid | null",
    "orgName": "Driver on Demand"
  },
  "appEntitlements": [
    { "appCode": "DRIVERHUB",      "accessGranted": true,  "grantedAt": "2026-01-01T00:00:00Z", "revokedAt": null },
    { "appCode": "DRIVERCONNECT",  "accessGranted": false, "grantedAt": null, "revokedAt": null }
  ],
  "entitlements": {
    "hasDriverHubAccess":     true,
    "hasDriverConnectAccess": false
  },
  "issuedAt":    "2026-03-17T19:00:00Z"
}`}
                </pre>
              </CardContent>
            </Card>

            {/* Token Exchange Flow */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  <CardTitle>Token Exchange Flow</CardTitle>
                </div>
                <CardDescription>How to implement DriverHub → DriverConnect SSO handoff</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {[
                    { step: 1, title: "User accesses DriverConnect sign-in", desc: "User is redirected to DriverHub authentication flow. DriverHub is the sole identity authority." },
                    { step: 2, title: "DriverHub authenticates the user", desc: "User logs into DriverHub via Replit Auth (OIDC). A session is established." },
                    { step: 3, title: "DriverHub validates access", desc: "DriverHub checks: (a) user status == ACTIVE, (b) user has DriverConnect entitlement (user_app_entitlements). Denials are audited." },
                    { step: 4, title: "Issue SSO token", desc: "POST /api/v1/sso/token issues a short-lived (5 min) one-time token. Token is hashed (SHA-256) before storage." },
                    { step: 5, title: "Handoff to DriverConnect", desc: "DriverHub redirects to DriverConnect with the token. DriverConnect receives it via URL param or POST body." },
                    { step: 6, title: "DriverConnect exchanges the token", desc: "POST /api/v1/sso/token/exchange (API key, read:sso-identity scope). Token is validated, marked used, and the full identity payload is returned. One-time guarantee enforced." },
                    { step: 7, title: "JIT provisioning or update", desc: "POST /api/v1/sso/provision — DriverConnect creates the local user record on first login, or refreshes mutable identity fields on repeat login. driverHubUserId is stored as permanent cross-system key." },
                    { step: 8, title: "Role mapping and scope seeding", desc: "DriverConnect maps roleClassification to its local role. Scope (market, network, account) is seeded from identity payload hints. Absence of scope ≠ global access." },
                    { step: 9, title: "User lands in DriverConnect", desc: "DriverConnect enforces all permissions locally (UI + backend). DriverHub role classification is for mapping only — DriverConnect owns detailed RBAC." },
                  ].map(s => (
                    <div key={s.step} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                        {s.step}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                  <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    SSO tokens are one-time use and expire in 5 minutes. Issue a new token for each authentication attempt.
                    The exchange endpoint requires the <code className="font-mono">read:sso-identity</code> scope on your API key.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* JIT Provisioning Contract */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  <CardTitle>JIT Provisioning Contract</CardTitle>
                </div>
                <CardDescription>
                  DriverConnect calls <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">POST /api/v1/sso/provision</code> after token exchange.
                  On first login a user record is created; on repeat login mutable fields are refreshed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Request Body</p>
                    <pre className="bg-muted text-xs rounded-md p-3 overflow-auto font-mono text-muted-foreground">{`{
  "driverHubUserId": "uuid",        // required — permanent key
  "dcLocalRole":     "driver",      // required — DC local role
  "email":           "...",         // optional — refreshed on sync
  "firstName":       "...",
  "lastName":        "...",
  "homeMarket":      "Phoenix",
  "homeNetwork":     "Network-A",
  "branchId":        "branch-uuid",
  "companyId":       "account-uuid",
  "scopeMarkets":    ["Phoenix"],   // initial scope seeding
  "scopeNetworks":   ["Network-A"],
  "scopeAccounts":   [],
  "provisioningTrigger": "FIRST_LOGIN",
  "forceSync": false                // if true, overwrites scope
}`}</pre>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Response</p>
                    <pre className="bg-muted text-xs rounded-md p-3 overflow-auto font-mono text-muted-foreground">{`{
  "success": true,
  "isFirstProvision": true,
  "action": "provisioned",     // or "updated"
  "data": {
    "id":                "uuid",
    "driverHubUserId":   "uuid",
    "dcLocalRole":       "driver",
    "driverHubRoleClassification": "DRIVER",
    "status":            "ACTIVE",
    "homeMarket":        "Phoenix",
    "homeNetwork":       "Network-A",
    "scopeMarkets":      ["Phoenix"],
    "scopeNetworks":     ["Network-A"],
    "provisionedAt":     "2026-03-17T...",
    "lastLoginAt":       "2026-03-17T...",
    "provisioningTrigger": "FIRST_LOGIN"
  }
}`}</pre>
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 border p-3 space-y-1">
                  <p className="text-xs font-semibold">Scope Seeding Rules</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc ml-4">
                    <li>Scope is seeded from DriverHub hints (homeMarket, homeNetwork, company/account) on first provision</li>
                    <li>Local DriverConnect admin may adjust scope after provisioning</li>
                    <li>Scope is preserved on repeat login unless <code className="font-mono">forceSync: true</code></li>
                    <li className="font-medium text-foreground">Absence of scope ≠ global access — scoped roles get no operational visibility until scope is assigned</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Denial / Failure Behavior */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />
                  <CardTitle>Denial &amp; Failure Behavior</CardTitle>
                </div>
                <CardDescription>All denial events are written to the SSO audit log with a denial reason code</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Condition</TableHead>
                      <TableHead>HTTP Status</TableHead>
                      <TableHead>Error Code</TableHead>
                      <TableHead>Denial Reason (audit)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { cond: "User status != ACTIVE",             status: "403", code: "ACCOUNT_INACTIVE",    reason: "INACTIVE" },
                      { cond: "No DriverConnect entitlement",      status: "403", code: "ACCESS_DENIED",       reason: "NO_ENTITLEMENT" },
                      { cond: "Token invalid or expired",          status: "401", code: "INVALID_TOKEN",       reason: "INVALID_TOKEN" },
                      { cond: "Token already used",                status: "401", code: "TOKEN_ALREADY_USED",  reason: "TOKEN_ALREADY_USED" },
                      { cond: "driverHubUserId not found",         status: "404", code: "NOT_FOUND",           reason: "INVALID_TOKEN" },
                      { cond: "Unmapped role classification",      status: "—",   code: "—",                  reason: "UNMAPPED_ROLE (DC enforces)" },
                      { cond: "Scoped role + no scope assigned",   status: "—",   code: "—",                  reason: "NO_SCOPE (DC enforces)" },
                    ].map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{r.cond}</TableCell>
                        <TableCell><Badge variant={r.status === "—" ? "outline" : "destructive"} className="text-xs">{r.status}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* SSO Role Reference */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  <CardTitle>SSO Role Values</CardTitle>
                </div>
                <CardDescription>High-level classification sent to DriverConnect via the identity payload</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { role: "SUPER_ADMIN", desc: "Full platform access" },
                      { role: "ADMIN", desc: "Organization-level administration" },
                      { role: "MANAGER", desc: "Operational management and reporting" },
                      { role: "DISPATCHER", desc: "Trip assignment and dispatch" },
                      { role: "DRIVER", desc: "Field operations and trip execution" },
                      { role: "CUSTOMER_ADMIN", desc: "Customer-side administration" },
                      { role: "READ_ONLY", desc: "View-only access (default)" },
                    ].map(r => (
                      <TableRow key={r.role}>
                        <TableCell><Badge variant="outline" className="font-mono text-xs">{r.role}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Monitoring Tab */}
        <TabsContent value="monitoring" className="mt-4">
          <EventIngestion />
        </TabsContent>
      </Tabs>

      <CreateApiKeyDialog open={createKeyOpen} onClose={() => setCreateKeyOpen(false)} />
      <CreateWebhookDialog open={createWebhookOpen} onClose={() => setCreateWebhookOpen(false)} />
    </div>
  );
}
