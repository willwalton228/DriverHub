import { useQuery } from "@tanstack/react-query";
import type { Customer, Trip, Invoice } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Building2, Users, TrendingUp, Loader2, DollarSign, MapPin, FileText } from "lucide-react";
import { Link } from "wouter";
import { EmailSummaryDialog } from "@/components/EmailSummaryDialog";
import { HubSpotIntegration } from "@/components/HubSpotIntegration";
import { ModuleDashboard } from "@/components/dashboard/ModuleDashboard";

export default function CustomersDashboard() {
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
  });

  const { data: trips = [] } = useQuery<Trip[]>({
    queryKey: ["/api/corporate/trips"],
    select: (data: any) => Array.isArray(data) ? data : (data?.trips ?? []),
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/corporate/invoices"],
  });

  const activeCustomers = customers.filter((c) => c.status === "active");
  const inactiveCustomers = customers.filter((c) => c.status === "inactive");

  const customerTripCounts = customers.map((customer) => {
    const tripCount = trips.filter((t) => t.customerId === customer.id).length;
    return { customer, tripCount };
  }).sort((a, b) => b.tripCount - a.tripCount).slice(0, 5);

  const customerInvoiceTotals = customers.map((customer) => {
    const customerInvoices = invoices.filter((i) => i.customerId === customer.id);
    const total = customerInvoices.reduce((sum, inv) => sum + (parseFloat(inv.totalAmount as string) || 0), 0);
    return { customer, total, invoiceCount: customerInvoices.length };
  }).sort((a, b) => b.total - a.total).slice(0, 5);

  const stateCounts = customers.reduce((acc, cust) => {
    const state = cust.customerState || "Unknown";
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (parseFloat(inv.totalAmount as string) || 0), 0);

  const summaryContent = `
ACCOUNTS SUMMARY
Total Accounts: ${customers.length}
Active: ${activeCustomers.length}
Inactive: ${inactiveCustomers.length}
Total Invoiced: $${totalInvoiced.toFixed(2)}

TOP ACCOUNTS (by moves):
${customerTripCounts.map((c, i) => `${i + 1}. ${c.customer.customerName} - ${c.tripCount} moves`).join("\n")}

TOP ACCOUNTS (by revenue):
${customerInvoiceTotals.map((c, i) => `${i + 1}. ${c.customer.customerName} - $${c.total.toFixed(2)}`).join("\n")}

GEOGRAPHIC DISTRIBUTION:
${Object.entries(stateCounts).slice(0, 5).map(([state, count]) => `${state}: ${count}`).join("\n")}
  `.trim();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold">Accounts Dashboard</h1>
          <EmailSummaryDialog title="Accounts" summaryContent={summaryContent} />
        </div>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Overview of accounts and business metrics
        </p>
      </div>

      <ModuleDashboard moduleKey="accounts" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/customers">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customers.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Click to view all</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/customers?status=active">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeCustomers.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Active accounts</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Moves</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{trips.length}</div>
            <p className="text-xs text-muted-foreground mt-1">All account moves</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveCustomers.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Inactive accounts</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Customers by Moves
            </CardTitle>
            <CardDescription>Most active accounts</CardDescription>
          </CardHeader>
          <CardContent>
            {customerTripCounts.filter(c => c.tripCount > 0).length > 0 ? (
              <div className="space-y-3">
                {customerTripCounts.filter(c => c.tripCount > 0).map(({ customer, tripCount }, index) => (
                  <Link key={customer.id} href={`/customers/${customer.id}`}>
                    <div className="flex items-center justify-between p-2 rounded-lg hover-elevate cursor-pointer">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                        <p className="font-medium">{customer.customerName}</p>
                      </div>
                      <Badge>{tripCount} moves</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No move data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Top Revenue Customers
            </CardTitle>
            <CardDescription>Highest invoice totals</CardDescription>
          </CardHeader>
          <CardContent>
            {customerInvoiceTotals.filter(c => c.total > 0).length > 0 ? (
              <div className="space-y-3">
                {customerInvoiceTotals.filter(c => c.total > 0).map(({ customer, total, invoiceCount }) => (
                  <Link key={customer.id} href={`/customers/${customer.id}`}>
                    <div className="flex items-center justify-between p-2 rounded-lg hover-elevate cursor-pointer">
                      <div>
                        <p className="font-medium">{customer.customerName}</p>
                        <p className="text-sm text-muted-foreground">{invoiceCount} invoices</p>
                      </div>
                      <Badge variant="secondary">${total.toLocaleString()}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No invoice data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              By State
            </CardTitle>
            <CardDescription>Geographic distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stateCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([state, count]) => (
                  <div key={state} className="flex items-center justify-between p-2 rounded-lg border">
                    <p className="font-medium">{state}</p>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Account Directory
          </CardTitle>
          <CardDescription>Quick access to accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {customers.slice(0, 5).map((customer) => (
              <Link key={customer.id} href={`/customers/${customer.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
                  <div>
                    <p className="font-medium">{customer.customerName}</p>
                    <p className="text-sm text-muted-foreground">
                      {customer.customerCity && customer.customerState ? `${customer.customerCity}, ${customer.customerState}` : "Location not set"}
                    </p>
                  </div>
                  <StatusBadge status={customer.status} />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <HubSpotIntegration />
    </div>
  );
}
