import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function Support() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Support</h1>
        <p className="text-muted-foreground mt-2">
          Manage support tickets and driver assistance requests
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Support Tickets</CardTitle>
          <CardDescription>
            Track and resolve support tickets from drivers and employees
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Support ticket management features coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
