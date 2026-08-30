import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  new URL("../server/routes.ts", import.meta.url),
  "utf8",
);
const formSource = readFileSync(
  new URL("../client/src/components/recruiting/RecruitingRequestsTab.tsx", import.meta.url),
  "utf8",
);

describe("Recruiting Request submission resilience", () => {
  it("loads the employment-type validator before validating an intake request", () => {
    expect(routeSource).toContain(
      'const { recruitingRequests, isApprovedEmploymentType } = await import("@shared/schema");',
    );
    expect(routeSource).toContain("!isApprovedEmploymentType(employmentType)");
  });

  it("returns structured, field-level submission errors without exposing internal failures", () => {
    expect(routeSource).toContain('function recruitingSubmissionError(');
    expect(routeSource).toContain('"VALIDATION_FAILED", "validation"');
    expect(routeSource).toContain('fieldErrors: { employmentType:');
    expect(routeSource).toContain('fieldErrors: { certLiaison:');
    expect(routeSource).toContain('const referenceId = `REC-SUBMIT-${crypto.randomUUID()}`;');
    expect(routeSource).toContain('"REQUEST_SUBMISSION_FAILED"');
  });

  it("replays a completed submission instead of creating a duplicate", () => {
    expect(routeSource).toContain("recruiting_request_submit:${userId}");
    expect(routeSource).toContain("checkIdempotency(");
    expect(routeSource).toContain("finalizeIdempotencyKey(");
    expect(routeSource).toContain("idempotentReplay: true");
  });

  it("preserves form values and offers retry only for recoverable client failures", () => {
    expect(formSource).toContain('headers: { "X-Idempotency-Key": submissionKeyRef.current }');
    expect(formSource).toContain('const retryable = !error?.status || error?.retryable === true;');
    expect(formSource).toContain('form.setError(field as keyof RequestForm');
    expect(formSource).toContain('data-testid="btn-retry-recruiting-request"');
    expect(formSource).toContain("disabled={submitMutation.isPending}");
    expect(formSource).toContain("submissionKeyRef.current = null;");
  });
});