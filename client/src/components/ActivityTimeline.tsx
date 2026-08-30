import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { 
  ArrowRightCircle, 
  MessageSquare, 
  FileText, 
  Calendar, 
  Shield, 
  Activity,
  Filter,
  ChevronDown,
  User,
  Clock,
  Loader2,
  Download
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimelineEntry {
  id: string;
  type: 'stage_change' | 'communication' | 'document' | 'interview' | 'audit' | 'compliance' | 'consent';
  timestamp: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  actorId?: string | null;
  actorName?: string | null;
  entityType: string;
  entityId: string;
}

interface ActivityTimelineProps {
  entityType: 'application' | 'candidate';
  entityId: string;
  maxHeight?: string;
  isAdmin?: boolean;
}

const EVENT_TYPE_CONFIG: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  stage_change: { icon: ArrowRightCircle, color: "text-blue-500", label: "Stage Changes" },
  communication: { icon: MessageSquare, color: "text-green-500", label: "Communications" },
  document: { icon: FileText, color: "text-purple-500", label: "Documents" },
  interview: { icon: Calendar, color: "text-orange-500", label: "Interviews" },
  compliance: { icon: Shield, color: "text-red-500", label: "Compliance" },
  consent: { icon: Shield, color: "text-teal-500", label: "Consents" },
  audit: { icon: Activity, color: "text-gray-500", label: "Other Events" },
};

export function ActivityTimeline({ entityType, entityId, maxHeight = "600px", isAdmin = false }: ActivityTimelineProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [limit, setLimit] = useState(50);
  const { toast } = useToast();

  const eventTypesParam = selectedTypes.length > 0 ? selectedTypes.join(',') : undefined;
  
  const { data, isLoading, error, refetch } = useQuery<{ events: TimelineEntry[]; total: number }>({
    queryKey: [`/api/recruiting/${entityType}s/${entityId}/timeline`, eventTypesParam, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (eventTypesParam) params.set('eventTypes', eventTypesParam);
      params.set('limit', limit.toString());
      const url = `/api/recruiting/${entityType}s/${entityId}/timeline?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch timeline');
      return res.json();
    },
  });

  const events = data?.events || [];
  const total = data?.total || 0;

  const toggleEventType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type) 
        : [...prev, type]
    );
  };

  const getEventIcon = (type: string) => {
    const config = EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.audit;
    const Icon = config.icon;
    return <Icon className={`h-4 w-4 ${config.color}`} />;
  };

  const getEventBadge = (type: string) => {
    const config = EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.audit;
    return (
      <Badge variant="outline" className="text-xs">
        {config.label.replace('s', '')}
      </Badge>
    );
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Failed to load timeline</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Activity Timeline
            {total > 0 && (
              <Badge variant="secondary" className="ml-2">
                {total} events
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && entityType === 'application' && (
              <ExportTimelineButton applicationId={entityId} />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filter-timeline">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                  {selectedTypes.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {selectedTypes.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {Object.entries(EVENT_TYPE_CONFIG).map(([type, config]) => (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={selectedTypes.includes(type)}
                    onCheckedChange={() => toggleEventType(type)}
                    data-testid={`filter-${type}`}
                  >
                    <config.icon className={`h-4 w-4 mr-2 ${config.color}`} />
                    {config.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No activity recorded yet</p>
          </div>
        ) : (
          <ScrollArea style={{ maxHeight }} className="pr-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              
              <div className="space-y-4">
                {events.map((event, index) => (
                  <div key={event.id} className="relative pl-10" data-testid={`timeline-event-${index}`}>
                    {/* Timeline dot */}
                    <div className="absolute left-2 w-5 h-5 rounded-full bg-background border-2 border-border flex items-center justify-center">
                      {getEventIcon(event.type)}
                    </div>
                    
                    <div className="bg-muted/50 rounded-lg p-3 hover-elevate">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{event.title}</span>
                            {getEventBadge(event.type)}
                          </div>
                          
                          {event.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                            </span>
                            {event.actorName && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {event.actorName}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(event.timestamp), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      
                      {/* Show relevant metadata for certain event types */}
                      {event.type === 'stage_change' && event.metadata?.fromStage && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="outline">{event.metadata.fromStage}</Badge>
                            <ArrowRightCircle className="h-3 w-3" />
                            <Badge variant="default">{event.metadata.toStage}</Badge>
                          </div>
                          {event.metadata?.reasonCode && (
                            <div className="text-xs text-muted-foreground pl-1">
                              Reason: <span className="font-medium">{event.metadata.reasonLabel || event.metadata.reasonCode}</span>
                              {event.metadata?.reasonNotes && (
                                <span className="italic ml-1">— {event.metadata.reasonNotes}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {event.type === 'interview' && event.metadata?.startTime && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Scheduled: {format(new Date(event.metadata.startTime), 'MMM d, h:mm a')}
                          {event.metadata.interviewType && ` (${event.metadata.interviewType})`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {events.length < total && (
              <div className="text-center mt-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setLimit(prev => prev + 50)}
                  data-testid="button-load-more"
                >
                  Load more ({total - events.length} remaining)
                </Button>
              </div>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function ExportTimelineButton({ applicationId }: { applicationId: string }) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (exportFormat: "pdf" | "csv") => {
    setIsExporting(true);
    try {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/timeline/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ format: exportFormat }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Export failed" }));
        throw new Error(err.message || "Export failed");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || `timeline_export.${exportFormat}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Timeline exported",
        description: `Downloaded as ${exportFormat.toUpperCase()}`,
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Could not export timeline",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isExporting}
          data-testid="button-export-timeline"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleExport("pdf")}
          data-testid="button-export-timeline-pdf"
        >
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleExport("csv")}
          data-testid="button-export-timeline-csv"
        >
          <FileText className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
