import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Package, 
  Calendar, 
  Building2, 
  MapPin, 
  Users,
  Loader2,
  ClipboardList,
  CreditCard,
  AlertCircle,
  Bell
} from "lucide-react";

interface ExportFilters {
  startDate: string;
  endDate: string;
  customerId: string;
  billingEntityId: string;
  locationId: string;
}

interface ExportType {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  endpoint: string;
}

const exportTypes: ExportType[] = [
  {
    id: "invoice-ledger",
    name: "Invoice Ledger",
    description: "All invoices with totals, statuses, and aging buckets",
    icon: <FileText className="h-5 w-5" />,
    endpoint: "/api/corporate/invoicing/exports/invoice-ledger",
  },
  {
    id: "payment-ledger",
    name: "Payment Ledger",
    description: "All payments with methods, references, and applied invoices",
    icon: <CreditCard className="h-5 w-5" />,
    endpoint: "/api/corporate/invoicing/exports/payment-ledger",
  },
  {
    id: "credits-voids",
    name: "Credits & Voids Report",
    description: "Credit memos and voided invoices with audit trail (who/when/why)",
    icon: <AlertCircle className="h-5 w-5" />,
    endpoint: "/api/corporate/invoicing/exports/credits-voids",
  },
  {
    id: "collections-activity",
    name: "Reminder & Collections Activity",
    description: "Payment reminders and collections workflow history",
    icon: <Bell className="h-5 w-5" />,
    endpoint: "/api/corporate/invoicing/exports/collections-activity",
  },
];

export function InvoicingExports() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<ExportFilters>({
    startDate: "",
    endDate: "",
    customerId: "",
    billingEntityId: "",
    locationId: "",
  });
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers"],
  });

  const { data: billingEntities = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/billing-entities"],
  });

  const { data: billingLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/billing-locations"],
  });

  const buildQueryString = (format: string) => {
    const params = new URLSearchParams();
    params.append("format", format);
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    if (filters.customerId) params.append("customerId", filters.customerId);
    if (filters.billingEntityId) params.append("billingEntityId", filters.billingEntityId);
    if (filters.locationId) params.append("locationId", filters.locationId);
    return params.toString();
  };

  const handleExport = async (exportType: ExportType, format: "csv" | "pdf") => {
    setExportingId(`${exportType.id}-${format}`);
    try {
      const queryString = buildQueryString(format);
      const response = await fetch(`${exportType.endpoint}?${queryString}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportType.id}_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Complete",
        description: `${exportType.name} exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to generate the export. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExportingId(null);
    }
  };

  const handleBundleDownload = async () => {
    setBundleLoading(true);
    try {
      const queryString = buildQueryString("zip");
      const response = await fetch(`/api/corporate/invoicing/exports/compliance-bundle?${queryString}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Bundle download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const periodLabel = filters.startDate && filters.endDate
        ? `${filters.startDate}_to_${filters.endDate}`.replace(/-/g, "")
        : new Date().toISOString().slice(0, 7).replace("-", "");
      
      a.download = `compliance_bundle_${periodLabel}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Bundle Downloaded",
        description: "Compliance package downloaded successfully with all reports",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Unable to create compliance bundle. Please try again.",
        variant: "destructive",
      });
    } finally {
      setBundleLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      startDate: "",
      endDate: "",
      customerId: "",
      billingEntityId: "",
      locationId: "",
    });
  };

  const hasFilters = Object.values(filters).some(v => v !== "");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Audit Export & Compliance Package
          </CardTitle>
          <CardDescription>
            Generate exportable reports for finance reviews, customer disputes, and auditor requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Start Date
              </Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                data-testid="input-export-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                End Date
              </Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                data-testid="input-export-end-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer" className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Customer
              </Label>
              <Select
                value={filters.customerId || "__all__"}
                onValueChange={(value) => setFilters({ ...filters, customerId: value === "__all__" ? "" : value })}
              >
                <SelectTrigger id="customer" data-testid="select-export-customer">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Customers</SelectItem>
                  {customers.map((customer: any) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingEntity" className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                Billing Entity
              </Label>
              <Select
                value={filters.billingEntityId || "__all__"}
                onValueChange={(value) => setFilters({ ...filters, billingEntityId: value === "__all__" ? "" : value })}
              >
                <SelectTrigger id="billingEntity" data-testid="select-export-billing-entity">
                  <SelectValue placeholder="All Entities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Entities</SelectItem>
                  {billingEntities.map((entity: any) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                Location
              </Label>
              <Select
                value={filters.locationId || "__all__"}
                onValueChange={(value) => setFilters({ ...filters, locationId: value === "__all__" ? "" : value })}
              >
                <SelectTrigger id="location" data-testid="select-export-location">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Locations</SelectItem>
                  {billingLocations.map((location: any) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              {hasFilters && (
                <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                  Clear Filters
                </Button>
              )}
            </div>
          </div>

          {hasFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Active Filters:</span>
              {filters.startDate && (
                <Badge variant="secondary">From: {filters.startDate}</Badge>
              )}
              {filters.endDate && (
                <Badge variant="secondary">To: {filters.endDate}</Badge>
              )}
              {filters.customerId && (
                <Badge variant="secondary">
                  Customer: {customers.find((c: any) => c.id === filters.customerId)?.name || filters.customerId}
                </Badge>
              )}
              {filters.billingEntityId && (
                <Badge variant="secondary">
                  Entity: {billingEntities.find((e: any) => e.id === filters.billingEntityId)?.name || filters.billingEntityId}
                </Badge>
              )}
              {filters.locationId && (
                <Badge variant="secondary">
                  Location: {billingLocations.find((l: any) => l.id === filters.locationId)?.name || filters.locationId}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exportTypes.map((exportType) => (
          <Card key={exportType.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {exportType.icon}
                {exportType.name}
              </CardTitle>
              <CardDescription className="text-sm">
                {exportType.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport(exportType, "csv")}
                  disabled={exportingId !== null}
                  data-testid={`button-export-${exportType.id}-csv`}
                >
                  {exportingId === `${exportType.id}-csv` ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                  )}
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport(exportType, "pdf")}
                  disabled={exportingId !== null}
                  data-testid={`button-export-${exportType.id}-pdf`}
                >
                  {exportingId === `${exportType.id}-pdf` ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-1" />
                  )}
                  PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Compliance Bundle Download
          </CardTitle>
          <CardDescription>
            Download all reports in a single ZIP file for the selected period. Includes CSV and PDF versions 
            of all ledgers plus a manifest file for audit documentation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleBundleDownload}
            disabled={bundleLoading}
            className="gap-2"
            data-testid="button-download-compliance-bundle"
          >
            {bundleLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Bundle...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download Compliance Bundle
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Bundle includes: Invoice Ledger, Payment Ledger, Credits/Voids Report, Collections Activity Log (CSV + PDF)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
