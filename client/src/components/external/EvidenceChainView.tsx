import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowLeft, 
  Shield, 
  Link2,
  Search,
  AlertCircle,
  Clock,
  CheckCircle2,
  Camera,
  FileText,
  AlertTriangle,
  MapPin,
  Eye
} from "lucide-react";

type GrantInfo = {
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

type EvidenceEntry = {
  id: string;
  entryType: "ledger" | "proof" | "media" | "incident";
  timestamp: string;
  description: string;
  actor: string;
  metadata: Record<string, any>;
};

type EvidenceChain = {
  claimId: string;
  moveId: string;
  chainStartedAt: string;
  chainEndedAt: string;
  entryCount: number;
  entries: EvidenceEntry[];
};

interface EvidenceChainViewProps {
  token: string;
  grantInfo: GrantInfo;
  onBack: () => void;
  onLogout: () => void;
}

export default function EvidenceChainView({ token, grantInfo, onBack, onLogout }: EvidenceChainViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<EvidenceChain | null>(null);
  const [claimIdInput, setClaimIdInput] = useState(grantInfo.claimRestriction || "");

  async function fetchEvidenceChain(claimId: string) {
    if (!claimId.trim()) {
      setError("Please enter a claim ID");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/external/evidence-chain/${claimId}`, {
        headers: {
          "x-access-token": token,
        },
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to fetch evidence chain");
      }
      
      const data = await response.json();
      setChain(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch evidence chain");
      setChain(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (grantInfo.claimRestriction) {
      fetchEvidenceChain(grantInfo.claimRestriction);
    }
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchEvidenceChain(claimIdInput);
  }

  function formatTimestamp(ts: string): string {
    return new Date(ts).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function getEntryIcon(type: string) {
    switch (type) {
      case "ledger":
        return <FileText className="h-4 w-4" />;
      case "proof":
        return <CheckCircle2 className="h-4 w-4" />;
      case "media":
        return <Camera className="h-4 w-4" />;
      case "incident":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  }

  function getEntryColor(type: string): string {
    switch (type) {
      case "ledger":
        return "bg-blue-500/10 text-blue-500";
      case "proof":
        return "bg-green-500/10 text-green-500";
      case "media":
        return "bg-purple-500/10 text-purple-500";
      case "incident":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Evidence Chain Viewer</h1>
                <p className="text-sm text-muted-foreground">Read-only external access</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{grantInfo.granteeName}</p>
              <p className="text-xs text-muted-foreground">{grantInfo.granteeOrganization}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout} data-testid="button-logout">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Evidence Chain of Custody</h2>
          <p className="text-muted-foreground">
            Immutable chronological record of all evidence related to a claim
          </p>
        </div>

        {!grantInfo.claimRestriction && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Claim
              </CardTitle>
              <CardDescription>
                Enter a claim ID to view its evidence chain
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="claimId" className="sr-only">Claim ID</Label>
                  <Input
                    id="claimId"
                    placeholder="Enter claim ID"
                    value={claimIdInput}
                    onChange={(e) => setClaimIdInput(e.target.value)}
                    data-testid="input-claim-id"
                  />
                </div>
                <Button type="submit" disabled={isLoading} data-testid="button-search">
                  {isLoading ? "Searching..." : "View Chain"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription data-testid="text-error">{error}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {chain && !isLoading && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-purple-500" />
                      Claim #{chain.claimId}
                    </CardTitle>
                    <CardDescription>Move ID: {chain.moveId}</CardDescription>
                  </div>
                  <Badge variant="secondary" data-testid="badge-entry-count">
                    {chain.entryCount} entries
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      <span className="text-muted-foreground">Chain Started:</span>{" "}
                      <span className="font-medium" data-testid="text-chain-start">
                        {formatTimestamp(chain.chainStartedAt)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      <span className="text-muted-foreground">Chain Ended:</span>{" "}
                      <span className="font-medium" data-testid="text-chain-end">
                        {formatTimestamp(chain.chainEndedAt)}
                      </span>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evidence Timeline</CardTitle>
                <CardDescription>
                  Chronological record of all evidence in the chain of custody
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-4">
                  <div className="relative space-y-0">
                    <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />
                    
                    {chain.entries.map((entry, index) => (
                      <div key={entry.id} className="relative flex gap-4 pb-6">
                        <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${getEntryColor(entry.entryType)}`}>
                          {getEntryIcon(entry.entryType)}
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium" data-testid={`text-entry-${index}-description`}>
                                {entry.description}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {entry.actor} • {formatTimestamp(entry.timestamp)}
                              </p>
                            </div>
                            <Badge variant="outline" className="shrink-0">
                              {entry.entryType}
                            </Badge>
                          </div>
                          
                          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                            <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
                              <div className="grid gap-1">
                                {Object.entries(entry.metadata).slice(0, 4).map(([key, value]) => (
                                  <div key={key} className="flex gap-2">
                                    <span className="text-muted-foreground">{key}:</span>
                                    <span className="font-medium">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Chain of Custody Notice</AlertTitle>
              <AlertDescription>
                This evidence chain is immutable and read-only. All entries are timestamped and 
                cannot be modified. Actor identities have been anonymized for privacy compliance.
              </AlertDescription>
            </Alert>

            <div className="text-center text-sm text-muted-foreground">
              <p>Report generated for {grantInfo.granteeOrganization}</p>
              <p>Grant ID: {grantInfo.grantId}</p>
            </div>
          </div>
        )}

        {!chain && !isLoading && !error && !grantInfo.claimRestriction && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">No Claim Selected</h3>
              <p className="text-sm text-muted-foreground text-center">
                Enter a claim ID above to view its evidence chain of custody
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
