import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, RefreshCw, Link2, Unlink, AlertCircle, CheckCircle2, Settings, Lock, Unlock } from "lucide-react";
import { SiHubspot } from "react-icons/si";

// DriverHub customer fields that can be mapped to HubSpot
const DRIVERHUB_FIELDS = [
  { name: "customerName", label: "Account Name", type: "string", required: true },
  { name: "customerNumber", label: "Account Number", type: "string", required: false },
  { name: "status", label: "Status", type: "string", required: false },
  { name: "customerType", label: "Account Type", type: "string", required: false },
  { name: "customerLegalName", label: "Legal Name", type: "string", required: false },
  { name: "customerGroup", label: "Account Group", type: "string", required: false },
  { name: "customerAddress", label: "Address", type: "string", required: false },
  { name: "customerCity", label: "City", type: "string", required: false },
  { name: "customerState", label: "State", type: "string", required: false },
  { name: "customerZip", label: "ZIP Code", type: "string", required: false },
  { name: "customerWebsite", label: "Website", type: "string", required: false },
  { name: "customerLatitude", label: "Latitude", type: "number", required: false },
  { name: "customerLongitude", label: "Longitude", type: "number", required: false },
  { name: "primaryContactName", label: "Primary Contact Name", type: "string", required: false },
  { name: "primaryContactNumber", label: "Primary Contact Phone", type: "string", required: false },
  { name: "primaryContactCell", label: "Primary Contact Cell", type: "string", required: false },
  { name: "primaryContactEmail", label: "Primary Contact Email", type: "string", required: false },
  { name: "billingContactName", label: "Billing Contact Name", type: "string", required: false },
  { name: "billingContactNumber", label: "Billing Contact Phone", type: "string", required: false },
  { name: "billingContactEmail", label: "Billing Contact Email", type: "string", required: false },
  { name: "arStatus", label: "A/R Status", type: "string", required: false },
  { name: "network", label: "Network", type: "string", required: false },
  { name: "potentialRisk", label: "Potential Risk", type: "string", required: false },
  { name: "implementationDate", label: "Launch Date", type: "date", required: false },
  { name: "cancellationDate", label: "Cancellation Date", type: "date", required: false },
  { name: "cancellationReason", label: "Cancellation Reason", type: "string", required: false },
];

interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description: string;
  groupName: string;
  hubspotDefined: boolean;
}

interface FieldMapping {
  driverHubField: string;
  hubspotProperty: string | null;
  hubspotPropertyLabel: string | null;
  isActive: boolean;
  fieldType: string;
  isLocked?: boolean;
  lockedBy?: string | null;
  lockedAt?: string | null;
}

