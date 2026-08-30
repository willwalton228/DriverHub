import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileCheck, 
  Shield, 
  ShieldAlert, 
  History,
  RefreshCw,
  FileText,
  MessageSquare,
  Mail,
  Scale,
  Building,
  AlertTriangle,
  RotateCcw
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ConsentHistoryViewProps {
  candidateId: string;
  candidateName: string;
  applicationId?: string;
}

interface Consent {
  id: string;
  candidateId: string;
  applicationId: string | null;
  consentType: string;
  version: string;
  accepted: boolean;
  source: string;
  acceptedAt: string;
  witnessedBy: string | null;
  verificationMethod: string | null;
  textHash: string | null;
  stateCode: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
  isExpired?: boolean;
  expiresAt?: string | null;
  expirationDays?: number | null;
}

interface ConsentSummary {
  candidateId: string;
  summary: Record<string, {
    latestConsent: Consent | null;
    hasActiveConsent: boolean;
    totalRecords: number;
    versions: string[];
  }>;
  totalConsents: number;
  lastUpdated: string | null;
}

const consentTypeLabels: Record<string, { label: string; icon: any; description: string }> = {
  sms_opt_in: { label: "SMS Communication", icon: MessageSquare, description: "Consent to receive SMS messages" },
  email_opt_in: { label: "Email Communication", icon: Mail, description: "Consent to receive email communications" },
  background_check_authorization: { label: "Background Check", icon: Shield, description: "Authorization to conduct background checks" },
  drug_test_consent: { label: "Drug Test", icon: ShieldAlert, description: "Consent for drug testing" },
  mvr_check_consent: { label: "MVR Check", icon: FileCheck, description: "Motor vehicle record authorization" },
  disclosure_ny_article_23a: { label: "NY Article 23-A Disclosure", icon: Building, description: "New York State criminal history disclosure" },
  disclosure_ca_icraa: { label: "CA ICRAA Disclosure", icon: Building, description: "California Investigative Consumer Reporting Agencies Act disclosure" },
  disclosure_general: { label: "General Disclosure", icon: FileText, description: "General disclosure acknowledgment" },
  privacy_policy: { label: "Privacy Policy", icon: Shield, description: "Privacy policy acceptance" },
  terms_of_service: { label: "Terms of Service", icon: FileText, description: "Terms of service acceptance" },
  arbitration_agreement: { label: "Arbitration Agreement", icon: Scale, description: "Agreement to arbitration clause" },
  at_will_employment: { label: "At-Will Employment", icon: FileCheck, description: "Acknowledgment of at-will employment" },
};

const sourceLabels: Record<string, string> = {
  candidate_portal: "Candidate Portal",
  application_form: "Application Form",
  sms_reply: "SMS Reply",
  email_link: "Email Link",
  in_person: "In Person",
  phone: "Phone",
  recruiter_entry: "Recruiter Entry",
  api: "API",
  system: "System",
};

function ExpirationBadge({ consent }: { consent: Consent }) {
  if (!consent.accepted || consent.revokedAt) return null;

  if (consent.isExpired) {
    return (
      <Badge variant="destructive" className="text-xs" data-testid={`badge-expired-${consent.id}`}>
        <AlertTriangle className="h-3 w-3 mr-1" />
        Expired
      </Badge>
    );
  }

  if (consent.expiresAt) {
    const expiresDate = new Date(consent.expiresAt);
    const now = new Date();
    const daysUntil = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 30) {
      return (
        <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700" data-testid={`badge-expiring-soon-${consent.id}`}>
          <Clock className="h-3 w-3 mr-1" />
          Expires in {daysUntil}d
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="text-xs" data-testid={`badge-expires-${consent.id}`}>
        Expires {format(expiresDate, "MMM d, yyyy")}
      </Badge>
    );
  }

  return null;
}

