import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const labels: Record<string, string> = {
  unconfirmed: "Unconfirmed",
  open: "Open",
  modified_hours: "Modified Hours",
  closed: "Closed",
};

export function AccountHolidayHistory({ accountId }: { accountId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/holiday-operations/accounts", accountId, "history"],
    queryFn: async () => {
      const response = await fetch(`/api/holiday-operations/accounts/${encodeURIComponent(accountId)}/history`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load holiday history");
      return response.json();
    },
    enabled: !!accountId,
  });
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" />Holiday Operations history</CardTitle></CardHeader>
    <CardContent>
      {isLoading ? <Skeleton className="h-24 w-full" /> : data?.records?.length ? <div className="space-y-3">
        {data.records.map((row: any) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div><p className="font-medium">{row.holiday_name} <span className="text-xs font-normal text-muted-foreground">({row.holiday_year})</span></p><p className="text-sm text-muted-foreground">{row.holiday_date}{row.confirmed_at ? ` · Confirmed ${new Date(row.confirmed_at).toLocaleDateString()}` : ""}</p>{row.confirmation_source && <p className="text-xs text-muted-foreground">Confirmed by {row.confirmed_by_user_name || row.confirmed_by_contact_name || "authorized source"} · {row.confirmation_source}</p>}</div>
          <div className="text-right"><Badge variant={row.operating_status === "unconfirmed" ? "outline" : "secondary"}>{labels[row.operating_status]}</Badge>{row.opening_time && <p className="mt-1 text-xs text-muted-foreground flex items-center justify-end gap-1"><Clock className="h-3 w-3" />{row.opening_time.slice(0, 5)}–{row.closing_time.slice(0, 5)}</p>}</div>
        </div>)}
      </div> : <p className="text-sm text-muted-foreground">No Holiday Operations records are available for this Account.</p>}
    </CardContent>
  </Card>;
}