import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;

interface ProfilePhotoUploaderProps {
  onComplete: (dataUrl: string) => void;
  children: React.ReactNode;
  buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  buttonClassName?: string;
  testId?: string;
}

function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(blobUrl);

      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("Failed to load image"));
    };

    img.src = blobUrl;
  });
}

export function ProfilePhotoUploader({
  onComplete,
  children,
  buttonVariant = "default",
  buttonClassName,
  testId = "button-upload-photo",
}: ProfilePhotoUploaderProps) {
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const startCamera = async () => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setStream(ms);
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = ms;
      }, 100);
    } catch {
      toast({ title: "Camera unavailable", description: "Could not access camera. Check browser permissions.", variant: "destructive" });
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
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
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setShowCamera(false);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setProcessing(true);
    try {
      const dataUrl = await resizeImageToDataUrl(selectedFile);
      onComplete(dataUrl);
      handleClose();
      toast({ title: "Photo ready", description: "Saving your profile photo..." });
    } catch (err) {
      console.error("[ProfilePhotoUploader] resize error:", err);
      toast({ title: "Processing failed", description: "Could not process the image. Please try a different file.", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    setOpen(false);
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const reset = () => {
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      <Button
        variant={buttonVariant}
        className={buttonClassName}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        {children}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Profile Photo</DialogTitle>
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
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-select"
                />
                <Button
                  variant="outline"
                  className="w-full h-24 flex flex-col gap-2"
                  onClick={startCamera}
                  data-testid="button-use-camera"
                >
                  <Camera className="h-6 w-6" />
                  <span>Use Camera</span>
                </Button>
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
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={stopCamera} data-testid="button-cancel-camera">Cancel</Button>
                  <Button className="flex-1" onClick={capturePhoto} data-testid="button-capture-photo">Capture</Button>
                </div>
              </div>
            )}

            {(previewUrl || (selectedFile && !showCamera)) && (
              <div className="space-y-3">
                {previewUrl && (
                  <div className="relative aspect-square bg-muted rounded-md overflow-hidden">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Photo will be resized to 512&times;512 and saved as JPEG.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={reset} data-testid="button-choose-different">
                    Choose Different
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleUpload}
                    disabled={processing}
                    data-testid="button-confirm-upload"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
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
