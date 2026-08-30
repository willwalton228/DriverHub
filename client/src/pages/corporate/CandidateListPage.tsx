import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertCircle, Check, ChevronDown, Loader2, Plus, RefreshCw, Search, Users } from "lucide-react";
import { apiRequest, ApiRequestError } from "@/lib/queryClient";
import { MARKET_VALUES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPhone, formatPhoneInput } from "@/lib/phone";

type LatestApplication = {
  id: string;
  stage: string;
  appliedAt: string | null;
  requisitionId: string;
  requisitionTitle: string | null;
  campaignName: string | null;
  recruiterName: string | null;
};

type Candidate = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  addressLine2: string | null;
  zipCode: string | null;
  dateOfBirth: string | null;
  status: string | null;
  latestApplication: LatestApplication | null;
};

type CandidateListResponse = { candidates: Candidate[]; total: number };
type CandidateAccess = { canRead: boolean; canWrite: boolean; isAdmin: boolean; authorizedMarkets: string[] };

const initialForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  addressLine2: "",
  city: "",
  state: "",
  zipCode: "",
  dateOfBirth: "",
  preferredMarkets: "",
  currentEmployer: "",
  yearsExperience: "",
  hasCommercialLicense: false,
  source: "recruiter_sourced",
  sourceDetails: "",
  endorsements: [] as string[],
  notes: "",
};

function candidateName(candidate: Candidate) {
  return [candidate.firstName, candidate.middleName, candidate.lastName].filter(Boolean).join(" ");
}

function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function compactAddress(candidate: Candidate) {
  return [candidate.address, [candidate.city, candidate.state].filter(Boolean).join(", "), candidate.zipCode]
    .filter(Boolean)
    .join(", ");
}

function stageLabel(stage: string | null | undefined) {
  return stage ? stage.replace(/_/g, " ") : "—";
}

function CandidateTableLoading() {
  return (
    <Card data-testid="candidate-list-loading">
      <CardContent className="p-4 space-y-3">
        {[...Array(7)].map((_, index) => <Skeleton key={index} className="h-11 w-full" />)}
      </CardContent>
    </Card>
  );
}

