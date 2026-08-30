/**
 * Ticket 3 — Communication Logging Lifecycle Proof Script
 *
 * Internal/dev-only script. NOT a production endpoint.
 *
 * Demonstrates the enforced recipient validation flow and all lifecycle stages:
 *
 *   Stage 1 — Create a message record (status = draft)
 *   Stage 2 — Validate recipients BEFORE creating rows
 *              • recipient[0]: valid — E.164 phone, normalized
 *              • recipient[1]: valid — E.164 phone, normalized
 *              • recipient[2]: excluded at validation — missing_destination
 *              • recipient[3]: excluded at validation — phone_not_normalized
 *              • recipient[4]: excluded at validation — invalid_e164_format
 *   Stage 3 — Create recipient rows (valid → pending, excluded → excluded at creation)
 *   Stage 4 — Advance message status: draft → queued → partial
 *   Stage 5 — Update delivery status on the two valid recipients
 *   Stage 6 — Write provider response placeholders
 *
 * Run with:
 *   npx tsx server/scripts/test_comm_log_lifecycle.ts
 */

import {
  validateRecipients,
  createCommunicationLog,
  createCommunicationRecipients,
  updateCommunicationMessageStatus,
  updateRecipientStatuses,
  getCommunicationMessage,
  getCommunicationRecipients,
} from "../services/communications/commLogger";

const SEP = "─".repeat(62);

function section(title: string) {
  console.log(`\n${SEP}`);
  console.log(`  ${title}`);
  console.log(SEP);
}

