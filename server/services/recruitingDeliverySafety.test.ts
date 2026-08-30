import { describe, expect, it } from "vitest";
import {
  getRecruitingExternalDeliverySuppressionReason,
  isRecruitingExternalDeliverySuppressed,
} from "./recruitingDeliverySafety";

describe("Recruiting external delivery safety", () => {
  it("fails closed by default in development", () => {
    expect(isRecruitingExternalDeliverySuppressed({ NODE_ENV: "development" })).toBe(true);
    expect(getRecruitingExternalDeliverySuppressionReason({ NODE_ENV: "development" }))
      .toContain("default_fail_closed");
  });

  it("fails closed in staging even if a mode is not configured", () => {
    expect(isRecruitingExternalDeliverySuppressed({ NODE_ENV: "staging" })).toBe(true);
  });

  it("does not alter production delivery behavior", () => {
    expect(isRecruitingExternalDeliverySuppressed({
      NODE_ENV: "production",
      RECRUITING_EXTERNAL_DELIVERY_MODE: "fail_closed",
    })).toBe(false);
  });
});