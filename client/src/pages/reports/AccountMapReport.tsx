import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

import * as L from "leaflet";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  MapPin,
  Filter,
  X,
  Download,
  RefreshCw,
  Loader2,
  ExternalLink,
  AlertCircle,
  Search,
  ChevronDown,
} from "lucide-react";

// Fix Leaflet default marker icon (broken in Vite bundler)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Types ──────────────────────────────────────────────────────────────────

interface AccountPin {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  network: string | null;
  market: string | null;
  status: string | null;
  accountType: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string | null;
}

interface AccountMapData {
  accounts: AccountPin[];
  filterOptions: {
    markets: string[];
    networks: string[];
    states: string[];
    accountTypes: string[];
  };
}

// ── Leaflet cluster layer using leaflet.markercluster directly ─────────────

function ClusterLayer({
  accounts,
  onSelect,
}: {
  accounts: AccountPin[];
  onSelect: (a: AccountPin) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!map) return;

    if (groupRef.current) {
      map.removeLayer(groupRef.current);
      groupRef.current = null;
    }

    const group = (L as any).markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      animate: true,
    });

    accounts.forEach((acct) => {
      if (acct.lat == null || acct.lng == null) return;

      const marker = L.marker([acct.lat, acct.lng]);

      const statusColor =
        (acct.status || "").toLowerCase() === "active"
          ? "#16a34a"
          : "#9ca3af";
      const tooltipHtml = [
        `<div style="font-weight:600;font-size:13px;margin-bottom:3px;max-width:220px">${acct.name}</div>`,
        acct.address
          ? `<div style="font-size:12px;color:#374151">${acct.address}</div>`
          : "",
        `<div style="font-size:12px;color:#374151">${[acct.city, acct.state, acct.zip].filter(Boolean).join(", ")}</div>`,
        acct.phone
          ? `<div style="font-size:12px;color:#374151">${acct.phone}</div>`
          : "",
        acct.network
          ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">Network: ${acct.network}</div>`
          : "",
        acct.market
          ? `<div style="font-size:11px;color:#6b7280">Market: ${acct.market}</div>`
          : "",
        `<div style="margin-top:4px"><span style="background:${statusColor};color:white;padding:1px 7px;border-radius:9999px;font-size:11px">${acct.status || "Unknown"}</span></div>`,
      ].join("");

      marker.bindTooltip(tooltipHtml, {
        sticky: true,
        opacity: 0.97,
        direction: "auto",
      });

      marker.on("click", () => onSelect(acct));
      group.addLayer(marker);
    });

    map.addLayer(group);
    groupRef.current = group;

    return () => {
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }
    };
  }, [map, accounts, onSelect]);

  return null;
}

// ── Summary widget ─────────────────────────────────────────────────────────

