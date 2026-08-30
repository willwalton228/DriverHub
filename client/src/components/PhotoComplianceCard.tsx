import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Camera, Check, X, AlertTriangle, ShieldCheck, Upload, Trash2, Eye, RefreshCw } from "lucide-react";

interface PhotoComplianceProps {
  moveId: string;
  isAdmin?: boolean;
}

interface PhotoData {
  id: string;
  category: string;
  fileUrl: string;
  qualityScore: string | null;
  qualityPassed: boolean;
}

interface ComplianceData {
  moveId: string;
  pickup: {
    status: string;
    required: string[];
    captured: string[];
    missing: string[];
    photos: PhotoData[];
    overridden: boolean;
  };
  dropoff: {
    status: string;
    required: string[];
    captured: string[];
    missing: string[];
    photos: PhotoData[];
    overridden: boolean;
  };
  overrides: Array<{
    id: string;
    stage: string;
    overriddenByName: string;
    reason: string;
    createdAt: string;
  }>;
}

const PHOTO_LABELS: Record<string, string> = {
  angle_front_left: "Front Left",
  angle_front_right: "Front Right",
  angle_rear_left: "Rear Left",
  angle_rear_right: "Rear Right",
  vin: "VIN Plate",
  surroundings: "Surroundings",
  other: "Other",
};

