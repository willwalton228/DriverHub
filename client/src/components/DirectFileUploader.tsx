import { useState, useRef, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Camera, X, File, Image, Loader2, Copy, ChevronDown, ChevronUp, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Files larger than this threshold trigger the "Large image detected" advisory
const LARGE_IMAGE_THRESHOLD = 5 * 1024 * 1024; // 5 MB

interface UploadErrorDetails {
  errorCode: string;
  message: string;
  requestId?: string;
  timestamp: string;
  fileName?: string;
}

interface DirectFileUploaderProps {
  onUploadComplete: (result: { objectPath: string; fileName: string; fileType: string; fileSize: number }) => void;
  onError?: (error: string) => void;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  enableCamera?: boolean;
  maxFiles?: number;
  claimId?: string;
}

function getErrorDisplay(errorCode: string, serverMessage: string, fileName?: string, fileSize?: number): { title: string; description: string; action: string } {
  switch (errorCode) {
    case "FILE_TOO_LARGE": {
      const sizeStr = fileSize ? `${(fileSize / 1024 / 1024).toFixed(1)}MB` : "too large";
      return {
        title: "File too large",
        description: `This file is ${sizeStr}. Maximum allowed is 25MB. Please choose a smaller file.`,
        action: "Try a smaller file",
      };
    }
    case "UNSUPPORTED_TYPE":
      return {
        title: "Unsupported file type",
        description: "Supported formats: PDF, DOCX, JPG, PNG, WEBP, XLSX, CSV. Please choose a supported file.",
        action: "Choose another file",
      };
    case "NOT_AUTHORIZED":
      return {
        title: "Not authorized",
        description: "You don't have permission to upload attachments for this claim.",
        action: "Contact your admin",
      };
    case "CLAIM_NOT_FOUND":
      return {
        title: "Claim not found",
        description: "This claim may have been deleted or you may not have access.",
        action: "Return to Claims and try again",
      };
    case "STORAGE_NOT_CONFIGURED":
      return {
        title: "Uploads unavailable",
        description: "Uploads are not available in this environment yet. Please contact Admin.",
        action: "Contact admin",
      };
    case "STORAGE_AUTH_FAILED":
      return {
        title: "Storage error",
        description: "Storage authentication failed. Please contact your administrator.",
        action: "Contact admin",
      };
    case "STORAGE_UNREACHABLE":
      return {
        title: "Storage temporarily unavailable",
        description: "The storage service is temporarily unavailable. Please try again in a few minutes.",
        action: "Retry in a moment",
      };
    case "STORAGE_ERROR":
      return {
        title: "Upload failed",
        description: "The upload encountered an error. Please try again. If the issue persists, try a smaller file or contact support.",
        action: "Retry",
      };
    default:
      return {
        title: "Upload failed",
        description: serverMessage || "Something went wrong while uploading. Please try again. If it keeps happening, copy the error details and send to support.",
        action: "Retry",
      };
  }
}

export function DirectFileUploader({
  onUploadComplete,
  onError,
  maxFileSize = 26214400,
  allowedFileTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf", ".doc", ".docx", ".xlsx", ".csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
  enableCamera = true,
  maxFiles = 5,
  claimId,
}: DirectFileUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [lastErrorDetails, setLastErrorDetails] = useState<UploadErrorDetails | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [hasLargeImage, setHasLargeImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isLargeImage = (file: File) =>
    file.type.startsWith("image/") && file.size > LARGE_IMAGE_THRESHOLD;

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > maxFileSize) {
        const errorInfo = getErrorDisplay("FILE_TOO_LARGE", "", file.name, file.size);
        toast({
          title: errorInfo.title,
          description: errorInfo.description,
          variant: "destructive",
        });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length + selectedFiles.length > maxFiles) {
      toast({
        title: "Too Many Files",
        description: `You can only upload up to ${maxFiles} files at a time.`,
        variant: "destructive",
      });
      return;
    }

    const nextFiles = [...selectedFiles, ...validFiles];
    setSelectedFiles(nextFiles);
    setHasLargeImage(nextFiles.some(isLargeImage));
    setLastErrorDetails(null);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    const next = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(next);
    setHasLargeImage(next.some(isLargeImage));
  };

  const copyErrorDetails = () => {
    if (!lastErrorDetails) return;
    const text = [
      `Error: ${lastErrorDetails.errorCode}`,
      `Message: ${lastErrorDetails.message}`,
      lastErrorDetails.requestId ? `Request ID: ${lastErrorDetails.requestId}` : null,
      lastErrorDetails.fileName ? `File: ${lastErrorDetails.fileName}` : null,
      claimId ? `Claim ID: ${claimId}` : null,
      `Timestamp: ${lastErrorDetails.timestamp}`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied", description: "Error details copied to clipboard." });
    }).catch(() => {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" });
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setLastErrorDetails(null);

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(Math.round(((i) / selectedFiles.length) * 100));

        if (file.size > maxFileSize) {
          const details: UploadErrorDetails = {
            errorCode: "FILE_TOO_LARGE",
            message: `File is ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum allowed is ${Math.round(maxFileSize / 1024 / 1024)}MB.`,
            timestamp: new Date().toISOString(),
            fileName: file.name,
          };
          setLastErrorDetails(details);
          const display = getErrorDisplay("FILE_TOO_LARGE", details.message, file.name, file.size);
          toast({ title: display.title, description: display.description, variant: "destructive" });
          onError?.(display.description);
          return;
        }

        const dataUrl = await readFileAsDataUrl(file);

        onUploadComplete({
          objectPath: dataUrl,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });

        setUploadProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
      }

      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${selectedFiles.length} file(s).`,
      });

      setSelectedFiles([]);
      setHasLargeImage(false);
    } catch (error: any) {
      console.error("Upload error:", error);

      const errorCode = "UNKNOWN_ERROR";
      const serverMessage = error.message || "Something went wrong while uploading.";

      const details: UploadErrorDetails = {
        errorCode,
        message: serverMessage,
        timestamp: new Date().toISOString(),
      };
      setLastErrorDetails(details);

      const display = getErrorDisplay(errorCode, serverMessage);
      toast({
        title: display.title,
        description: display.description,
        variant: "destructive",
      });
      onError?.(display.description);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) {
      return <Image className="h-4 w-4 text-blue-500" />;
    }
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || selectedFiles.length >= maxFiles}
          data-testid="button-browse-files"
        >
          <Upload className="h-4 w-4 mr-2" />
          Browse Files
        </Button>

        {enableCamera && (
          <Button
            type="button"
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isUploading || selectedFiles.length >= maxFiles}
            data-testid="button-take-photo"
          >
            <Camera className="h-4 w-4 mr-2" />
            Take Photo
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={allowedFileTypes.join(",")}
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-file-upload"
      />

      {enableCamera && (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-camera-capture"
        />
      )}

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Selected Files ({selectedFiles.length}/{maxFiles})</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-3 p-2 bg-muted/50 rounded-md"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getFileIcon(file.type)}
                  <span className="truncate text-sm">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(index)}
                  disabled={isUploading}
                  data-testid={`button-remove-file-${index}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {hasLargeImage && !isUploading && (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2"
              data-testid="large-image-warning"
            >
              <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Large image detected. Optimizing upload...
              </p>
            </div>
          )}

          <Button
            type="button"
            onClick={uploadFiles}
            disabled={isUploading || selectedFiles.length === 0}
            className="w-full"
            data-testid="button-upload-files"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading... {uploadProgress}%
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {selectedFiles.length} File{selectedFiles.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      )}

      {lastErrorDetails && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2" data-testid="upload-error-details">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-destructive">
              {getErrorDisplay(lastErrorDetails.errorCode, lastErrorDetails.message).title}
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyErrorDetails}
                data-testid="button-copy-error-details"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy details
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowErrorDetails(!showErrorDetails)}
                data-testid="button-toggle-error-details"
              >
                {showErrorDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {(() => {
            const { action } = getErrorDisplay(lastErrorDetails.errorCode, lastErrorDetails.message);
            const isRetryable = ["UNKNOWN_ERROR", "STORAGE_ERROR", "STORAGE_AUTH_FAILED"].includes(lastErrorDetails.errorCode);
            const needsNewFile = ["FILE_TOO_LARGE", "UNSUPPORTED_TYPE"].includes(lastErrorDetails.errorCode);
            if (isRetryable) {
              return (
                <button
                  type="button"
                  className="text-xs text-primary underline underline-offset-2 hover:opacity-80 transition-opacity text-left"
                  onClick={() => { setLastErrorDetails(null); uploadFiles(); }}
                  data-testid="button-retry-upload"
                >
                  {action}
                </button>
              );
            }
            if (needsNewFile) {
              return (
                <button
                  type="button"
                  className="text-xs text-primary underline underline-offset-2 hover:opacity-80 transition-opacity text-left"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-choose-new-file"
                >
                  {action}
                </button>
              );
            }
            return <p className="text-xs text-muted-foreground">{action}</p>;
          })()}
          {showErrorDetails && (
            <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t border-destructive/20" data-testid="error-details-expanded">
              <p>Error: {lastErrorDetails.errorCode}</p>
              {lastErrorDetails.requestId && <p>Request ID: {lastErrorDetails.requestId}</p>}
              {lastErrorDetails.fileName && <p>File: {lastErrorDetails.fileName}</p>}
              {claimId && <p>Claim: {claimId}</p>}
              <p>Time: {lastErrorDetails.timestamp}</p>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Photos, PDFs, and Word documents accepted. Max {Math.round(maxFileSize / 1024 / 1024)}MB per file.
      </p>
    </div>
  );
}

