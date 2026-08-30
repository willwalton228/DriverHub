import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Camera, StickyNote, Send, Search, ChevronUp, ChevronDown, X,
  Loader2, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DirectFileUploader } from "@/components/DirectFileUploader";
import { ClaimWorkflowPanel } from "@/components/ClaimTransitionDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Photo / Document categories — mirror ClaimPhotoGallery canonical values ─
const PHOTO_CATEGORIES = [
  { value: "scene_photos",           label: "Scene Photos",           group: "Photos" },
  { value: "vehicle_damage_photos",  label: "Vehicle Damage Photos",  group: "Photos" },
  { value: "driver_photos",          label: "Driver Photos",          group: "Photos" },
  { value: "video_photos",           label: "Video / Photos",         group: "Photos" },
  { value: "video",                  label: "Video",                  group: "Photos" },
  { value: "police_report",          label: "Police Report",          group: "Documents" },
  { value: "repair_estimate",        label: "Repair Estimate",        group: "Documents" },
  { value: "insurance_claim_form",   label: "Insurance Claim Form",   group: "Documents" },
  { value: "invoice_receipt",        label: "Invoice / Receipt",      group: "Documents" },
  { value: "accident_report",        label: "Accident Report",        group: "Documents" },
  { value: "customer_documentation", label: "Customer Documentation", group: "Documents" },
  { value: "traffic_citations",      label: "Traffic Citations",      group: "Documents" },
  { value: "vehicle_towing",         label: "Vehicle Towing",         group: "Documents" },
  { value: "general",                label: "General",                group: "Documents" },
  { value: "other",                  label: "Other",                  group: "Documents" },
] as const;

// ─── Note categories ──────────────────────────────────────────────────────────
const NOTE_CATEGORIES = [
  { value: "general",    label: "General Note" },
  { value: "insurance",  label: "Insurance Update" },
  { value: "customer",   label: "Customer Update" },
  { value: "driver",     label: "Driver Update" },
  { value: "legal",      label: "Legal" },
  { value: "recovery",   label: "Recovery / Subrogation" },
  { value: "internal",   label: "Internal Only" },
] as const;

// ─── Internal update distribution lists & sending accounts ───────────────────
const DISTRIBUTION_LISTS = [
  { value: "claims",      label: "Claims Team" },
  { value: "operations",  label: "Operations" },
  { value: "safety",      label: "Safety" },
  { value: "executive",   label: "Executive" },
  { value: "legal",       label: "Legal" },
  { value: "accounting",  label: "Accounting" },
] as const;

const SENDING_ACCOUNTS = [
  { value: "claims@",     label: "claims@" },
  { value: "support@",    label: "support@" },
  { value: "safety@",     label: "safety@" },
  { value: "operations@", label: "operations@" },
] as const;

// ─── DOM text-search helpers ──────────────────────────────────────────────────
function clearHighlights(container: Element) {
  container.querySelectorAll("mark.claim-search-highlight, mark.claim-search-highlight-active").forEach((m) => {
    const parent = m.parentNode!;
    if (m.firstChild) parent.replaceChild(m.firstChild, m);
    parent.normalize();
  });
}