function ok(label: string, value: unknown) {
  console.log(`  ✓  ${label}:`, value);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗  ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓  ${message}`);
}

async function run() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("  Communication Logging Lifecycle — Ticket 3 Proof Script    ");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // ── Stage 1: Create message record ──────────────────────────────────────

  section("Stage 1 — Create message record (status = draft)");

  const msgId = await createCommunicationLog({
    channel:           "sms",
    provider:          "heymarket",
    direction:         "outbound",
    status:            "draft",
    fromIdentity:      "inbox:12345",
    body:              "[TICKET-3-TEST] Reminder: your shift starts at 07:00 tomorrow.",
    relatedModule:     "scheduling",
    relatedEntityType: "shift",
    relatedEntityId:   "shift-test-001",
    createdByUserId:   "system",
  });

  ok("message ID", msgId);
  const msgAfterCreate = await getCommunicationMessage(msgId);
  assert(msgAfterCreate?.status === "draft",   "status = draft");
  assert(msgAfterCreate?.channel === "sms",    "channel = sms");
  assert(msgAfterCreate?.relatedModule === "scheduling", "relatedModule = scheduling");

  // ── Stage 2: Validate recipients before creating rows ───────────────────

  section("Stage 2 — Validate 5 recipients (2 valid, 3 excluded)");

  const rawRecipients = [
    {
      recipientType:         "driver" as const,
      recipientId:           "driver-aaa-001",
      destinationRaw:        "9545551111",
      destinationNormalized: "+19545551111",   // valid E.164
    },
    {
      recipientType:         "driver" as const,
      recipientId:           "driver-bbb-002",
      destinationRaw:        "9545552222",
      destinationNormalized: "+19545552222",   // valid E.164
    },
    {
      recipientType:         "driver" as const,
      recipientId:           "driver-ccc-003",
      destinationRaw:        "",               // no phone — missing_destination
      destinationNormalized: undefined,
    },
    {
      recipientType:         "driver" as const,
      recipientId:           "driver-ddd-004",
      destinationRaw:        "5551234",        // raw only, not normalized — phone_not_normalized
      destinationNormalized: undefined,
    },
    {
      recipientType:         "driver" as const,
      recipientId:           "driver-eee-005",
      destinationRaw:        "0000000000",
      destinationNormalized: "0000000000",     // present but not E.164 — invalid_e164_format
    },
  ];

  const validated = validateRecipients("sms", rawRecipients);

  ok("total validated", validated.length);
  assert(validated[0].valid === true,  "recipient[0] valid = true");
  assert(validated[1].valid === true,  "recipient[1] valid = true");
  assert(validated[2].valid === false, "recipient[2] valid = false");
  assert(validated[3].valid === false, "recipient[3] valid = false");
  assert(validated[4].valid === false, "recipient[4] valid = false");
  assert(validated[2].exclusionReason === "missing_destination",   "recipient[2] reason = missing_destination");
  assert(validated[3].exclusionReason === "phone_not_normalized",  "recipient[3] reason = phone_not_normalized");
  assert(validated[4].exclusionReason === "invalid_e164_format",   "recipient[4] reason = invalid_e164_format");

  // ── Stage 3: Create recipient rows with correct initial state ────────────

  section("Stage 3 — createCommunicationRecipients() with validated results");

  const recipientRowIds = await createCommunicationRecipients(msgId, validated);
  ok("row IDs created", recipientRowIds.length);

  let recipients = await getCommunicationRecipients(msgId);
  assert(recipients.length === 5,                        "5 rows created");
  assert(recipients[0].deliveryStatus === "pending",     "recipient[0] deliveryStatus = pending");
  assert(recipients[0].excluded === false,               "recipient[0] excluded = false");
  assert(recipients[1].deliveryStatus === "pending",     "recipient[1] deliveryStatus = pending");
  assert(recipients[2].deliveryStatus === "excluded",    "recipient[2] deliveryStatus = excluded at creation");
  assert(recipients[2].excluded === true,                "recipient[2] excluded = true at creation");
  assert(recipients[2].excludedReason === "missing_destination",  "recipient[2] excludedReason set at creation");
  assert(recipients[3].excludedReason === "phone_not_normalized", "recipient[3] excludedReason set at creation");
  assert(recipients[4].excludedReason === "invalid_e164_format",  "recipient[4] excludedReason set at creation");

  // ── Stage 4: Advance message status ──────────────────────────────────────

  section("Stage 4 — Message status: draft → queued → partial");

  await updateCommunicationMessageStatus(msgId, { status: "queued" });
  let msg = await getCommunicationMessage(msgId);
  assert(msg?.status === "queued", "status = queued");

  await updateCommunicationMessageStatus(msgId, { status: "partial" });
  msg = await getCommunicationMessage(msgId);
  assert(msg?.status === "partial",     "status = partial");
  assert(msg?.sentAt !== null,          "sent_at populated on partial");

  // ── Stage 5: Update delivery statuses on the two valid recipients ─────────

  section("Stage 5 — recipient[0] → sent, recipient[1] → failed");

  await updateRecipientStatuses([
    { recipientRowId: recipientRowIds[0], deliveryStatus: "sent" },
    { recipientRowId: recipientRowIds[1], deliveryStatus: "failed", errorMessage: "Simulated provider failure" },
  ]);

  recipients = await getCommunicationRecipients(msgId);
  assert(recipients[0].deliveryStatus === "sent",    "recipient[0] = sent");
  assert(recipients[0].deliveredAt !== null,          "recipient[0] deliveredAt set");
  assert(recipients[1].deliveryStatus === "failed",  "recipient[1] = failed");
  assert(recipients[1].failedAt !== null,             "recipient[1] failedAt set");
  assert(recipients[1].errorMessage === "Simulated provider failure", "recipient[1] errorMessage");
  assert(recipients[2].deliveryStatus === "excluded", "recipient[2] still excluded");
  assert(recipients[3].deliveryStatus === "excluded", "recipient[3] still excluded");
  assert(recipients[4].deliveryStatus === "excluded", "recipient[4] still excluded");

  // ── Stage 6: Write provider response placeholders ─────────────────────────

  section("Stage 6 — Write provider response placeholders");

  const fakeProviderResponse = {
    heymarket_message_id: "hm-test-9999",
    status:               "partial",
    sent_at:              new Date().toISOString(),
    recipient_count:      2,
  };

  await updateCommunicationMessageStatus(msgId, {
    status:              "partial",
    providerMessageId:   "hm-test-9999",
    providerRawResponse: fakeProviderResponse,
  });

  await updateRecipientStatuses([
    { recipientRowId: recipientRowIds[0], deliveryStatus: "sent", providerMessageId: "hm-test-9999-r0" },
  ]);

  msg       = await getCommunicationMessage(msgId);
  recipients = await getCommunicationRecipients(msgId);

  assert(msg?.providerMessageId === "hm-test-9999",    "message providerMessageId stored");
  assert(msg?.providerRawResponse !== null,             "message providerRawResponse stored");
  assert(recipients[0].providerMessageId === "hm-test-9999-r0", "recipient[0] providerMessageId stored");

  // ── Summary ───────────────────────────────────────────────────────────────

  section("Summary");
  console.log(`  Message ID        : ${msgId}`);
  console.log(`  Final status      : ${msg?.status}`);
  console.log(`  sent_at           : ${msg?.sentAt}`);
  console.log(`  providerMessageId : ${msg?.providerMessageId}`);
  console.log("");
  console.log("  Recipients:");
  recipients.forEach((r, i) => {
    const flag = r.excluded ? " [EXCLUDED]" : "";
    const detail = r.excludedReason ?? r.errorMessage ?? "—";
    console.log(`    [${i}] ${r.deliveryStatus.padEnd(8)}${flag}  id=${r.id.slice(0, 8)}…  detail=${detail}`);
  });

  console.log("\n  All 6 lifecycle stages passed — validation-before-creation enforced.\n");
  process.exit(0);
}

run().catch(err => {
  console.error("\n  FAILED:", err);
  process.exit(1);
});