export default function AccountsSetup() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [mappings, setMappings] = useState<Record<string, FieldMapping>>({});
  const [hasChanges, setHasChanges] = useState(false);
  
  // Check if user is NexCopy Admin (can lock/unlock mappings)
  const isNexCopyAdmin = user?.role === "admin";

  // Fetch HubSpot configuration status
  const { data: hubspotConfig } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/hubspot/config"],
  });

  // Fetch HubSpot properties
  const { 
    data: propertiesResponse, 
    isLoading: propertiesLoading,
    refetch: refetchProperties 
  } = useQuery<{ success: boolean; properties?: HubSpotProperty[]; error?: string }>({
    queryKey: ["/api/hubspot/properties"],
    enabled: hubspotConfig?.configured === true,
  });

  // Fetch existing mappings
  const { data: existingMappings, isLoading: mappingsLoading } = useQuery<FieldMapping[]>({
    queryKey: ["/api/hubspot/field-mappings"],
    enabled: true,
  });

  // Initialize mappings from existing data when loaded
  useEffect(() => {
    if (existingMappings) {
      const initialMappings: Record<string, FieldMapping> = {};
      for (const field of DRIVERHUB_FIELDS) {
        const existing = existingMappings.find(m => m.driverHubField === field.name);
        initialMappings[field.name] = existing || {
          driverHubField: field.name,
          hubspotProperty: null,
          hubspotPropertyLabel: null,
          isActive: true,
          fieldType: field.type,
        };
      }
      setMappings(initialMappings);
      setHasChanges(false);
    }
  }, [existingMappings]);

  // Save mappings mutation
  const saveMappingsMutation = useMutation({
    mutationFn: async (mappingsToSave: FieldMapping[]) => {
      const response = await apiRequest("POST", "/api/hubspot/field-mappings", { mappings: mappingsToSave });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Mappings Saved",
        description: "Field mappings have been saved successfully.",
      });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/hubspot/field-mappings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save field mappings.",
        variant: "destructive",
      });
    },
  });

  const handleMappingChange = (driverHubField: string, hubspotProperty: string | null) => {
    const mapping = mappings[driverHubField];
    // Super Users cannot change locked mappings
    if (!isNexCopyAdmin && mapping?.isLocked) {
      toast({
        title: "Locked Mapping",
        description: "This mapping is locked by NexCopy. Contact your administrator to make changes.",
        variant: "destructive",
      });
      return;
    }
    
    const property = propertiesResponse?.properties?.find(p => p.name === hubspotProperty);
    setMappings(prev => ({
      ...prev,
      [driverHubField]: {
        ...prev[driverHubField],
        hubspotProperty: hubspotProperty === "none" ? null : hubspotProperty,
        hubspotPropertyLabel: hubspotProperty === "none" ? null : (property?.label || null),
      },
    }));
    setHasChanges(true);
  };
  
  const handleToggleLock = (driverHubField: string) => {
    if (!isNexCopyAdmin) return;
    
    setMappings(prev => ({
      ...prev,
      [driverHubField]: {
        ...prev[driverHubField],
        isLocked: !prev[driverHubField]?.isLocked,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const mappingsToSave = Object.values(mappings).filter(m => m.hubspotProperty !== null);
    saveMappingsMutation.mutate(mappingsToSave);
  };

  const getMappedCount = () => {
    return Object.values(mappings).filter(m => m.hubspotProperty !== null).length;
  };

  const hubspotProperties = propertiesResponse?.properties || [];
  const defaultProperties = hubspotProperties.filter(p => p.hubspotDefined);
  const customProperties = hubspotProperties.filter(p => !p.hubspotDefined);

  if (!hubspotConfig?.configured) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Accounts Setup
            </CardTitle>
            <CardDescription>
              Configure account settings and integrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">HubSpot Not Configured</h3>
              <p className="text-muted-foreground max-w-md">
                To use the field mapping tool, please configure your HubSpot integration by adding the HUBSPOT_ACCESS_TOKEN secret.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Accounts Setup
          </h1>
          <p className="text-muted-foreground">
            Configure account settings and HubSpot field mappings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <SiHubspot className="h-3 w-3 text-orange-500" />
            HubSpot Connected
          </Badge>
        </div>
      </div>

      {/* Layer 3: Accounts Workspace */}
      <h2 className="text-lg font-bold mb-3" data-testid="text-accounts-workspace-header">Accounts Workspace</h2>

      <Tabs defaultValue="field-mapping" className="space-y-4">
        <TabsList>
          <TabsTrigger value="field-mapping" data-testid="tab-field-mapping">
            <Link2 className="h-4 w-4 mr-2" />
            Field Mapping
          </TabsTrigger>
        </TabsList>

        <TabsContent value="field-mapping" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <SiHubspot className="h-5 w-5 text-orange-500" />
                    HubSpot Field Mapping
                  </CardTitle>
                  <CardDescription>
                    Map DriverHub account fields to HubSpot company properties. These mappings will be used during the daily sync.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchProperties()}
                    disabled={propertiesLoading}
                    data-testid="button-refresh-properties"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${propertiesLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!hasChanges || saveMappingsMutation.isPending}
                    data-testid="button-save-mappings"
                  >
                    {saveMappingsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Mappings
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {propertiesLoading || mappingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : propertiesResponse?.error ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                  <p className="text-destructive">{propertiesResponse.error}</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        {getMappedCount()} fields mapped
                      </span>
                      <span className="flex items-center gap-1">
                        <Unlink className="h-4 w-4" />
                        {DRIVERHUB_FIELDS.length - getMappedCount()} unmapped
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {hubspotProperties.length} HubSpot properties available
                      ({defaultProperties.length} default, {customProperties.length} custom)
                    </div>
                  </div>

                  <Separator className="mb-4" />

                  <div className="space-y-3">
                    <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground px-2">
                      <div className="col-span-3">DriverHub Field</div>
                      <div className="col-span-1 text-center">→</div>
                      <div className="col-span-4">HubSpot Property</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2 text-center">{isNexCopyAdmin ? "Lock" : "Access"}</div>
                    </div>

                    {DRIVERHUB_FIELDS.map((field) => {
                      const mapping = mappings[field.name];
                      const isMapped = mapping?.hubspotProperty !== null;
                      const isLocked = mapping?.isLocked === true;
                      const isDisabled = !isNexCopyAdmin && isLocked;

                      return (
                        <div
                          key={field.name}
                          className={`grid grid-cols-12 gap-4 items-center p-2 rounded-md hover:bg-muted/50 ${isLocked ? 'bg-muted/30' : ''}`}
                          data-testid={`mapping-row-${field.name}`}
                        >
                          <div className="col-span-3">
                            <div className="font-medium flex items-center gap-1">
                              {field.label}
                              {isLocked && (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{field.name}</div>
                          </div>
                          <div className="col-span-1 text-center text-muted-foreground">
                            <Link2 className="h-4 w-4 mx-auto" />
                          </div>
                          <div className="col-span-4">
                            <Select
                              value={mapping?.hubspotProperty || "none"}
                              onValueChange={(value) => handleMappingChange(field.name, value)}
                              disabled={isDisabled}
                              data-testid={`select-mapping-${field.name}`}
                            >
                              <SelectTrigger className={`w-full ${isDisabled ? 'opacity-60' : ''}`}>
                                <SelectValue placeholder="Select HubSpot property" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="text-muted-foreground">Not mapped</span>
                                </SelectItem>
                                
                                {defaultProperties.length > 0 && (
                                  <>
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted">
                                      Default Properties
                                    </div>
                                    {defaultProperties.map((prop) => (
                                      <SelectItem key={prop.name} value={prop.name}>
                                        <div className="flex flex-col">
                                          <span>{prop.label}</span>
                                          <span className="text-xs text-muted-foreground">{prop.name}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </>
                                )}

                                {customProperties.length > 0 && (
                                  <>
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted">
                                      Custom Properties
                                    </div>
                                    {customProperties.map((prop) => (
                                      <SelectItem key={prop.name} value={prop.name}>
                                        <div className="flex flex-col">
                                          <span>{prop.label}</span>
                                          <span className="text-xs text-muted-foreground">{prop.name}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            {isMapped ? (
                              <Badge variant="default" className="bg-green-500">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Mapped
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Unlink className="h-3 w-3 mr-1" />
                                Unmapped
                              </Badge>
                            )}
                          </div>
                          <div className="col-span-2 flex justify-center">
                            {isNexCopyAdmin ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant={isLocked ? "default" : "outline"}
                                    size="icon"
                                    onClick={() => handleToggleLock(field.name)}
                                    className={isLocked ? "bg-orange-500 hover:bg-orange-600" : ""}
                                    data-testid={`button-lock-${field.name}`}
                                  >
                                    {isLocked ? (
                                      <Lock className="h-4 w-4" />
                                    ) : (
                                      <Unlock className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isLocked 
                                    ? "Click to unlock (allow customer modification)" 
                                    : "Click to lock (prevent customer modification)"}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Badge variant={isLocked ? "secondary" : "outline"}>
                                {isLocked ? (
                                  <>
                                    <Lock className="h-3 w-3 mr-1" />
                                    Locked
                                  </>
                                ) : (
                                  <>
                                    <Unlock className="h-3 w-3 mr-1" />
                                    Editable
                                  </>
                                )}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
