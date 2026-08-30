import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loginSource = readFileSync(
  new URL("../client/src/pages/Login.tsx", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);

describe("Login failure handling", () => {
  it("does not attempt to parse every failed login response as JSON", () => {
    expect(loginSource).toContain("async function readLoginResponse(response: Response)");
    expect(loginSource).toContain("const text = await response.text();");
    expect(loginSource).toContain("const json = await readLoginResponse(response);");
    expect(loginSource).toContain("We couldn't sign you in right now. Please try again in a moment.");
  });

  it("returns a safe JSON response for uncaught server errors without rethrowing", () => {
    expect(serverSource).toContain('error: "INTERNAL_ERROR"');
    expect(serverSource).toContain("if (res.headersSent) {");
    expect(serverSource).not.toContain("res.status(status).json({ message });\n      throw err;");
  });
});