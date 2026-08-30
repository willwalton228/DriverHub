import { useRef, useState, useCallback } from "react";
import { UploadCloud, File as FileIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileDropZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile?: File | null;
  onClear?: () => void;
  accept?: string;
  disabled?: boolean;
  hint?: string;
  testId?: string;
  inputTestId?: string;
  browseTestId?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropZone({
  onFileSelect,
  selectedFile,
  onClear,
  accept = ".csv,.xlsx,.xls",
  disabled = false,
  hint = "Supports CSV and XLSX files",
  testId = "dropzone",
  inputTestId = "input-file",
  browseTestId = "button-browse-files",
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;
    const f = e.dataTransfer.files[0];
    if (f) onFileSelect(f);
  }, [disabled, onFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
    e.target.value = "";
  }, [onFileSelect]);

  const openPicker = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!disabled) inputRef.current?.click();
    }
  }, [disabled]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClear?.();
  }, [onClear]);

  return (
    <div
      role="button"
      aria-label={selectedFile ? `Selected file: ${selectedFile.name}. Press Enter to choose a different file.` : "Drop file here or press Enter to browse"}
      tabIndex={disabled ? -1 : 0}
      data-testid={testId}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      className={[
        "relative rounded-md border-2 border-dashed transition-colors select-none",
        isDragOver && !disabled
          ? "border-primary bg-primary/5"
          : selectedFile
          ? "border-primary/40 bg-primary/3"
          : "border-border",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-default",
      ].join(" ")}
    >
      {/* Hidden native file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
        data-testid={inputTestId}
      />

      <div className="flex flex-col items-center gap-3 p-8 text-center">
        {selectedFile ? (
          <>
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
              <FileIcon className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-tight break-all">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openPicker}
                disabled={disabled}
                data-testid={browseTestId}
              >
                Change File
              </Button>
              {onClear && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleClear}
                  disabled={disabled}
                  aria-label="Clear selected file"
                  data-testid={`${browseTestId}-clear`}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              className={[
                "flex items-center justify-center h-12 w-12 rounded-full transition-colors",
                isDragOver ? "bg-primary/15" : "bg-muted",
              ].join(" ")}
            >
              <UploadCloud className={["h-6 w-6 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground"].join(" ")} />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isDragOver ? "Release to upload" : "Drag file here"}
              </p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-border" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px w-8 bg-border" aria-hidden="true" />
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={openPicker}
              disabled={disabled}
              data-testid={browseTestId}
              aria-label="Open file picker to browse for a file"
            >
              Browse Files
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
