import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, 
  FileBarChart, 
  Link2, 
  Calendar, 
  Building2, 
  User,
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  Clock
} from "lucide-react";
import RISPSummaryView from "@/components/external/RISPSummaryView";
import EvidenceChainView from "@/components/external/EvidenceChainView";

type GrantValidation = {
  valid: boolean;
  grantId: string;
  granteeEmail: string;
  granteeName: string;
  granteeOrganization: string;
  role: string;
  scopes: string[];
  expiresAt: string;
  customerRestriction: string | null;
  claimRestriction: string | null;
};

type ActiveView = "home" | "risp_summary" | "evidence_chain";

export default function ExternalPortal() {
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [grantInfo, setGrantInfo] = useState<GrantValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("home");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get("token");
    if (tokenParam) {
      setTokenInput(tokenParam);
      validateToken(tokenParam);
    }
  }, []);

  async function validateToken(accessToken: string) {
    setIsValidating(true);
    setError(null);
    try {
      const response = await fetch("/api/external/validate", {
        headers: {
          "x-access-token": accessToken,
        },
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Invalid token");
      }
      
      const data = await response.json();
      setGrantInfo(data);
      setToken(accessToken);
      toast({
        title: "Access Granted",
        description: `Welcome, ${data.granteeName}`,
      });
    } catch (err: any) {
      setError(err.message || "Failed to validate token");
      setGrantInfo(null);
      setToken("");
    } finally {
      setIsValidating(false);
    }
  }

  function handleSubmitToken(e: React.FormEvent) {
    e.preventDefault();
    if (tokenInput.trim()) {
      validateToken(tokenInput.trim());
    }
  }

  function handleLogout() {
    setToken("");
    setTokenInput("");
    setGrantInfo(null);
    setActiveView("home");
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  }

  function getScopeLabel(scope: string): string {
    const labels: Record<string, string> = {
      risp_summary: "RISP Insurance Summary",
      evidence_chain: "Evidence Chain Viewer",
      claims_metrics: "Claims Metrics",
      carrier_metrics: "Carrier Metrics Dashboard",
    };
    return labels[scope] || scope;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle data-testid="text-portal-title">DriverHub 360 External Portal</CardTitle>
            <CardDescription>
              Enter your access token to view authorized reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitToken} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">Access Token</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="Enter your access token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  data-testid="input-access-token"
                />
              </div>
              
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Access Denied</AlertTitle>
                  <AlertDescription data-testid="text-error-message">{error}</AlertDescription>
                </Alert>
              )}
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isValidating || !tokenInput.trim()}
                data-testid="button-submit-token"
              >
                {isValidating ? "Validating..." : "Access Portal"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeView === "risp_summary" && grantInfo) {
    return (
      <RISPSummaryView 
        token={token} 
        grantInfo={grantInfo}
        onBack={() => setActiveView("home")}
        onLogout={handleLogout}
      />
    );
  }

  if (activeView === "evidence_chain" && grantInfo) {
    return (
      <EvidenceChainView 
        token={token} 
        grantInfo={grantInfo}
        onBack={() => setActiveView("home")}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold" data-testid="text-header-title">DriverHub 360</h1>
              <p className="text-sm text-muted-foreground">External Access Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium" data-testid="text-grantee-name">{grantInfo?.granteeName}</p>
              <p className="text-xs text-muted-foreground">{grantInfo?.granteeOrganization}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Welcome, {grantInfo?.granteeName}</h2>
          <p className="text-muted-foreground">
            You have read-only access to the reports listed below. All access is logged for security purposes.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Access Role</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary" data-testid="badge-role">
                {grantInfo?.role === "carrier_viewer" ? "Carrier Viewer" : "Broker Viewer"}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Access Expires</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium" data-testid="text-expires-at">
                {grantInfo ? formatDate(grantInfo.expiresAt) : "-"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Organization</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium" data-testid="text-organization">
                {grantInfo?.granteeOrganization || "-"}
              </p>
            </CardContent>
          </Card>
        </div>

        {grantInfo?.customerRestriction && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Restriction</AlertTitle>
            <AlertDescription>
              Your access is limited to customer ID: {grantInfo.customerRestriction}
            </AlertDescription>
          </Alert>
        )}

        {grantInfo?.claimRestriction && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Restriction</AlertTitle>
            <AlertDescription>
              Your access is limited to claim ID: {grantInfo.claimRestriction}
            </AlertDescription>
          </Alert>
        )}

        <h3 className="text-lg font-semibold mb-4">Available Reports</h3>
        
        <div className="grid gap-4 md:grid-cols-2">
          {grantInfo?.scopes?.includes("risp_summary") && (
            <Card className="hover-elevate cursor-pointer" onClick={() => setActiveView("risp_summary")}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                      <FileBarChart className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">RISP Insurance Summary</CardTitle>
                      <CardDescription>Carrier-ready risk metrics and analytics</CardDescription>
                    </div>
                  </div>
                  <Eye className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>No driver-identifiable data exposed</span>
                </div>
              </CardContent>
            </Card>
          )}

          {grantInfo?.scopes?.includes("evidence_chain") && (
            <Card className="hover-elevate cursor-pointer" onClick={() => setActiveView("evidence_chain")}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                      <Link2 className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Evidence Chain Viewer</CardTitle>
                      <CardDescription>Immutable chain of custody for claims</CardDescription>
                    </div>
                  </div>
                  <Eye className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Chronological timeline with timestamps</span>
                </div>
              </CardContent>
            </Card>
          )}

          {grantInfo?.scopes?.includes("claims_metrics") && (
            <Card className="opacity-60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                      <FileBarChart className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Claims Metrics</CardTitle>
                      <CardDescription>Aggregated claims performance data</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline">Coming Soon</Badge>
                </div>
              </CardHeader>
            </Card>
          )}

          {grantInfo?.scopes?.includes("carrier_metrics") && (
            <Card className="opacity-60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                      <Building2 className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Carrier Metrics Dashboard</CardTitle>
                      <CardDescription>Insurance-grade underwriting metrics</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline">Coming Soon</Badge>
                </div>
              </CardHeader>
            </Card>
          )}
        </div>

        {(grantInfo?.scopes?.length ?? 0) === 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Access</AlertTitle>
            <AlertDescription>
              You do not have access to any reports. Please contact your administrator.
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>All access is logged and monitored for security purposes.</p>
          <p className="mt-1">Grant ID: {grantInfo?.grantId}</p>
        </div>
      </main>
    </div>
  );
}
