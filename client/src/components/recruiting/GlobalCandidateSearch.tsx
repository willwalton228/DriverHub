import { useState, useCallback, useEffect, useRef } from "react";
import { formatPhone } from "@/lib/phone";
import { useQuery } from "@tanstack/react-query";
import { Search, X, User, Mail, Phone, Briefcase, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SearchResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  preferredMarkets: string[] | null;
  applications: Array<{
    id: string;
    requisitionTitle: string;
    market: string | null;
    stage: string;
  }>;
}

interface SearchResponse {
  candidates: SearchResult[];
  total: number;
  query: string;
}

interface GlobalCandidateSearchProps {
  onSelectCandidate?: (candidateId: string) => void;
  placeholder?: string;
  className?: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function getStageColor(stage: string): string {
  const stageColors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    screening: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    interview: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    offer: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    hired: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };
  return stageColors[stage] || "bg-muted text-muted-foreground";
}


export function GlobalCandidateSearch({
  onSelectCandidate,
  placeholder = "Search candidates by name, email, or phone...",
  className = "",
}: GlobalCandidateSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchUrl = `/api/recruiting/candidates/search?q=${encodeURIComponent(debouncedQuery)}`;
  const { data, isLoading, isFetching } = useQuery<SearchResponse>({
    queryKey: [searchUrl],
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000,
  });

  const handleSelect = useCallback(
    (candidateId: string) => {
      setOpen(false);
      setSearchQuery("");
      onSelectCandidate?.(candidateId);
    },
    [onSelectCandidate]
  );

  const handleClear = useCallback(() => {
    setSearchQuery("");
    inputRef.current?.focus();
  }, []);

  const showResults = debouncedQuery.length >= 2;
  const hasResults = data?.candidates && data.candidates.length > 0;

  return (
    <div className={`relative ${className}`}>
      <Popover open={open && showResults} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              data-testid="input-candidate-search"
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.length >= 2) {
                  setOpen(true);
                }
              }}
              onFocus={() => {
                if (searchQuery.length >= 2) {
                  setOpen(true);
                }
              }}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <Button
                data-testid="button-clear-search"
                variant="ghost"
                size="sm"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 px-2"
                onClick={handleClear}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {(isLoading || isFetching) && debouncedQuery.length >= 2 && (
              <Loader2 className="absolute right-8 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[500px] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList>
              {!hasResults && !isLoading && (
                <CommandEmpty>
                  No candidates found for "{debouncedQuery}"
                </CommandEmpty>
              )}
              {hasResults && (
                <CommandGroup heading={`${data.total} result${data.total !== 1 ? "s" : ""} found`}>
                  {data.candidates.map((candidate) => (
                    <CommandItem
                      key={candidate.id}
                      data-testid={`search-result-${candidate.id}`}
                      value={candidate.id}
                      onSelect={() => handleSelect(candidate.id)}
                      className="flex flex-col items-start gap-2 p-3 cursor-pointer"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {candidate.firstName} {candidate.lastName}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {candidate.status}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {candidate.email}
                        </span>
                        {candidate.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {formatPhone(candidate.phone)}
                          </span>
                        )}
                        {candidate.preferredMarkets && candidate.preferredMarkets.length > 0 && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {candidate.preferredMarkets.slice(0, 2).join(", ")}
                            {candidate.preferredMarkets.length > 2 && (
                              <span className="text-xs">+{candidate.preferredMarkets.length - 2}</span>
                            )}
                          </span>
                        )}
                      </div>
                      
                      {candidate.applications.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {candidate.applications.slice(0, 3).map((app) => (
                            <Badge
                              key={app.id}
                              variant="secondary"
                              className={`text-xs ${getStageColor(app.stage)}`}
                            >
                              <Briefcase className="h-3 w-3 mr-1" />
                              {app.requisitionTitle}
                              {app.market && <span className="ml-1 opacity-70">({app.market})</span>}
                            </Badge>
                          ))}
                          {candidate.applications.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{candidate.applications.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
