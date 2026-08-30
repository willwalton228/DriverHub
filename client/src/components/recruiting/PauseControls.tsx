import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PauseCircle, PlayCircle, AlertTriangle, Building2, Briefcase, Loader2 } from "lucide-react";

interface MarketPauseStatus {
  market: string;
  isPaused: boolean;
  pausedAt?: string;
  pausedBy?: string;
  reason?: string;
}

interface PauseControlsProps {
  isAdmin: boolean;
}

export function PauseStatusBanner() {
  const { data: marketPauses, isLoading } = useQuery<MarketPauseStatus[]>({
    queryKey: ['/api/recruiting/pause/markets'],
  });

  const pausedMarkets = marketPauses?.filter(m => m.isPaused) || [];

  if (isLoading || pausedMarkets.length === 0) {
    return null;
  }

  return (
    <Alert className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800 mb-4" data-testid="alert-hiring-freeze">
      <AlertTriangle className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="text-yellow-800 dark:text-yellow-200">Hiring Freeze Active</AlertTitle>
      <AlertDescription className="text-yellow-700 dark:text-yellow-300">
        The following markets have paused recruiting: {pausedMarkets.map(m => m.market).join(', ')}.
        New applications are blocked in these markets.
      </AlertDescription>
    </Alert>
  );
}