export function ConsentHistoryView({ candidateId, candidateName }: ConsentHistoryViewProps) {
  const { toast } = useToast();

  const { data: summary, isLoading: loadingSummary } = useQuery<ConsentSummary>({
    queryKey: ["/api/recruiting/candidates", candidateId, "consents/summary"],
    enabled: !!candidateId,
  });

  const { data: consentsWithExpiration, isLoading: loadingConsents } = useQuery<Consent[]>({
    queryKey: ["/api/recruiting/candidates", candidateId, "consents/with-expiration"],
    enabled: !!candidateId,
  });

  const reconfirmMutation = useMutation({
    mutationFn: async (consentType: string) => {
      await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/consent-reconfirmation`, { consentType });
    },
    onSuccess: () => {
      toast({ title: "Reconfirmation requested", description: "A reconfirmation request has been logged." });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "consents/with-expiration"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "consents/summary"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to request reconfirmation.", variant: "destructive" });
    },
  });

  const recordReconfirmMutation = useMutation({
    mutationFn: async (consentType: string) => {
      return apiRequest("POST", `/api/recruiting/candidates/${candidateId}/consent-reconfirm`, { consentType, source: "recruiter_entry" });
    },
    onSuccess: () => {
      toast({ title: "Consent reconfirmed", description: "A new consent record has been created." });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "consents/with-expiration"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "consents/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "consents"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record reconfirmation.", variant: "destructive" });
    },
  });

  const activeConsentsCount = summary ? Object.values(summary.summary).filter(s => s.hasActiveConsent).length : 0;
  const totalConsentTypes = Object.keys(consentTypeLabels).length;
  const expiredCount = consentsWithExpiration?.filter(c => c.isExpired && c.accepted && !c.revokedAt).length ?? 0;

  return (
    <Card className="w-full" data-testid="consent-history-card">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Consent & Disclosure Ledger
          </CardTitle>
          <CardDescription>
            Immutable record of consents for {candidateName}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {expiredCount > 0 && (
            <Badge variant="destructive" data-testid="badge-expired-count">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {expiredCount} Expired
            </Badge>
          )}
          <Badge variant="outline" data-testid="badge-consent-count">
            {activeConsentsCount}/{totalConsentTypes} Active
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-2" data-testid="consent-tabs">
            <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">Full History</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            {loadingSummary ? (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(consentTypeLabels).map(([type, config]) => {
                  const ConsentIcon = config.icon;
                  const consentData = summary?.summary[type];
                  const hasConsent = consentData?.hasActiveConsent;
                  const latestConsent = consentData?.latestConsent;
                  const matchingExpConsent = consentsWithExpiration?.find(
                    c => c.consentType === type && c.accepted && !c.revokedAt
                  );
                  const isExpired = matchingExpConsent?.isExpired ?? false;

                  return (
                    <div
                      key={type}
                      className={`p-3 rounded-lg border ${
                        isExpired
                          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                          : hasConsent 
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                            : "bg-muted/50 border-border"
                      }`}
                      data-testid={`consent-card-${type}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ConsentIcon className={`h-4 w-4 ${
                            isExpired
                              ? "text-red-600 dark:text-red-400"
                              : hasConsent ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                          }`} />
                          <span className="font-medium text-sm">{config.label}</span>
                        </div>
                        {isExpired ? (
                          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        ) : hasConsent ? (
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      {latestConsent && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {isExpired ? (
                            <span className="text-red-600 dark:text-red-400">Expired</span>
                          ) : hasConsent ? (
                            <span>v{latestConsent.version} - {format(new Date(latestConsent.acceptedAt), "MMM d, yyyy")}</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">Revoked</span>
                          )}
                        </div>
                      )}
                      {matchingExpConsent?.expiresAt && !isExpired && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Expires {formatDistanceToNow(new Date(matchingExpConsent.expiresAt), { addSuffix: true })}
                        </div>
                      )}
                      {!latestConsent && (
                        <div className="mt-2 text-xs text-muted-foreground">Not collected</div>
                      )}
                      {latestConsent?.stateCode && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {latestConsent.stateCode}
                        </Badge>
                      )}
                      {isExpired && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => reconfirmMutation.mutate(type)}
                          disabled={reconfirmMutation.isPending}
                          data-testid={`button-reconfirm-${type}`}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Request Reconfirmation
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {loadingConsents ? (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : consentsWithExpiration && consentsWithExpiration.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {consentsWithExpiration.map((consent) => {
                    const typeConfig = consentTypeLabels[consent.consentType] || { label: consent.consentType, icon: FileCheck };
                    const ConsentIcon = typeConfig.icon;
                    const isActive = consent.accepted && !consent.revokedAt && !consent.isExpired;
                    
                    return (
                      <div
                        key={consent.id}
                        className="flex items-start gap-3 p-3 rounded-lg border"
                        data-testid={`consent-history-item-${consent.id}`}
                      >
                        <div className={`p-2 rounded-full ${
                          consent.isExpired 
                            ? "bg-red-100 dark:bg-red-900"
                            : isActive 
                              ? "bg-green-100 dark:bg-green-900" 
                              : "bg-red-100 dark:bg-red-900"
                        }`}>
                          {consent.isExpired ? (
                            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          ) : isActive ? (
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <ConsentIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{typeConfig.label}</span>
                            <Badge variant="secondary" className="text-xs">
                              v{consent.version}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {sourceLabels[consent.source] || consent.source}
                            </Badge>
                            <ExpirationBadge consent={consent} />
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {consent.isExpired 
                              ? "Consent expired" 
                              : isActive 
                                ? "Consent given" 
                                : consent.revokedAt 
                                  ? "Consent revoked" 
                                  : "Consent declined"}
                            {consent.revocationReason && (
                              <span className="ml-2 text-amber-600 dark:text-amber-400">
                                Reason: {consent.revocationReason}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(consent.acceptedAt), "MMM d, yyyy 'at' h:mm a")}
                            </div>
                            {consent.stateCode && (
                              <Badge variant="outline" className="text-xs">
                                {consent.stateCode}
                              </Badge>
                            )}
                            {consent.verificationMethod && (
                              <Badge variant="secondary" className="text-xs">
                                {consent.verificationMethod}
                              </Badge>
                            )}
                          </div>
                          {consent.textHash && (
                            <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                              Hash: {consent.textHash.substring(0, 16)}...
                            </div>
                          )}
                          {consent.isExpired && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => reconfirmMutation.mutate(consent.consentType)}
                                disabled={reconfirmMutation.isPending}
                                data-testid={`button-request-reconfirm-${consent.id}`}
                              >
                                <Mail className="h-3 w-3 mr-1" />
                                Request
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => recordReconfirmMutation.mutate(consent.consentType)}
                                disabled={recordReconfirmMutation.isPending}
                                data-testid={`button-record-reconfirm-${consent.id}`}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Record Reconfirmation
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <History className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No consent records found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Consents are captured during the application process
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
