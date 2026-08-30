import { useState, useCallback, useEffect, useRef } from "react";
import { PhotoAnnotationViewer } from "@/components/claims/PhotoAnnotationViewer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  X,
  Expand,
  Loader2,
  ImageOff,
  Upload,
  FileText,
  FileSpreadsheet,
  Film,
  Play,
  File,
  Trash2,
  FolderOpen,
  Pen,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { ATTACHMENT_SOURCE_LABELS } from "@shared/schema";

// ── Category metadata ─────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  uncategorized:          "Uncategorized",
  scene_photos:           "Scene Photos",
  vehicle_damage_photos:  "Vehicle Damage Photos",
  driver_photos:          "Driver Photos",
  video_photos:           "Video / Photos",
  video:                  "Video",
  accident_report:        "Accident Report",
  traffic_citations:      "Traffic Citations",
  vehicle_towing:         "Vehicle Towing",
  police_report:          "Police Report",
  insurance_claim_form:   "Insurance Claim Form",
  customer_documentation: "Customer Documentation",
  repair_estimate:        "Repair Estimate",
  invoice_receipt:        "Invoice / Receipt",
  general:                "General",
  other:                  "Other",
};

/** Categories that belong in the Photos gallery */
export const PHOTO_CATEGORY_SET = new Set([
  "scene_photos",
  "vehicle_damage_photos",
  "driver_photos",
  "video_photos",
  "video",
]);

const PHOTO_PICKER_OPTIONS = [
  { value: "scene_photos",           label: "Scene Photos" },
  { value: "vehicle_damage_photos",  label: "Vehicle Damage Photos" },
  { value: "driver_photos",          label: "Driver Photos" },
  { value: "video_photos",           label: "Video / Photos" },
  { value: "video",                  label: "Video" },
];

const DOCUMENT_PICKER_OPTIONS = [
  { value: "police_report",          label: "Police Report" },
  { value: "repair_estimate",        label: "Repair Estimate" },
  { value: "insurance_claim_form",   label: "Insurance Claim Form" },
  { value: "invoice_receipt",        label: "Invoice / Receipt" },
  { value: "accident_report",        label: "Accident Report" },
  { value: "customer_documentation", label: "Customer Documentation" },
  { value: "traffic_citations",      label: "Traffic Citations" },
  { value: "vehicle_towing",         label: "Vehicle Towing" },
  { value: "general",                label: "General" },
  { value: "other",                  label: "Other" },
];

const MAX_FILE_BYTES = 26214400; // 25 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isImageFile(attachment: any): boolean {
  return !!(attachment.fileType?.startsWith("image/"));
}

export function isVideoFile(attachment: any): boolean {
  return !!(attachment.fileType?.startsWith("video/"));
}

/** True for any file that belongs in the media gallery (photos + videos) */
export function isMediaFile(attachment: any): boolean {
  return isImageFile(attachment) || isVideoFile(attachment);
}