function highlightMatches(query: string, container: Element): HTMLElement[] {
  clearHighlights(container);
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lq = trimmed.toLowerCase();
  const marks: HTMLElement[] = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = (node.parentElement?.tagName || "").toUpperCase();
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && getComputedStyle(node.parentElement).display === "none") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Collect all hits before mutating the DOM
  const hits: Array<{ node: Text; offset: number }> = [];
  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    const text = textNode.textContent || "";
    let idx = 0;
    while ((idx = text.toLowerCase().indexOf(lq, idx)) !== -1) {
      hits.push({ node: textNode, offset: idx });
      idx += lq.length;
    }
  }

  // Wrap hits using Range — process in reverse to preserve offsets
  [...hits].reverse().forEach(({ node, offset }) => {
    try {
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + lq.length);
      const mark = document.createElement("mark");
      mark.className = "claim-search-highlight";
      range.surroundContents(mark);
      marks.unshift(mark);
    } catch {
      // skip ranges that cross element boundaries
    }
  });

  return marks;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ClaimQuickActionsBarProps {
  accidentId: string;
  onUploadComplete: (
    result: { objectPath: string; fileName: string; fileType: string; fileSize: number },
    category: string
  ) => Promise<void>;
  currentClaimStatus: string | null | undefined;
  onTransitionComplete: () => void;
  onExpandAll: () => void;
  /** When true, skips the -mx-6 bleed — parent handles full-width. */
  noBleed?: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ClaimQuickActionsBar({
  accidentId,
  onUploadComplete,
  currentClaimStatus,
  onTransitionComplete,
  onExpandAll,
  noBleed = false,
}: ClaimQuickActionsBarProps) {
  const { toast } = useToast();

  // ── Photo dialog state ───────────────────────────────────────────────────
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoCategory, setPhotoCategory] = useState<string>("scene_photos");
  const [uploadedCount, setUploadedCount] = useState(0);

  // ── Note dialog state ────────────────────────────────────────────────────
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteCategory, setNoteCategory] = useState<string>("general");
  const [noteText, setNoteText] = useState("");

  // ── Send Internal Update dialog state ────────────────────────────────────
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateDistribution, setUpdateDistribution] = useState<string>("claims");
  const [updateFrom, setUpdateFrom] = useState<string>("claims@");
  const [updateBody, setUpdateBody] = useState("");

  // ── Search state ─────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matches, setMatches] = useState<HTMLElement[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeMatchRef = useRef<HTMLElement | null>(null);

  // ── Photo upload handler ─────────────────────────────────────────────────
  const handlePhotoUploaded = useCallback(
    async (result: { objectPath: string; fileName: string; fileType: string; fileSize: number }) => {
      await onUploadComplete(result, photoCategory);
      setUploadedCount((n) => n + 1);
    },
    [onUploadComplete, photoCategory]
  );

  const handlePhotoDialogClose = () => {
    setPhotoOpen(false);
    setUploadedCount(0);
    setPhotoCategory("scene_photos");
  };

  // ── Note mutation ────────────────────────────────────────────────────────
  const addNoteMutation = useMutation({
    mutationFn: async (text: string) => {
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/notes`, { noteText: text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId, "timeline"] });
      setNoteText("");
      setNoteCategory("general");
      setNoteOpen(false);
      toast({ title: "Note added", description: "Your note has been saved to this claim." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save note", variant: "destructive" });
    },
  });

  const handleNoteSubmit = () => {
    if (!noteText.trim()) return;
    const cat = NOTE_CATEGORIES.find((c) => c.value === noteCategory);
    const prefix = cat && noteCategory !== "general" ? `[${cat.label}] ` : "";
    addNoteMutation.mutate(prefix + noteText.trim());
  };

  // ── Internal update mutation (logged as a note + audit entry) ────────────
  const sendUpdateMutation = useMutation({
    mutationFn: async (payload: { distribution: string; fromAccount: string; body: string }) => {
      const distLabel = DISTRIBUTION_LISTS.find((d) => d.value === payload.distribution)?.label ?? payload.distribution;
      const noteText = `[Internal Update → ${distLabel} via ${payload.fromAccount}]\n${payload.body.trim()}`;
      return apiRequest("POST", `/api/corporate/accidents/${accidentId}/notes`, { noteText });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents", accidentId, "timeline"] });
      setUpdateBody("");
      setUpdateOpen(false);
      toast({ title: "Update logged", description: "Internal update has been recorded on this claim." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to send update", variant: "destructive" });
    },
  });

  const handleSendUpdate = () => {
    if (!updateBody.trim()) return;
    sendUpdateMutation.mutate({ distribution: updateDistribution, fromAccount: updateFrom, body: updateBody });
  };

  // ── Search helpers ───────────────────────────────────────────────────────
  const activateMatch = useCallback((idx: number, allMarks: HTMLElement[]) => {
    if (activeMatchRef.current) {
      activeMatchRef.current.className = "claim-search-highlight";
    }
    const mark = allMarks[idx];
    if (!mark) return;
    mark.className = "claim-search-highlight claim-search-highlight-active";
    activeMatchRef.current = mark;
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const runSearch = useCallback(
    (query: string) => {
      const container = document.querySelector("[data-testid='claim-detail-body']");
      if (!container) return;
      if (!query.trim()) {
        clearHighlights(container);
        setMatches([]);
        setMatchIndex(0);
        return;
      }
      const found = highlightMatches(query, container);
      setMatches(found);
      setMatchIndex(0);
      if (found.length > 0) activateMatch(0, found);
    },
    [activateMatch]
  );

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      const container = document.querySelector("[data-testid='claim-detail-body']");
      if (container) clearHighlights(container);
      setMatches([]);
      setMatchIndex(0);
    }
  };

  const handleSearchSubmit = () => {
    onExpandAll();
    setTimeout(() => runSearch(searchQuery), 80);
  };

  const handlePrev = () => {
    if (!matches.length) return;
    const next = (matchIndex - 1 + matches.length) % matches.length;
    setMatchIndex(next);
    activateMatch(next, matches);
  };

  const handleNext = () => {
    if (!matches.length) return;
    const next = (matchIndex + 1) % matches.length;
    setMatchIndex(next);
    activateMatch(next, matches);
  };

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    const container = document.querySelector("[data-testid='claim-detail-body']");
    if (container) clearHighlights(container);
    setMatches([]);
    setMatchIndex(0);
    setSearchOpen(false);
  }, []);

  // Escape closes search
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClearSearch();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, handleClearSearch]);

  // Ctrl+F / Cmd+F override while on claim detail page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        if (document.querySelector("[data-testid='claim-detail-body']")) {
          e.preventDefault();
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Grouped photo options ────────────────────────────────────────────────
  const photoGroups = ["Photos", "Documents"] as const;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Bar ──────────────────────────────────────────────────────────── */}
      <div
        className={`bg-muted/40 border-b py-1 flex items-center gap-1 flex-wrap ${noBleed ? "px-6" : "-mx-6 px-6"}`}
        data-testid="claim-quick-actions-bar"
      >
        {/* Add Photo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPhotoOpen(true)}
              className="gap-1.5 text-xs"
              data-testid="qab-button-add-photo"
            >
              <Camera className="h-3.5 w-3.5 shrink-0" />
              Add Photo
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Upload photos or documents to this claim</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Add Note */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNoteOpen(true)}
              className="gap-1.5 text-xs"
              data-testid="qab-button-add-note"
            >
              <StickyNote className="h-3.5 w-3.5 shrink-0" />
              Add Note
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Quickly add a timestamped note to this claim</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Send Internal Update */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUpdateOpen(true)}
              className="gap-1.5 text-xs"
              data-testid="qab-button-send-update"
            >
              <Send className="h-3.5 w-3.5 shrink-0" />
              Send Update
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Log an internal communication update for this claim</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Search — inline input or collapsed button */}
        {searchOpen ? (
          <div className="flex items-center gap-1 flex-1 min-w-0" data-testid="qab-search-area">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              ref={searchInputRef}
              autoFocus
              type="text"
              placeholder="Search claim…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (matches.length > 0) handleNext();
                  else handleSearchSubmit();
                }
              }}
              className="text-xs flex-1 min-w-0 max-w-64 border-0 bg-transparent focus-visible:ring-0 px-1 shadow-none"
              data-testid="qab-search-input"
            />
            {searchQuery && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSearchSubmit}
                  data-testid="qab-search-go"
                  aria-label="Run search"
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
                {matches.length > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0" data-testid="qab-search-count">
                      {matchIndex + 1} / {matches.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handlePrev}
                      data-testid="qab-search-prev"
                      aria-label="Previous match"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleNext}
                      data-testid="qab-search-next"
                      aria-label="Next match"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {searchQuery && matches.length === 0 && (
                  <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                    No results
                  </Badge>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearSearch}
              className="text-muted-foreground shrink-0"
              data-testid="qab-search-close"
              aria-label="Close search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className="gap-1.5 text-xs"
                data-testid="qab-button-search"
              >
                <Search className="h-3.5 w-3.5 shrink-0" />
                Search Claim
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Search anywhere in this claim (Ctrl+F)</TooltipContent>
          </Tooltip>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Transition — right side, compact mode */}
        <div className="shrink-0" data-testid="qab-transition-area">
          <ClaimWorkflowPanel
            claimId={accidentId}
            currentStatus={currentClaimStatus}
            onTransitionComplete={onTransitionComplete}
            compact
          />
        </div>
      </div>

      {/* ── Add Photo Dialog ──────────────────────────────────────────────── */}
      <Dialog open={photoOpen} onOpenChange={(o) => { if (!o) handlePhotoDialogClose(); else setPhotoOpen(true); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-quick-add-photo">
          <DialogHeader>
            <DialogTitle>Add Photo / Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="photo-category">Category</Label>
              <Select value={photoCategory} onValueChange={setPhotoCategory}>
                <SelectTrigger id="photo-category" data-testid="select-photo-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {photoGroups.map((group) => (
                    <div key={group}>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {group}
                      </div>
                      {PHOTO_CATEGORIES.filter((c) => c.group === group).map((c) => (
                        <SelectItem key={c.value} value={c.value} data-testid={`option-photo-cat-${c.value}`}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DirectFileUploader
              onUploadComplete={handlePhotoUploaded}
              enableCamera
              maxFiles={10}
              claimId={accidentId}
            />
            {uploadedCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {uploadedCount} file{uploadedCount > 1 ? "s" : ""} uploaded
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handlePhotoDialogClose} data-testid="button-photo-dialog-close">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Note Dialog ───────────────────────────────────────────────── */}
      <Dialog open={noteOpen} onOpenChange={(o) => { if (!o) { setNoteOpen(false); setNoteText(""); } else setNoteOpen(true); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-quick-add-note">
          <DialogHeader>
            <DialogTitle>Add Claim Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="note-category">Category</Label>
              <Select value={noteCategory} onValueChange={setNoteCategory}>
                <SelectTrigger id="note-category" data-testid="select-note-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} data-testid={`option-note-cat-${c.value}`}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-text">Note</Label>
              <Textarea
                id="note-text"
                placeholder="Enter your note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={4}
                data-testid="textarea-note-text"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNoteOpen(false); setNoteText(""); }} data-testid="button-note-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleNoteSubmit}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              data-testid="button-note-submit"
            >
              {addNoteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</>
              ) : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send Internal Update Dialog ───────────────────────────────────── */}
      <Dialog open={updateOpen} onOpenChange={(o) => { if (!o) { setUpdateOpen(false); setUpdateBody(""); } else setUpdateOpen(true); }}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-send-update">
          <DialogHeader>
            <DialogTitle>Send Internal Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="update-distribution">To (Distribution)</Label>
                <Select value={updateDistribution} onValueChange={setUpdateDistribution}>
                  <SelectTrigger id="update-distribution" data-testid="select-update-distribution">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISTRIBUTION_LISTS.map((d) => (
                      <SelectItem key={d.value} value={d.value} data-testid={`option-dist-${d.value}`}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="update-from">From Account</Label>
                <Select value={updateFrom} onValueChange={setUpdateFrom}>
                  <SelectTrigger id="update-from" data-testid="select-update-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENDING_ACCOUNTS.map((a) => (
                      <SelectItem key={a.value} value={a.value} data-testid={`option-from-${a.value}`}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="update-body">Message</Label>
              <Textarea
                id="update-body"
                placeholder="Enter update message…"
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
                rows={5}
                data-testid="textarea-update-body"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUpdateOpen(false); setUpdateBody(""); }} data-testid="button-update-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSendUpdate}
              disabled={!updateBody.trim() || sendUpdateMutation.isPending}
              data-testid="button-update-submit"
            >
              {sendUpdateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" />Logging…</>
              ) : "Log Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
