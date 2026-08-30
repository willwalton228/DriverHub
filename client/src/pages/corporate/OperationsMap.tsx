import "leaflet.heat";
import * as L from "leaflet";
import { useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MapPin,
  Layers,
  Building2,
  Users,
  Briefcase,
  Car,
  Filter,
  X,
  ExternalLink,
  RefreshCw,
  Loader2,
  Flame,
} from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/dateFormat";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MapAccount {
  id: string;
  name: string;
  status: string;
  region: string | null;
  network: string | null;
  market: string | null;
  driverModel: string | null;
  lat: number;
  lng: number;
  address: string | null;
}

interface MapDriver {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  email: string | null;
  accounts: string[];
  lat: number;
  lng: number;
  city: string | null;
  state: string | null;
}

interface MapEmployee {
  id: string;
  name: string;
  role: string | null;
  region: string | null;
  assignedArea: string | null;
  lat: number;
  lng: number;
  city: string | null;
  state: string | null;
}

interface MapMove {
  id: string;
  moveNumber: string;
  status: string;
  assignmentState: string;
  executionState: string;
  accountName: string | null;
  accountId: string | null;
  driverName: string | null;
  tripDate: string;
  origin: string;
  destination: string;
  lat: number;
  lng: number;
}

type LayerKey = "accounts" | "drivers" | "employees" | "moves";

// Layers that support heat map visualization
type HeatLayerKey = "drivers" | "moves";

// Visualization mode: pins only, heat map only, or both
type VizMode = "pins" | "heat" | "both";

interface LayerConfig {
  key: LayerKey;
  label: string;
  icon: React.ElementType;
  color: string;
  radius: number;
  supportsHeat: boolean;
}

// ── Layer configuration ────────────────────────────────────────────────────────

const LAYERS: LayerConfig[] = [
  {
    key: "accounts",
    label: "Accounts",
    icon: Building2,
    color: "#6366f1",
    radius: 9,
    supportsHeat: false,
  },
  {
    key: "drivers",
    label: "Drivers",
    icon: Users,
    color: "#22c55e",
    radius: 7,
    supportsHeat: true,
  },
  {
    key: "employees",
    label: "Employees",
    icon: Briefcase,
    color: "#a855f7",
    radius: 7,
    supportsHeat: false,
  },
  {
    key: "moves",
    label: "Moves",
    icon: Car,
    color: "#f97316",
    radius: 7,
    supportsHeat: true,
  },
];

// Classic blue → yellow → red heat gradient (shared across all heat layers)
const HEAT_GRADIENT: Record<number, string> = {
  0.0: "#2563eb",
  0.35: "#facc15",
  0.65: "#f97316",
  1.0: "#dc2626",
};
const HEAT_GRADIENTS: Record<HeatLayerKey, Record<number, string>> = {
  drivers: HEAT_GRADIENT,
  moves: HEAT_GRADIENT,
};

const STALE_TIME = 60_000;

// ── DivIcon factories for distinct marker shapes ───────────────────────────────

function makeDriverIcon(active = true) {
  const bg = active ? "#22c55e" : "#6b7280";
  return L.divIcon({
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="9" fill="${bg}" stroke="#fff" stroke-width="2"/>
      <circle cx="10" cy="7.5" r="2.5" fill="#fff"/>
      <path d="M5 16c0-2.76 2.24-5 5-5s5 2.24 5 5" fill="#fff" opacity="0.9"/>
    </svg>`,
  });
}

function makeMoveIcon() {
  return L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <rect x="2" y="2" width="14" height="14" rx="2" fill="#f97316" stroke="#c2410c" stroke-width="1.5" transform="rotate(45 9 9)"/>
      <path d="M9 5.5 L12.5 9 L9 12.5 L5.5 9 Z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="9" cy="9" r="1.5" fill="#fff"/>
    </svg>`,
  });
}

// ── Canvas Heat Map Layer (wraps leaflet.heat) ─────────────────────────────────

