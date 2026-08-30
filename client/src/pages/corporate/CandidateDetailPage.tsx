import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AlertCircle, ArrowLeft, Building2, Clock3, FileText, History, Loader2, MapPin, RefreshCw, Save, UserRound } from "lucide-react";
import { apiRequest, ApiRequestError } from "@/lib/queryClient";
import { MARKET_VALUES } from "@shared/schema";
import { RecordDetailLayout } from "@/components/RecordDetailLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone, formatPhoneInput } from "@/lib/phone";

type Application = {
  id: string;
  currentStage: string;
  appliedAt: string | null;
  disposition: string | null;
  requisition?: { id: string; title: string; market: string; sourceRequestId?: string | null } | null;
  owner?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
};

type Candidate = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  dateOfBirth: string | null;
  currentEmployer: string | null;
  yearsExperience: number | null;
  hasCommercialLicense: boolean | null;
  licenseClass: string | null;
  licenseState: string | null;
  preferredMarkets: string[] | null;
  source: string | null;
  sourceDetails: string | null;
  endorsements: string[] | null;
  notes: string | null;
  driverId: string | null;
  canEdit: boolean;
  status: string | null;
  createdAt: string;
  updatedAt: string;
  applications: Application[];
};

type HistoryEvent = {
  id: string;
  actionType: string;
  occurredAt: string;
  userEmail: string | null;
  changedFields: string[] | null;
};
type HistoryResponse = { events: HistoryEvent[]; total: number };

function date(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

function titleCase(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()) : "—";
}

function candidateDisplayName(candidate: Candidate) {
  return [candidate.firstName, candidate.middleName, candidate.lastName].filter(Boolean).join(" ");
}

function DetailLoading() {
  return <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6" data-testid="candidate-detail-loading">
    <Skeleton className="h-20 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-80 w-full" />
  </main>;
}

