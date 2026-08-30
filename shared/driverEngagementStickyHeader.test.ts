import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reportSource = readFileSync(
  new URL("../client/src/pages/corporate/reports/DriverEngagementRetentionReport.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../client/src/App.tsx", import.meta.url),
  "utf8",
);

describe("Driver Engagement table layout", () => {
  it("pins the header to the actual application scroll viewport", () => {
    // App.tsx owns vertical scrolling with its central <main overflow-auto>.
    // Adding overflow to this CardContent makes it the nearest sticky ancestor
    // even though it has no vertical scroll range, so the header scrolls away.
    expect(reportSource).toMatch(
      /<CardContent className="p-0">\s*<table className="w-full min-w-max caption-bottom text-sm">/,
    );
    expect(reportSource).not.toContain(
      '<CardContent className="p-0 overflow-x-auto">',
    );
    expect(reportSource).toContain("sticky top-0 z-30 bg-card");

    // The main scroll viewport has standard top padding. That padding creates a
    // visible strip above a sticky table header, so this route must keep its
    // visual page spacing inside the page instead of on the scroll container.
    expect(appSource).toContain(
      'location === "/reports/driver-engagement" ? " px-3 pb-4 sm:px-4 sm:pb-6 md:px-6"',
    );
    expect(reportSource).toContain('className="space-y-5 pt-4 sm:pt-6"');
  });
});