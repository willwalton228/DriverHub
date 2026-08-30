import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CandidateSummaryCard, CandidateSummaryCardData } from "./CandidateSummaryCard";
import { Search, Users, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface CandidateSummaryPanelProps {
  readOnly?: boolean;
  onCardClick?: (candidateId: string) => void;
}

export function CandidateSummaryPanel({
  readOnly = true,
  onCardClick,
}: CandidateSummaryPanelProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [market, setMarket] = useState<string>("all");
  const [readinessFilter, setReadinessFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const handleSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout((window as any).__candidateSearchTimeout);
    (window as any).__candidateSearchTimeout = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 300);
  };

  const queryParams = new URLSearchParams();
  if (debouncedSearch) queryParams.set("search", debouncedSearch);
  if (market && market !== "all") queryParams.set("market", market);
  if (readinessFilter && readinessFilter !== "all") queryParams.set("readinessStatus", readinessFilter);
  queryParams.set("limit", String(pageSize));
  queryParams.set("offset", String(page * pageSize));

  const { data, isLoading } = useQuery<{ data: CandidateSummaryCardData[]; total: number }>({
    queryKey: ["/api/recruiting/candidates/summary-cards/search", debouncedSearch, market, readinessFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/candidates/summary-cards/search?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to load candidates");
      return res.json();
    },
    staleTime: 30000,
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-4" data-testid="candidate-summary-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search candidates..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-candidate-search"
          />
        </div>
        <Select value={readinessFilter} onValueChange={(v) => { setReadinessFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]" data-testid="select-readiness-filter">
            <SelectValue placeholder="Readiness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="not_ready">Not Ready</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.data.length > 0 ? (
        <div className="space-y-2">
          {data.data.map((candidate) => (
            <CandidateSummaryCard
              key={candidate.candidateId}
              candidateId={candidate.candidateId}
              data={candidate}
              readOnly={readOnly}
              onClick={onCardClick}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <Users className="h-8 w-8" />
          <p className="text-sm">No candidates found</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2" data-testid="pagination-controls">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} ({data?.total ?? 0} total)
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              data-testid="button-next-page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
