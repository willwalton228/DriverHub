import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Key, 
  Shield, 
  Clock, 
  Ban, 
  User, 
  Building2, 
  Mail, 
  FileText,
  Activity,
  Eye,
  Copy,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dateFormat";

interface ExternalAccessGrant {
  id: string;
  role: string;
  grantedToEmail: string;
  grantedToName: string | null;
  grantedToOrg: string | null;
  allowedScopes: string[];
  customerId: string | null;
  claimId: string | null;
  expiresAt: string;
  accessToken: string;
  isActive: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedReason: string | null;
  createdAt: string;
  createdBy: string;
  notes: string | null;
}

interface ExternalAccessLog {
  id: string;
  grantId: string;
  accessedResource: string;
  resourceScope: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  responseStatus: number | null;
  occurredAt: string;
}

const AVAILABLE_SCOPES = [
  { value: 'risp_summary', label: 'RISP Insurance Summary', description: 'Aggregated risk metrics report' },
  { value: 'evidence_chain', label: 'Evidence Chain', description: 'Claims evidence timeline' },
  { value: 'claims_metrics', label: 'Claims Metrics', description: 'Aggregated claims data (no PII)' },
  { value: 'carrier_metrics', label: 'Carrier Metrics', description: 'Carrier-facing dashboard' },
];

function CreateGrantDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    role: 'carrier_viewer',
    grantedToEmail: '',
    grantedToName: '',
    grantedToOrg: '',
    allowedScopes: [] as string[],
    expiresAt: '',
    notes: '',
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('POST', '/api/external-access/grants', data);
    },
    onSuccess: () => {
      toast({ title: "Access grant created successfully" });
      setOpen(false);
      setFormData({
        role: 'carrier_viewer',
        grantedToEmail: '',
        grantedToName: '',
        grantedToOrg: '',
        allowedScopes: [],
        expiresAt: '',
        notes: '',
      });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to create access grant", variant: "destructive" });
    },
  });

  const handleScopeToggle = (scope: string) => {
    setFormData(prev => ({
      ...prev,
      allowedScopes: prev.allowedScopes.includes(scope)
        ? prev.allowedScopes.filter(s => s !== scope)
        : [...prev.allowedScopes, scope],
    }));
  };

  const setDefaultExpiry = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setFormData(prev => ({ ...prev, expiresAt: date.toISOString().slice(0, 16) }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-grant">
          <Plus className="w-4 h-4 mr-2" />
          Create Access Grant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create External Access Grant</DialogTitle>
          <DialogDescription>
            Grant time-limited access to carriers or brokers for viewing specific reports.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Role</Label>
            <Select 
              value={formData.role} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, role: v }))}
            >
              <SelectTrigger data-testid="select-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="carrier_viewer">Carrier Viewer</SelectItem>
                <SelectItem value="broker_viewer">Broker Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label required>Email</Label>
              <Input
                type="email"
                placeholder="user@carrier.com"
                value={formData.grantedToEmail}
                onChange={(e) => setFormData(prev => ({ ...prev, grantedToEmail: e.target.value }))}
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Contact name"
                value={formData.grantedToName}
                onChange={(e) => setFormData(prev => ({ ...prev, grantedToName: e.target.value }))}
                data-testid="input-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Organization</Label>
            <Input
              placeholder="Carrier/Broker organization name"
              value={formData.grantedToOrg}
              onChange={(e) => setFormData(prev => ({ ...prev, grantedToOrg: e.target.value }))}
              data-testid="input-org"
            />
          </div>

          <div className="space-y-2">
            <Label required>Allowed Scopes</Label>
            <div className="space-y-2">
              {AVAILABLE_SCOPES.map((scope) => (
                <div key={scope.value} className="flex items-start gap-2">
                  <Checkbox
                    id={scope.value}
                    checked={formData.allowedScopes.includes(scope.value)}
                    onCheckedChange={() => handleScopeToggle(scope.value)}
                    data-testid={`checkbox-scope-${scope.value}`}
                  />
                  <div className="grid gap-0.5">
                    <Label htmlFor={scope.value} className="text-sm font-medium cursor-pointer">
                      {scope.label}
                    </Label>
                    <span className="text-xs text-muted-foreground">{scope.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label required>Expiration</Label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDefaultExpiry(7)}>
                7 days
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDefaultExpiry(30)}>
                30 days
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDefaultExpiry(90)}>
                90 days
              </Button>
            </div>
            <Input
              type="datetime-local"
              value={formData.expiresAt}
              onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
              data-testid="input-expires"
            />
          </div>

          <div className="space-y-2">
            <Label>Internal Notes</Label>
            <Textarea
              placeholder="Notes about this access grant (not visible to external users)"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              data-testid="input-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => createMutation.mutate(formData)}
            disabled={createMutation.isPending || !formData.grantedToEmail || formData.allowedScopes.length === 0 || !formData.expiresAt}
            data-testid="button-submit-grant"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create Grant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrantCard({ grant, onRevoke }: { grant: ExternalAccessGrant; onRevoke: () => void }) {
  const { toast } = useToast();
  const [showToken, setShowToken] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');

  const isExpired = new Date(grant.expiresAt) < new Date();
  const isRevoked = !!grant.revokedAt;
  const isInactive = !grant.isActive || isExpired || isRevoked;

  const revokeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/external-access/grants/${grant.id}/revoke`, { reason: revokeReason });
    },
    onSuccess: () => {
      toast({ title: "Access grant revoked" });
      setShowRevokeDialog(false);
      onRevoke();
    },
    onError: () => {
      toast({ title: "Failed to revoke grant", variant: "destructive" });
    },
  });

  const copyToken = () => {
    navigator.clipboard.writeText(grant.accessToken);
    toast({ title: "Token copied to clipboard" });
  };

  return (
    <Card className={isInactive ? "opacity-60" : ""} data-testid={`grant-card-${grant.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant={grant.role === 'carrier_viewer' ? 'default' : 'secondary'}>
              {grant.role === 'carrier_viewer' ? 'Carrier' : 'Broker'}
            </Badge>
            {isRevoked && <Badge variant="destructive">Revoked</Badge>}
            {isExpired && !isRevoked && <Badge variant="outline">Expired</Badge>}
            {!isInactive && <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Active</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            Created {formatDate(grant.createdAt)}
          </div>
        </div>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          {grant.grantedToOrg || 'Unknown Organization'}
        </CardTitle>
        <CardDescription className="flex items-center gap-1">
          <Mail className="w-3 h-3" />
          {grant.grantedToEmail}
          {grant.grantedToName && ` (${grant.grantedToName})`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Scopes:</span>
          {grant.allowedScopes.map((scope) => (
            <Badge key={scope} variant="outline" className="text-xs">
              {scope.replace('_', ' ')}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Expires: {formatDateTime(grant.expiresAt)}
          </span>
        </div>

        {grant.notes && (
          <div className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
            {grant.notes}
          </div>
        )}

        {isRevoked && grant.revokedReason && (
          <div className="text-xs text-destructive border-l-2 border-destructive pl-2">
            Revoked: {grant.revokedReason}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowToken(!showToken)}
            data-testid={`button-toggle-token-${grant.id}`}
          >
            <Key className="w-3 h-3 mr-1" />
            {showToken ? 'Hide Token' : 'Show Token'}
          </Button>
          
          {!isInactive && (
            <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive" data-testid={`button-revoke-${grant.id}`}>
                  <Ban className="w-3 h-3 mr-1" />
                  Revoke
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Revoke Access Grant</DialogTitle>
                  <DialogDescription>
                    This will immediately terminate access for {grant.grantedToEmail}. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label>Reason (optional)</Label>
                  <Textarea
                    placeholder="Why is this access being revoked?"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    rows={2}
                    data-testid="input-revoke-reason"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowRevokeDialog(false)}>Cancel</Button>
                  <Button 
                    variant="destructive" 
                    onClick={() => revokeMutation.mutate()}
                    disabled={revokeMutation.isPending}
                    data-testid="button-confirm-revoke"
                  >
                    {revokeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Revoke Access
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {showToken && (
          <div className="mt-2 p-2 bg-muted rounded flex items-center gap-2">
            <code className="text-xs flex-1 overflow-hidden text-ellipsis">{grant.accessToken}</code>
            <Button variant="ghost" size="sm" onClick={copyToken} data-testid={`button-copy-token-${grant.id}`}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AccessLogsTab() {
  const { data: logs = [], isLoading, refetch } = useQuery<ExternalAccessLog[]>({
    queryKey: ['/api/external-access/logs'],
  });

  const getStatusColor = (status: number | null) => {
    if (!status) return 'text-muted-foreground';
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Access Logs</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-logs">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>No access logs recorded yet</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            {logs.map((log) => (
              <div 
                key={log.id} 
                className="flex items-center gap-4 p-3 border rounded text-sm"
                data-testid={`log-entry-${log.id}`}
              >
                <div className={`font-mono ${getStatusColor(log.responseStatus)}`}>
                  {log.responseStatus || '---'}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{log.accessedResource}</div>
                  {log.resourceScope && (
                    <div className="text-xs text-muted-foreground">{log.resourceScope}</div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {log.requestMethod} {log.requestPath}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(log.occurredAt)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export default function ExternalAccess() {
  const [showExpired, setShowExpired] = useState(false);
  
  const { data: grants = [], isLoading, refetch } = useQuery<ExternalAccessGrant[]>({
    queryKey: ['/api/external-access/grants', { includeExpired: showExpired }],
  });

  const activeGrants = grants.filter(g => g.isActive && new Date(g.expiresAt) > new Date());
  const inactiveGrants = grants.filter(g => !g.isActive || new Date(g.expiresAt) <= new Date());

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6" />
            External Access Management
          </h1>
          <p className="text-muted-foreground">
            Manage controlled read-only access for carriers and brokers
          </p>
        </div>
        <CreateGrantDialog onSuccess={() => refetch()} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Grants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="stat-active-grants">
              {activeGrants.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Carrier Access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-carrier-grants">
              {activeGrants.filter(g => g.role === 'carrier_viewer').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Broker Access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-broker-grants">
              {activeGrants.filter(g => g.role === 'broker_viewer').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Expired/Revoked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground" data-testid="stat-inactive-grants">
              {inactiveGrants.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="grants">
        <TabsList>
          <TabsTrigger value="grants" data-testid="tab-grants">
            <Key className="w-4 h-4 mr-2" />
            Access Grants
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs">
            <Activity className="w-4 h-4 mr-2" />
            Access Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grants" className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox 
              id="show-expired" 
              checked={showExpired}
              onCheckedChange={(checked) => setShowExpired(!!checked)}
              data-testid="checkbox-show-expired"
            />
            <Label htmlFor="show-expired" className="text-sm cursor-pointer">
              Show expired/revoked grants
            </Label>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : grants.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Key className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No access grants created yet</p>
                <p className="text-sm">Create a grant to provide controlled access to external users</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {grants.map((grant) => (
                <GrantCard key={grant.id} grant={grant} onRevoke={() => refetch()} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs">
          <AccessLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
