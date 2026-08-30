import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Check, ChevronRight, GitMerge, Search, ShieldAlert, X, Equal } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

export type MergeEntityType = "account" | "driver";

interface MergeSearchResult {
  id: string;
  customerName?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  driver_number?: string;
  status?: string;
  customerType?: string;
  customerNumber?: string;
  dealerId?: string;
  driver_type?: string;
  market?: string;
}

interface ComparisonField {
  key: string;
  label: string;
  primaryValue: any;
  duplicateValue: any;
  hasConflict: boolean;
  readonly: boolean;
}

interface OperationalCounts {
  primary: Record<string, number>;
  duplicate: Record<string, number>;
}

interface DiffResult {
  primary: Record<string, any>;
  duplicate: Record<string, any>;
  allFields: ComparisonField[];
  conflicts: ComparisonField[];
  operationalCounts: OperationalCounts;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: MergeEntityType;
  primaryId: string;
  primaryLabel: string;
  onMergeComplete?: () => void;
}

type Step = "select-duplicate" | "compare" | "confirm";

const CONFIRM_PHRASE = "MERGE";

export function MergeRecordsDialog({ open, onOpenChange, entityType, primaryId, primaryLabel, onMergeComplete }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("select-duplicate");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDuplicate, setSelectedDuplicate] = useState<MergeSearchResult | null>(null);
  const [fieldResolutions, setFieldResolutions] = useState<Record<string, "primary" | "duplicate">>({});
  const [mergeReason, setMergeReason] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");

  const entityPath = entityType === "account" ? "accounts" : "drivers";
  const searchEndpoint = `/api/admin/merge/${entityPath}/search`;
  const diffEndpoint = `/api/admin/merge/${entityPath}/diff`;
  const mergeEndpoint = `/api/admin/merge/${entityPath}`;

  const { data: searchResultsRaw, isFetching: searching, isError: searchError } = useQuery<MergeSearchResult[]>({
    queryKey: [searchEndpoint, searchQuery, primaryId],
    queryFn: async () => {
      const r = await fetch(`${searchEndpoint}?q=${encodeURIComponent(searchQuery)}&excludeId=${primaryId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Search failed: ${r.status} ${r.statusText}`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("Unexpected response format from search endpoint");
      return data;
    },
    enabled: open && step === "select-duplicate",
  });
  const searchResults: MergeSearchResult[] = Array.isArray(searchResultsRaw) ? searchResultsRaw : [];

  const { data: diffData, isLoading: loadingDiff, isError: diffError } = useQuery<DiffResult>({
    queryKey: [diffEndpoint, primaryId, selectedDuplicate?.id],
    queryFn: async () => {
      const r = await fetch(`${diffEndpoint}?primaryId=${primaryId}&duplicateId=${selectedDuplicate!.id}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Comparison failed: ${r.status} ${r.statusText}`);
      const data = await r.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Unexpected response format from diff endpoint");
      return data;
    },
    enabled: !!selectedDuplicate && (step === "compare" || step === "confirm"),
  });

  const mergeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", mergeEndpoint, { primaryId, duplicateId: selectedDuplicate!.id, mergeReason, fieldResolutions })
        .then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Merge Complete", description: "The duplicate record has been retired and all linked data moved to the primary record." });
      queryClient.invalidateQueries();
      onMergeComplete?.();
      handleClose();
    },
    onError: (e: any) => {
      toast({ title: "Merge Failed", description: e?.message || "An error occurred during merge.", variant: "destructive" });
    },
  });

  function handleClose() {
    setStep("select-duplicate");
    setSearchQuery("");
    setSelectedDuplicate(null);
    setFieldResolutions({});
    setMergeReason("");
    setConfirmPhrase("");
    onOpenChange(false);
  }

  function getLabel(result: MergeSearchResult) {
    if (entityType === "account") return result.customerName ?? result.id;
    return result.display_name || `${result.first_name || ""} ${result.last_name || ""}`.trim() || result.driver_number || result.id;
  }

  function getSubLabel(result: MergeSearchResult) {
    if (entityType === "account") {
      return [
        result.customerType,
        result.customerNumber ? `Acct #${result.customerNumber}` : null,
        result.dealerId ? `Dealer ID ${result.dealerId}` : null,
      ].filter(Boolean).join(" · ");
    }
    return [result.driver_type, result.driver_number, result.market].filter(Boolean).join(" · ");
  }

  function handleSelectDuplicate(r: MergeSearchResult) {
    setSelectedDuplicate(r);
    setFieldResolutions({});
    setStep("compare");
  }

  function formatValue(v: any) {
    if (v == null || v === "") return <span className="text-muted-foreground/50 italic">—</span>;
    const s = String(v);
    if (s.length > 40) return <span title={s}>{s.slice(0, 40)}…</span>;
    return <span>{s}</span>;
  }

  // Determine if there is active operational data on BOTH sides
  const hasOpDataOnBothSides = (() => {
    if (!diffData) return false;
    const pTotal = Object.values(diffData.operationalCounts.primary).reduce((a, b) => a + b, 0);
    const dTotal = Object.values(diffData.operationalCounts.duplicate).reduce((a, b) => a + b, 0);
    return pTotal > 0 && dTotal > 0;
  })();

  const opDataItems = diffData
    ? Object.entries(diffData.operationalCounts.duplicate).filter(([, v]) => v > 0)
    : [];

  const conflictCount = diffData?.conflicts.length ?? 0;
  const confirmPhraseValid = confirmPhrase.trim().toUpperCase() === CONFIRM_PHRASE;
  const canExecuteMerge = confirmPhraseValid && mergeReason.trim().length >= 10 && !mergeMutation.isPending;

  const stepLabels: Record<Step, string> = {
    "select-duplicate": "1. Select Duplicate",
    "compare": "2. Side-by-Side Review",
    "confirm": "3. Confirm & Merge",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col gap-0 p-0" data-testid="dialog-merge-records">
        {/* Header */}
        <div className="flex flex-col gap-3 px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <GitMerge className="h-5 w-5 text-orange-500 shrink-0" />
              Merge {entityType === "account" ? "Account" : "Driver"} Records
              <Badge variant="outline" className="ml-1 text-xs font-normal">Super Admin Only</Badge>
            </DialogTitle>
          </DialogHeader>

          {/* Step progress */}
          <div className="flex items-center gap-1.5 text-xs">
            {(["select-duplicate", "compare", "confirm"] as Step[]).map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${step === s ? "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 font-medium" : "text-muted-foreground"}`}>
                  {stepLabels[s]}
                </span>
              </span>
            ))}
          </div>
        </div>

        <Separator />

        {/* Body */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-5">

            {/* ── Step 1: Select Duplicate ── */}
            {step === "select-duplicate" && (
              <div className="space-y-4">
                <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-0.5">Primary Record — will be kept</p>
                  <p className="font-semibold">{primaryLabel}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Search for the duplicate record to retire:</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={entityType === "account" ? "Search by account name, account number, or dealer ID…" : "Search by name or driver number…"}
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-merge-search"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  {searching && (
                    <p className="text-sm text-muted-foreground py-2">
                      {searchQuery ? "Searching…" : "Finding potential duplicate candidates…"}
                    </p>
                  )}
                  {!searching && searchError && (
                    <p className="text-sm text-destructive py-2">No merge candidates available. Please try again or contact support.</p>
                  )}
                  {!searching && !searchError && searchResults.length === 0 && searchQuery && (
                    <p className="text-sm text-muted-foreground py-2">No matching records found.</p>
                  )}
                  {!searching && !searchError && searchResults.length === 0 && !searchQuery && (
                    <p className="text-sm text-muted-foreground py-2">No similar accounts found. Use the search box above to find a duplicate by name, account number, or dealer ID.</p>
                  )}
                  {!searching && !searchError && searchResults.length > 0 && !searchQuery && (
                    <p className="text-xs text-muted-foreground pb-1">Showing potential duplicates based on account name, dealer ID, and account number. Use the search box to broaden or refine results.</p>
                  )}
                  {searchResults.map(r => (
                    <button
                      key={r.id}
                      className="w-full flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-left hover-elevate"
                      onClick={() => handleSelectDuplicate(r)}
                      data-testid={`option-merge-duplicate-${r.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{getLabel(r)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{getSubLabel(r)}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0 capitalize">{r.status}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 2: Side-by-Side Comparison ── */}
            {step === "compare" && (
              <div className="space-y-4">
                {loadingDiff ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Loading comparison…</p>
                ) : diffError ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Comparison Unavailable</AlertTitle>
                    <AlertDescription>Could not load the record comparison. Please go back and try again.</AlertDescription>
                  </Alert>
                ) : diffData ? (
                  <>
                    {/* Conflict summary */}
                    {conflictCount > 0 ? (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>{conflictCount} Field {conflictCount === 1 ? "Conflict" : "Conflicts"} Detected</AlertTitle>
                        <AlertDescription>
                          For each highlighted row, select which value to keep on the primary record. The primary value is pre-selected by default.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert>
                        <Check className="h-4 w-4 text-green-500" />
                        <AlertTitle>No Field Conflicts</AlertTitle>
                        <AlertDescription>All values match or the primary record already has the populated value.</AlertDescription>
                      </Alert>
                    )}

                    {/* Side-by-side table */}
                    <div className="rounded-md border overflow-hidden text-sm">
                      {/* Column headers */}
                      <div className="grid grid-cols-[180px_1fr_1fr] bg-muted/50 border-b">
                        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Field</div>
                        <div className="px-3 py-2 border-l">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                            <span className="font-semibold text-xs truncate">Primary — Kept</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{primaryLabel}</p>
                        </div>
                        <div className="px-3 py-2 border-l">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                            <span className="font-semibold text-xs truncate">Duplicate — Retired</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{selectedDuplicate ? getLabel(selectedDuplicate) : "—"}</p>
                        </div>
                      </div>

                      {/* Field rows */}
                      {diffData.allFields.map(f => {
                        const isConflict = f.hasConflict && !f.readonly;
                        const resolution = fieldResolutions[f.key] ?? "primary";
                        return (
                          <div
                            key={f.key}
                            className={`grid grid-cols-[180px_1fr_1fr] border-b last:border-0 ${isConflict ? "bg-amber-50/60 dark:bg-amber-950/10" : ""}`}
                            data-testid={`comparison-row-${f.key}`}
                          >
                            {/* Field label */}
                            <div className="px-3 py-2.5 flex items-start gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground leading-snug">{f.label}</span>
                              {isConflict && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />}
                              {!isConflict && !f.readonly && f.primaryValue && (
                                <Equal className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5" />
                              )}
                            </div>

                            {/* Primary value */}
                            <div className={`px-3 py-2.5 border-l ${isConflict ? (resolution === "primary" ? "bg-green-50 dark:bg-green-950/20" : "") : ""}`}>
                              {isConflict ? (
                                <label className="flex items-start gap-2 cursor-pointer" data-testid={`radio-primary-${f.key}`}>
                                  <input
                                    type="radio"
                                    name={f.key}
                                    value="primary"
                                    checked={resolution === "primary"}
                                    onChange={() => setFieldResolutions(p => ({ ...p, [f.key]: "primary" }))}
                                    className="mt-0.5 shrink-0 accent-green-600"
                                  />
                                  <span className={`text-xs leading-snug ${resolution === "primary" ? "font-medium" : "text-muted-foreground"}`}>
                                    {formatValue(f.primaryValue)}
                                  </span>
                                </label>
                              ) : (
                                <span className="text-xs leading-snug">{formatValue(f.primaryValue)}</span>
                              )}
                            </div>

                            {/* Duplicate value */}
                            <div className={`px-3 py-2.5 border-l ${isConflict ? (resolution === "duplicate" ? "bg-orange-50 dark:bg-orange-950/20" : "") : ""}`}>
                              {isConflict ? (
                                <label className="flex items-start gap-2 cursor-pointer" data-testid={`radio-duplicate-${f.key}`}>
                                  <input
                                    type="radio"
                                    name={f.key}
                                    value="duplicate"
                                    checked={resolution === "duplicate"}
                                    onChange={() => setFieldResolutions(p => ({ ...p, [f.key]: "duplicate" }))}
                                    className="mt-0.5 shrink-0 accent-orange-500"
                                  />
                                  <span className={`text-xs leading-snug ${resolution === "duplicate" ? "font-medium" : "text-muted-foreground"}`}>
                                    {formatValue(f.duplicateValue)}
                                  </span>
                                </label>
                              ) : (
                                <span className="text-xs leading-snug text-muted-foreground">{formatValue(f.duplicateValue)}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Operational data summary */}
                    {opDataItems.length > 0 && (
                      <div className="rounded-md border p-4 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operational Data in Duplicate Record</p>
                        <div className="flex flex-wrap gap-2">
                          {opDataItems.map(([label, count]) => (
                            <Badge key={label} variant="secondary" className="text-xs">
                              {count} {label}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          These records will be moved to the primary record when the merge is executed.
                        </p>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {/* ── Step 3: Confirm ── */}
            {step === "confirm" && (
              <div className="space-y-4">
                {/* Cannot be undone warning */}
                <Alert variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>This action cannot be undone.</AlertTitle>
                  <AlertDescription>
                    The duplicate record will be permanently retired and locked from future operational use. All linked records will be moved to the primary record.
                  </AlertDescription>
                </Alert>

                {/* Operational data warning */}
                {hasOpDataOnBothSides && (
                  <Alert className="border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800 dark:text-amber-300">Both records contain active operational data.</AlertTitle>
                    <AlertDescription className="text-amber-700 dark:text-amber-400">
                      Please confirm you wish to merge these records. All operational data from the duplicate will be reassigned to the primary record.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Merge summary */}
                <div className="rounded-md border divide-y text-sm">
                  <div className="grid grid-cols-[160px_1fr] px-4 py-2.5">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide self-center">Primary (Kept)</span>
                    <span className="font-semibold">{primaryLabel}</span>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] px-4 py-2.5">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide self-center">Duplicate (Retired)</span>
                    <span className="font-medium">{selectedDuplicate ? getLabel(selectedDuplicate) : "—"}</span>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] px-4 py-2.5">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide self-center">Fields Overridden</span>
                    <span>{Object.values(fieldResolutions).filter(v => v === "duplicate").length} field(s) taken from duplicate record</span>
                  </div>
                  {opDataItems.length > 0 && (
                    <div className="grid grid-cols-[160px_1fr] px-4 py-2.5">
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide self-center">Data Moving</span>
                      <span>{opDataItems.map(([l, c]) => `${c} ${l}`).join(", ")}</span>
                    </div>
                  )}
                </div>

                {/* Merge reason */}
                <div className="space-y-1.5">
                  <Label htmlFor="merge-reason">
                    Merge Reason <span className="text-muted-foreground font-normal text-xs">(minimum 10 characters, required)</span>
                  </Label>
                  <Textarea
                    id="merge-reason"
                    placeholder="Explain why these records are being merged (e.g. duplicate created during CSV import on 2025-01-15)…"
                    value={mergeReason}
                    onChange={e => setMergeReason(e.target.value)}
                    rows={3}
                    data-testid="textarea-merge-reason"
                  />
                  {mergeReason.length > 0 && mergeReason.trim().length < 10 && (
                    <p className="text-xs text-destructive">{10 - mergeReason.trim().length} more character(s) required.</p>
                  )}
                </div>

                {/* Typed confirmation */}
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
                    <p className="text-sm font-medium text-destructive">Type <strong className="font-mono tracking-widest">{CONFIRM_PHRASE}</strong> to confirm this merge.</p>
                  </div>
                  <Input
                    placeholder={`Type ${CONFIRM_PHRASE} here…`}
                    value={confirmPhrase}
                    onChange={e => setConfirmPhrase(e.target.value)}
                    className={`font-mono uppercase tracking-widest ${confirmPhraseValid ? "border-green-500 focus-visible:ring-green-500" : ""}`}
                    data-testid="input-confirm-phrase"
                  />
                  {confirmPhrase.length > 0 && !confirmPhraseValid && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <X className="h-3 w-3" /> Enter the exact phrase: {CONFIRM_PHRASE}
                    </p>
                  )}
                  {confirmPhraseValid && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Confirmation accepted.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4">
          <div>
            {step !== "select-duplicate" && (
              <Button
                variant="outline"
                onClick={() => setStep(step === "confirm" ? "compare" : "select-duplicate")}
                data-testid="button-merge-back"
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose} data-testid="button-merge-cancel">Cancel</Button>

            {step === "compare" && (
              <Button
                onClick={() => setStep("confirm")}
                disabled={loadingDiff || !diffData}
                data-testid="button-merge-next"
              >
                Continue to Confirm
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === "confirm" && (
              <Button
                onClick={() => mergeMutation.mutate()}
                disabled={!canExecuteMerge}
                className="bg-orange-600 text-white"
                data-testid="button-merge-execute"
              >
                {mergeMutation.isPending ? "Merging…" : "Execute Merge"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
