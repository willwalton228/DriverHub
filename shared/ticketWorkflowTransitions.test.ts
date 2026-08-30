import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schemaSource = readFileSync(
  new URL("./schema.ts", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../server/routes.ts", import.meta.url),
  "utf8",
);
const portalSource = readFileSync(
  new URL("../client/src/pages/corporate/TicketPortal.tsx", import.meta.url),
  "utf8",
);

describe("AMR workflow status access", () => {
  it("defines one complete workflow list without Roadmapped", () => {
    for (const status of [
      "submitted", "reviewed", "sent_back_for_info", "prioritizing",
      "in_queue", "in_development", "product_decision_required", "in_production",
      "needs_testing", "user_accepts", "user_declines", "completed", "cancelled", "duplicate",
    ]) {
      expect(schemaSource).toContain(`"${status}"`);
    }
    expect(schemaSource).toContain("export const TICKET_ACTIVE_STATUSES = [");
    expect(schemaSource).not.toContain('"on_roadmap", "cancelled", "duplicate",\n] as const;\n\nexport const TICKET_TRANSITIONS');
  });

  it("uses the same complete workflow list in the detail dropdown and API validation", () => {
    expect(portalSource).toContain("const workflowStatuses = TICKET_ACTIVE_STATUSES;");
    expect(portalSource).toContain('data-testid="select-ticket-status"');
    expect(routeSource).toContain("!(TICKET_ACTIVE_STATUSES as readonly string[]).includes(status)");
    expect(routeSource).not.toContain("AMR_STATUS_TRANSITION_FORBIDDEN");
    expect(routeSource).not.toContain("DUPLICATE_SUPER_ROLES");
  });

  it("preserves the decline-comment flow and the immutable status-change audit record", () => {
    expect(portalSource).toContain("if (newStatus === 'user_declines')");
    expect(portalSource).toContain("A comment is required when testing is declined");
    expect(routeSource).toContain("statusFrom: existing.status");
    expect(routeSource).toContain("statusTo: finalStatus");
    expect(routeSource).toContain("createdByUserId: userId");
  });
});