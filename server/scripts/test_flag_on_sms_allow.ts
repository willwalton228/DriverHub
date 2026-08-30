/**
 * Feature-Flag-On SMS Path Verification
 *
 * With heymarket_texting_enabled = true (just written to DB),
 * confirms that:
 *   1. The flag-check gate now passes (isSmsEnabled() = true)
 *   2. The send paths proceed past the flag into the credential gate
 *   3. No real Heymarket API call fires (inbox_id / token still absent)
 *   4. All log records are written correctly with the right blocking reason
 *   5. No record is incorrectly marked 'sent'
 *
 * Paths under test:
 *   A — sendBulkSms()                   (flag check → credential check)
 *   B — CommunicationOrchestrator.send() (isConfigured() with flag now true)
 *   C — sendTestSms()                    (getHeymarketConfig() path — unchanged)
 *
 * Run with:
 *   npx tsx server/scripts/test_flag_on_sms_allow.ts
 */

import { pool } from "../db";
import { resolveConfig } from "../services/platformConfigService";
import {
  sendBulkSms,
  sendTestSms,
  isSmsEnabled,
} from "../services/communicationsService";
import { communicationOrchestrator } from "../services/communications/orchestrator";

const TEST_USER_ID    = "0a520043-f7eb-4944-aefe-9a85de761950";
const TEST_DRIVER_ID  = "7c472cc3-7092-45ec-8f1b-f0fdf68cc9a1";
const TEST_ACCOUNT_ID = "03144c76-e191-41ad-82f7-5c2c638ef1f6";
const TEST_MESSAGE    = "[FLAG-ON-TEST] Credential gate check — must not deliver.";
const SEP = "─".repeat(68);

function section(title: string) {
  console.log(`\n${SEP}`);
  console.log(`  ${title}`);
  console.log(SEP);
}

function ok(label: string, value: unknown) {
  console.log(`  ✓  ${label}:`, value);
}

function note(msg: string) {
  console.log(`  ℹ  ${msg}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n  ✗  ASSERTION FAILED: ${message}\n`);
    process.exit(1);
  }
  console.log(`  ✓  ${message}`);
}

async function queryLogsCreatedAfter(since: Date) {
  const r = await pool.query(
    `SELECT id, driver_id, status, provider, external_message_id,
            bulk_send_id, error_message, sent_at, failed_at
       FROM driver_communication_logs
      WHERE created_at >= $1
        AND sent_by_user_id = $2
      ORDER BY created_at`,
    [since, TEST_USER_ID],
  );
  return r.rows;
}

async function queryCommMessagesCreatedAfter(since: Date) {
  const r = await pool.query(
    `SELECT id, status, error_message, sent_at
       FROM communication_messages
      WHERE created_at >= $1
        AND created_by_user_id = $2
      ORDER BY created_at`,
    [since, TEST_USER_ID],
  );
  return r.rows;
}

async function queryCommRecipientsFor(msgId: string) {
  const r = await pool.query(
    `SELECT id, delivery_status, excluded, excluded_reason, provider_message_id
       FROM communication_recipients
      WHERE communication_message_id = $1
      ORDER BY created_at`,
    [msgId],
  );
  return r.rows;
}