function getImageUrl(attachment: any): string | null {
  const url = (attachment.fileUrl || "").trim();
  if (url.startsWith("data:")) return url;
  if (attachment.attachmentDocumentId) {
    return `/api/documents/${attachment.attachmentDocumentId}/download`;
  }
  if (!url) return null; // fileUrl was stripped (legacy base64) — caller must fetch on-demand
  const rawPath = url.replace(/^\//, "");
  return rawPath.startsWith("objects/") ? `/${rawPath}` : `/objects/${rawPath}`;
}

function getDocIcon(fileType: string) {
  if (!fileType) return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
  if (fileType.includes("pdf"))
    return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
  if (fileType.includes("spreadsheet") || fileType.includes("excel") || fileType.includes("csv"))
    return <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />;
  if (fileType.includes("video"))
    return <Film className="h-4 w-4 text-purple-500 shrink-0" />;
  if (fileType.includes("word") || fileType.includes("document"))
    return <FileText className="h-4 w-4 text-blue-500 shrink-0" />;
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Read a File as a base64 data URL */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ── Category Picker Dialog ────────────────────────────────────────────────────

interface CategoryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "photo" | "document";
  fileCount: number;
  onSelect: (category: string) => void;
}

function CategoryPickerDialog({
  open,
  onOpenChange,
  mode,
  fileCount,
  onSelect,
}: CategoryPickerDialogProps) {
  const options = mode === "photo" ? PHOTO_PICKER_OPTIONS : DOCUMENT_PICKER_OPTIONS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="category-picker-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Choose a Category
          </DialogTitle>
          <DialogDescription>
            Select the category for{" "}
            {fileCount === 1 ? "this file" : `these ${fileCount} files`} before
            uploading.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 pt-1" data-testid="category-picker-grid">
          {options.map((opt) => (
            <Button
              key={opt.value}
              variant="outline"
              className="h-auto py-2.5 px-3 text-left justify-start text-sm font-normal"
              onClick={() => onSelect(opt.value)}
              data-testid={`category-option-${opt.value}`}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
          className="mt-1 w-full"
          data-testid="button-cancel-category-picker"
        >
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ── DuplicateWarningDialog ────────────────────────────────────────────────────

interface DupItem {
  file: File;
  isDuplicate: boolean;
  resolvedName: string;
}

interface DuplicateWarningDialogProps {
  open: boolean;
  items: DupItem[];
  onItemRename: (index: number, name: string) => void;
  onCancel: () => void;
  onSkipDuplicates: () => void;
  onUploadAll: () => void;
}

function DuplicateWarningDialog({
  open,
  items,
  onItemRename,
  onCancel,
  onSkipDuplicates,
  onUploadAll,
}: DuplicateWarningDialogProps) {
  const dupCount = items.filter((i) => i.isDuplicate).length;
  const allDups  = dupCount === items.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-lg" data-testid="duplicate-warning-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            Duplicate Files Detected
          </DialogTitle>
          <DialogDescription>
            {dupCount === 1
              ? "1 file already exists in this claim."
              : `${dupCount} files already exist in this claim.`}{" "}
            Review the list below, rename duplicates if needed, then choose how to proceed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1" data-testid="duplicate-file-list">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-md border border-border p-2.5"
              data-testid={`dup-item-${idx}`}
            >
              {item.isDuplicate ? (
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{item.file.name}</span>
                  {item.isDuplicate && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 shrink-0">
                      Duplicate
                    </Badge>
                  )}
                </div>
                {item.isDuplicate && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">New name:</span>
                    <Input
                      value={item.resolvedName}
                      onChange={(e) => onItemRename(idx, e.target.value)}
                      className="h-7 text-xs"
                      data-testid={`input-rename-${idx}`}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            data-testid="button-dup-cancel"
          >
            Cancel
          </Button>
          {!allDups && (
            <Button
              variant="outline"
              onClick={onSkipDuplicates}
              data-testid="button-dup-skip"
            >
              Skip Duplicates
            </Button>
          )}
          <Button
            onClick={onUploadAll}
            data-testid="button-dup-upload-all"
          >
            {allDups ? "Upload with New Names" : "Upload All"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Duplicate detection helper ────────────────────────────────────────────────

function buildDupItems(incoming: File[], existingNames: Set<string>): DupItem[] {
  return incoming.map((file) => {
    const isDuplicate = existingNames.has(file.name.toLowerCase());
    let resolvedName = file.name;
    if (isDuplicate) {
      const dotIdx = file.name.lastIndexOf(".");
      const base = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
      const ext  = dotIdx > 0 ? file.name.substring(dotIdx) : "";
      resolvedName = `${base}_v2${ext}`;
    }
    return { file, isDuplicate, resolvedName };
  });
}

// ── File picker hook ──────────────────────────────────────────────────────────
// Collects files via hidden input, validates size, returns them to the caller.

interface UseFilePickerOptions {
  accept: string;
  multiple?: boolean;
  testId: string;
  onFilesSelected: (files: File[]) => void;
  toast: ReturnType<typeof useToast>["toast"];
}

function useFilePicker({ accept, multiple = true, testId, onFilesSelected, toast }: UseFilePickerOptions) {
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerPicker = () => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files || []);
    e.target.value = "";
    if (!all.length) return;

    const oversized = all.filter((f) => f.size > MAX_FILE_BYTES);
    if (oversized.length) {
      toast({
        title: "File too large",
        description: `Max 25 MB per file. Skipped: ${oversized.map((f) => f.name).join(", ")}`,
        variant: "destructive",
      });
    }
    const valid = all.filter((f) => f.size <= MAX_FILE_BYTES);
    if (valid.length) onFilesSelected(valid);
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      className="hidden"
      onChange={handleChange}
      data-testid={testId}
    />
  );

  return { triggerPicker, hiddenInput };
}

// ── Upload executor ───────────────────────────────────────────────────────────

type UploadResult = {
  objectPath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
};

async function uploadFiles(
  files: File[],
  category: string,
  onUploadComplete: (result: UploadResult, category: string) => Promise<void> | void,
  resolvedNames?: string[]
) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = resolvedNames?.[i] ?? file.name;
    const dataUrl = await readAsDataUrl(file);
    await onUploadComplete(
      { objectPath: dataUrl, fileName, fileType: file.type, fileSize: file.size },
      category
    );
  }
}

// ── InlineCategorySelect ──────────────────────────────────────────────────────

function InlineCategorySelect({
  attachment,
  isReadOnly,
  onCategoryChange,
}: {
  attachment: any;
  isReadOnly?: boolean;
  onCategoryChange?: (attachmentId: string, newCategory: string) => Promise<void> | void;
}) {
  const [localCategory, setLocalCategory] = useState<string>(attachment.category || "uncategorized");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalCategory(attachment.category || "uncategorized");
  }, [attachment.category]);

  if (isReadOnly) {
    return (
      <span className="text-xs text-muted-foreground">
        {CATEGORY_LABELS[localCategory] || localCategory}
      </span>
    );
  }

  const handleChange = async (newCat: string) => {
    const prev = localCategory;
    setLocalCategory(newCat);
    setSaving(true);
    try {
      await onCategoryChange?.(attachment.id, newCat);
    } catch {
      setLocalCategory(prev);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
      <Select value={localCategory} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger
          className="h-7 text-xs border-border/60 bg-transparent min-w-0 max-w-full"
          data-testid={`select-category-${attachment.id}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="uncategorized" className="text-xs">Uncategorized</SelectItem>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-xs">Photos</SelectLabel>
            {PHOTO_PICKER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-xs">Documents</SelectLabel>
            {DOCUMENT_PICKER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

interface ThumbnailProps {
  attachment: any;
  index: number;
  onClick: (index: number) => void;
  isReadOnly?: boolean;
  onCategoryChange?: (attachmentId: string, newCategory: string) => Promise<void> | void;
  accidentId?: string;
  canDelete?: boolean;
  onDelete?: (attachmentId: string) => void;
}

function Thumbnail({ attachment, index, onClick, isReadOnly, onCategoryChange, accidentId, canDelete, onDelete }: ThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const staticSrc = getImageUrl(attachment);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  // When fileUrl was stripped (legacy base64), fetch it on-demand
  useEffect(() => {
    if (staticSrc !== null) return; // already have a usable URL
    if (!accidentId || !attachment.id) return;
    let cancelled = false;
    fetch(`/api/corporate/accidents/${accidentId}/attachments/${attachment.id}/url`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data?.fileUrl) setResolvedSrc(data.fileUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [staticSrc, accidentId, attachment.id]);

  const src = resolvedSrc ?? staticSrc;

  const fileTypeBadge = attachment.fileType?.startsWith("video/")
    ? "Video"
    : attachment.fileType?.startsWith("image/")
    ? "Photo"
    : attachment.fileType?.includes("pdf")
    ? "PDF"
    : null;

  let annotationCount = 0;
  try {
    const parsed = attachment.annotations ? JSON.parse(attachment.annotations) : [];
    annotationCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch { annotationCount = 0; }

  const annotationLabel = annotationCount === 1 ? "Annotated" : `${annotationCount} markups`;

  return (
    <div className="flex flex-col gap-1" data-testid={`photo-thumbnail-wrapper-${attachment.id}`}>
      <div className="relative group/thumb">
      <button
        className="group relative aspect-square rounded-md overflow-hidden bg-muted cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none w-full"
        onClick={() => onClick(index)}
        data-testid={`photo-thumbnail-${attachment.id}`}
        aria-label={`View ${attachment.fileName}`}
      >
        {/* Spinner: shown while loading OR while waiting for URL resolution */}
        {(!loaded && !errored) || (src === null && !errored) ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {errored && src !== null ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            <span className="text-xs text-center px-1 line-clamp-2">{attachment.fileName}</span>
          </div>
        ) : src ? (
          isVideoFile(attachment) ? (
            <>
              <video
                src={src}
                muted
                playsInline
                preload="metadata"
                className={`w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
                onLoadedMetadata={() => setLoaded(true)}
                onError={() => { setErrored(true); setLoaded(true); }}
              />
              {/* Play icon overlay so users can tell it's a video */}
              {loaded && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="rounded-full bg-black/50 p-2">
                    <Play className="h-5 w-5 text-white fill-white" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <img
              src={src}
              alt={attachment.fileName}
              className={`w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => { setErrored(true); setLoaded(true); }}
            />
          )
        ) : null}

        {/* Hover dark scrim */}
        <div
          className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors"
          style={{ visibility: loaded ? "visible" : "hidden" }}
        />

        {/* Hover: expand icon */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ visibility: loaded ? "visible" : "hidden" }}
        >
          <Expand className="h-6 w-6 text-white drop-shadow-md" />
        </div>

        {/* File type badge — top-left, always visible */}
        {fileTypeBadge && (
          <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
            <span
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
              style={{ background: "rgba(0,0,0,0.60)" }}
              data-testid={`badge-file-type-${attachment.id}`}
            >
              {fileTypeBadge}
            </span>
          </div>
        )}

        {/* Annotation badge — top-right, always visible when annotations exist */}
        {annotationCount > 0 && (
          <div className="absolute top-1.5 right-1.5 z-10 pointer-events-none">
            <span
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
              style={{ background: "rgba(99,102,241,0.85)" }}
              data-testid={`badge-annotation-count-${attachment.id}`}
            >
              <Pen className="h-2.5 w-2.5" />
              {annotationLabel}
            </span>
          </div>
        )}

        {/* Hover: file name overlay — bottom strip */}
        <div
          className="absolute bottom-0 left-0 right-0 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none"
          style={{ background: "rgba(0,0,0,0.70)", visibility: loaded ? "visible" : "hidden" }}
        >
          <p className="text-white text-[10px] leading-tight truncate font-medium">{attachment.fileName}</p>
        </div>
      </button>

      {/* Delete button — Super Admin only, top-right corner overlay */}
      {canDelete && onDelete && (
        <button
          className="absolute top-1.5 right-1.5 z-30 flex items-center justify-center rounded-md w-6 h-6 bg-black/60 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete(attachment.id); }}
          title="Remove photo (Super Admin)"
          data-testid={`button-delete-photo-${attachment.id}`}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      </div>

      <InlineCategorySelect
        attachment={attachment}
        isReadOnly={isReadOnly}
        onCategoryChange={onCategoryChange}
      />
      {attachment.createdAt && (
        <p className="text-[10px] text-muted-foreground leading-tight truncate" data-testid={`text-upload-time-${attachment.id}`}>
          {format(new Date(attachment.createdAt), "MMM d, h:mm a")}
        </p>
      )}
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

interface LightboxProps {
  photos: any[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  accidentId?: string;
}

function Lightbox({ photos, currentIndex, onClose, onNext, onPrev, accidentId }: LightboxProps) {
  const { toast } = useToast();
  const [zoom, setZoom] = useState(1);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const photo = photos[currentIndex];
  const staticSrc = getImageUrl(photo);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  // On-demand URL fetch for legacy base64 photos whose fileUrl was stripped
  useEffect(() => {
    setResolvedSrc(null);
    if (staticSrc !== null) return;
    if (!accidentId || !photo?.id) return;
    let cancelled = false;
    fetch(`/api/corporate/accidents/${accidentId}/attachments/${photo.id}/url`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data?.fileUrl) setResolvedSrc(data.fileUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [staticSrc, accidentId, photo?.id]);

  const src = resolvedSrc ?? staticSrc;

  const resetZoom = useCallback(() => setZoom(1), []);

  const handleNext = useCallback(() => {
    setZoom(1); setImgLoaded(false); onNext();
  }, [onNext]);

  const handlePrev = useCallback(() => {
    setZoom(1); setImgLoaded(false); onPrev();
  }, [onPrev]);

  useEffect(() => { setImgLoaded(false); setZoom(1); }, [currentIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleNext();
      else if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.5, 4));
      else if (e.key === "-") setZoom((z) => Math.max(z - 0.5, 0.5));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleNext, handlePrev, onClose]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Use resolved src (handles legacy base64 fetched on-demand + object storage paths)
      const effectiveSrc = src;
      if (effectiveSrc?.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = effectiveSrc; a.download = photo.fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        return;
      }
      const retryFetch = async (url: string, maxAttempts = 3) => {
        for (let i = 1; i <= maxAttempts; i++) {
          try {
            const r = await fetch(url, { credentials: "include" });
            if (r.ok) return r;
            if (i < maxAttempts) await new Promise((res) => setTimeout(res, 500 * i));
          } catch {
            if (i < maxAttempts) await new Promise((res) => setTimeout(res, 500 * i));
          }
        }
        return null;
      };
      const resp = photo.attachmentDocumentId
        ? await retryFetch(`/api/documents/${photo.attachmentDocumentId}/download`)
        : effectiveSrc ? await retryFetch(effectiveSrc) : null;
      if (resp) {
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl; a.download = photo.fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } else {
        toast({ title: "Download failed", description: "Could not retrieve the file.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Download failed", description: "A network error occurred.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const uploadDate = photo.createdAt ? format(new Date(photo.createdAt), "MMM d, yyyy h:mm a") : "—";
  const catLabel = CATEGORY_LABELS[photo.category] || (photo.category || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === photos.length - 1;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-[92vw] w-full p-0 overflow-hidden bg-background border-border"
        style={{ maxHeight: "94vh" }}
        data-testid="photo-lightbox"
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="secondary" className="shrink-0 text-xs">{currentIndex + 1} / {photos.length}</Badge>
            <span className="text-sm font-medium truncate" data-testid="lightbox-filename">{photo.fileName}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(z - 0.5, 0.5))} disabled={zoom <= 0.5} title="Zoom out (−)" data-testid="button-lightbox-zoom-out"><ZoomOut className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(z + 0.5, 4))} disabled={zoom >= 4} title="Zoom in (+)" data-testid="button-lightbox-zoom-in"><ZoomIn className="h-4 w-4" /></Button>
            {zoom !== 1 && <Button size="icon" variant="ghost" onClick={resetZoom} title="Reset zoom" data-testid="button-lightbox-zoom-reset"><RotateCcw className="h-3.5 w-3.5" /></Button>}
            <Separator orientation="vertical" className="h-5 mx-1" />
            <Button size="icon" variant="ghost" onClick={handleDownload} disabled={downloading} title="Download" data-testid="button-lightbox-download">
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} title="Close (Esc)" data-testid="button-lightbox-close"><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="relative flex items-center justify-center bg-black/90 overflow-hidden" style={{ height: "calc(94vh - 130px)" }}>
          <Button size="icon" variant="ghost" className="absolute left-3 z-10 bg-black/40 text-white hover:bg-black/60" onClick={handlePrev} disabled={isFirst} data-testid="button-lightbox-prev" style={{ visibility: isFirst ? "hidden" : "visible" }}><ChevronLeft className="h-5 w-5" /></Button>
          <div className="overflow-hidden flex items-center justify-center w-full h-full" style={{ cursor: zoom > 1 ? "move" : "default" }}>
            {!imgLoaded && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-white/60" /></div>}
            <img key={photo.id} src={src} alt={photo.fileName} className="max-w-full max-h-full object-contain select-none transition-transform duration-200" style={{ transform: `scale(${zoom})`, opacity: imgLoaded ? 1 : 0 }} onLoad={() => setImgLoaded(true)} onError={() => setImgLoaded(true)} draggable={false} data-testid="lightbox-image" />
          </div>
          <Button size="icon" variant="ghost" className="absolute right-3 z-10 bg-black/40 text-white hover:bg-black/60" onClick={handleNext} disabled={isLast} data-testid="button-lightbox-next" style={{ visibility: isLast ? "hidden" : "visible" }}><ChevronRight className="h-5 w-5" /></Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 border-t border-border bg-muted/20 shrink-0 text-xs">
          <span className="text-muted-foreground"><span className="font-medium text-foreground">Category:</span> {catLabel}</span>
          {photo.attachmentSource && <span className="text-muted-foreground"><span className="font-medium text-foreground">Source:</span> {(ATTACHMENT_SOURCE_LABELS as Record<string, string>)[photo.attachmentSource] || photo.attachmentSource}</span>}
          <span className="text-muted-foreground"><span className="font-medium text-foreground">Uploaded by:</span> {photo.uploaderName || "—"}</span>
          <span className="text-muted-foreground"><span className="font-medium text-foreground">Upload date:</span> {uploadDate}</span>
          {zoom !== 1 && <span className="text-muted-foreground ml-auto">Zoom: {Math.round(zoom * 100)}%</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Photo Gallery ─────────────────────────────────────────────────────────────

interface ClaimPhotoGalleryProps {
  attachments: any[];
  isReadOnly?: boolean;
  onUploadComplete?: (result: UploadResult, category: string) => Promise<void> | void;
  onCategoryChange?: (attachmentId: string, newCategory: string) => Promise<void> | void;
  onSaveAnnotations?: (attachmentId: string, annotationsJson: string) => Promise<void>;
  accidentId?: string;
  canDelete?: boolean;
  onDelete?: (attachmentId: string) => void;
}

export function ClaimPhotoGallery({ attachments, isReadOnly, onUploadComplete, onCategoryChange, onSaveAnnotations, accidentId, canDelete, onDelete }: ClaimPhotoGalleryProps) {
  const { toast } = useToast();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Category picker flow
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Duplicate detection flow
  const [dupModalOpen, setDupModalOpen]     = useState(false);
  const [dupItems, setDupItems]             = useState<DupItem[]>([]);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const { triggerPicker, hiddenInput } = useFilePicker({
    accept: "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif,video/mp4,video/quicktime,video/x-msvideo,video/avi,video/webm,video/x-m4v,.mp4,.mov,.avi,.m4v,.webm",
    multiple: true,
    testId: "hidden-file-input-photo",
    onFilesSelected: (files) => {
      setPendingFiles(files);
      setPickerOpen(true);
    },
    toast,
  });

  const doUpload = async (files: File[], category: string, resolvedNames?: string[]) => {
    if (!onUploadComplete) return;
    setIsUploading(true);
    try {
      await uploadFiles(files, category, onUploadComplete, resolvedNames);
    } catch {
      toast({ title: "Upload failed", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      setPendingFiles([]);
      setDupItems([]);
      setPendingCategory(null);
    }
  };

  const handleCategorySelected = async (category: string) => {
    setPickerOpen(false);
    if (!onUploadComplete || !pendingFiles.length) return;

    const existingNames = new Set((attachments || []).map((a) => (a.fileName as string)?.toLowerCase()));
    const items = buildDupItems(pendingFiles, existingNames);
    const hasDups = items.some((i) => i.isDuplicate);

    if (hasDups) {
      setPendingCategory(category);
      setDupItems(items);
      setDupModalOpen(true);
      return;
    }
    await doUpload(pendingFiles, category);
  };

  const handleDupCancel = () => {
    setDupModalOpen(false);
    setDupItems([]);
    setPendingFiles([]);
    setPendingCategory(null);
  };

  const handleDupSkip = async () => {
    setDupModalOpen(false);
    const nonDups = dupItems.filter((i) => !i.isDuplicate);
    if (!nonDups.length || !pendingCategory) { handleDupCancel(); return; }
    await doUpload(nonDups.map((i) => i.file), pendingCategory, nonDups.map((i) => i.resolvedName));
  };

  const handleDupUploadAll = async () => {
    setDupModalOpen(false);
    if (!pendingCategory) return;
    await doUpload(dupItems.map((i) => i.file), pendingCategory, dupItems.map((i) => i.resolvedName));
  };

  // All non-deleted image AND video files from any category
  const photos = (attachments || []).filter((a) => isMediaFile(a) && !a.isDeleted);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const goNext = () => setLightboxIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : i));
  const goPrev = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));

  const categoryCounts: Record<string, number> = {};
  photos.forEach((p) => { categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1; });

  const canUpload = !isReadOnly && !!onUploadComplete;

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (!canUpload || !onUploadComplete) return;

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    const nonMedia = files.filter((f) => !f.type.startsWith("image/") && !f.type.startsWith("video/"));
    if (nonMedia.length) {
      toast({
        title: "Only image and video files allowed here",
        description: "Only images and videos can be dropped into Photos & Video. Use Upload Document for PDFs and other files.",
        variant: "destructive",
      });
      return;
    }
    const oversized = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (oversized.length) {
      toast({ title: "File too large", description: `Max 25 MB per file. Skipped: ${oversized.map((f) => f.name).join(", ")}`, variant: "destructive" });
    }
    const valid = files.filter((f) => (f.type.startsWith("image/") || f.type.startsWith("video/")) && f.size <= MAX_FILE_BYTES);
    if (!valid.length) return;

    // Route through category picker
    setPendingFiles(valid);
    setPickerOpen(true);
  }, [canUpload, onUploadComplete, toast]);

  return (
    <div className="space-y-3" data-testid="claim-photo-gallery">
      {hiddenInput}

      <CategoryPickerDialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) { setPickerOpen(false); setPendingFiles([]); }
        }}
        mode="photo"
        fileCount={pendingFiles.length}
        onSelect={handleCategorySelected}
      />

      <DuplicateWarningDialog
        open={dupModalOpen}
        items={dupItems}
        onItemRename={(idx, name) => setDupItems((prev) => prev.map((it, i) => i === idx ? { ...it, resolvedName: name } : it))}
        onCancel={handleDupCancel}
        onSkipDuplicates={handleDupSkip}
        onUploadAll={handleDupUploadAll}
      />

      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Camera className="h-5 w-5 text-primary shrink-0" />
        <h4 className="font-semibold text-sm">Photos</h4>
        <Badge variant="secondary" className="text-xs">
          {photos.length} photo{photos.length !== 1 ? "s" : ""}
        </Badge>
        {Object.entries(categoryCounts).map(([cat, count]) => (
          <Badge key={cat} variant="outline" className="text-xs font-normal">
            {CATEGORY_LABELS[cat] || cat}: {count}
          </Badge>
        ))}
        {canUpload && (
          <Button
            size="sm"
            variant="outline"
            onClick={triggerPicker}
            disabled={isUploading}
            className="ml-auto"
            data-testid="button-upload-photo"
          >
            {isUploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            {isUploading ? "Uploading…" : "Upload Photo"}
          </Button>
        )}
      </div>

      {/* Drop zone — wraps both empty state and grid */}
      <div
        className={[
          "relative rounded-md transition-colors duration-150",
          isDragging ? "ring-2 ring-primary bg-primary/5" : "",
        ].join(" ")}
        onDragEnter={canUpload ? handleDragEnter : undefined}
        onDragOver={canUpload ? handleDragOver : undefined}
        onDragLeave={canUpload ? handleDragLeave : undefined}
        onDrop={canUpload ? handleDrop : undefined}
        data-testid="photo-drop-zone"
      >
        {/* Drag overlay */}
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-md pointer-events-none transition-opacity duration-150"
          style={{ visibility: isDragging ? "visible" : "hidden", opacity: isDragging ? 1 : 0 }}
          data-testid="photo-drag-overlay"
        >
          <Upload className="h-8 w-8 text-primary drop-shadow-sm" />
          <p className="text-sm font-semibold text-primary">Drop photos here</p>
          <p className="text-xs text-primary/70">You'll choose a category after dropping</p>
        </div>

        {photos.length === 0 ? (
          <div
            className={["flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-8 text-center transition-colors duration-150",
              isDragging ? "border-primary bg-transparent" : "border-border bg-muted/30",
            ].join(" ")}
            data-testid="photo-gallery-empty"
          >
            <Camera className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No photos attached yet</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Drag photos here or use Upload Photo — you'll choose the category after selecting files
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="photo-grid">
              {photos.map((photo, i) => (
                <Thumbnail key={photo.id} attachment={photo} index={i} onClick={openLightbox} isReadOnly={isReadOnly} onCategoryChange={onCategoryChange} accidentId={accidentId} canDelete={canDelete} onDelete={onDelete} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {canUpload
                ? "Drag photos here or click Upload Photo to add more. You'll choose the category after selecting. Click any photo to open the viewer."
                : "Click any photo to open the full-screen viewer. Use arrow keys to navigate."}
            </p>
          </>
        )}
      </div>

      {lightboxIndex !== null && (
        <PhotoAnnotationViewer
          photos={photos}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={goNext}
          onPrev={goPrev}
          isReadOnly={isReadOnly}
          onSaveAnnotations={isReadOnly ? undefined : onSaveAnnotations}
          accidentId={accidentId}
        />
      )}
    </div>
  );
}

// ── Document List ─────────────────────────────────────────────────────────────

interface EvidenceDocumentListProps {
  attachments: any[];
  onDownload: (attachment: any, index: number) => void;
  onDelete?: (attachmentId: string) => void;
  canDelete?: boolean;
  isEvidenceLocked?: boolean;
  isReadOnly?: boolean;
  onUploadComplete?: (result: UploadResult, category: string) => Promise<void> | void;
  onCategoryChange?: (attachmentId: string, newCategory: string) => Promise<void> | void;
}

export function EvidenceDocumentList({
  attachments,
  onDownload,
  onDelete,
  canDelete,
  isEvidenceLocked,
  isReadOnly,
  onUploadComplete,
  onCategoryChange,
}: EvidenceDocumentListProps) {
  const { toast } = useToast();

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Duplicate detection flow
  const [dupModalOpen, setDupModalOpen]       = useState(false);
  const [dupItems, setDupItems]               = useState<DupItem[]>([]);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  const { triggerPicker, hiddenInput } = useFilePicker({
    accept:
      "application/pdf,.pdf,.doc,.docx,application/msword," +
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
      ".xls,.xlsx,application/vnd.ms-excel," +
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    multiple: true,
    testId: "hidden-file-input-document",
    onFilesSelected: (files) => {
      setPendingFiles(files);
      setPickerOpen(true);
    },
    toast,
  });

  const doUpload = async (files: File[], category: string, resolvedNames?: string[]) => {
    if (!onUploadComplete) return;
    setIsUploading(true);
    try {
      await uploadFiles(files, category, onUploadComplete, resolvedNames);
    } catch {
      toast({ title: "Upload failed", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      setPendingFiles([]);
      setDupItems([]);
      setPendingCategory(null);
    }
  };

  const handleCategorySelected = async (category: string) => {
    setPickerOpen(false);
    if (!onUploadComplete || !pendingFiles.length) return;

    const existingNames = new Set((attachments || []).map((a) => (a.fileName as string)?.toLowerCase()));
    const items = buildDupItems(pendingFiles, existingNames);
    const hasDups = items.some((i) => i.isDuplicate);

    if (hasDups) {
      setPendingCategory(category);
      setDupItems(items);
      setDupModalOpen(true);
      return;
    }
    await doUpload(pendingFiles, category);
  };

  const handleDupCancel = () => {
    setDupModalOpen(false);
    setDupItems([]);
    setPendingFiles([]);
    setPendingCategory(null);
  };

  const handleDupSkip = async () => {
    setDupModalOpen(false);
    const nonDups = dupItems.filter((i) => !i.isDuplicate);
    if (!nonDups.length || !pendingCategory) { handleDupCancel(); return; }
    await doUpload(nonDups.map((i) => i.file), pendingCategory, nonDups.map((i) => i.resolvedName));
  };

  const handleDupUploadAll = async () => {
    setDupModalOpen(false);
    if (!pendingCategory) return;
    await doUpload(dupItems.map((i) => i.file), pendingCategory, dupItems.map((i) => i.resolvedName));
  };

  // All non-deleted non-image non-video files (images and videos go to the photo gallery)
  const docs = (attachments || []).filter((a) => !isMediaFile(a) && !a.isDeleted);

  const canUpload = !isReadOnly && !!onUploadComplete;

  return (
    <div className="space-y-3" data-testid="evidence-document-list">
      {hiddenInput}

      <CategoryPickerDialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) { setPickerOpen(false); setPendingFiles([]); }
        }}
        mode="document"
        fileCount={pendingFiles.length}
        onSelect={handleCategorySelected}
      />

      <DuplicateWarningDialog
        open={dupModalOpen}
        items={dupItems}
        onItemRename={(idx, name) => setDupItems((prev) => prev.map((it, i) => i === idx ? { ...it, resolvedName: name } : it))}
        onCancel={handleDupCancel}
        onSkipDuplicates={handleDupSkip}
        onUploadAll={handleDupUploadAll}
      />

      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="h-5 w-5 text-primary shrink-0" />
        <h4 className="font-semibold text-sm">Documents</h4>
        <Badge variant="secondary" className="text-xs">
          {docs.length} file{docs.length !== 1 ? "s" : ""}
        </Badge>
        {canUpload && (
          <Button
            size="sm"
            variant="outline"
            onClick={triggerPicker}
            disabled={isUploading}
            className="ml-auto"
            data-testid="button-upload-document"
          >
            {isUploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            {isUploading ? "Uploading…" : "Upload Document"}
          </Button>
        )}
      </div>

      {docs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 py-6 text-center"
          data-testid="document-list-empty"
        >
          <FileText className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No documents attached yet</p>
          <p className="text-xs text-muted-foreground/70">
            Use Upload Document above — you'll choose the category after selecting files
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden" data-testid="document-table">
          <div className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_160px_140px_auto] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>File</span>
            <span className="hidden sm:block">Category</span>
            <span className="hidden sm:block">Uploaded</span>
            <span>Actions</span>
          </div>
          {docs.map((doc, index) => {
            const uploadDate = doc.createdAt ? format(new Date(doc.createdAt), "MMM d, yyyy") : "—";
            const fileSize = formatFileSize(doc.fileSize);
            const canDeleteThis = canDelete && !isReadOnly;

            return (
              <div
                key={doc.id}
                className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_160px_140px_auto] gap-3 px-3 py-2.5 border-b border-border/60 last:border-0 items-center hover-elevate"
                data-testid={`document-row-${doc.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getDocIcon(doc.fileType || "")}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    {fileSize && <p className="text-xs text-muted-foreground">{fileSize}</p>}
                    {doc.attachmentSource && (
                      <Badge variant="outline" className="text-xs font-normal mt-0.5" data-testid={`badge-doc-source-${doc.id}`}>
                        {(ATTACHMENT_SOURCE_LABELS as Record<string, string>)[doc.attachmentSource] || doc.attachmentSource}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="hidden sm:block">
                  <InlineCategorySelect
                    attachment={doc}
                    isReadOnly={isReadOnly}
                    onCategoryChange={onCategoryChange}
                  />
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs text-foreground">{uploadDate}</p>
                  {doc.uploaderName && <p className="text-xs text-muted-foreground truncate">{doc.uploaderName}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => onDownload(doc, index)} title="Download" data-testid={`button-download-doc-${doc.id}`}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {canDeleteThis && onDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => isEvidenceLocked ? undefined : onDelete(doc.id)}
                      title={isEvidenceLocked ? "Evidence lock active — deletion requires override" : "Delete"}
                      disabled={!!isEvidenceLocked}
                      className={isEvidenceLocked ? "opacity-40 cursor-not-allowed" : "text-destructive/70 hover:text-destructive"}
                      data-testid={`button-delete-doc-${doc.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