interface HeatmapLayerProps {
  points: [number, number][];
  layerKey: HeatLayerKey;
}

function HeatmapLayer({ points, layerKey }: HeatmapLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (points.length === 0) return;

    const heatPoints: L.HeatLatLngTuple[] = points.map(([lat, lng]) => [lat, lng, 1]);
    layerRef.current = L.heatLayer(heatPoints, {
      radius: 28,
      blur: 22,
      maxZoom: 17,
      max: 1.0,
      minOpacity: 0.35,
      gradient: HEAT_GRADIENTS[layerKey],
    }).addTo(map);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
    // points is a stable memoized reference from the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, layerKey, points]);

  return null;
}

// ── Map bounds auto-fit helper ─────────────────────────────────────────────────

function MapBoundsFitter({ points, trigger }: { points: [number, number][]; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return null;
}

// ── Popup content helpers ─────────────────────────────────────────────────────

function AccountPopup({ a }: { a: MapAccount }) {
  return (
    <div className="text-sm min-w-[200px]">
      <div className="font-semibold text-base mb-1">{a.name}</div>
      <div className="space-y-0.5 text-muted-foreground">
        <div><span className="font-medium text-foreground">Status:</span> {a.status}</div>
        {a.region && <div><span className="font-medium text-foreground">Region:</span> {a.region}</div>}
        {a.network && <div><span className="font-medium text-foreground">Network:</span> {a.network}</div>}
        {a.address && <div className="text-xs mt-1">{a.address}</div>}
      </div>
      <Link href={`/accounts/${a.id}`}>
        <span className="text-xs text-primary flex items-center gap-1 mt-2 hover:underline cursor-pointer">
          <ExternalLink className="h-3 w-3" />View account
        </span>
      </Link>
    </div>
  );
}

function DriverPopup({ d }: { d: MapDriver }) {
  return (
    <div className="text-sm min-w-[200px]">
      <div className="font-semibold text-base mb-1">{d.name}</div>
      <div className="space-y-0.5 text-muted-foreground">
        <div><span className="font-medium text-foreground">Status:</span> {d.status}</div>
        {d.phone && <div><span className="font-medium text-foreground">Mobile:</span> {d.phone}</div>}
        {d.accounts.length > 0 && (
          <div><span className="font-medium text-foreground">Account(s):</span> {d.accounts.join(", ")}</div>
        )}
        {d.city && <div className="text-xs">{d.city}{d.state ? `, ${d.state}` : ""}</div>}
      </div>
      <Link href={`/drivers/${d.id}`}>
        <span className="text-xs text-primary flex items-center gap-1 mt-2 hover:underline cursor-pointer">
          <ExternalLink className="h-3 w-3" />View driver
        </span>
      </Link>
    </div>
  );
}

function EmployeePopup({ e }: { e: MapEmployee }) {
  return (
    <div className="text-sm min-w-[180px]">
      <div className="font-semibold text-base mb-1">{e.name}</div>
      <div className="space-y-0.5 text-muted-foreground">
        {e.role && <div><span className="font-medium text-foreground">Role:</span> {e.role}</div>}
        {e.region && <div><span className="font-medium text-foreground">Region:</span> {e.region}</div>}
        {e.city && <div className="text-xs">{e.city}{e.state ? `, ${e.state}` : ""}</div>}
      </div>
    </div>
  );
}

function MovePopup({ m }: { m: MapMove }) {
  return (
    <div className="text-sm min-w-[220px]">
      <div className="font-semibold text-base mb-1">Move #{m.moveNumber}</div>
      <div className="space-y-0.5 text-muted-foreground">
        <div><span className="font-medium text-foreground">Status:</span> {m.status || m.executionState}</div>
        {m.accountName && <div><span className="font-medium text-foreground">Account:</span> {m.accountName}</div>}
        {m.driverName && <div><span className="font-medium text-foreground">Driver:</span> {m.driverName}</div>}
        <div><span className="font-medium text-foreground">Date:</span> {formatDate(m.tripDate)}</div>
        <div className="text-xs mt-1">
          <span className="font-medium text-foreground">Pickup:</span> {m.origin}
        </div>
        <div className="text-xs">
          <span className="font-medium text-foreground">Dropoff:</span> {m.destination}
        </div>
      </div>
    </div>
  );
}

// ── Viz Mode Toggle (Pins / Heat / Both) ──────────────────────────────────────

function VizModeToggle({
  value,
  onChange,
  color,
}: {
  value: VizMode;
  onChange: (v: VizMode) => void;
  color: string;
}) {
  const opts: { key: VizMode; label: string; title: string }[] = [
    { key: "pins", label: "Pins", title: "Show as pins" },
    { key: "heat", label: "Heat", title: "Show as heat map" },
    { key: "both", label: "Both", title: "Show pins and heat map" },
  ];
  return (
    <div className="flex rounded-md overflow-hidden border text-[10px] mt-1">
      {opts.map(({ key, label, title }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <button
              onClick={() => onChange(key)}
              title={title}
              data-testid={`button-vizmode-${key}`}
              className={`flex-1 px-1.5 py-0.5 transition-colors ${
                value === key
                  ? "text-white font-semibold"
                  : "text-muted-foreground bg-background"
              }`}
              style={value === key ? { backgroundColor: color } : {}}
            >
              {label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{title}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OperationsMap() {
  // Layer visibility toggles — Accounts + Drivers ON by default; Employees + Moves OFF
  const [visibleLayers, setVisibleLayers] = useState<Record<LayerKey, boolean>>({
    accounts: true,
    drivers: true,
    employees: false,
    moves: false,
  });

  // Visualization mode per heat-capable layer
  const [vizModes, setVizModes] = useState<Record<HeatLayerKey, VizMode>>({
    drivers: "pins",
    moves: "pins",
  });

  const setVizMode = (key: HeatLayerKey, mode: VizMode) =>
    setVizModes((prev) => ({ ...prev, [key]: mode }));

  // Global Pins / Heat Map view toggle
  const [globalMapView, setGlobalMapView] = useState<"pins" | "heat">("pins");

  const handleGlobalMapView = (view: "pins" | "heat") => {
    setGlobalMapView(view);
    const mode: VizMode = view === "heat" ? "heat" : "pins";
    setVizModes({ drivers: mode, moves: mode });
    // Turn on both heat-capable layers when switching to heat view
    if (view === "heat") {
      setVisibleLayers((prev) => ({ ...prev, drivers: true, moves: true }));
    }
  };

  // Filter panel
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters — separate status per entity type
  const [filterAccountStatus, setFilterAccountStatus] = useState("all");
  const [filterDriverStatus, setFilterDriverStatus] = useState("all");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterMarket, setFilterMarket] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [datePreset, setDatePreset] = useState<"today" | "7d" | "30d" | "custom">("custom");

  const applyDatePreset = (preset: "today" | "7d" | "30d" | "custom") => {
    setDatePreset(preset);
    const today = new Date().toISOString().slice(0, 10);
    if (preset === "today") {
      setFilterDateFrom(today);
      setFilterDateTo(today);
    } else if (preset === "7d") {
      setFilterDateFrom(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
      setFilterDateTo(today);
    } else if (preset === "30d") {
      setFilterDateFrom(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
      setFilterDateTo(today);
    }
    // "custom" keeps existing values so user can type them in
  };

  // Auto-fit trigger — bumped on manual "Fit All" or after initial account load
  const [fitTrigger, setFitTrigger] = useState(0);
  const autoFittedRef = useRef(false);

  // Build query params
  const accountParams = new URLSearchParams();
  if (filterAccountStatus !== "all") accountParams.set("status", filterAccountStatus);
  if (filterRegion) accountParams.set("region", filterRegion);
  if (filterMarket) accountParams.set("market", filterMarket);

  const moveParams = new URLSearchParams();
  if (filterDateFrom) moveParams.set("from", filterDateFrom);
  if (filterDateTo) moveParams.set("to", filterDateTo);
  if (filterAccountStatus !== "all") moveParams.set("status", filterAccountStatus);
  if (filterMarket) moveParams.set("market", filterMarket);

  const driverParams = new URLSearchParams();
  if (filterDriverStatus !== "all") driverParams.set("status", filterDriverStatus);
  if (filterRegion) driverParams.set("region", filterRegion);
  if (filterMarket) driverParams.set("market", filterMarket);

  const safeJson = async (r: Response) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    return Array.isArray(json) ? json : [];
  };

  // Always fetch when layer is active (whether in pins or heat mode)
  const { data: accounts = [], isLoading: loadingAccounts, refetch: refetchAccounts, isError: accountsError } =
    useQuery<MapAccount[]>({
      queryKey: ["/api/ops-map/accounts", filterAccountStatus, filterRegion, filterMarket],
      queryFn: () => fetch(`/api/ops-map/accounts?${accountParams}`).then(safeJson),
      staleTime: STALE_TIME,
      enabled: visibleLayers.accounts,
    });

  const { data: drivers = [], isLoading: loadingDrivers, refetch: refetchDrivers, isError: driversError } =
    useQuery<MapDriver[]>({
      queryKey: ["/api/ops-map/drivers", filterDriverStatus, filterRegion, filterMarket],
      queryFn: () => fetch(`/api/ops-map/drivers?${driverParams}`).then(safeJson),
      staleTime: STALE_TIME,
      enabled: visibleLayers.drivers,
    });

  const { data: employees = [], isLoading: loadingEmployees, refetch: refetchEmployees, isError: employeesError } =
    useQuery<MapEmployee[]>({
      queryKey: ["/api/ops-map/employees"],
      queryFn: () => fetch("/api/ops-map/employees").then(safeJson),
      staleTime: STALE_TIME,
      enabled: visibleLayers.employees,
    });

  const { data: moves = [], isLoading: loadingMoves, refetch: refetchMoves, isError: movesError } =
    useQuery<MapMove[]>({
      queryKey: ["/api/ops-map/moves", filterDateFrom, filterDateTo, filterAccountStatus, filterMarket],
      queryFn: () => fetch(`/api/ops-map/moves?${moveParams}`).then(safeJson),
      staleTime: STALE_TIME,
      enabled: visibleLayers.moves,
    });

  const anyError = accountsError || driversError || employeesError || movesError;

  const isLoading = loadingAccounts || loadingDrivers || loadingEmployees || loadingMoves;

  // Heat points — memoized so HeatmapLayer only re-renders when the data actually changes
  const driverHeatPoints = useMemo<[number, number][]>(
    () => drivers.map((d) => [d.lat, d.lng]),
    [drivers],
  );
  const moveHeatPoints = useMemo<[number, number][]>(
    () => moves.map((m) => [m.lat, m.lng]),
    [moves],
  );

  // All visible points for bounds fitting
  const allPoints: [number, number][] = [
    ...(visibleLayers.accounts ? accounts.map((a) => [a.lat, a.lng] as [number, number]) : []),
    ...(visibleLayers.drivers ? drivers.map((d) => [d.lat, d.lng] as [number, number]) : []),
    ...(visibleLayers.employees ? employees.map((e) => [e.lat, e.lng] as [number, number]) : []),
    ...(visibleLayers.moves ? moves.map((m) => [m.lat, m.lng] as [number, number]) : []),
  ];

  const toggleLayer = (key: LayerKey) =>
    setVisibleLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleFitBounds = () => setFitTrigger((t) => t + 1);

  const handleRefresh = () => {
    refetchAccounts();
    refetchDrivers();
    refetchEmployees();
    refetchMoves();
  };

  // Auto-fit to accounts on first successful load
  useEffect(() => {
    if (!autoFittedRef.current && accounts.length > 0) {
      autoFittedRef.current = true;
      setFitTrigger((t) => t + 1);
    }
  }, [accounts]);

  const clearFilters = () => {
    setFilterAccountStatus("all");
    setFilterDriverStatus("all");
    setFilterRegion("");
    setFilterMarket("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setDatePreset("custom");
  };

  const hasActiveFilters =
    filterAccountStatus !== "all" || filterDriverStatus !== "all" ||
    filterRegion || filterMarket || filterDateFrom || filterDateTo;

  // Layer counts
  const counts: Record<LayerKey, number> = {
    accounts: accounts.length,
    drivers: drivers.length,
    employees: employees.length,
    moves: moves.length,
  };

  // Heat-active indicator for a layer
  const isHeatActive = (key: HeatLayerKey) =>
    visibleLayers[key] && (vizModes[key] === "heat" || vizModes[key] === "both");

  const showPins = (key: LayerKey) => {
    if (!visibleLayers[key]) return false;
    if (key === "drivers" || key === "moves") {
      return vizModes[key] === "pins" || vizModes[key] === "both";
    }
    return true;
  };

  // Empty state: all active layers have loaded with zero results
  const anyLayerActive =
    visibleLayers.accounts || visibleLayers.drivers || visibleLayers.employees || visibleLayers.moves;
  const noData =
    !isLoading &&
    anyLayerActive &&
    (!visibleLayers.accounts || accounts.length === 0) &&
    (!visibleLayers.drivers || drivers.length === 0) &&
    (!visibleLayers.employees || employees.length === 0) &&
    (!visibleLayers.moves || moves.length === 0);

  return (
    <div className="flex flex-col h-full relative">
      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-[450] bg-background/95 backdrop-blur border-b px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">Operations Map</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Accounts · Drivers · Employees · Moves
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isLoading && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />Loading…
            </span>
          )}
          {anyError && !isLoading && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <X className="h-3 w-3" />One or more layers failed to load
            </span>
          )}

          {/* ── Global Pins / Heat Map toggle ── */}
          <div className="flex items-center rounded-md border overflow-hidden text-xs shrink-0">
            <button
              onClick={() => handleGlobalMapView("pins")}
              data-testid="button-mapview-pins"
              className={`px-3 py-1.5 transition-colors ${
                globalMapView === "pins"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              Pins
            </button>
            <button
              onClick={() => handleGlobalMapView("heat")}
              data-testid="button-mapview-heat"
              className={`px-3 py-1.5 transition-colors flex items-center gap-1 ${
                globalMapView === "heat"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              <Flame className="h-3 w-3" />
              Heat Map
            </button>
          </div>

          <Button
            size="icon"
            variant="ghost"
            onClick={handleRefresh}
            data-testid="button-refresh-map"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={hasActiveFilters ? "default" : "outline"}
            onClick={() => setFiltersOpen((o) => !o)}
            data-testid="button-toggle-filters"
            className="gap-1.5"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilters && (
              <Badge className="ml-1 h-4 px-1 text-[10px]">Active</Badge>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleFitBounds}
            data-testid="button-fit-bounds"
          >
            Fit All
          </Button>
        </div>
      </div>

      {/* ── Filter Panel ───────────────────────────────────────────────────── */}
      {filtersOpen && (
        <div className="z-[440] bg-background border-b px-4 sm:px-6 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-[150px]">
              <label className="text-xs font-medium text-muted-foreground">Account Status</label>
              <Select value={filterAccountStatus} onValueChange={setFilterAccountStatus}>
                <SelectTrigger data-testid="select-filter-account-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[150px]">
              <label className="text-xs font-medium text-muted-foreground">Driver Status</label>
              <Select value={filterDriverStatus} onValueChange={setFilterDriverStatus}>
                <SelectTrigger data-testid="select-filter-driver-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Suspended">Suspended</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Region / State</label>
              <Input
                placeholder="e.g. FL"
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                data-testid="input-filter-region"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Market / Network</label>
              <Input
                placeholder="Market…"
                value={filterMarket}
                onChange={(e) => setFilterMarket(e.target.value)}
                data-testid="input-filter-market"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Moves Date Range</label>
              <div className="flex items-center gap-1 flex-wrap">
                {(["today", "7d", "30d", "custom"] as const).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={datePreset === p ? "default" : "outline"}
                    onClick={() => applyDatePreset(p)}
                    data-testid={`button-date-preset-${p}`}
                  >
                    {p === "today" ? "Today" : p === "7d" ? "Last 7 Days" : p === "30d" ? "Last 30 Days" : "Custom"}
                  </Button>
                ))}
              </div>
              {datePreset === "custom" && (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    data-testid="input-filter-date-from"
                    className="w-36"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    data-testid="input-filter-date-to"
                    className="w-36"
                  />
                </div>
              )}
            </div>
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearFilters}
                className="gap-1"
                data-testid="button-clear-filters"
              >
                <X className="h-3.5 w-3.5" />Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Map + Controls ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative" style={{ minHeight: "500px" }}>
        <MapContainer
          center={[25.76, -80.19]}
          zoom={8}
          scrollWheelZoom={true}
          doubleClickZoom={true}
          dragging={true}
          zoomControl={true}
          touchZoom={true}
          className="h-full w-full"
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapBoundsFitter points={allPoints} trigger={fitTrigger} />

          {/* ── Heat map layers (rendered below pins for readability) ── */}
          {isHeatActive("drivers") && (
            <HeatmapLayer points={driverHeatPoints} layerKey="drivers" />
          )}
          {isHeatActive("moves") && (
            <HeatmapLayer points={moveHeatPoints} layerKey="moves" />
          )}

          {/* ── Accounts pins ── */}
          {showPins("accounts") &&
            accounts.map((a) => (
              <CircleMarker
                key={`acc-${a.id}`}
                center={[a.lat, a.lng]}
                radius={9}
                pathOptions={{
                  fillColor: "#6366f1",
                  color: "#4338ca",
                  weight: 1.5,
                  opacity: 1,
                  fillOpacity: 0.85,
                }}
              >
                <Popup maxWidth={280}>
                  <AccountPopup a={a} />
                </Popup>
              </CircleMarker>
            ))}

          {/* ── Driver pins (person icon — shown in pins / both mode) ── */}
          {showPins("drivers") &&
            drivers.map((d) => (
              <Marker
                key={`drv-${d.id}`}
                position={[d.lat, d.lng]}
                icon={makeDriverIcon(d.status === "Active")}
              >
                <Popup maxWidth={260}>
                  <DriverPopup d={d} />
                </Popup>
              </Marker>
            ))}

          {/* ── Employee pins ── */}
          {showPins("employees") &&
            employees.map((e) => (
              <CircleMarker
                key={`emp-${e.id}`}
                center={[e.lat, e.lng]}
                radius={7}
                pathOptions={{
                  fillColor: "#a855f7",
                  color: "#7c3aed",
                  weight: 1.5,
                  opacity: 1,
                  fillOpacity: 0.85,
                }}
              >
                <Popup maxWidth={240}>
                  <EmployeePopup e={e} />
                </Popup>
              </CircleMarker>
            ))}

          {/* ── Move pins (diamond icon — shown in pins / both mode) ── */}
          {showPins("moves") &&
            moves.map((m) => (
              <Marker
                key={`mv-${m.id}`}
                position={[m.lat, m.lng]}
                icon={makeMoveIcon()}
              >
                <Popup maxWidth={300}>
                  <MovePopup m={m} />
                </Popup>
              </Marker>
            ))}
        </MapContainer>

        {/* ── Empty State Overlay ── */}
        {noData && (
          <div className="absolute inset-0 z-[410] flex items-center justify-center pointer-events-none">
            <div className="bg-background/90 backdrop-blur rounded-lg px-6 py-4 shadow-lg flex flex-col items-center gap-2 text-center max-w-xs pointer-events-auto">
              <MapPin className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No data available for selected filters</p>
              <p className="text-xs text-muted-foreground">Try adjusting your filters or toggling a different layer.</p>
              {hasActiveFilters && (
                <Button size="sm" variant="outline" onClick={clearFilters} className="mt-1 gap-1">
                  <X className="h-3 w-3" />Clear filters
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Layer Controls (floating top-right) ── */}
        <div className="absolute top-3 right-3 z-[400]">
          <Card className="shadow-md w-[170px]">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                Layers
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 space-y-2">
              {LAYERS.map((layer) => {
                const Icon = layer.icon;
                const active = visibleLayers[layer.key];
                const heatMode =
                  layer.supportsHeat &&
                  (vizModes[layer.key as HeatLayerKey] === "heat" ||
                    vizModes[layer.key as HeatLayerKey] === "both");
                return (
                  <div key={layer.key}>
                    <button
                      onClick={() => toggleLayer(layer.key)}
                      data-testid={`button-layer-${layer.key}`}
                      className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded-md text-xs transition-colors ${
                        active
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover-elevate"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 border"
                        style={{
                          backgroundColor: active ? layer.color : "transparent",
                          borderColor: layer.color,
                        }}
                      />
                      <Icon
                        className="h-3 w-3 shrink-0"
                        style={{ color: active ? layer.color : undefined }}
                      />
                      <span className="flex-1">{layer.label}</span>
                      <span className="flex items-center gap-0.5">
                        {heatMode && active && (
                          <Flame
                            className="h-2.5 w-2.5"
                            style={{ color: layer.color }}
                          />
                        )}
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {counts[layer.key]}
                        </span>
                      </span>
                    </button>

                    {/* Viz mode toggle — only for heat-capable layers when active */}
                    {layer.supportsHeat && active && (
                      <VizModeToggle
                        value={vizModes[layer.key as HeatLayerKey]}
                        onChange={(mode) =>
                          setVizMode(layer.key as HeatLayerKey, mode)
                        }
                        color={layer.color}
                      />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* ── Summary Stats (floating bottom-left) ── */}
        <div className="absolute bottom-6 left-3 z-[400]">
          <Card className="shadow-md">
            <CardContent className="px-3 py-2">
              <div className="flex items-center gap-3">
                {LAYERS.map((layer) => {
                  if (!visibleLayers[layer.key]) return null;
                  const Icon = layer.icon;
                  const heatOn =
                    layer.supportsHeat &&
                    (vizModes[layer.key as HeatLayerKey] === "heat" ||
                      vizModes[layer.key as HeatLayerKey] === "both");
                  return (
                    <div key={layer.key} className="flex items-center gap-1 text-xs">
                      {heatOn ? (
                        <Flame className="h-3 w-3" style={{ color: layer.color }} />
                      ) : (
                        <Icon className="h-3 w-3" style={{ color: layer.color }} />
                      )}
                      <span className="font-semibold tabular-nums">{counts[layer.key]}</span>
                    </div>
                  );
                })}
                {isLoading && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Heat Map Legend (shown when a heat layer is active) ── */}
        {(isHeatActive("drivers") || isHeatActive("moves")) && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400]">
            <Card className="shadow-md">
              <CardContent className="px-3 py-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Heat Intensity
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Low</span>
                    <div
                      className="h-2.5 w-28 rounded-full"
                      style={{
                        background: "linear-gradient(to right, #2563eb, #facc15, #f97316, #dc2626)",
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">High</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {isHeatActive("drivers") && (
                      <span className="flex items-center gap-1">
                        <Flame className="h-2.5 w-2.5 text-blue-500" />
                        Drivers
                      </span>
                    )}
                    {isHeatActive("moves") && (
                      <span className="flex items-center gap-1">
                        <Flame className="h-2.5 w-2.5 text-red-500" />
                        Moves
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