function SummaryWidget({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "green" | "gray";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-lg font-bold leading-tight ${
          accent === "green"
            ? "text-green-600 dark:text-green-400"
            : accent === "gray"
            ? "text-muted-foreground"
            : ""
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

// ── Multi-select filter ────────────────────────────────────────────────────

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  testId,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (val: string) => {
    onChange(
      selected.includes(val)
        ? selected.filter((v) => v !== val)
        : [...selected, val]
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="default"
            className="w-44 justify-between text-sm"
            data-testid={`button-${testId}`}
          >
            <span className="truncate">
              {selected.length === 0 ? `All ${label}s` : `${selected.length} selected`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50 ml-1 flex-shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2" align="start">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1">
              No options available
            </p>
          ) : (
            <div className="space-y-0.5 max-h-56 overflow-y-auto">
              {options.map((opt) => (
                <div
                  key={opt}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
                  onClick={() => toggle(opt)}
                  data-testid={`checkbox-${testId}-${opt}`}
                >
                  <Checkbox
                    checked={selected.includes(opt)}
                    onCheckedChange={() => toggle(opt)}
                  />
                  <Label className="text-sm cursor-pointer leading-tight">
                    {opt}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AccountMapReport() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [marketFilter, setMarketFilter] = useState<string[]>([]);
  const [networkFilter, setNetworkFilter] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [accountTypeFilter, setAccountTypeFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<AccountPin | null>(
    null
  );
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<AccountMapData>({
      queryKey: ["/api/reports/account-map"],
      staleTime: 60_000,
    });

  const accounts = data?.accounts ?? [];
  const filterOptions = data?.filterOptions ?? {
    markets: [],
    networks: [],
    states: [],
    accountTypes: [],
  };

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (
        statusFilter !== "all" &&
        (a.status || "").toLowerCase() !== statusFilter.toLowerCase()
      )
        return false;
      if (
        marketFilter.length > 0 &&
        !marketFilter.includes(a.market || "")
      )
        return false;
      if (
        networkFilter.length > 0 &&
        !networkFilter.includes(a.network || "")
      )
        return false;
      if (stateFilter.length > 0 && !stateFilter.includes(a.state || ""))
        return false;
      if (
        accountTypeFilter.length > 0 &&
        !accountTypeFilter.includes(a.accountType || "")
      )
        return false;
      if (dateFrom && a.createdAt && a.createdAt.substring(0, 10) < dateFrom)
        return false;
      if (dateTo && a.createdAt && a.createdAt.substring(0, 10) > dateTo)
        return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !(a.name || "").toLowerCase().includes(s) &&
          !(a.city || "").toLowerCase().includes(s) &&
          !(a.state || "").toLowerCase().includes(s) &&
          !(a.phone || "").toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [
    accounts,
    statusFilter,
    marketFilter,
    networkFilter,
    stateFilter,
    accountTypeFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  const withCoords = useMemo(
    () => filtered.filter((a) => a.lat != null && a.lng != null),
    [filtered]
  );

  const summary = useMemo(
    () => ({
      total: filtered.length,
      active: filtered.filter(
        (a) => (a.status || "").toLowerCase() === "active"
      ).length,
      inactive: filtered.filter(
        (a) => (a.status || "").toLowerCase() !== "active"
      ).length,
      markets: new Set(filtered.map((a) => a.market).filter(Boolean)).size,
      networks: new Set(filtered.map((a) => a.network).filter(Boolean)).size,
      states: new Set(filtered.map((a) => a.state).filter(Boolean)).size,
    }),
    [filtered]
  );

  const handleSelect = useCallback((a: AccountPin) => setSelectedAccount(a), []);

  const hasActiveFilters =
    statusFilter !== "Active" ||
    marketFilter.length > 0 ||
    networkFilter.length > 0 ||
    stateFilter.length > 0 ||
    accountTypeFilter.length > 0 ||
    dateFrom !== "" ||
    dateTo !== "" ||
    search !== "";

  const activeFilterCount = [
    marketFilter.length > 0,
    networkFilter.length > 0,
    stateFilter.length > 0,
    accountTypeFilter.length > 0,
    !!dateFrom,
    !!dateTo,
  ].filter(Boolean).length;

  function clearFilters() {
    setStatusFilter("Active");
    setMarketFilter([]);
    setNetworkFilter([]);
    setStateFilter([]);
    setAccountTypeFilter([]);
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  function buildExportRows() {
    const headers = [
      "Account Name",
      "Address",
      "City",
      "State",
      "Zip",
      "Phone",
      "Network",
      "Market",
      "Status",
      "Account Type",
      "Customer Since",
    ];
    const rows = filtered.map((a) =>
      [
        a.name,
        a.address,
        a.city,
        a.state,
        a.zip,
        a.phone,
        a.network,
        a.market,
        a.status,
        a.accountType,
        a.createdAt ? a.createdAt.substring(0, 10) : "",
      ]
        .map((v) => `"${(v || "").replace(/"/g, '""')}"`)
        .join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  function exportCSV() {
    const blob = new Blob([buildExportRows()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "account-map.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportExcel() {
    const blob = new Blob([buildExportRows()], {
      type: "application/vnd.ms-excel",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "account-map.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-muted-foreground">
          Account Map could not be loaded.
        </p>
        <Button onClick={() => refetch()} data-testid="button-account-map-retry">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background z-10 flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Account Map</h1>
          <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
            {isLoading || isFetching
              ? "Loading…"
              : `${withCoords.length.toLocaleString()} pins`}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9 w-52 text-sm"
              placeholder="Search accounts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-account-map-search"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="w-32 h-9 text-sm"
              data-testid="select-account-map-status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={showFilters ? "default" : "outline"}
            size="default"
            onClick={() => setShowFilters((v) => !v)}
            data-testid="button-account-map-filters"
          >
            <Filter className="h-4 w-4 mr-1.5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="ml-1.5 h-5 px-1.5 text-xs no-default-hover-elevate no-default-active-elevate">
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-account-map-refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>

          <Button
            variant="outline"
            size="default"
            onClick={exportCSV}
            data-testid="button-account-map-export-csv"
          >
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>

          <Button
            variant="outline"
            size="default"
            onClick={exportExcel}
            data-testid="button-account-map-export-excel"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Excel
          </Button>
        </div>
      </div>

      {/* ── Filter drawer ── */}
      {showFilters && (
        <div className="flex-shrink-0 px-4 py-3 border-b bg-muted/40 flex flex-wrap gap-4 items-end">
          <MultiSelectFilter
            label="Market"
            options={filterOptions.markets}
            selected={marketFilter}
            onChange={setMarketFilter}
            testId="filter-market"
          />
          <MultiSelectFilter
            label="Network"
            options={filterOptions.networks}
            selected={networkFilter}
            onChange={setNetworkFilter}
            testId="filter-network"
          />
          <MultiSelectFilter
            label="State"
            options={filterOptions.states}
            selected={stateFilter}
            onChange={setStateFilter}
            testId="filter-state"
          />
          <MultiSelectFilter
            label="Account Type"
            options={filterOptions.accountTypes}
            selected={accountTypeFilter}
            onChange={setAccountTypeFilter}
            testId="filter-account-type"
          />

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Customer Since
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="h-9 text-sm w-36"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-account-map-date-from"
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="date"
                className="h-9 text-sm w-36"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-account-map-date-to"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="default"
              onClick={clearFilters}
              data-testid="button-account-map-clear-filters"
            >
              <X className="h-4 w-4 mr-1" />
              Clear Filters
            </Button>
          )}
        </div>
      )}

      {/* ── Summary widgets ── */}
      <div className="flex-shrink-0 px-4 py-2 border-b bg-background flex gap-4 flex-wrap items-center">
        <SummaryWidget label="Total Accounts" value={summary.total} />
        <div className="w-px h-6 bg-border" />
        <SummaryWidget label="Active" value={summary.active} accent="green" />
        <SummaryWidget
          label="Inactive"
          value={summary.inactive}
          accent="gray"
        />
        <div className="w-px h-6 bg-border" />
        <SummaryWidget label="Markets" value={summary.markets} />
        <SummaryWidget label="Networks" value={summary.networks} />
        <SummaryWidget label="States" value={summary.states} />
        {!isLoading && filtered.length > 0 && filtered.length !== withCoords.length && (
          <span className="text-xs text-muted-foreground ml-auto">
            {(filtered.length - withCoords.length).toLocaleString()} address
            {filtered.length - withCoords.length !== 1 ? "es" : ""} pending
            geocoding
          </span>
        )}
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative min-h-0">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-[500]">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Loading accounts and geocoding addresses…
              </p>
            </div>
          </div>
        )}

        {!isLoading && filtered.length > 0 && withCoords.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-[500] pointer-events-none">
            <p className="text-muted-foreground text-sm bg-background/80 px-4 py-2 rounded-md">
              No map coordinates available yet. They will geocode on the next
              load.
            </p>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-[500] pointer-events-none">
            <p className="text-muted-foreground text-sm bg-background/80 px-4 py-2 rounded-md">
              No accounts found matching current filters.
            </p>
          </div>
        )}

        <MapContainer
          center={[39.5, -98.35]}
          zoom={4}
          style={{ height: "100%", width: "100%" }}
          zoomControl
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {!isLoading && withCoords.length > 0 && (
            <ClusterLayer accounts={withCoords} onSelect={handleSelect} />
          )}
        </MapContainer>

        {/* ── Selected account popup ── */}
        {selectedAccount && (
          <div
            className="absolute top-4 right-4 z-[1000] w-72"
            data-testid="panel-selected-account"
          >
            <Card className="shadow-lg">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">
                      {selectedAccount.name}
                    </p>
                    <Badge
                      variant={
                        (selectedAccount.status || "").toLowerCase() ===
                        "active"
                          ? "default"
                          : "secondary"
                      }
                      className="mt-1 text-xs no-default-hover-elevate no-default-active-elevate"
                    >
                      {selectedAccount.status || "Unknown"}
                    </Badge>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setSelectedAccount(null)}
                    data-testid="button-close-account-popup"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-1 text-sm">
                  {selectedAccount.address && (
                    <p className="text-muted-foreground">
                      {selectedAccount.address}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    {[
                      selectedAccount.city,
                      selectedAccount.state,
                      selectedAccount.zip,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {selectedAccount.phone && (
                    <p className="text-muted-foreground">
                      {selectedAccount.phone}
                    </p>
                  )}
                  {selectedAccount.network && (
                    <p className="text-xs">
                      <span className="font-medium">Network:</span>{" "}
                      {selectedAccount.network}
                    </p>
                  )}
                  {selectedAccount.market && (
                    <p className="text-xs">
                      <span className="font-medium">Market:</span>{" "}
                      {selectedAccount.market}
                    </p>
                  )}
                </div>

                {selectedAccount.id ? (
                  <a
                    href={`/customers/${selectedAccount.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    data-testid="link-account-more-details"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Click for More Details
                  </a>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground" data-testid="text-account-no-details">
                    Account details unavailable
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
