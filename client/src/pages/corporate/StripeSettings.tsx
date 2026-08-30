import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import {
  Loader2, CheckCircle, XCircle, AlertCircle, CreditCard,
  RefreshCw, ExternalLink, Landmark, Zap, Shield, Webhook,
  Copy, KeyRound, Activity, Clock, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface StripeConfig {
  configured: boolean;
  publishableKey: string | null;
  mode: "test" | "live" | null;
  webhookConfigured: boolean;
  secretKeyMasked: string | null;
  publishableKeyMasked: string | null;
  enabledMethods: string[];
}

interface TestResult {
  success: boolean;
  message: string;
  available?: { amount: number; currency: string }[];
}

interface WebhookEvent {
  id: string;
  stripeEventId: string;
  eventType: string;
  status: string;
  invoiceId: string | null;
  paymentId: string | null;
  stripeObjectId: string | null;
  amount: string | null;
  currency: string | null;
  processingError: string | null;
  processedAt: string | null;
  receivedAt: string;
}

interface WebhookEventsResponse {
  events: WebhookEvent[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ModeBadge({ mode }: { mode: "test" | "live" | null }) {
  if (!mode) return null;
  if (mode === "test") {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 font-semibold">
        TEST MODE
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 font-semibold">
      LIVE MODE
    </Badge>
  );
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle className="h-5 w-5 text-green-500" />
    : <XCircle className="h-5 w-5 text-muted-foreground" />;
}

function EventStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    processed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    failed:    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    skipped:   "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    received:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };
  return (
    <Badge className={`text-xs ${map[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </Badge>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const color =
    type.includes("succeeded") ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
    type.includes("failed")    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" :
    type.includes("processing") ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
    type.includes("refunded") || type.includes("dispute") ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" :
    "bg-muted text-muted-foreground";
  return (
    <code className={`text-xs px-1.5 py-0.5 rounded font-mono ${color}`}>
      {type}
    </code>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() =>
      toast({ title: "Copied", description: `${label} copied to clipboard` })
    ).catch(() => {});
  };
  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} data-testid={`button-copy-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <Copy className="h-4 w-4" />
    </Button>
  );
}

// ─── Event Row ────────────────────────────────────────────────────────────────
function EventRow({ event }: { event: WebhookEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <TableRow
        className="cursor-pointer hover-elevate"
        onClick={() => setExpanded(e => !e)}
        data-testid={`row-webhook-event-${event.id}`}
      >
        <TableCell className="font-mono text-xs text-muted-foreground">
          {event.stripeEventId.slice(0, 18)}…
        </TableCell>
        <TableCell><EventTypeBadge type={event.eventType} /></TableCell>
        <TableCell><EventStatusBadge status={event.status} /></TableCell>
        <TableCell className="text-sm">
          {event.amount ? `$${parseFloat(event.amount).toFixed(2)} ${(event.currency || '').toUpperCase()}` : "—"}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(event.receivedAt), { addSuffix: true })}
        </TableCell>
        <TableCell>
          <Button variant="ghost" size="icon">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/40 px-4 py-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-semibold text-muted-foreground mb-1">Stripe Event ID</p>
                <p className="font-mono">{event.stripeEventId}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1">Stripe Object ID</p>
                <p className="font-mono">{event.stripeObjectId || "—"}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1">Invoice ID</p>
                <p className="font-mono">{event.invoiceId || "—"}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1">Payment ID</p>
                <p className="font-mono">{event.paymentId || "—"}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1">Received</p>
                <p>{format(new Date(event.receivedAt), "MMM d, yyyy h:mm:ss a")}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1">Processed</p>
                <p>{event.processedAt ? format(new Date(event.processedAt), "MMM d, yyyy h:mm:ss a") : "—"}</p>
              </div>
              {event.processingError && (
                <div className="col-span-2">
                  <p className="font-semibold text-red-600 mb-1">Error</p>
                  <p className="text-red-700 dark:text-red-400">{event.processingError}</p>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Webhook Events Tab ───────────────────────────────────────────────────────
function WebhookEventsTab() {
  const { data, isLoading, refetch } = useQuery<WebhookEventsResponse>({
    queryKey: ["/api/stripe/webhook-events"],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-medium">Recent Stripe Webhook Events</p>
          <p className="text-xs text-muted-foreground">
            {data?.total != null ? `${data.total} total events logged` : "Loading…"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-webhook-events">
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!data?.events || data.events.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <Webhook className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No webhook events yet</p>
          <p className="text-sm mt-1">Events will appear here once Stripe starts sending webhooks to this endpoint.</p>
        </div>
      )}

      {!isLoading && data && data.events.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Event ID</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Amount</TableHead>
                <TableHead className="text-xs">Received</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.events.map(event => (
                <EventRow key={event.id} event={event} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StripeSettings() {
  const { toast } = useToast();
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const { data: config, isLoading } = useQuery<StripeConfig>({
    queryKey: ["/api/stripe/config"],
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/test-connection");
      return res.json() as Promise<TestResult>;
    },
    onSuccess: (data) => {
      setTestResult(data);
      if (data.success) {
        toast({ title: "Connection Verified", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["/api/stripe/config"] });
      } else {
        toast({ title: "Connection Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: any) => {
      const msg = err?.message || "Test failed";
      setTestResult({ success: false, message: msg });
      toast({ title: "Test Failed", description: msg, variant: "destructive" });
    },
  });

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/stripe`
    : "/api/webhooks/stripe";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConnected = config?.configured ?? false;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">

      {/* ── Page Header ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-5 w-5 text-[#635BFF]" />
            <h1 className="text-2xl font-bold">Stripe Integration</h1>
            {config?.mode && <ModeBadge mode={config.mode} />}
          </div>
          <p className="text-sm text-muted-foreground">
            Secure ACH and card payment processing for customer invoice payments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/stripe/config"] })}
            data-testid="button-refresh-stripe-config"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button asChild variant="outline" size="sm" data-testid="link-stripe-dashboard">
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              Stripe Dashboard
            </a>
          </Button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <Tabs defaultValue="configuration">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="configuration" data-testid="tab-stripe-configuration">
            <Zap className="h-4 w-4 mr-1.5" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-stripe-events">
            <Activity className="h-4 w-4 mr-1.5" />
            Webhook Events
          </TabsTrigger>
        </TabsList>

        {/* ── Configuration Tab ─────────────────────────────────── */}
        <TabsContent value="configuration" className="space-y-5 mt-5">

          {/* Connection Status */}
          <Card data-testid="card-stripe-connection-status">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Connection Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <StatusIcon ok={isConnected} />
                  <div>
                    <p className="font-medium" data-testid="text-stripe-connection-status">
                      {isConnected ? "Connected" : "Not Connected"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isConnected
                        ? config?.mode === "test"
                          ? "Test mode — no real charges occur."
                          : "Live mode — real charges are active."
                        : "Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to enable payments."}
                    </p>
                  </div>
                </div>
                <Button
                  variant={isConnected ? "outline" : "default"}
                  size="sm"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                  data-testid="button-test-stripe-connection"
                >
                  {testMutation.isPending
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : <Zap className="h-4 w-4 mr-1" />}
                  Test Connection
                </Button>
              </div>

              {testResult && (
                <Alert variant={testResult.success ? "default" : "destructive"} data-testid="alert-test-result">
                  <AlertDescription className="flex items-center gap-2">
                    {testResult.success
                      ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      : <AlertCircle className="h-4 w-4 shrink-0" />}
                    <span>{testResult.message}</span>
                    {testResult.success && testResult.available && testResult.available.length > 0 && (
                      <span className="text-muted-foreground ml-1">
                        — Balance: {testResult.available.map(b => `${b.currency} ${b.amount.toFixed(2)}`).join(", ")}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card data-testid="card-stripe-api-keys">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                API Keys
              </CardTitle>
              <CardDescription>Keys are masked for security. Set them as environment secrets.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Publishable Key</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono truncate" data-testid="text-publishable-key-masked">
                    {config?.publishableKeyMasked ?? "pk_test_•••••••••••••••••••• (not set)"}
                  </code>
                  {config?.publishableKey && <CopyButton value={config.publishableKey} label="Publishable Key" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Secret name: <code className="font-mono">STRIPE_PUBLISHABLE_KEY</code>
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Secret Key</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono truncate" data-testid="text-secret-key-masked">
                    {config?.secretKeyMasked ?? "sk_test_•••••••••••••••••••• (not set)"}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Secret name: <code className="font-mono">STRIPE_SECRET_KEY</code> — never share or display the real value.
                </p>
              </div>

              {!isConnected && (
                <Alert data-testid="alert-keys-not-set">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    API keys not configured. Copy them from your{" "}
                    <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                      Stripe API Keys page
                    </a>{" "}
                    and set them as environment secrets.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card data-testid="card-stripe-payment-methods">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Enabled Payment Methods
              </CardTitle>
              <CardDescription>Both ACH and card payments are enabled when Stripe is connected.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`rounded-md border p-4 flex items-start gap-3 ${isConnected ? "" : "opacity-50"}`} data-testid="stripe-method-card">
                  <CreditCard className="h-5 w-5 mt-0.5 shrink-0 text-[#635BFF]" />
                  <div>
                    <p className="font-medium text-sm">Credit &amp; Debit Card</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Visa, Mastercard, Amex, Discover</p>
                    <div className="mt-2"><StatusIcon ok={isConnected} /></div>
                  </div>
                </div>
                <div className={`rounded-md border p-4 flex items-start gap-3 ${isConnected ? "" : "opacity-50"}`} data-testid="stripe-method-ach">
                  <Landmark className="h-5 w-5 mt-0.5 shrink-0 text-[#635BFF]" />
                  <div>
                    <p className="font-medium text-sm">ACH Bank Transfer</p>
                    <p className="text-xs text-muted-foreground mt-0.5">US bank accounts via Stripe ACH</p>
                    <div className="mt-2"><StatusIcon ok={isConnected} /></div>
                  </div>
                </div>
              </div>
              {isConnected && config?.mode === "test" && (
                <Alert className="mt-4" data-testid="alert-test-mode-info">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Test mode active.</strong> Use{" "}
                    <a href="https://stripe.com/docs/testing" target="_blank" rel="noopener noreferrer" className="underline">
                      Stripe test credentials
                    </a>{" "}
                    — no real charges will occur.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Webhook */}
          <Card data-testid="card-stripe-webhook">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="h-4 w-4" />
                Webhook Configuration
                {config?.webhookConfigured
                  ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">Configured</Badge>
                  : <Badge variant="secondary" className="text-xs">Not Configured</Badge>}
              </CardTitle>
              <CardDescription>
                Handles: payment success, ACH settlement, payment failures, refunds, and disputes — in real time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Webhook Endpoint URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all" data-testid="text-webhook-url">
                    {webhookUrl}
                  </code>
                  <CopyButton value={webhookUrl} label="Webhook URL" />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Required Stripe events</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "payment_intent.succeeded",
                    "payment_intent.processing",
                    "payment_intent.payment_failed",
                    "payment_intent.canceled",
                    "charge.refunded",
                    "charge.dispute.created",
                  ].map(e => (
                    <code key={e} className="text-xs bg-muted rounded px-1.5 py-0.5 font-mono">{e}</code>
                  ))}
                </div>
              </div>

              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Setup steps:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
                  <li>Open <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer" className="underline">Stripe Webhooks Dashboard</a> → <strong>Add endpoint</strong>.</li>
                  <li>Paste the webhook URL above and select all events listed above.</li>
                  <li>Copy the <strong>Signing secret</strong> → add it as <code className="font-mono">STRIPE_WEBHOOK_SECRET</code> environment secret.</li>
                </ol>
              </div>

              {!config?.webhookConfigured && (
                <Alert variant="destructive" data-testid="alert-webhook-not-configured">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>STRIPE_WEBHOOK_SECRET is not set.</strong> Payment events (especially async ACH) will not be automatically recorded.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Security */}
          <Card data-testid="card-stripe-security">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Security &amp; Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {[
                "Card data never touches DriverHub servers — captured directly by Stripe's JS library (PCI DSS SAQ A).",
                "All webhook events are verified using HMAC-SHA256 signature validation before processing.",
                "Duplicate payment detection prevents the same PaymentIntent from being recorded twice.",
                "ACH payments use Stripe Financial Connections for instant bank account verification.",
                "Disputes are automatically flagged and tracked in the payment record.",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <p>{text}</p>
                </div>
              ))}
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-xs">Payment processor</span>
                <a href="https://stripe.com/docs/security" target="_blank" rel="noopener noreferrer" className="text-xs underline flex items-center gap-1" data-testid="link-stripe-security-docs">
                  Stripe Security Docs <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        {/* ── Webhook Events Tab ─────────────────────────────────── */}
        <TabsContent value="events" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Webhook Event Log
              </CardTitle>
              <CardDescription>
                Every Stripe webhook event received is logged here for auditing and debugging.
                Click a row to expand details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WebhookEventsTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
