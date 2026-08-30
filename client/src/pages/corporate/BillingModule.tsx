import { FileText, CreditCard, Users, Clock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function PlaceholderSection({
  icon: Icon,
  title,
  description,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>
        </div>
        <CardDescription className="text-sm mt-1">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function BillingModule() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Invoice management, payment tracking, customer balances, and aging reports.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PlaceholderSection
            icon={FileText}
            title="Invoices"
            description="Create, manage, and track customer invoices across all accounts."
            items={[
              "Invoice generation and editing",
              "Bulk invoice operations",
              "PDF export and delivery",
              "Invoice status tracking",
            ]}
          />
          <PlaceholderSection
            icon={CreditCard}
            title="Payments"
            description="Record and reconcile incoming payments against open invoices."
            items={[
              "Payment entry and allocation",
              "FIFO payment application",
              "Stripe payment processing",
              "Deposit batch management",
            ]}
          />
          <PlaceholderSection
            icon={Users}
            title="Customer Balances"
            description="Monitor outstanding balances and account standings in real time."
            items={[
              "Live balance dashboard",
              "Account-level balance drill-down",
              "Credit limit monitoring",
              "Balance trend analysis",
            ]}
          />
          <PlaceholderSection
            icon={Clock}
            title="Aging"
            description="Aging schedule across all receivable buckets (Current, 30, 60, 90+ days)."
            items={[
              "Aging summary and detail views",
              "Bucket-level drill-down",
              "Collections priority queue",
              "Automated aging alerts",
            ]}
          />
          <PlaceholderSection
            icon={Zap}
            title="Invoice Actions"
            description="Bulk actions and workflow controls for invoice lifecycle management."
            items={[
              "Batch approve / send",
              "Write-off and credit memo",
              "Dunning and reminder scheduling",
              "Invoice import from CSV / XLSX",
            ]}
          />
        </div>
      </div>
    </div>
  );
}
