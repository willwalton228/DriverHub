import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("claim creation uses the supported driver lookup before emitting CLAIM_CREATED", async () => {
  const routes = await readFile(new URL("./routes.ts", import.meta.url), "utf8");
  const claimCreationSection = routes.slice(
    routes.indexOf("// Emit CLAIM_CREATED event"),
    routes.indexOf("// ── Claims Controls"),
  );

  assert.doesNotMatch(claimCreationSection, /storage\.getDriverById/);
  assert.match(claimCreationSection, /storage\.getDriverWithUser/);
  assert.match(claimCreationSection, /CLAIM_CREATED_EVENT_EMITTED/);
  assert.match(claimCreationSection, /CLAIM_CREATED_EVENT_FAILED/);
});

test("CLAIM_CREATED handler records receipt, controls, and delivery outcomes", async () => {
  const handler = await readFile(
    new URL("./services/communications/events/claimEvents.ts", import.meta.url),
    "utf8",
  );

  for (const eventType of [
    "CLAIM_CREATED_COMMUNICATION_RECEIVED",
    "CLAIM_CREATED_CONTROLS_EVALUATED",
    "CLAIM_CREATED_EMAIL_FAILED",
    "CLAIM_CREATED_EMAIL_ACCEPTED",
    "CLAIM_CREATED_EMAIL_SKIPPED",
  ]) {
    assert.match(handler, new RegExp(eventType));
  }
});

test("Claims Controls migration derives User IDs from existing rules without hard-coded recipients", async () => {
  const migration = await readFile(
    new URL("./migrations/0098_normalize_claim_notification_recipients.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /normalized_claim_created_users/);
  assert.match(migration, /recipient_type\s*=\s*'email'/);
  assert.match(migration, /recipient_type\s*=\s*'role'/);
  assert.match(migration, /'user'/);
  assert.doesNotMatch(migration, /@driverondemand\.co/);
});