import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";

export default function HolidayResponse() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const [status, setStatus] = useState("open");
  const [openingTime, setOpeningTime] = useState("");
  const [closingTime, setClosingTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const details = useQuery({
    queryKey: ["/api/holiday-operations/response", token],
    queryFn: async () => {
      const response = await fetch(`/api/holiday-operations/response/${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error((await response.json()).message);
      return response.json();
    },
    enabled: !!token,
  });
  const submit = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/holiday-operations/response/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, openingTime, closingTime, notes }),
      });
      if (!response.ok) throw new Error((await response.json()).message);
      return response.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  if (details.isLoading) return <main className="min-h-screen grid place-items-center"><Loader2 className="animate-spin" /></main>;
  if (details.isError || !token) return <main className="min-h-screen grid place-items-center p-4"><Card className="max-w-lg"><CardHeader><CardTitle>Holiday response unavailable</CardTitle><CardDescription>{details.error?.message || "This response link is invalid or expired."}</CardDescription></CardHeader></Card></main>;
  if (submitted) return <main className="min-h-screen grid place-items-center p-4"><Card className="max-w-lg text-center"><CardContent className="py-12 space-y-3"><CheckCircle2 className="mx-auto text-green-600 h-12 w-12" /><h1 className="text-xl font-semibold">Thank you for confirming</h1><p className="text-muted-foreground">Your holiday operating status has been recorded.</p></CardContent></Card></main>;
  const data = details.data;
  return <main className="min-h-screen bg-muted/30 grid place-items-center p-4"><Card className="w-full max-w-xl"><CardHeader><CardTitle>Holiday operating status</CardTitle><CardDescription>Please confirm operations for <strong>{data.accountName}</strong> on <strong>{data.holidayName}, {data.holidayDate}</strong>.</CardDescription></CardHeader><CardContent className="space-y-6">
    <RadioGroup value={status} onValueChange={setStatus} className="space-y-3">
      {[["open", "Open normally"], ["modified_hours", "Modified hours"], ["closed", "Closed"]].map(([value, label]) => <Label key={value} className="flex items-center gap-3 rounded-md border p-3 cursor-pointer"><RadioGroupItem value={value} />{label}</Label>)}
    </RadioGroup>
    {status === "modified_hours" && <div className="grid grid-cols-2 gap-4"><div><Label>Opening time</Label><Input type="time" value={openingTime} onChange={e => setOpeningTime(e.target.value)} /></div><div><Label>Closing time</Label><Input type="time" value={closingTime} onChange={e => setClosingTime(e.target.value)} /></div></div>}
    <div><Label>Notes (optional)</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything Operations should know" /></div>
    {submit.isError && <p className="text-sm text-destructive">{submit.error.message}</p>}
    <Button className="w-full" disabled={submit.isPending || (status === "modified_hours" && (!openingTime || !closingTime))} onClick={() => submit.mutate()}>{submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}Confirm status</Button>
  </CardContent></Card></main>;
}