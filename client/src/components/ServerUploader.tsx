import { useState, useRef, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Upload, Loader2 } from "lucide-react";

interface ServerUploaderProps {
  maxFileSize?: number;
  onComplete: (result: { objectPath: string; uploadURL: string }) => void;
  onError?: (errorMessage: string) => void;
  buttonClassName?: string;
  buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  children: ReactNode;
  enableCamera?: boolean;
  allowedFileTypes?: string[];
  testId?: string;
}

function getErrorMessage(errorCode: string, fallbackMessage: string): { title: string; description: string } {
  switch (errorCode) {
    case "FILE_TOO_LARGE":
      return { title: "File too large", description: "Please select a file smaller than 10MB." };
    case "UNSUPPORTED_TYPE":
      return { title: "Unsupported file type", description: "Supported formats: PDF, DOCX, JPG, PNG, GIF, WebP." };
    case "NOT_AUTHORIZED":
      return { title: "Not authorized", description: "Your session may have expired. Please refresh the page and try again." };
    case "STORAGE_NOT_CONFIGURED":
      return { title: "Uploads unavailable", description: "Uploads are not available in this environment yet. Please contact Admin." };
    case "STORAGE_AUTH_FAILED":
      return { title: "Storage authentication error", description: "Storage authentication failed. This may be temporary — please try again in a moment. If it persists, contact your administrator." };
    case "STORAGE_UNREACHABLE":
      return { title: "Storage temporarily unavailable", description: "The storage service is temporarily unavailable. Please try again in a few minutes." };
    case "STORAGE_ERROR":
      return { title: "Upload failed", description: "The upload encountered an error. Please try again. If the issue persists, try a smaller file or contact support." };
    default:
      return { title: "Upload failed", description: fallbackMessage || "Something went wrong. Please try again." };
  }
}

export function ServerUploader({
  maxFileSize = 10485760,
  onComplete,
  onError,
  buttonClassName,
  buttonVariant = "default",
  children,
  enableCamera = true,
  allowedFileTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"],
  testId = "button-upload-photo",
}: ServerUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!allowedFileTypes.some((type) => file.type.match(type.replace("*", ".*")))) {
      toast({
        title: "Invalid file type",
        description: "This file type is not supported. Please choose a different file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > maxFileSize) {
      toast({
        title: "File too large",
        description: `Please select a file smaller than ${Math.round(maxFileSize / 1024 / 1024)}MB.`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    const isImage = file.type.startsWith("image/");
    setPreviewUrl(isImage ? URL.createObjectURL(file) : null);
    setShowCamera(false);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      setStream(mediaStream);
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (error) {
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], "camera-photo.jpg", { type: "image/jpeg" });
          setSelectedFile(file);
          setPreviewUrl(URL.createObjectURL(blob));
          stopCamera();
        }
      },
      "image/jpeg",
      0.9
    );
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();

      const response = await fetch("/api/objects/upload-file", {
        method: "POST",
        headers: {
          "Content-Type": selectedFile.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(selectedFile.name),
        },
        body: arrayBuffer,
        credentials: "include",
      });

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch {
          errorData = {};
        }

        const errorCode = errorData.errorCode || mapHttpStatusToErrorCode(response.status);
        const serverMessage = errorData.message || `Upload failed (${response.status})`;
        const requestId = errorData.requestId;

        console.error(`[ServerUploader] Upload failed - errorCode: ${errorCode}, requestId: ${requestId}, message: ${serverMessage}`);

        const display = getErrorMessage(errorCode, serverMessage);
        toast({
          title: display.title,
          description: display.description,
          variant: "destructive",
        });
        onError?.(display.description);
        return;
      }

      const result = await response.json();
      onComplete(result);
      handleClose();
      toast({
        title: "Upload Complete",
        description: "Your file has been uploaded successfully.",
      });
    } catch (error: any) {
      console.error("[ServerUploader] Upload error:", error);

      const isNetworkError = !error.message || error.message === "Failed to fetch" || error.message.includes("NetworkError");
      const display = isNetworkError
        ? { title: "Connection error", description: "Could not reach the server. Please check your connection and try again." }
        : { title: "Upload failed", description: "Something went wrong. Please try again." };

      toast({
        title: display.title,
        description: display.description,
        variant: "destructive",
      });
      onError?.(display.description);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    setShowModal(false);
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <Button
        variant={buttonVariant}
        className={buttonClassName}
        onClick={() => setShowModal(true)}
        data-testid={testId}
      >
        {children}
      </Button>

      <Dialog open={showModal} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!showCamera && !previewUrl && !selectedFile && (
              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  className="w-full h-24 flex flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-choose-file"
                >
                  <Upload className="h-6 w-6" />
                  <span>Choose File</span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={allowedFileTypes.join(",")}
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-select"
                />
                {enableCamera && (
                  <Button
                    variant="outline"
                    className="w-full h-24 flex flex-col gap-2"
                    onClick={startCamera}
                    data-testid="button-use-camera"
                  >
                    <Camera className="h-6 w-6" />
                    <span>Use Camera</span>
                  </Button>
                )}
              </div>
            )}

            {showCamera && (
              <div className="space-y-3">
                <div className="relative aspect-video bg-black rounded-md overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={stopCamera} data-testid="button-cancel-camera">
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={capturePhoto} data-testid="button-capture-photo">
                    Capture
                  </Button>
                </div>
              </div>
            )}

            {(previewUrl || (selectedFile && !showCamera)) && (
              <div className="space-y-3">
                {previewUrl ? (
                  <div className="relative aspect-square bg-muted rounded-md overflow-hidden">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : selectedFile ? (
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-md">
                    <Upload className="h-8 w-8 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedFile.size < 1024 * 1024
                          ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                          : `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`}
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setPreviewUrl(null);
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    data-testid="button-choose-different"
                  >
                    Choose Different
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleUpload}
                    disabled={isUploading}
                    data-testid="button-confirm-upload"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Upload"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function mapHttpStatusToErrorCode(status: number): string {
  if (status === 413) return "FILE_TOO_LARGE";
  if (status === 415) return "UNSUPPORTED_TYPE";
  if (status === 401 || status === 403) return "NOT_AUTHORIZED";
  if (status === 503) return "STORAGE_NOT_CONFIGURED";
  if (status === 502) return "STORAGE_ERROR";
  return "UNKNOWN_ERROR";
}