export default function CandidateListPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string; matchedOn: string[] } | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const listUrl = useMemo(
    () => `/api/recruiting/candidates?limit=${pageSize}&offset=${page * pageSize}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`,
    [page, search],
  );
  const candidatesQuery = useQuery<CandidateListResponse>({
    queryKey: ["/api/recruiting/candidates", search.trim(), page],
    queryFn: async () => {
      const response = await apiRequest("GET", listUrl);
      return response.json();
    },
    retry: false,
  });
  const accessQuery = useQuery<CandidateAccess>({
    queryKey: ["/api/recruiting/candidates/access"],
    queryFn: async () => (await apiRequest("GET", "/api/recruiting/candidates/access")).json(),
    retry: false,
  });
  const canCreate = accessQuery.data?.canWrite === true;
  const requiresMarket = accessQuery.data ? !accessQuery.data.isAdmin : true;

  const createCandidate = useMutation({
    mutationFn: async () => {
      const payload = {
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || undefined,
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        addressLine2: form.addressLine2.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim().toUpperCase() || undefined,
        zipCode: form.zipCode.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        preferredMarkets: form.preferredMarkets.split(",").map(value => value.trim()).filter(Boolean),
        currentEmployer: form.currentEmployer.trim() || undefined,
        yearsExperience: form.yearsExperience === "" ? undefined : Number(form.yearsExperience),
        hasCommercialLicense: form.hasCommercialLicense,
        source: form.source,
        sourceDetails: form.source === "other" ? form.sourceDetails.trim() || undefined : undefined,
        endorsements: form.endorsements.length ? form.endorsements : undefined,
        notes: form.notes.trim() || undefined,
      };
      const response = await apiRequest("POST", "/api/recruiting/candidates", payload);
      return response.json() as Promise<Candidate>;
    },
    onSuccess: (candidate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      setCreateOpen(false);
      setForm(initialForm);
      setLocation(`/recruiting/candidates/${candidate.id}`);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError && error.code === "DUPLICATE_CANDIDATE") {
        const existing = (error as any).existingCandidate;
        setDuplicate({
          id: existing?.id,
          name: [existing?.firstName, existing?.lastName].filter(Boolean).join(" ") || "Existing candidate",
          matchedOn: (error as any).matchedOn || [],
        });
      }
    },
  });

  const errorMessage = candidatesQuery.error instanceof Error
    ? candidatesQuery.error.message
    : "Candidate data is unavailable right now.";

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" data-testid="candidate-list-page">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Recruiting</p>
          <h1 className="text-3xl font-bold tracking-tight">Candidates</h1>
          <p className="mt-1 text-muted-foreground">Manage Candidate records separately from their Applications and job opportunities.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={!canCreate} data-testid="button-add-candidate">
          <Plus className="mr-2 h-4 w-4" /> Add Candidate
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
               onChange={(event) => { setSearch(event.target.value); setPage(0); }}
              className="pl-9"
              placeholder="Search by full name, email address, or phone number"
              aria-label="Search candidates"
              data-testid="input-search-candidates"
            />
          </div>
        </CardContent>
      </Card>

      {candidatesQuery.isLoading ? <CandidateTableLoading /> : candidatesQuery.isError ? (
        <Alert variant="destructive" data-testid="candidate-list-error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load Candidates</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage}</span>
            <Button variant="outline" size="sm" onClick={() => candidatesQuery.refetch()} disabled={candidatesQuery.isFetching}>
              {candidatesQuery.isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : candidatesQuery.data?.candidates.length === 0 ? (
        <Card data-testid="candidate-list-empty">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{search ? "No Candidates match this search" : "No Candidates yet"}</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {search ? "Try a different name, email address, or phone number." : "Add the first Candidate to begin building the recruiting pipeline."}
            </p>
            {!search && canCreate && <Button className="mt-5" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add Candidate</Button>}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">{candidatesQuery.data?.total ?? 0} Candidate{(candidatesQuery.data?.total ?? 0) === 1 ? "" : "s"}</CardTitle>
            <CardDescription>Select a Candidate to view their profile and Application history.</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Contact</TableHead>
                   <TableHead>Address</TableHead>
                   <TableHead>DOB</TableHead>
                  <TableHead>Latest Application / Campaign</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Recruiter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidatesQuery.data?.candidates.map((candidate) => (
                  <TableRow
                    key={candidate.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setLocation(`/recruiting/candidates/${candidate.id}`)}
                    onKeyDown={(event) => event.key === "Enter" && setLocation(`/recruiting/candidates/${candidate.id}`)}
                    data-testid={`candidate-row-${candidate.id}`}
                  >
                    <TableCell className="font-medium">
                      <div>{candidateName(candidate)}</div>
                      {candidate.status && <Badge variant="secondary" className="mt-1 capitalize">{stageLabel(candidate.status)}</Badge>}
                    </TableCell>
                    <TableCell><div>{candidate.email}</div><div className="text-sm text-muted-foreground">{formatPhone(candidate.phone) || "—"}</div></TableCell>
                     <TableCell className="max-w-[220px] truncate" title={compactAddress(candidate)}>{compactAddress(candidate) || "—"}</TableCell>
                     <TableCell className="whitespace-nowrap">{shortDate(candidate.dateOfBirth)}</TableCell>
                    <TableCell>{candidate.latestApplication?.campaignName || candidate.latestApplication?.requisitionTitle || "No applications"}</TableCell>
                    <TableCell className="capitalize">{stageLabel(candidate.latestApplication?.stage)}</TableCell>
                    <TableCell>{shortDate(candidate.latestApplication?.appliedAt)}</TableCell>
                    <TableCell>{candidate.latestApplication?.recruiterName || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {((candidatesQuery.data?.total ?? 0) > pageSize) && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, candidatesQuery.data?.total ?? 0)} of {candidatesQuery.data?.total ?? 0}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(current => current - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= (candidatesQuery.data?.total ?? 0)} onClick={() => setPage(current => current + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Candidate</DialogTitle>
            <DialogDescription>Create a person-level Candidate record. Applications are added separately and keep their own workflow status.</DialogDescription>
          </DialogHeader>
           <Alert>
             <AlertCircle className="h-4 w-4" />
             <AlertDescription><strong>Required:</strong> First name, last name, email address{requiresMarket ? ", and at least one recruiting market" : ""}. All other fields are optional.</AlertDescription>
           </Alert>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
             <Field label="First name" required><Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></Field>
             <Field label="Last name" required><Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></Field>
            <Field label="Middle name"><Input value={form.middleName} onChange={e => setForm({ ...form, middleName: e.target.value })} /></Field>
             <Field label="Email address" required><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
             <Field label="Mobile phone"><Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: formatPhoneInput(e.target.value) })} /></Field>
            <Field label="Current employer"><Input value={form.currentEmployer} onChange={e => setForm({ ...form, currentEmployer: e.target.value })} /></Field>
             <Field label="Address"><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
             <Field label="Address line 2"><Input value={form.addressLine2} onChange={e => setForm({ ...form, addressLine2: e.target.value })} /></Field>
            <Field label="City"><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State"><Input maxLength={2} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></Field>
             <Field label="ZIP code"><Input inputMode="numeric" value={form.zipCode} onChange={e => setForm({ ...form, zipCode: e.target.value })} /></Field>
             <Field label="Date of birth"><Input type="date" value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} /></Field>
              <div className="space-y-1.5 sm:col-span-2">
                <Field label="Recruiting market(s)" required={requiresMarket}>
                  <MarketMultiSelect
                    value={form.preferredMarkets.split(",").map(value => value.trim()).filter(Boolean)}
                    onChange={markets => setForm({ ...form, preferredMarkets: markets.join(", ") })}
                    options={requiresMarket ? accessQuery.data?.authorizedMarkets || [] : [...MARKET_VALUES]}
                  />
                </Field>
                {requiresMarket && accessQuery.data?.authorizedMarkets.length ? <p className="text-xs text-muted-foreground">Only your authorized markets can be selected.</p> : null}
              </div>
              <Field label="Source">
                <Select value={form.source} onValueChange={source => setForm({ ...form, source, sourceDetails: source === "other" ? form.sourceDetails : "" })}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recruiter_sourced">Recruiter sourced</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="job_board">Job board</SelectItem>
                    <SelectItem value="employee_referral">Employee referral</SelectItem>
                    <SelectItem value="driver_referral">Driver referral</SelectItem>
                    <SelectItem value="social_media">Social media</SelectItem>
                    <SelectItem value="career_fair">Career fair</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.source === "other" && <Field label="Other source" required><Input value={form.sourceDetails} onChange={e => setForm({ ...form, sourceDetails: e.target.value })} placeholder="Identify the source" /></Field>}
              <div className="space-y-1.5 sm:col-span-2">
                <Field label="Endorsements">
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-3">
                    {ENDORSEMENT_OPTIONS.map(option => (
                      <label key={option.value} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.endorsements.includes(option.value)} onChange={event => setForm({
                          ...form,
                          endorsements: event.target.checked ? [...form.endorsements, option.value] : form.endorsements.filter(value => value !== option.value),
                        })} />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Select any known CDL endorsements. Leave blank when not yet known.</p>
                </Field>
              </div>
            <Field label="Years of driving experience"><Input type="number" min="0" value={form.yearsExperience} onChange={e => setForm({ ...form, yearsExperience: e.target.value })} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" checked={form.hasCommercialLicense} onChange={e => setForm({ ...form, hasCommercialLicense: e.target.checked })} /> Has commercial license</label>
          </div>
          {createCandidate.isError && !(createCandidate.error instanceof ApiRequestError && createCandidate.error.code === "DUPLICATE_CANDIDATE") && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{createCandidate.error instanceof Error ? createCandidate.error.message : "Unable to create Candidate."}</AlertDescription></Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button disabled={!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || (requiresMarket && !form.preferredMarkets.trim()) || (form.source === "other" && !form.sourceDetails.trim()) || createCandidate.isPending} onClick={() => createCandidate.mutate()}>
              {createCandidate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Candidate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicate} onOpenChange={(open) => !open && setDuplicate(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Candidate already exists</DialogTitle><DialogDescription>{duplicate?.name} matches the supplied {duplicate?.matchedOn.join(" and ") || "contact information"}. No new Candidate was created.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicate(null)}>Keep editing</Button>
            <Button onClick={() => duplicate?.id && setLocation(`/recruiting/candidates/${duplicate.id}`)}>Open existing Candidate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

const ENDORSEMENT_OPTIONS = [
  { value: "H", label: "H — Hazmat" },
  { value: "N", label: "N — Tank" },
  { value: "P", label: "P — Passenger" },
  { value: "T", label: "T — Double/Triple" },
  { value: "X", label: "X — Hazmat + Tank" },
  { value: "S", label: "S — School bus" },
];

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}{required ? <><span className="ml-1 text-destructive" aria-hidden="true">*</span><span className="sr-only"> required</span></> : null}</Label>{children}</div>;
}

function MarketMultiSelect({ value, onChange, options }: { value: string[]; onChange: (value: string[]) => void; options: readonly string[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className={value.length ? "" : "text-muted-foreground"}>{value.length ? value.join(", ") : "Select recruiting market(s)"}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search markets..." />
          <CommandList>
            <CommandEmpty>No matching markets.</CommandEmpty>
            {options.map(market => (
              <CommandItem key={market} value={market} onSelect={() => onChange(value.includes(market) ? value.filter(item => item !== market) : [...value, market])}>
                <Check className={`mr-2 h-4 w-4 ${value.includes(market) ? "opacity-100" : "opacity-0"}`} />
                {market}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}