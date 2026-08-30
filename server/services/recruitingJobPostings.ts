const JOB_POSTING_SOURCES = new Set([
  "Indeed",
  "Craigslist",
  "Facebook",
  "ZipRecruiter",
  "LinkedIn",
  "Nextdoor",
  "Local / Community Group",
  "Military / Veteran Board",
  "Other",
]);

const JOB_POSTING_STATUSES = new Set(["active", "paused", "expired", "removed"]);

export type JobPostingValues = {
  source: string;
  sourceName: string | null;
  postingUrl: string;
  postingStatus: string;
  postedAt: string;
  expiresAt: string | null;
  notes: string | null;
};

export type JobPostingValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: Record<string, string> };

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateSource(value: unknown, fieldErrors: Record<string, string>): string | undefined {
  const source = optionalText(value);
  if (!source) {
    fieldErrors.source = "Source is required.";
  } else if (!JOB_POSTING_SOURCES.has(source)) {
    fieldErrors.source = "Select a supported job-posting source.";
  }
  return source ?? undefined;
}

function validateStatus(value: unknown, fieldErrors: Record<string, string>): string | undefined {
  const status = optionalText(value);
  if (!status || !JOB_POSTING_STATUSES.has(status)) {
    fieldErrors.postingStatus = "Select a valid posting status.";
    return undefined;
  }
  return status;
}

function validateDate(
  value: unknown,
  fieldName: "postedAt" | "expiresAt",
  fieldErrors: Record<string, string>,
  required: boolean,
): string | null | undefined {
  const date = optionalText(value);
  if (!date) {
    if (required) fieldErrors[fieldName] = "Posting date is required.";
    return null;
  }
  if (!isCalendarDate(date)) {
    fieldErrors[fieldName] = "Enter a valid date.";
    return undefined;
  }
  return date;
}

function validateDateOrder(
  postedAt: string | null | undefined,
  expiresAt: string | null | undefined,
  fieldErrors: Record<string, string>,
): void {
  if (postedAt && expiresAt && expiresAt < postedAt) {
    fieldErrors.expiresAt = "Expiration date cannot be before the posting date.";
  }
}

export function normalizeNewJobPosting(payload: unknown): JobPostingValidationResult<JobPostingValues> {
  const input = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const fieldErrors: Record<string, string> = {};
  const source = validateSource(input.source, fieldErrors);
  const postingUrl = optionalText(input.postingUrl);
  const postingStatus = validateStatus(input.postingStatus ?? "active", fieldErrors);
  const postedAt = validateDate(input.postedAt, "postedAt", fieldErrors, true);
  const expiresAt = validateDate(input.expiresAt, "expiresAt", fieldErrors, false);
  const sourceName = optionalText(input.sourceName);

  if (!postingUrl) {
    fieldErrors.postingUrl = "Posting URL is required.";
  } else if (!isHttpUrl(postingUrl)) {
    fieldErrors.postingUrl = "Enter a valid HTTP or HTTPS posting URL.";
  }
  if (source === "Other" && !sourceName) {
    fieldErrors.sourceName = "Source name is required when source is Other.";
  }
  validateDateOrder(postedAt, expiresAt, fieldErrors);

  if (Object.keys(fieldErrors).length > 0 || !source || !postingUrl || !postingStatus || !postedAt) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      source,
      sourceName: source === "Other" ? sourceName : null,
      postingUrl,
      postingStatus,
      postedAt,
      expiresAt: expiresAt ?? null,
      notes: optionalText(input.notes),
    },
  };
}

export function normalizeJobPostingUpdate(
  payload: unknown,
  current?: Pick<JobPostingValues, "postedAt" | "expiresAt">,
): JobPostingValidationResult<Partial<JobPostingValues>> {
  const input = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const fieldErrors: Record<string, string> = {};
  const update: Partial<JobPostingValues> = {};

  if (input.source !== undefined) {
    const source = validateSource(input.source, fieldErrors);
    if (source) {
      const sourceName = optionalText(input.sourceName);
      if (source === "Other" && !sourceName) {
        fieldErrors.sourceName = "Source name is required when source is Other.";
      }
      update.source = source;
      update.sourceName = source === "Other" ? sourceName : null;
    }
  }
  if (input.postingUrl !== undefined) {
    const postingUrl = optionalText(input.postingUrl);
    if (!postingUrl || !isHttpUrl(postingUrl)) {
      fieldErrors.postingUrl = "Enter a valid HTTP or HTTPS posting URL.";
    } else {
      update.postingUrl = postingUrl;
    }
  }
  if (input.postingStatus !== undefined) {
    const postingStatus = validateStatus(input.postingStatus, fieldErrors);
    if (postingStatus) update.postingStatus = postingStatus;
  }
  if (input.postedAt !== undefined) {
    const postedAt = validateDate(input.postedAt, "postedAt", fieldErrors, true);
    if (postedAt) update.postedAt = postedAt;
  }
  if (input.expiresAt !== undefined) {
    const expiresAt = validateDate(input.expiresAt, "expiresAt", fieldErrors, false);
    if (expiresAt !== undefined) update.expiresAt = expiresAt;
  }
  if (input.notes !== undefined) {
    update.notes = optionalText(input.notes);
  }

  validateDateOrder(
    update.postedAt ?? current?.postedAt,
    update.expiresAt !== undefined ? update.expiresAt : current?.expiresAt,
    fieldErrors,
  );

  if (Object.keys(update).length === 0 && Object.keys(fieldErrors).length === 0) {
    fieldErrors.request = "Provide at least one job-posting field to update.";
  }
  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: true, data: update };
}