export const QUALIFYING_PHOTO_VIDEO_CATEGORIES = [
  "scene_photos",
  "vehicle_damage_photos",
  "driver_photos",
  "video_photos",
  "video",
] as const;

export interface ClaimEvidenceAttachment {
  category?: string | null;
  fileType?: string | null;
  isDeleted?: boolean | null;
}

export function normalizeClaimAttachmentCategory(
  category: string | null | undefined,
): string {
  const normalized = (category || "").trim().toLowerCase();
  return normalized === "video" ? "video_photos" : normalized;
}

export function isQualifyingPhotoVideoAttachment(
  attachment: ClaimEvidenceAttachment,
): boolean {
  if (attachment.isDeleted) return false;
  const category = normalizeClaimAttachmentCategory(attachment.category);
  if (!QUALIFYING_PHOTO_VIDEO_CATEGORIES.includes(
    category as typeof QUALIFYING_PHOTO_VIDEO_CATEGORIES[number],
  )) return false;

  const fileType = attachment.fileType || "";
  return fileType.startsWith("image/") || fileType.startsWith("video/");
}