export default function CandidateDetailPage() {
  const [, params] = useRoute("/recruiting/candidates/:id");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const candidateId = params?.id ?? "";
  const [editMode, setEditMode] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  const candidateQuery = useQuery<Candidate>({
    queryKey: ["/api/recruiting/candidates", candidateId],
    queryFn: async () => (await apiRequest("GET", `/api/recruiting/candidates/${candidateId}`)).json(),
    enabled: !!candidateId,
    retry: false,
  });
  const historyQuery = useQuery<HistoryResponse>({
    queryKey: ["/api/recruiting/candidates", candidateId, "history"],
    queryFn: async () => (await apiRequest("GET", `/api/recruiting/candidates/${candidateId}/history`)).json(),
    enabled: !!candidateId,
    retry: false,
  });

  const candidate = candidateQuery.data;
  const [draft, setDraft] = useState<Partial<Candidate>>({});
  useEffect(() => {
    if (candidate) setDraft(candidate);
  }, [candidate]);

  const updateCandidate = useMutation({
    mutationFn: async (payload: Partial<Candidate>) => {
      const response = await apiRequest("PATCH", `/api/recruiting/candidates/${candidateId}`, payload);
      return response.json() as Promise<Candidate>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "history"] });
      setEditMode(false);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError && error.code === "DUPLICATE_CANDIDATE") {
        const existing = (error as any).existingCandidate;
        setDuplicate({ id: existing?.id, name: [existing?.firstName, existing?.lastName].filter(Boolean).join(" ") || "Existing candidate" });
      }
    },
  });

  const save = () => {
    updateCandidate.mutate({
      firstName: draft.firstName?.trim(),
      middleName: draft.middleName?.trim() || null,
      lastName: draft.lastName?.trim(),
      email: draft.email?.trim(),
      phone: draft.phone?.trim() || null,
      address: draft.address?.trim() || null,
      addressLine2: draft.addressLine2?.trim() || null,
      city: draft.city?.trim() || null,
      state: draft.state?.trim().toUpperCase() || null,
      zipCode: draft.zipCode?.trim() || null,
      dateOfBirth: draft.dateOfBirth || null,
      currentEmployer: draft.currentEmployer?.trim() || null,
      yearsExperience: draft.yearsExperience === null || draft.yearsExperience === undefined ? null : Number(draft.yearsExperience),
      hasCommercialLicense: !!draft.hasCommercialLicense,
      licenseClass: draft.licenseClass?.trim() || null,
      licenseState: draft.licenseState?.trim().toUpperCase() || null,
      preferredMarkets: (draft.preferredMarkets || []).filter(Boolean),
      notes: draft.notes?.trim() || null,
       source: draft.source || null,
       sourceDetails: draft.source === "other" ? draft.sourceDetails?.trim() || null : null,
       endorsements: draft.endorsements?.length ? draft.endorsements : null,
    });
  };

  const recentHistory = useMemo(() => historyQuery.data?.events?.slice(0, 5) ?? [], [historyQuery.data]);
  if (candidateQuery.isLoading) return <DetailLoading />;
  if (candidateQuery.isError || !candidate) {
    const message = candidateQuery.error instanceof Error ? candidateQuery.error.message : "This Candidate could not be loaded.";
    return <main className="mx-auto max-w-4xl p-4 md:p-6">
      <Alert variant="destructive" data-testid="candidate-detail-error"><AlertCircle className="h-4 w-4" /><AlertTitle>Unable to load Candidate</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{message}</span><Button size="sm" variant="outline" onClick={() => candidateQuery.refetch()}><RefreshCw className="mr-1.5 h-4 w-4" />Retry</Button></AlertDescription>
      </Alert>
    </main>;
  }

  const rightPanel = <Card>
    <CardHeader className="pb-3"><CardTitle className="text-base">Activity</CardTitle><CardDescription>Candidate record history</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {historyQuery.isLoading ? <><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></> :
        recentHistory.length ? recentHistory.map(event => <div key={event.id} className="border-l-2 border-muted pl-3 text-sm">
          <p className="font-medium">{titleCase(event.actionType)}</p><p className="text-xs text-muted-foreground">{date(event.occurredAt)}{event.userEmail ? ` · ${event.userEmail}` : ""}</p>
        </div>) : <p className="text-sm text-muted-foreground">No history has been recorded yet.</p>}
    </CardContent>
  </Card>;

  return <main className="mx-auto max-w-7xl p-4 md:p-6" data-testid="candidate-detail-page">
    <RecordDetailLayout
      stickyHeader={<div className="sticky top-0 z-30 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/recruiting/candidates")} aria-label="Back to Candidates"><ArrowLeft className="h-4 w-4" /></Button>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-bold">{candidateDisplayName(candidate)}</h1><Badge variant="secondary">{titleCase(candidate.status)}</Badge></div><p className="truncate text-sm text-muted-foreground">{candidate.email}</p></div>
          </div>
          <div className="flex gap-2">
            {candidate.canEdit ? (editMode ? <><Button variant="outline" onClick={() => { setDraft(candidate); setEditMode(false); }}>Cancel</Button><Button disabled={updateCandidate.isPending || !draft.firstName?.trim() || !draft.lastName?.trim() || !draft.email?.trim()} onClick={save}>{updateCandidate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save changes</Button></> : <Button onClick={() => setEditMode(true)}>Edit Candidate</Button>) : null}
          </div>
        </div>
      </div>}
      summaryStrip={<div className="grid gap-3 sm:grid-cols-3">
        <QuickStat icon={<FileText className="h-4 w-4" />} label="Applications" value={String(candidate.applications.length)} />
        <QuickStat icon={<MapPin className="h-4 w-4" />} label="Markets" value={(candidate.preferredMarkets || []).join(", ") || "Not specified"} />
        <QuickStat icon={<Clock3 className="h-4 w-4" />} label={candidate.driverId ? "Driver relationship" : "Candidate since"} value={candidate.driverId ? "Linked for future activation" : date(candidate.createdAt)} />
      </div>}
      rightPanel={rightPanel}
    >
      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="applications">Applications ({candidate.applications.length})</TabsTrigger><TabsTrigger value="notes">Notes</TabsTrigger><TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          {updateCandidate.isError && !(updateCandidate.error instanceof ApiRequestError && updateCandidate.error.code === "DUPLICATE_CANDIDATE") && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{updateCandidate.error instanceof Error ? updateCandidate.error.message : "Unable to save changes."}</AlertDescription></Alert>}
          <Card><CardHeader><CardTitle>Contact and identity</CardTitle><CardDescription>Person-level information. Application workflow state is kept separately.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <EditField edit={editMode} label="First name" value={draft.firstName} onChange={value => setDraft({ ...draft, firstName: value })} required />
            <EditField edit={editMode} label="Middle name" value={draft.middleName} onChange={value => setDraft({ ...draft, middleName: value })} />
            <EditField edit={editMode} label="Last name" value={draft.lastName} onChange={value => setDraft({ ...draft, lastName: value })} required />
            <EditField edit={editMode} label="Email address" value={draft.email} onChange={value => setDraft({ ...draft, email: value })} type="email" required />
            <EditField edit={editMode} label="Mobile phone" value={draft.phone} onChange={value => setDraft({ ...draft, phone: value })} type="tel" />
            <EditField edit={editMode} label="Date of birth" value={draft.dateOfBirth} onChange={value => setDraft({ ...draft, dateOfBirth: value })} type="date" />
             <EditField edit={editMode} label="Source" value={draft.source} onChange={value => setDraft({ ...draft, source: value })} />
             {(editMode ? draft.source === "other" : candidate.source === "other") && <EditField edit={editMode} label="Other source" value={draft.sourceDetails} onChange={value => setDraft({ ...draft, sourceDetails: value })} />}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Location and experience</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <EditField edit={editMode} label="Address" value={draft.address} onChange={value => setDraft({ ...draft, address: value })} />
            <EditField edit={editMode} label="Address line 2" value={draft.addressLine2} onChange={value => setDraft({ ...draft, addressLine2: value })} />
            <EditField edit={editMode} label="City" value={draft.city} onChange={value => setDraft({ ...draft, city: value })} />
            <EditField edit={editMode} label="State" value={draft.state} onChange={value => setDraft({ ...draft, state: value })} />
            <EditField edit={editMode} label="ZIP code" value={draft.zipCode} onChange={value => setDraft({ ...draft, zipCode: value })} />
            <EditField edit={editMode} label="Current employer" value={draft.currentEmployer} onChange={value => setDraft({ ...draft, currentEmployer: value })} />
            <EditField edit={editMode} label="Years of driving experience" value={draft.yearsExperience} onChange={value => setDraft({ ...draft, yearsExperience: value === "" ? null : Number(value) })} type="number" />
            <EditField edit={editMode} label="License class" value={draft.licenseClass} onChange={value => setDraft({ ...draft, licenseClass: value })} />
            <EditField edit={editMode} label="License state" value={draft.licenseState} onChange={value => setDraft({ ...draft, licenseState: value })} />
            {editMode ? <div className="space-y-1.5"><Label>Commercial license</Label><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.hasCommercialLicense} onChange={event => setDraft({ ...draft, hasCommercialLicense: event.target.checked })} /> Has commercial license</label></div> : <ReadField label="Commercial license" value={candidate.hasCommercialLicense ? "Yes" : "No"} />}
             <div className="space-y-1.5 sm:col-span-2">
               <Label>Preferred markets</Label>
               {editMode ? <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-3">
                 {MARKET_VALUES.map(market => <label key={market} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(draft.preferredMarkets || []).includes(market)} onChange={event => setDraft({ ...draft, preferredMarkets: event.target.checked ? [...(draft.preferredMarkets || []), market] : (draft.preferredMarkets || []).filter(value => value !== market) })} />{market}</label>)}
               </div> : <ReadField label="" value={(candidate.preferredMarkets || []).join(", ") || "Not specified"} />}
             </div>
             <div className="space-y-1.5 sm:col-span-2">
               <Label>Endorsements</Label>
               {editMode ? <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-3">
                 {ENDORSEMENT_OPTIONS.map(option => <label key={option.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(draft.endorsements || []).includes(option.value)} onChange={event => setDraft({ ...draft, endorsements: event.target.checked ? [...(draft.endorsements || []), option.value] : (draft.endorsements || []).filter(value => value !== option.value) })} />{option.label}</label>)}
               </div> : <ReadField label="" value={(candidate.endorsements || []).join(", ") || "Not specified"} />}
             </div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="applications"><Card><CardHeader><CardTitle>Applications</CardTitle><CardDescription>Each Application is a separate participation record with its own stage and outcome.</CardDescription></CardHeader><CardContent className="space-y-3">
          {candidate.applications.length ? candidate.applications.map(application => <div key={application.id} className="rounded-lg border p-4">
            <div className="flex flex-col justify-between gap-2 sm:flex-row"><div><h3 className="font-semibold">{application.requisition?.title || "Recruiting opportunity"}</h3><p className="text-sm text-muted-foreground">{application.requisition?.market || "Market not specified"} · Applied {date(application.appliedAt)}</p></div><Badge className="w-fit capitalize" variant="secondary">{titleCase(application.currentStage)}</Badge></div>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><span>Recruiter: {[application.owner?.firstName, application.owner?.lastName].filter(Boolean).join(" ") || application.owner?.email || "Unassigned"}</span><span>Disposition: {titleCase(application.disposition)}</span></div>
          </div>) : <div className="py-10 text-center text-sm text-muted-foreground">This Candidate has not been added to an Application yet.</div>}
        </CardContent></Card></TabsContent>
        <TabsContent value="notes"><Card><CardHeader><CardTitle>Candidate notes</CardTitle><CardDescription>Internal summary notes for this Candidate. No communications are sent from this record.</CardDescription></CardHeader><CardContent className="space-y-3">
          {editMode ? <Textarea value={draft.notes || ""} onChange={event => setDraft({ ...draft, notes: event.target.value })} rows={10} placeholder="Add an internal Candidate summary…" /> : <p className="whitespace-pre-wrap text-sm">{candidate.notes || "No notes have been added."}</p>}
           {!editMode && candidate.canEdit && <Button variant="outline" onClick={() => setEditMode(true)}>Edit notes</Button>}
        </CardContent></Card></TabsContent>
        <TabsContent value="history"><Card><CardHeader><CardTitle>History</CardTitle><CardDescription>Append-only record of Candidate creation and updates.</CardDescription></CardHeader><CardContent className="space-y-3">
          {historyQuery.isLoading ? <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></> : historyQuery.isError ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Unable to load Candidate history. <Button variant="ghost" className="h-auto p-0" onClick={() => historyQuery.refetch()}>Retry</Button></AlertDescription></Alert> : historyQuery.data?.events.length ? historyQuery.data.events.map(event => <div key={event.id} className="flex gap-3 border-b pb-3"><History className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><p className="font-medium">{titleCase(event.actionType)}</p><p className="text-sm text-muted-foreground">{date(event.occurredAt)}{event.userEmail ? ` · ${event.userEmail}` : ""}</p>{event.changedFields?.length ? <p className="mt-1 text-xs text-muted-foreground">Updated: {event.changedFields.join(", ")}</p> : null}</div></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No history has been recorded yet.</p>}
        </CardContent></Card></TabsContent>
      </Tabs>
    </RecordDetailLayout>
    {duplicate && <Alert className="fixed bottom-4 right-4 z-50 max-w-md border-destructive" variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Duplicate contact information</AlertTitle><AlertDescription>{duplicate.name} already has this email address or phone number. <Button className="h-auto p-0" variant="ghost" onClick={() => setLocation(`/recruiting/candidates/${duplicate.id}`)}>Open existing Candidate</Button></AlertDescription></Alert>}
  </main>;
}

function QuickStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div><div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div></CardContent></Card>;
}

function ReadField({ label, value }: { label: string; value: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><p className="min-h-10 rounded-md border bg-muted/30 px-3 py-2 text-sm">{value || "—"}</p></div>;
}

function EditField({ label, value, onChange, edit, type = "text", required = false }: { label: string; value: string | number | null | undefined; onChange: (value: string) => void; edit: boolean; type?: string; required?: boolean }) {
  if (!edit) return <ReadField label={label} value={value === null || value === undefined || value === "" ? "—" : type === "tel" ? formatPhone(String(value)) : String(value)} />;
  return <div className="space-y-1.5"><Label>{label}{required ? " *" : ""}</Label><Input type={type} value={value ?? ""} onChange={event => onChange(type === "tel" ? formatPhoneInput(event.target.value) : event.target.value)} /></div>;
}

const ENDORSEMENT_OPTIONS = [
  { value: "H", label: "H — Hazmat" },
  { value: "N", label: "N — Tank" },
  { value: "P", label: "P — Passenger" },
  { value: "T", label: "T — Double/Triple" },
  { value: "X", label: "X — Hazmat + Tank" },
  { value: "S", label: "S — School bus" },
];