export function MarketPauseControls({ isAdmin }: PauseControlsProps) {
  const { toast } = useToast();
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState("");

  const { data: marketPauses, isLoading } = useQuery<MarketPauseStatus[]>({
    queryKey: ['/api/recruiting/pause/markets'],
    enabled: isAdmin,
  });

  const pauseMarketMutation = useMutation({
    mutationFn: async ({ market, reason }: { market: string; reason: string }) => {
      return apiRequest("POST", `/api/recruiting/pause/market/${encodeURIComponent(market)}`, { reason });
    },
    onSuccess: () => {
      toast({ title: "Market paused", description: "Recruiting has been paused for this market." });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/pause/markets'] });
      setPauseDialogOpen(false);
      setPauseReason("");
      setSelectedMarket(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to pause market.", variant: "destructive" });
    }
  });

  const resumeMarketMutation = useMutation({
    mutationFn: async (market: string) => {
      return apiRequest("POST", `/api/recruiting/resume/market/${encodeURIComponent(market)}`, {});
    },
    onSuccess: () => {
      toast({ title: "Market resumed", description: "Recruiting has been resumed for this market." });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/pause/markets'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resume market.", variant: "destructive" });
    }
  });

  if (!isAdmin) return null;

  const markets = marketPauses || [];

  return (
    <Card data-testid="card-market-pause-controls">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Market Pause Controls
        </CardTitle>
        <CardDescription>Pause recruiting by market (hiring freeze)</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : markets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No markets configured.</p>
        ) : (
          <div className="space-y-3">
            {markets.map((market) => (
              <div 
                key={market.market} 
                className="flex items-center justify-between p-3 border rounded-lg"
                data-testid={`market-pause-row-${market.market}`}
              >
                <div className="flex items-center gap-3">
                  <Badge 
                    variant={market.isPaused ? "destructive" : "secondary"}
                    data-testid={`badge-market-status-${market.market}`}
                  >
                    {market.isPaused ? (
                      <><PauseCircle className="h-3 w-3 mr-1" /> Paused</>
                    ) : (
                      <><PlayCircle className="h-3 w-3 mr-1" /> Active</>
                    )}
                  </Badge>
                  <span className="font-medium">{market.market}</span>
                  {market.isPaused && market.reason && (
                    <span className="text-sm text-muted-foreground">- {market.reason}</span>
                  )}
                </div>
                <div>
                  {market.isPaused ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resumeMarketMutation.mutate(market.market)}
                      disabled={resumeMarketMutation.isPending}
                      data-testid={`button-resume-market-${market.market}`}
                    >
                      {resumeMarketMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><PlayCircle className="h-4 w-4 mr-1" /> Resume</>
                      )}
                    </Button>
                  ) : (
                    <Dialog open={pauseDialogOpen && selectedMarket === market.market} onOpenChange={(open) => {
                      setPauseDialogOpen(open);
                      if (!open) {
                        setSelectedMarket(null);
                        setPauseReason("");
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedMarket(market.market)}
                          data-testid={`button-pause-market-${market.market}`}
                        >
                          <PauseCircle className="h-4 w-4 mr-1" /> Pause
                        </Button>
                      </DialogTrigger>
                      <DialogContent data-testid="dialog-pause-market">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                            Pause Market: {market.market}
                          </DialogTitle>
                          <DialogDescription>
                            This will block new applications in this market. Existing applications will not be affected.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <Label htmlFor="pause-reason">Reason (optional)</Label>
                          <Input
                            id="pause-reason"
                            placeholder="e.g., Hiring freeze due to budget constraints"
                            value={pauseReason}
                            onChange={(e) => setPauseReason(e.target.value)}
                            data-testid="input-pause-reason"
                          />
                        </div>
                        <DialogFooter>
                          <Button 
                            variant="outline" 
                            onClick={() => setPauseDialogOpen(false)}
                            data-testid="button-cancel-pause"
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => pauseMarketMutation.mutate({ market: market.market, reason: pauseReason })}
                            disabled={pauseMarketMutation.isPending}
                            data-testid="button-confirm-pause"
                          >
                            {pauseMarketMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <PauseCircle className="h-4 w-4 mr-1" />
                            )}
                            Pause Market
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RequisitionPauseButtonProps {
  requisitionId: string;
  isPaused: boolean;
  pauseReason?: string;
  isAdmin: boolean;
}

export function RequisitionPauseButton({ requisitionId, isPaused, pauseReason, isAdmin }: RequisitionPauseButtonProps) {
  const { toast } = useToast();
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [reason, setReason] = useState("");

  const pauseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest("POST", `/api/recruiting/pause/requisition/${id}`, { reason });
    },
    onSuccess: () => {
      toast({ title: "Requisition paused", description: "No new applications will be accepted." });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/recruiting/requisitions'] });
      setPauseDialogOpen(false);
      setReason("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to pause requisition.", variant: "destructive" });
    }
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/recruiting/resume/requisition/${id}`, {});
    },
    onSuccess: () => {
      toast({ title: "Requisition resumed", description: "Applications are now accepted." });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/recruiting/requisitions'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resume requisition.", variant: "destructive" });
    }
  });

  if (!isAdmin) {
    if (isPaused) {
      return (
        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
          <PauseCircle className="h-3 w-3 mr-1" />
          Paused
        </Badge>
      );
    }
    return null;
  }

  if (isPaused) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => resumeMutation.mutate(requisitionId)}
        disabled={resumeMutation.isPending}
        data-testid={`button-resume-requisition-${requisitionId}`}
      >
        {resumeMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <><PlayCircle className="h-4 w-4 mr-1" /> Resume</>
        )}
      </Button>
    );
  }

  return (
    <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          data-testid={`button-pause-requisition-${requisitionId}`}
        >
          <PauseCircle className="h-4 w-4 mr-1" /> Pause
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-pause-requisition">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Pause Requisition
          </DialogTitle>
          <DialogDescription>
            This will block new applications for this position. Existing applications will not be affected.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="req-pause-reason">Reason (optional)</Label>
          <Input
            id="req-pause-reason"
            placeholder="e.g., Position filled, reviewing candidates"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="input-requisition-pause-reason"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPauseDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => pauseMutation.mutate({ id: requisitionId, reason })}
            disabled={pauseMutation.isPending}
            data-testid="button-confirm-pause-requisition"
          >
            {pauseMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <PauseCircle className="h-4 w-4 mr-1" />
            )}
            Pause
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SlaEscalationsPanel({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();

  const { data: escalations, isLoading } = useQuery<any[]>({
    queryKey: ['/api/recruiting/sla/escalations'],
    enabled: isAdmin,
  });

  const acknowledgeEscalation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/recruiting/sla/escalations/${id}/acknowledge`, {});
    },
    onSuccess: () => {
      toast({ title: "Escalation acknowledged" });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/sla/escalations'] });
    },
  });

  if (!isAdmin || isLoading) return null;

  const activeEscalations = escalations?.filter(e => e.status !== 'resolved') || [];

  if (activeEscalations.length === 0) return null;

  return (
    <Alert className="border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 mb-4" data-testid="alert-sla-escalations">
      <AlertTriangle className="h-4 w-4 text-red-600" />
      <AlertTitle className="text-red-800 dark:text-red-200">SLA Escalations ({activeEscalations.length})</AlertTitle>
      <AlertDescription className="text-red-700 dark:text-red-300">
        <div className="mt-2 space-y-2">
          {activeEscalations.slice(0, 3).map((esc) => (
            <div key={esc.id} className="flex items-center justify-between text-sm">
              <span>Application {esc.applicationId?.substring(0, 8)}... - Level {esc.escalationLevel}</span>
              {esc.status === 'pending' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => acknowledgeEscalation.mutate(esc.id)}
                  disabled={acknowledgeEscalation.isPending}
                  data-testid={`button-ack-escalation-${esc.id}`}
                >
                  Acknowledge
                </Button>
              )}
            </div>
          ))}
          {activeEscalations.length > 3 && (
            <p className="text-xs">...and {activeEscalations.length - 3} more</p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
