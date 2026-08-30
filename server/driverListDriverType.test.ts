import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clientSource = readFileSync(
  new URL("../client/src/pages/corporate/Drivers.tsx", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("./routes.ts", import.meta.url),
  "utf8",
);

describe("Driver List Driver Type support", () => {
  it("replaces the list-only OpenForce column with a sortable Driver Type column", () => {
    expect(clientSource).toContain('data-testid="header-driver-type"');
    expect(clientSource).toContain('toggleSort("driverType")');
    expect(clientSource).toContain('"Unassigned"');
    expect(clientSource).not.toContain('data-testid="header-openforce-id"');
  });

  it("filters and exports Driver Type using the server-side complete dataset", () => {
    expect(clientSource).toContain('params.set("driverTypes", driverTypeFilter)');
    expect(clientSource).toContain("body.driverTypes = driverTypeFilter");
    expect(routeSource).toContain("if (driverTypes) {");
    expect(routeSource).toContain('case "driverType"');
    expect(routeSource).toContain('typeof driverTypes === "string"');
    expect(routeSource).toContain('"Driver Type"');
  });
});