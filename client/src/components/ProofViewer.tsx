import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Image, FileImage, MapPin, Calendar, User, Eye, Download, ExternalLink, AlertCircle, ZoomIn } from "lucide-react";
import { format } from "date-fns";

interface ProofItem {
  id: number;
  proofType: string;
  mediaRef: string | null;
  occurredAt: string;
  geo?: {
    lat: number;
    lng: number;
    accuracy?: number;
  } | null;
  eventId: string;
  metadata?: any;
  driverId?: string;
}

interface ProofViewerProps {
  proof: ProofItem;
  context?: "billing" | "claims" | "qa" | "move_detail" | "admin";
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
}

function getProofTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    photo: "Photo",
    signature: "Signature",
    document: "Document",
    DAMAGE_PHOTO: "Damage Photo",
    damage_photo: "Damage Photo",
    BOL_PHOTO: "BOL Photo",
    bol_photo: "BOL Photo",
    DELIVERY_PHOTO: "Delivery Photo",
    delivery_photo: "Delivery Photo",
    PICKUP_PHOTO: "Pickup Photo",
    pickup_photo: "Pickup Photo",
    VEHICLE_PHOTO: "Vehicle Photo",
    vehicle_photo: "Vehicle Photo",
    unknown: "Unknown",
  };
  return labels[type] || type;
}

function getProofTypeVariant(type: string): "default" | "destructive" | "secondary" | "outline" {
  if (type.toLowerCase().includes("damage")) return "destructive";
  if (type.toLowerCase().includes("signature")) return "secondary";
  return "default";
}

export function ProofViewer({ proof, context = "move_detail", size = "md", showDetails = true }: ProofViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
  };

  const { data: mediaData, isLoading: isLoadingMedia, error: mediaError } = useQuery({
    queryKey: ["/api/proofs", proof.id, "media", context],
    queryFn: async () => {
      const response = await fetch(`/api/proofs/${proof.id}/media?context=${context}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || "Failed to access media");
      }
      return response.json();
    },
    enabled: isOpen && !!proof.mediaRef,
  });

  // Construct media URL - use stream endpoint for internal paths
  const getMediaUrl = () => {
    const url = mediaData?.mediaUrl || mediaData?.mediaRef;
    if (!url) return null;
    // If it's an external URL, use directly
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // For internal paths, use the stream endpoint
    return `/api/proofs/${proof.id}/stream?context=${context}`;
  };
  
  const mediaUrl = getMediaUrl();

  const handleDownload = async () => {
    if (mediaUrl) {
      const link = document.createElement("a");
      link.href = mediaUrl;
      link.download = `proof-${proof.id}-${proof.proofType}.jpg`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Use inline fetch for thumbnail since <img> can't pass credentials in all browsers
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  
  // Load thumbnail metadata with credentials, then use stream endpoint for actual image
  useEffect(() => {
    let cancelled = false;

    if (proof.mediaRef) {
      fetch(`/api/proofs/${proof.id}/media?context=${context}`, { credentials: 'include' })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load');
          return res.json();
        })
        .then(data => {
          if (cancelled) return;
          const url = data.mediaUrl || data.mediaRef;
          // Check if it's an internal path and use stream endpoint
          if (url && !url.startsWith('http') && url.startsWith('/')) {
            setThumbnailUrl(`/api/proofs/${proof.id}/stream?context=${context}`);
          } else {
            setThumbnailUrl(url);
          }
          setImageLoaded(true);
        })
        .catch(() => {
          if (cancelled) return;
          setImageError(true);
          setImageLoaded(true);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [proof.id, proof.mediaRef, context]);

  const renderThumbnail = () => {
    if (!proof.mediaRef) {
      return (
        <div className={`${sizeClasses[size]} flex items-center justify-center bg-muted rounded-md`}>
          <FileImage className="w-6 h-6 text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className={`${sizeClasses[size]} relative rounded-md overflow-visible border cursor-pointer hover-elevate transition-all group`}>
        {!imageLoaded && (
          <Skeleton className="absolute inset-0 rounded-md" />
        )}
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={`${getProofTypeLabel(proof.proofType)} proof`}
            className={`w-full h-full object-cover rounded-md ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          />
        )}
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-md">
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
          <ZoomIn className="w-6 h-6 text-white" />
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className="inline-block" data-testid={`proof-thumbnail-${proof.id}`}>
          {renderThumbnail()}
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            <span>{getProofTypeLabel(proof.proofType)}</span>
            <Badge variant={getProofTypeVariant(proof.proofType)}>
              {proof.proofType}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="relative bg-muted rounded-lg overflow-hidden flex items-center justify-center min-h-[300px]">
            {isLoadingMedia && (
              <div className="flex flex-col items-center gap-2">
                <Skeleton className="w-full h-[300px]" />
                <span className="text-sm text-muted-foreground">Loading media...</span>
              </div>
            )}
            {mediaError && (
              <div className="flex flex-col items-center gap-2 text-destructive">
                <AlertCircle className="w-12 h-12" />
                <span className="text-sm">{(mediaError as Error).message || "Failed to load media"}</span>
              </div>
            )}
            {!isLoadingMedia && !mediaError && mediaUrl && (
              <img
                src={mediaUrl}
                alt={`${getProofTypeLabel(proof.proofType)} proof`}
                className="max-w-full max-h-[60vh] object-contain"
                data-testid={`proof-image-${proof.id}`}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </div>

          {showDetails && (
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Captured</p>
                      <p className="font-medium">{format(new Date(proof.occurredAt), "MMM d, yyyy h:mm a")}</p>
                    </div>
                  </div>

                  {proof.driverId && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground text-xs">Driver</p>
                        <p className="font-medium">{proof.driverId}</p>
                      </div>
                    </div>
                  )}

                  {proof.geo && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground text-xs">Location</p>
                        <p className="font-medium">
                          {proof.geo.lat.toFixed(4)}, {proof.geo.lng.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Context</p>
                      <p className="font-medium capitalize">{context.replace("_", " ")}</p>
                    </div>
                  </div>
                </div>

                {proof.metadata && Object.keys(proof.metadata).length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Additional Metadata</p>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(proof.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            {mediaUrl && (
              <>
                <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download-proof">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-open-new-tab">
                  <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open in New Tab
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ProofGalleryProps {
  proofs: ProofItem[];
  context?: "billing" | "claims" | "qa" | "move_detail" | "admin";
  size?: "sm" | "md" | "lg";
  emptyMessage?: string;
}

export function ProofGallery({ proofs, context = "move_detail", size = "md", emptyMessage = "No proofs available" }: ProofGalleryProps) {
  if (!proofs || proofs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground" data-testid="proof-gallery-empty">
        <FileImage className="w-12 h-12 mb-2" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3" data-testid="proof-gallery">
      {proofs.map((proof) => (
        <div key={proof.id} className="flex flex-col items-center gap-1">
          <ProofViewer proof={proof} context={context} size={size} />
          <Badge variant="outline" className="text-xs">
            {getProofTypeLabel(proof.proofType)}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export default ProofViewer;
