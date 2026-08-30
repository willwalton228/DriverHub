import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  Mail,
  MessageSquare,
  CreditCard,
  HardDrive,
  Key,
  Users,
  Search,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface ProviderHealthSummary {
  providerId: string;
  name: string;
  category: string;
  description: string;
  status: "connected" | "not_configured" | "error";
  configured: boolean;
  message: string;
  isRequired: boolean;
  featureFlag?: string;
  secretsMask: Record<string, boolean>;
  lastCheckedAt: string;
}

interface ProviderHealthResponse {
  providers: ProviderHealthSummary[];
  summary: {
    total: number;
    connected: number;
    notConfigured: number;
    errors: number;
  };
}

interface SecretDoc {
  key: string;
  provider: string;
  category: string;
  required: boolean;
  description: string;
}

interface SecretsDocResponse {
  secrets: SecretDoc[];
  totalSecrets: number;
}

const categoryIcons: Record<string, any> = {
  email: Mail,
  sms: MessageSquare,
  payments: CreditCard,
  background_check: Search,
  storage: HardDrive,
  crm: Users,
  auth: Shield,
  api_key: Key,
};

const categoryLabels: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  payments: "Payments",
  background_check: "Background Check",
  storage: "Storage",
  crm: "CRM",
  auth: "Authentication",
  api_key: "API Keys",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <Badge variant="default" className="bg-green-600 dark:bg-green-700" data-testid="badge-status-connected">
        <CheckCircle className="w-3 h-3 mr-1" />
        Connected
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" data-testid="badge-status-error">
        <XCircle className="w-3 h-3 mr-1" />
        Error
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid="badge-status-not-configured">
      <AlertTriangle className="w-3 h-3 mr-1" />
      Not Configured
    </Badge>
  );
}

function ProviderCard({ provider }: { provider: ProviderHealthSummary }) {
  const Icon = categoryIcons[provider.category] || Shield;
  const missingSecrets = Object.entries(provider.secretsMask)
    .filter(([, present]) => !present)
    .map(([key]) => key);

  return (
    <Card data-testid={`card-provider-${provider.providerId}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 p-2 rounded-md bg-muted">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{provider.name}</CardTitle>
              {provider.isRequired && (
                <Badge variant="outline" className="text-xs">Required</Badge>
              )}
            </div>
            <CardDescription className="mt-1">{provider.description}</CardDescription>
          </div>
        </div>
        <StatusBadge status={provider.status} />
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground mb-3">{provider.message}</p>
        {provider.featureFlag && (
          <p className="text-xs text-muted-foreground mb-2">
            Feature flag: <code className="bg-muted px-1 rounded">{provider.featureFlag}</code>
          </p>
        )}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Secrets</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(provider.secretsMask).map(([key, present]) => (
              <Badge
                key={key}
                variant={present ? "outline" : "secondary"}
                className={`text-xs ${present ? "border-green-500/30 text-green-700 dark:text-green-400" : "text-muted-foreground"}`}
                data-testid={`badge-secret-${key}`}
              >
                {present ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                {key}
              </Badge>
            ))}
          </div>
        </div>
        {missingSecrets.length > 0 && !provider.configured && (
          <Alert className="mt-3" variant="default">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">Missing secrets</AlertTitle>
            <AlertDescription className="text-xs">
              Set {missingSecrets.join(", ")} to enable this provider.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProviderHealth() {
  const { data, isLoading, isError } = useQuery<ProviderHealthResponse>({
    queryKey: ["/api/admin/provider-health"],
    refetchInterval: 30000,
  });

  const { data: secretsDocs, isLoading: secretsLoading } = useQuery<SecretsDocResponse>({
    queryKey: ["/api/admin/provider-health", "docs", "secrets"],
    queryFn: async () => {
      const res = await fetch("/api/admin/provider-health/docs/secrets");
      if (!res.ok) throw new Error("Failed to fetch secrets docs");
      return res.json();
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-health"] });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load provider health status. You may not have admin access.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { providers, summary } = data;

  const categories = Array.from(new Set(providers.map(p => p.category)));

  return (
    <div className="p-6 space-y-6 overflow-auto h-full" data-testid="page-provider-health">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Provider Health</h1>
          <p className="text-muted-foreground">Monitor external service connections and secrets configuration</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} data-testid="button-refresh-health">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="card-summary-connected">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-connected-count">{summary.connected}</p>
                <p className="text-sm text-muted-foreground">Connected</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-summary-not-configured">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-not-configured-count">{summary.notConfigured}</p>
                <p className="text-sm text-muted-foreground">Not Configured</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-summary-errors">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-errors-count">{summary.errors}</p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" data-testid="tabs-provider-categories">
        <TabsList className="flex-wrap">
          <TabsTrigger value="all" data-testid="tab-all">All ({providers.length})</TabsTrigger>
          {categories.map(cat => (
            <TabsTrigger key={cat} value={cat} data-testid={`tab-${cat}`}>
              {categoryLabels[cat] || cat} ({providers.filter(p => p.category === cat).length})
            </TabsTrigger>
          ))}
          <TabsTrigger value="secrets-doc" data-testid="tab-secrets-doc">Deployment Secrets</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {providers.map(provider => (
              <ProviderCard key={provider.providerId} provider={provider} />
            ))}
          </div>
        </TabsContent>

        {categories.map(cat => (
          <TabsContent key={cat} value={cat} className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {providers.filter(p => p.category === cat).map(provider => (
                <ProviderCard key={provider.providerId} provider={provider} />
              ))}
            </div>
          </TabsContent>
        ))}

        <TabsContent value="secrets-doc" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Deployment Secrets Reference</CardTitle>
              <CardDescription>
                Complete list of environment variables and secrets needed for deployment. 
                Set PROVIDER_FAIL_FAST=true to halt startup when required secrets are missing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {secretsLoading ? (
                <Skeleton className="h-48" />
              ) : secretsDocs ? (
                <Table data-testid="table-secrets-reference">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Secret Key</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {secretsDocs.secrets.map((secret) => (
                      <TableRow key={secret.key} data-testid={`row-secret-${secret.key}`}>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{secret.key}</code>
                        </TableCell>
                        <TableCell className="text-sm">{secret.provider}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {categoryLabels[secret.category] || secret.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {secret.required ? (
                            <Badge variant="default" className="text-xs">Required</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Optional</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{secret.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
