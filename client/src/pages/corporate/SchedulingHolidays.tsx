import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  History,
  Mail,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const statusLabel: Record<string, string> = {
  unconfirmed: "Unconfirmed",
  open: "Open",
  modified_hours: "Modified Hours",
  closed: "Closed",
};
const statusTone: Record<string, string> = {
  unconfirmed: "bg-amber-100 text-amber-900",
  open: "bg-green-100 text-green-900",
  modified_hours: "bg-blue-100 text-blue-900",
  closed: "bg-slate-200 text-slate-800",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function SchedulingHolidays() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [holiday, setHoliday] = useState("thanksgiving_day");
  const [network, setNetwork] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [status, setStatus] = useState("all");
  const [confirmationStatus, setConfirmationStatus] = useState("all");
  const [communicationStatus, setCommunicationStatus] = useState("all");
  const [schedulingConflict, setSchedulingConflict] = useState("all");
  const [exception, setException] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const [sendRecord, setSendRecord] = useState<any>(null);
  const [sendContactId, setSendContactId] = useState("");
  const [newStatus, setNewStatus] = useState("open");
  const [openingTime, setOpeningTime] = useState("");
  const [closingTime, setClosingTime] = useState("");
  const [notes, setNotes] = useState("");
  const [specialDateOpen, setSpecialDateOpen] = useState(false);
  const [specialName, setSpecialName] = useState("");
  const [specialDate, setSpecialDate] = useState("");
  const [specialScope, setSpecialScope] = useState<"all" | "selected">("all");
  const [specialAccountIds, setSpecialAccountIds] = useState<string[]>([]);
  const [specialNotes, setSpecialNotes] = useState("");

  const params = useMemo(() => {
    const values: Record<string, string> = { year: String(year), holiday };
    if (network !== "all") values.network = network;
    if (accountId !== "all") values.accountId = accountId;
    if (status !== "all") values.status = status;
    if (confirmationStatus !== "all") values.confirmationStatus = confirmationStatus;
    if (communicationStatus !== "all") values.communicationStatus = communicationStatus;
    if (schedulingConflict !== "all") values.schedulingConflict = schedulingConflict;
    if (exception !== "all") values.exception = exception;
    return new URLSearchParams(values).toString();
  }, [year, holiday, network, accountId, status, confirmationStatus, communicationStatus, schedulingConflict, exception]);

  const holidayDataEnabled = isAuthenticated && !authLoading;
  const metadata = useQuery({
    queryKey: ["/api/holiday-operations/metadata", year],
    queryFn: async () => {
      const response = await fetch(`/api/holiday-operations/metadata?year=${year}`, { credentials: "include" });
      if (!response.ok) throw new Error(errorMessage(await response.json(), "Failed to load holiday calendar"));
      return response.json();
    },
    enabled: holidayDataEnabled,
    retry: false,
  });
  const records = useQuery({
    queryKey: ["/api/holiday-operations/records", params],
    queryFn: async () => {
      const response = await fetch(`/api/holiday-operations/records?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error(errorMessage(await response.json(), "Failed to load holiday records"));
      return response.json();
    },
    enabled: holidayDataEnabled,
    retry: false,
  });
  const contacts = useQuery({
    queryKey: ["/api/accounts/contacts", sendRecord?.account_id],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${sendRecord.account_id}/contacts`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load Account contacts");
      return response.json();
    },
    enabled: holidayDataEnabled && !!sendRecord?.account_id,
  });
  const history = useQuery({
    queryKey: ["/api/holiday-operations/records/history", selected?.id],
    queryFn: async () => {
      const response = await fetch(`/api/holiday-operations/records/${selected.id}/history`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load status history");
      return response.json();
    },
    enabled: holidayDataEnabled && !!selected?.id,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/holiday-operations"] });
  };

  const confirm = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/holiday-operations/records/${selected.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, openingTime, closingTime, notes }),
      });
      if (!response.ok) throw new Error(errorMessage(await response.json(), "Failed to update holiday status"));
    },
    onSuccess: () => {
      toast({ title: "Holiday status updated" });
      setSelected(null);
      refresh();
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const send = useMutation({
    mutationFn: async ({ id, contactId }: { id: string; contactId?: string }) => {
      const response = await fetch(`/api/holiday-operations/records/${id}/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contactId || null }),
      });
      if (!response.ok) throw new Error(errorMessage(await response.json(), "The confirmation request could not be delivered."));
    },
    onSuccess: () => {
      toast({ title: "Confirmation request sent" });
      setSendRecord(null);
      refresh();
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const addSpecialDate = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/holiday-operations/special-dates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: specialName,
          date: specialDate,
          year,
          appliesToAllAccounts: specialScope === "all",
          accountIds: specialScope === "selected" ? specialAccountIds : [],
          notes: specialNotes,
        }),
      });
      if (!response.ok) throw new Error(errorMessage(await response.json(), "Failed to add special date"));
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Special date added",
        description: `${result.createdRecords} Account record${result.createdRecords === 1 ? "" : "s"} initialized as Unconfirmed.`,
      });
      setSpecialDateOpen(false);
      setSpecialName("");
      setSpecialDate("");
      setSpecialScope("all");
      setSpecialAccountIds([]);
      setSpecialNotes("");
      refresh();
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const metrics = records.data?.summary || {};
  const holidays = metadata.data?.holidays || [];
  const accounts = metadata.data?.accounts || [];
  const availableAccounts = network === "all" ? accounts : accounts.filter((account: any) => account.network === network);
  const loadError = metadata.error || records.error;
  const validContacts = (contacts.data?.contacts || []).filter(
    (contact: any) => contact.email && contact.status === "active" && !contact.isArchived,
  );

  return (
    <div className="space-y-6" data-testid="holiday-operations-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarDays className="h-6 w-6" /> Holiday Operations
          </h1>
          <p className="text-muted-foreground">
            Confirm Account operating status and review WIW scheduling impacts. WIW never determines an Account&apos;s holiday status.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSpecialDateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Holiday / Special Date
          </Button>
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <div>
          <Label>Holiday</Label>
          <Select value={holiday} onValueChange={setHoliday} disabled={!holidayDataEnabled || metadata.isLoading}>
            <SelectTrigger><SelectValue placeholder="Select a holiday" /></SelectTrigger>
            <SelectContent>
              {holidays.map((item: any) => <SelectItem key={item.code} value={item.code}>{item.name} — {item.date}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Year</Label>
          <Input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} />
        </div>
        <div>
          <Label>Network</Label>
          <Select value={network} onValueChange={(value) => { setNetwork(value); setAccountId("all"); }} disabled={!holidayDataEnabled || metadata.isLoading}>
            <SelectTrigger><SelectValue placeholder="All networks" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All networks</SelectItem>
              {metadata.data?.networks?.map((item: string) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Account</Label>
          <Select value={accountId} onValueChange={setAccountId} disabled={!holidayDataEnabled || metadata.isLoading}>
            <SelectTrigger><SelectValue placeholder="All Accounts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {availableAccounts.map((account: any) => <SelectItem key={account.id} value={account.id}>{account.customer_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(statusLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Confirmation</Label>
          <Select value={confirmationStatus} onValueChange={setConfirmationStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All confirmations</SelectItem><SelectItem value="confirmed">Confirmed</SelectItem><SelectItem value="unconfirmed">Unconfirmed</SelectItem></SelectContent>
          </Select>
        </div>
        <div>
          <Label>Communication</Label>
          <Select value={communicationStatus} onValueChange={setCommunicationStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All communication</SelectItem>
              <SelectItem value="not_sent">Not sent</SelectItem><SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="responded">Responded</SelectItem><SelectItem value="missing_recipient">Missing recipient</SelectItem><SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Scheduling conflict</Label>
          <Select value={schedulingConflict} onValueChange={setSchedulingConflict}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All scheduling</SelectItem><SelectItem value="yes">Conflicts only</SelectItem><SelectItem value="no">No conflicts</SelectItem></SelectContent>
          </Select>
        </div>
        <div>
          <Label>Exception</Label>
          <Select value={exception} onValueChange={setException}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All records</SelectItem>
              <SelectItem value="unconfirmed_with_shifts">Unconfirmed with shifts</SelectItem>
              <SelectItem value="closed_with_shifts">Closed with shifts</SelectItem>
              <SelectItem value="modified_hours_conflict">Modified-hours conflict</SelectItem>
              <SelectItem value="missing_recipient">Missing recipient</SelectItem>
              <SelectItem value="communication_failed">Communication failed</SelectItem>
              <SelectItem value="no_response">No response</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loadError && (
        <Card className="border-destructive">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="text-destructive">{errorMessage(loadError, "Holiday Operations could not be loaded.")}</span>
            <Button variant="outline" size="sm" onClick={refresh}>Try again</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          ["Applicable", metrics.applicableAccounts, CalendarDays],
          ["Open", metrics.open, CheckCircle2],
          ["Modified", metrics.modified_hours, Clock],
          ["Closed", metrics.closed, CheckCircle2],
          ["Unconfirmed", metrics.unconfirmed, AlertTriangle],
          ["Conflicts", metrics.schedulingConflicts, AlertTriangle],
          ["Email failures", metrics.communicationFailures, Mail],
          ["No response", metrics.noResponses, AlertTriangle],
        ].map(([label, value, Icon]: any) => (
          <Card key={label as string}>
            <CardContent className="p-4">
              <div className="flex justify-between text-sm text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4" /></div>
              <p className="mt-1 text-2xl font-bold">{value ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Account confirmation queue</CardTitle>
          <a href={`/api/holiday-operations/export?${params}`}>
            <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" /> Export</Button>
          </a>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Network</TableHead><TableHead>Account</TableHead><TableHead>Holiday</TableHead><TableHead>Status</TableHead>
              <TableHead>Primary holiday contact</TableHead><TableHead>Last communication</TableHead><TableHead>Communication</TableHead>
              <TableHead>Confirmed by</TableHead><TableHead>Scheduled</TableHead><TableHead>Exception</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {authLoading || records.isLoading ? (
                <TableRow><TableCell colSpan={11} className="py-10 text-center">Loading Holiday Operations…</TableCell></TableRow>
              ) : records.isError ? (
                <TableRow><TableCell colSpan={11} className="py-10 text-center text-destructive">Holiday Operations could not be loaded. Try refreshing the page.</TableCell></TableRow>
              ) : records.data?.records?.length ? records.data.records.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>{row.network || "—"}</TableCell>
                  <TableCell><div className="font-medium">{row.customer_name}</div></TableCell>
                  <TableCell><div className="font-medium">{row.holiday_name}</div><div className="text-xs text-muted-foreground">{row.holiday_date}</div></TableCell>
                  <TableCell>
                    <Badge className={statusTone[row.operating_status]}>{statusLabel[row.operating_status]}</Badge>
                    {row.opening_time && <div className="mt-1 text-xs">{row.opening_time}–{row.closing_time}<span className="ml-1 text-muted-foreground">{row.timezone}</span></div>}
                  </TableCell>
                  <TableCell>{row.primary_contact_name || <span className="text-destructive">Missing recipient</span>}<div className="text-xs text-muted-foreground">{row.primary_contact_email}</div></TableCell>
                  <TableCell>{row.last_communication ? <><div>{new Date(row.last_communication).toLocaleString()}</div><div className="text-xs text-muted-foreground">{row.last_sender_mailbox || "Sender not recorded"}</div></> : "—"}</TableCell>
                  <TableCell><Badge variant="outline">{row.communication_status.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell>{row.confirmed_by_user_name || row.confirmed_by_contact_name || "—"}<div className="text-xs text-muted-foreground">{row.confirmed_at ? new Date(row.confirmed_at).toLocaleString() : ""}</div></TableCell>
                  <TableCell>{row.scheduled_drivers || 0} drivers<br /><span className="text-xs text-muted-foreground">{row.scheduled_shifts || 0} shifts</span></TableCell>
                  <TableCell>
                    {row.exception_type ? <Badge variant="destructive">{row.exception_type.replace(/_/g, " ")}</Badge> : "—"}
                    {!!row.shift_details?.length && row.exception_type?.includes("shifts") && <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">View shifts</summary>
                      <div className="mt-1 space-y-1">{row.shift_details.map((shift: any, index: number) => <div key={`${row.id}-shift-${index}`}>{shift.driver}: {shift.startTime}–{shift.endTime}</div>)}</div>
                    </details>}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button size="sm" variant="outline" title="View status history" onClick={() => {
                      setSelected(row);
                      setNewStatus(row.operating_status === "unconfirmed" ? "open" : row.operating_status);
                      setOpeningTime(row.opening_time?.slice(0, 5) || "");
                      setClosingTime(row.closing_time?.slice(0, 5) || "");
                      setNotes(row.notes || "");
                    }}><History className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" disabled={row.operating_status !== "unconfirmed"} onClick={() => {
                      setSendRecord(row);
                      setSendContactId(row.primary_contact_id || "");
                    }}><Send className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" onClick={() => {
                      setSelected(row);
                      setNewStatus(row.operating_status === "unconfirmed" ? "open" : row.operating_status);
                      setOpeningTime(row.opening_time?.slice(0, 5) || "");
                      setClosingTime(row.closing_time?.slice(0, 5) || "");
                      setNotes(row.notes || "");
                    }}>Confirm</Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={11} className="py-10 text-center">No applicable Shift Accounts match these filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={specialDateOpen} onOpenChange={setSpecialDateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Add Holiday / Special Date</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Create a DriverHub-owned special date. Account statuses start as Unconfirmed; WIW is only used later to identify scheduling conflicts.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={specialName} onChange={(event) => setSpecialName(event.target.value)} placeholder="e.g. Christmas Eve" /></div>
              <div><Label>Date</Label><Input type="date" value={specialDate} onChange={(event) => setSpecialDate(event.target.value)} /></div>
            </div>
            <div><Label>Year</Label><Input value={year} readOnly /></div>
            <div>
              <Label>Applicable Accounts</Label>
              <Select value={specialScope} onValueChange={(value: "all" | "selected") => setSpecialScope(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All applicable active Shift Accounts</SelectItem><SelectItem value="selected">Choose specific Accounts</SelectItem></SelectContent>
              </Select>
            </div>
            {specialScope === "selected" && <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
              {availableAccounts.map((account: any) => <label key={account.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={specialAccountIds.includes(account.id)} onCheckedChange={(checked) => setSpecialAccountIds((current) => checked ? [...current, account.id] : current.filter((id) => id !== account.id))} />
                {account.customer_name}{account.network ? ` — ${account.network}` : ""}
              </label>)}
            </div>}
            <div><Label>Notes <span className="text-muted-foreground">(optional)</span></Label><Textarea value={specialNotes} onChange={(event) => setSpecialNotes(event.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSpecialDateOpen(false)}>Cancel</Button>
            <Button disabled={addSpecialDate.isPending || !specialName.trim() || !specialDate || (specialScope === "selected" && specialAccountIds.length === 0)} onClick={() => addSpecialDate.mutate()}><Plus className="mr-2 h-4 w-4" /> Add special date</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sendRecord} onOpenChange={(open) => !open && setSendRecord(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review recipient — {sendRecord?.customer_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Each Account receives a separate confirmation request. Choose an active Account contact with an email address.</p>
            <Label>Recipient</Label>
            <Select value={sendContactId} onValueChange={setSendContactId}>
              <SelectTrigger><SelectValue placeholder="Choose an Account contact" /></SelectTrigger>
              <SelectContent>{validContacts.map((contact: any) => <SelectItem key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName} — {contact.email}</SelectItem>)}</SelectContent>
            </Select>
            {contacts.isSuccess && !validContacts.length && <p className="text-sm text-destructive">No valid Account contact email is available. This will remain a Missing Recipient exception.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendRecord(null)}>Cancel</Button>
            <Button disabled={!sendContactId || send.isPending} onClick={() => send.mutate({ id: sendRecord.id, contactId: sendContactId })}><Mail className="mr-2 h-4 w-4" /> Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Confirm holiday status — {selected?.customer_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Operating status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open normally</SelectItem>
                  <SelectItem value="modified_hours">Modified hours</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="unconfirmed">Reopen as unconfirmed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newStatus === "modified_hours" && <div className="grid grid-cols-2 gap-3">
              <div><Label>Opening time ({selected?.timezone})</Label><Input type="time" value={openingTime} onChange={(event) => setOpeningTime(event.target.value)} /></div>
              <div><Label>Closing time ({selected?.timezone})</Label><Input type="time" value={closingTime} onChange={(event) => setClosingTime(event.target.value)} /></div>
            </div>}
            <div><Label>Notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
            <div className="rounded-md border p-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Status-change history</h3>
              {history.isLoading ? <p className="text-sm text-muted-foreground">Loading history…</p> : history.data?.history?.length ? (
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {history.data.history.map((entry: any) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 text-sm">
                    <span>{entry.previous_status || "—"} → {entry.new_status || "—"} <span className="text-muted-foreground">({entry.confirmation_source || "—"})</span></span>
                    <span className="text-muted-foreground">{entry.actor_name || entry.contact_name || "System"} · {new Date(entry.created_at).toLocaleString()}</span>
                  </div>)}
                </div>
              ) : <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button disabled={confirm.isPending || (newStatus === "modified_hours" && (!openingTime || !closingTime))} onClick={() => confirm.mutate()}>Save confirmation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}