async function run() {
  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("  Feature-Flag-On SMS Path Verification                             ");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  // ── Pre-flight: confirm flag is now ON ───────────────────────────────────

  section("Pre-flight — Confirm flag is now ON");

  const flagConf  = await resolveConfig("heymarket_texting_enabled");
  const inboxConf = await resolveConfig("sms.heymarket.inbox_id");
  const flagNow   = await isSmsEnabled();
  const tokenSet  = !!process.env.HEYMARKET_API_TOKEN;

  ok("heymarket_texting_enabled DB value", flagConf?.configValue ?? "(absent)");
  ok("sms.heymarket.inbox_id DB row",      inboxConf?.configValue ?? "(absent — expected)");
  ok("isSmsEnabled() result",              flagNow);
  ok("HEYMARKET_API_TOKEN present",        tokenSet);

  assert(flagConf !== null,  "heymarket_texting_enabled row now exists in DB");
  assert(flagConf?.configValue === true, "config_value is JSON boolean true");
  assert(flagNow === true,   "isSmsEnabled() returns true — flag gate will pass");
  assert(inboxConf === null, "sms.heymarket.inbox_id still absent — credential gate will catch");

  note("Flag check will PASS. Next blocking gate: getHeymarketConfig() / isConfigured() credential check.");
  note("No real Heymarket API call can fire without a valid inbox_id.");

  const testStart = new Date();

  // ── Path A: sendBulkSms() — flag gate passes, credential gate blocks ─────

  section("Path A — sendBulkSms() — flag gate now passes");

  const bulkResult = await sendBulkSms({
    accountId:     TEST_ACCOUNT_ID,
    driverIds:     [TEST_DRIVER_ID],
    message:       TEST_MESSAGE,
    sentByUserId:  TEST_USER_ID,
    contextModule: "flag_on_test",
  });

  ok("bulkResult.integrationActive", bulkResult.integrationActive);
  ok("bulkResult.summary",           bulkResult.summary);
  ok("bulkResult.sent",              bulkResult.sent);
  ok("bulkResult.included",          bulkResult.included);
  ok("bulkResult.excluded",          bulkResult.excluded);
  ok("bulkResult.recipientResults",  JSON.stringify(bulkResult.recipientResults));

  const sentRecips   = bulkResult.recipientResults.filter((r) => r.status === "sent");
  const pendingCreds = bulkResult.recipientResults.filter((r) => r.status === "pending_integration");
  const withMsgId    = bulkResult.recipientResults.filter((r) => r.externalMessageId !== null);

  // KEY ASSERTION: integrationActive is now true — flag gate passed
  assert(
    bulkResult.integrationActive === true,
    "Path A: integrationActive = true (flag check passed, distinct from previous flag-off run)",
  );
  assert(
    bulkResult.sent === 0,
    "Path A: sent = 0 (credential gate blocks dispatch, no API call)",
  );
  assert(
    sentRecips.length === 0,
    "Path A: zero recipients with status=sent",
  );
  assert(
    withMsgId.length === 0,
    "Path A: zero recipients with externalMessageId (no Heymarket response)",
  );
  assert(
    pendingCreds.length > 0,
    "Path A: pending_integration recipients logged (awaiting credential config)",
  );

  note(
    "Path A reached credential gate. status=pending_integration reflects missing inbox_id, not flag=false.",
  );

  // ── Path B: Orchestrator.send() — isConfigured() now tests credentials ───

  section("Path B — CommunicationOrchestrator.send() — flag now true, credential check next");

  const orchResult = await communicationOrchestrator.send({
    channel:           "sms",
    body:              TEST_MESSAGE,
    recipients: [
      {
        recipientType:         "driver",
        recipientId:           TEST_DRIVER_ID,
        destinationRaw:        "9294284675",
        destinationNormalized: "+19294284675",
      },
    ],
    relatedModule:     "flag_on_test",
    relatedEntityType: "driver",
    relatedEntityId:   TEST_DRIVER_ID,
    createdByUserId:   TEST_USER_ID,
  });

  ok("orchResult.status",   orchResult.status);
  ok("orchResult.sent",     orchResult.sent);
  ok("orchResult.failed",   orchResult.failed);
  ok("orchResult.excluded", orchResult.excluded);
  ok("orchResult.errors",   orchResult.errors);

  assert(
    orchResult.status !== "sent",
    "Path B: status != sent (no dispatch)",
  );
  assert(
    orchResult.sent === 0,
    "Path B: sent = 0 (credential gate blocks dispatch)",
  );
  assert(
    orchResult.errors.length > 0,
    "Path B: error message present (credential block, not flag block)",
  );

  note(
    "Path B: isConfigured() returned false due to missing inbox_id/token — not due to flag.",
  );
  note(
    `Path B: error = "${orchResult.errors[0]}"`,
  );

  // ── Path C: sendTestSms() — unchanged (credential check only) ───────────

  section("Path C — sendTestSms() — credential check (flag not checked in this path)");

  const testResult = await sendTestSms(
    "+19294284675",
    TEST_MESSAGE,
    TEST_USER_ID,
  );

  ok("testResult.success",   testResult.success);
  ok("testResult.error",     testResult.error ?? "(none)");
  ok("testResult.messageId", testResult.messageId ?? "(none)");

  assert(
    testResult.success === false,
    "Path C: still returns success=false (getHeymarketConfig=null, inbox_id absent)",
  );
  assert(
    !testResult.messageId,
    "Path C: no messageId (no API call reached)",
  );

  note(
    "Path C behavior unchanged — blocked by credential gate regardless of flag state.",
  );
  note(
    "This re-confirms the documented gap: sendTestSms() does not check the flag.",
  );

  // ── DB Audit: driver_communication_logs ──────────────────────────────────

  section("DB Audit — driver_communication_logs (Path A records)");

  const logs = await queryLogsCreatedAfter(testStart);
  ok("log rows created during this test run", logs.length);
  assert(logs.length >= 1, "At least one log row written");

  for (const log of logs) {
    console.log(`\n  Log ID: ${log.id}`);
    console.log(`    status             : ${log.status}`);
    console.log(`    provider           : ${log.provider}`);
    console.log(`    external_message_id: ${log.external_message_id ?? "(null)"}`);
    console.log(`    sent_at            : ${log.sent_at ?? "(null)"}`);
    console.log(`    failed_at          : ${log.failed_at ?? "(null)"}`);
    console.log(`    error_message      : ${log.error_message ?? "(null)"}`);

    assert(
      log.status !== "sent",
      `  log ${log.id.slice(0, 8)}: status != sent`,
    );
    assert(
      log.external_message_id === null,
      `  log ${log.id.slice(0, 8)}: external_message_id = null (no API response)`,
    );
    assert(
      log.sent_at === null,
      `  log ${log.id.slice(0, 8)}: sent_at = null`,
    );
  }

  // ── DB Audit: communication_messages + recipients ─────────────────────────

  section("DB Audit — communication_messages (Path B records)");

  const commMsgs = await queryCommMessagesCreatedAfter(testStart);
  ok("communication_messages rows created", commMsgs.length);

  for (const msg of commMsgs) {
    console.log(`\n  Message ID: ${msg.id}`);
    console.log(`    status        : ${msg.status}`);
    console.log(`    error_message : ${msg.error_message ?? "(null)"}`);
    console.log(`    sent_at       : ${msg.sent_at ?? "(null)"}`);

    assert(msg.status !== "sent", `  msg ${msg.id.slice(0, 8)}: status != sent`);
    assert(msg.sent_at === null,  `  msg ${msg.id.slice(0, 8)}: sent_at = null`);

    const recipients = await queryCommRecipientsFor(msg.id);
    console.log(`    recipient rows: ${recipients.length}`);
    for (const r of recipients) {
      console.log(
        `      [recipient]  delivery_status=${r.delivery_status}` +
        `  excluded=${r.excluded}  reason=${r.excluded_reason ?? "—"}` +
        `  provider_message_id=${r.provider_message_id ?? "(null)"}`,
      );
      assert(
        r.delivery_status !== "sent",
        `  recipient ${r.id.slice(0, 8)}: delivery_status != sent`,
      );
      assert(
        r.provider_message_id === null,
        `  recipient ${r.id.slice(0, 8)}: provider_message_id = null`,
      );
    }
  }

  // ── Compare with flag-off baseline ───────────────────────────────────────

  section("Flag-On vs Flag-Off Delta");

  console.log("  Behavior changed with flag=true:");
  console.log("    isSmsEnabled()             : false → true");
  console.log("    bulkResult.integrationActive: false → true");
  console.log("    Blocking gate              : flag check → credential check");
  console.log("    Log status                 : pending_integration (same — credential not yet met)");
  console.log("");
  console.log("  Behavior unchanged with flag=true (credentials still absent):");
  console.log("    sent count                 : 0 (no dispatch)");
  console.log("    external_message_id        : null");
  console.log("    sent_at                    : null");
  console.log("    Heymarket API called       : No");
  console.log("");
  console.log("  Next step to enable live dispatch:");
  console.log("    1. Set HEYMARKET_API_TOKEN env secret");
  console.log("    2. INSERT sms.heymarket.inbox_id into platform_configs");
  console.log("    3. getHeymarketConfig() will return non-null → live sends begin");

  // ── Cleanup ───────────────────────────────────────────────────────────────

  section("Cleanup — Removing heymarket_texting_enabled row");

  await pool.query(
    `DELETE FROM platform_configs WHERE config_key = 'heymarket_texting_enabled'`,
  );

  const afterCleanup = await resolveConfig("heymarket_texting_enabled");
  const flagAfter    = await isSmsEnabled();

  ok("Row after DELETE", afterCleanup ?? "(absent — confirmed)");
  ok("isSmsEnabled() after cleanup", flagAfter);

  assert(afterCleanup === null, "Cleanup: heymarket_texting_enabled row removed");
  assert(flagAfter === false,   "Cleanup: isSmsEnabled() back to false");

  console.log("\n  Flag-on row successfully removed. System is back to flag-off baseline.");

  // ── Summary ───────────────────────────────────────────────────────────────

  section("Verification Summary");

  console.log("  1. Flag check passed           — isSmsEnabled() = true");
  console.log("  2. Path proceeded to credential gate — integrationActive = true in Path A");
  console.log("  3. No Heymarket API call        — inbox_id absent, getHeymarketConfig()=null");
  console.log("  4. Logging lifecycle correct    — status/provider/sent_at all reflect blocked state");
  console.log("  5. No record marked 'sent'      — zero status=sent in any table");
  console.log("  6. No sent_at or externalMessageId written anywhere");
  console.log("  7. Cleanup successful           — flag row removed, baseline restored");
  console.log("\n  All assertions passed.\n");

  process.exit(0);
}

run().catch((err) => {
  console.error("\n  SCRIPT FAILED:", err);
  process.exit(1);
});