export function PhotoComplianceCard({ moveId, isAdmin = false }: PhotoComplianceProps) {
  const { toast } = useToast();
  const [uploadingCategory, setUploadingCategory] = useState<{ stage: string; category: string } | null>(null);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [qualityWarning, setQualityWarning] = useState<{ stage: string; category: string; issues: string[]; imageData: string; contentType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: compliance, isLoading, refetch } = useQuery<ComplianceData>({
    queryKey: ["/api/moves", moveId, "photo-compliance"],
    queryFn: async () => {
      const response = await fetch(`/api/moves/${moveId}/photo-compliance`);
      if (!response.ok) throw new Error("Failed to fetch compliance status");
      return response.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { stage: string; category: string; imageData: string; contentType: string; forceAccept?: boolean }) => {
      const response = await apiRequest("POST", `/api/moves/${moveId}/photos`, data);
      return response;
    },
    onSuccess: () => {
      toast({ title: "Photo uploaded", description: "Photo has been saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/moves", moveId, "photo-compliance"] });
      setUploadingCategory(null);
      setQualityWarning(null);
    },
    onError: async (error: any) => {
      if (error.status === 422) {
        const data = await error.json?.() || error;
        if (data.requiresConfirmation && uploadingCategory) {
          setQualityWarning({
            stage: uploadingCategory.stage,
            category: uploadingCategory.category,
            issues: data.issues || [],
            imageData: "",
            contentType: "",
          });
        }
      } else {
        toast({ title: "Upload failed", description: error.message || "Failed to upload photo", variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest("DELETE", `/api/moves/${moveId}/photos/${photoId}`);
    },
    onSuccess: () => {
      toast({ title: "Photo deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/moves", moveId, "photo-compliance"] });
    },
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async (data: { stage: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/moves/${moveId}/photo-gate-override`, data);
      return response;
    },
    onSuccess: () => {
      toast({ title: "Override created", description: "Photo gate has been overridden" });
      queryClient.invalidateQueries({ queryKey: ["/api/moves", moveId, "photo-compliance"] });
      setOverrideDialogOpen(null);
      setOverrideReason("");
    },
    onError: (error: any) => {
      toast({ title: "Override failed", description: error.message || "Failed to create override", variant: "destructive" });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingCategory) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        await uploadMutation.mutateAsync({
          stage: uploadingCategory.stage,
          category: uploadingCategory.category,
          imageData: base64,
          contentType: file.type,
        });
      } catch (error: any) {
        if (error.status === 422) {
          const data = await error.json();
          if (data.requiresConfirmation) {
            setQualityWarning({
              stage: uploadingCategory.stage,
              category: uploadingCategory.category,
              issues: data.issues || [],
              imageData: base64,
              contentType: file.type,
            });
          }
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleForceUpload = async () => {
    if (!qualityWarning) return;
    await uploadMutation.mutateAsync({
      stage: qualityWarning.stage,
      category: qualityWarning.category,
      imageData: qualityWarning.imageData,
      contentType: qualityWarning.contentType,
      forceAccept: true,
    });
  };

  const startUpload = (stage: string, category: string) => {
    setUploadingCategory({ stage, category });
    fileInputRef.current?.click();
  };

  const getStatusBadge = (status: string, overridden: boolean) => {
    if (overridden) {
      return <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Overridden</Badge>;
    }
    switch (status) {
      case "complete":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Complete</Badge>;
      case "partial":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Partial</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Not Started</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Photo Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!compliance) return null;

  const renderStageSection = (stage: "pickup" | "dropoff", stageData: typeof compliance.pickup) => {
    const isComplete = stageData.status === "complete" || stageData.overridden;
    
    return (
      <div className="border rounded-lg p-4 space-y-3" data-testid={`section-${stage}-photos`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isComplete ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            <span className="font-medium capitalize">{stage} Photos</span>
            {getStatusBadge(stageData.status, stageData.overridden)}
          </div>
          {isAdmin && !isComplete && stageData.missing.length > 0 && (
            <Dialog open={overrideDialogOpen === stage} onOpenChange={(open) => setOverrideDialogOpen(open ? stage : null)}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid={`button-override-${stage}`}>
                  Override
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Override Photo Gate</DialogTitle>
                  <DialogDescription>
                    This will allow the move to proceed without all required {stage} photos. A reason is required for audit purposes.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Missing Photos:</p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside">
                      {stageData.missing.map((cat) => (
                        <li key={cat}>{PHOTO_LABELS[cat] || cat}</li>
                      ))}
                    </ul>
                  </div>
                  <Textarea
                    placeholder="Enter reason for override (minimum 10 characters)..."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    data-testid="input-override-reason"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOverrideDialogOpen(null)}>Cancel</Button>
                  <Button
                    onClick={() => overrideMutation.mutate({ stage, reason: overrideReason })}
                    disabled={overrideReason.trim().length < 10 || overrideMutation.isPending}
                    data-testid="button-confirm-override"
                  >
                    Confirm Override
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {stageData.required.map((category) => {
            const photo = stageData.photos.find((p) => p.category === category);
            const isCaptured = stageData.captured.includes(category);

            return (
              <div
                key={category}
                className={`relative border rounded-lg p-2 text-center ${
                  isCaptured ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" : "bg-muted/50"
                }`}
              >
                {photo ? (
                  <div className="space-y-1">
                    <div className="relative aspect-square bg-muted rounded overflow-hidden">
                      <img
                        src={photo.fileUrl}
                        alt={PHOTO_LABELS[category]}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-1 right-1 flex gap-1">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-6 w-6"
                          onClick={() => window.open(photo.fileUrl, "_blank")}
                          data-testid={`button-view-${category}`}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-6 w-6"
                          onClick={() => deleteMutation.mutate(photo.id)}
                          data-testid={`button-delete-${category}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <Check className="h-3 w-3 text-green-600" />
                      <span className="text-xs">{PHOTO_LABELS[category]}</span>
                    </div>
                    {photo.qualityScore && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className="text-xs">
                            Q: {Math.round(parseFloat(photo.qualityScore))}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Quality Score: {photo.qualityScore}/100</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Button
                      variant="outline"
                      className="w-full aspect-square flex-col gap-1 text-muted-foreground"
                      onClick={() => startUpload(stage, category)}
                      data-testid={`button-upload-${stage}-${category}`}
                    >
                      <Camera className="h-6 w-6" />
                      <span className="text-xs">Upload</span>
                    </Button>
                    <span className="text-xs text-muted-foreground block">{PHOTO_LABELS[category]}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {stageData.captured.length}/{stageData.required.length} required photos captured
        </p>
      </div>
    );
  };

  return (
    <>
      <Card data-testid="card-photo-compliance">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Photo Compliance
            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
          <CardDescription>
            Required photos for pickup and dropoff documentation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderStageSection("pickup", compliance.pickup)}
          {renderStageSection("dropoff", compliance.dropoff)}

          {compliance.overrides.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Override History</p>
              <div className="space-y-2">
                {compliance.overrides.map((override) => (
                  <div key={override.id} className="text-sm bg-muted/50 rounded p-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{override.stage}</Badge>
                      <span className="text-muted-foreground">by {override.overriddenByName}</span>
                    </div>
                    <p className="text-muted-foreground mt-1">{override.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <Dialog open={!!qualityWarning} onOpenChange={(open) => !open && setQualityWarning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Photo Quality Warning
            </DialogTitle>
            <DialogDescription>
              The photo you uploaded may have quality issues:
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc list-inside text-sm text-muted-foreground py-4">
            {qualityWarning?.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQualityWarning(null)}>
              Cancel & Retake
            </Button>
            <Button onClick={handleForceUpload} disabled={uploadMutation.isPending}>
              Use Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
