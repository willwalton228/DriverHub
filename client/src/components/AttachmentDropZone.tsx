import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, X, Upload, ClipboardPaste, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/x-log",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
];
const ACCEPT_STRING = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,.log,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function generatePasteName(ticketNumber?: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
  const ref = ticketNumber ? ticketNumber.replace(/[^a-zA-Z0-9-]/g, "_") : "TEMP";
  return `AMR_${ref}_${date}_${time}.png`;
}

interface AttachmentDropZoneProps {
  files: File[];
  onFilesAdded: (files: File[]) => void;
  onFileRemoved: (index: number) => void;
  ticketNumber?: string;
  disabled?: boolean;
}

export function AttachmentDropZone({
  files,
  onFilesAdded,
  onFileRemoved,
  ticketNumber,
  disabled,
}: AttachmentDropZoneProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const validate = useCallback(
    (incoming: File[]): File[] => {
      const valid: File[] = [];
      for (const file of incoming) {
        if (!ACCEPTED_TYPES.includes(file.type) && file.type !== "") {
          toast({
            title: "Invalid file type",
            description: `${file.name}: Accepted types: PNG, JPG, WEBP, GIF, PDF, CSV, XLSX, TXT, LOG, DOC, DOCX.`,
            variant: "destructive",
          });
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: "File too large",
            description: `${file.name}: Maximum size is 10MB.`,
            variant: "destructive",
          });
          continue;
        }
        valid.push(file);
      }
      return valid;
    },
    [toast]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter(
        (item) => item.kind === "file" && item.type.startsWith("image/")
      );
      if (imageItems.length === 0) return;
      e.preventDefault();
      const pasted = imageItems.map((item) => {
        const blob = item.getAsFile()!;
        return new File([blob], generatePasteName(ticketNumber), {
          type: blob.type || "image/png",
        });
      });
      const valid = validate(pasted);
      if (valid.length > 0) onFilesAdded(valid);
    },
    [validate, onFilesAdded, ticketNumber]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const valid = validate(Array.from(e.dataTransfer.files));
    if (valid.length > 0) onFilesAdded(valid);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valid = validate(Array.from(e.target.files || []));
    if (valid.length > 0) onFilesAdded(valid);
    e.target.value = "";
  };

  const handleZoneClick = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const cameraInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div
          tabIndex={disabled ? -1 : 0}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleZoneClick}
          className={[
            "flex-1 relative border-2 border-dashed rounded-md p-4 cursor-pointer transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-muted-foreground/50",
            disabled ? "opacity-50 pointer-events-none" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-testid="dropzone-attachments"
        >
          <div className="flex flex-col items-center gap-1 text-center text-sm text-muted-foreground pointer-events-none select-none">
            <Upload className="h-5 w-5" />
            <span>Drag & drop or click to browse</span>
            <span className="text-xs flex items-center gap-1">
              <ClipboardPaste className="h-3 w-3" />
              Ctrl+V to paste a screenshot
            </span>
            <span className="text-xs opacity-70">PNG, JPG, PDF, CSV, XLSX, TXT, DOC — max 10MB</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_STRING}
            onChange={handleFileInput}
            disabled={disabled}
            className="hidden"
            data-testid="input-attachment-files"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <div className="flex flex-col justify-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            onClick={() => cameraInputRef.current?.click()}
            title="Take photo with camera"
            data-testid="button-camera-capture"
          >
            <Camera className="h-4 w-4" />
          </Button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInput}
            disabled={disabled}
            className="hidden"
            data-testid="input-camera-capture"
          />
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {f.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                  data-testid={`img-file-preview-${i}`}
                />
              ) : (
                <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <span className="flex-1 truncate text-sm">{f.name}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                ({(f.size / 1024).toFixed(1)} KB)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileRemoved(i);
                }}
                disabled={disabled}
                data-testid={`button-remove-file-${i}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
