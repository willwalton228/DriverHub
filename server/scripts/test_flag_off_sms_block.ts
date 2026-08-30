/**
 * Feature-Flag-Off SMS Block Verification (updated for explicit signal assertions)
 *
 * With heymarket_texting_enabled absent or false in platform_configs, confirms:
 *   1. An attempted SMS send is blocked
 *   2. No provider dispatch is attempted
 *   3. No communication record is incorrectly marked sent
 *   4. The returned result clearly states SMS is disabled by feature flag
 *
 * Paths under test:
 *   A — sendBulkSms()                    (communicationsService.ts)
 *   B — CommunicationOrchestrator.send() (orchestrator.ts)
 *   C — HeymarketProvider.getConfigurationStatus()  (providers/heymarket.ts)
 *
 * Run with:
 *   npx tsx server/scripts/test_flag_off_sms_block.ts
 */

import { pool } from "../db";
import { resolveConfig } from "../services/platformConfigService";
import {
  sendBulkSms,
  sendTestSms,
  isSmsEnabled,
} from "../services/communicationsService";
import { communicationOrchestrator } from "../services/communications/orchestrator";
import { HeymarketProvider } from "../services/communications/providers/heymarket";

const TEST_USER_ID    = "0a520043-f7eb-4944-aefe-9a85de761950";
const TEST_DRIVER_ID  = "7c472cc3-7092-45ec-8f1b-f0fdf68cc9a1";
const TEST_ACCOUNT_ID = "03144c76-e191-41ad-82f7-5c2c638ef1f6";
const TEST_MESSAGE    = "[FLAG-OFF-EXPLICIT-TEST] This message must never be delivered.";
const SEP = "─".repeat(68);

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
    console.error(`\n  ✗  ASSERTION FAILED: ${message}\n`);
    process.exit(1);
  }
  console.log(`  ✓  ${message}`);
}

async function queryLogsCreatedAfter(since: Date) {
  const r = await pool.query(
    `SELECT id, driver_id, status, provider, external_message_id,
            error_message, sent_at, failed_at
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
  console.log("  Feature-Flag-Off SMS Block — Explicit Signal Verification         ");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  // ── Pre-flight ────────────────────────────────────────────────────────────

  section("Pre-flight — Confirm flag is absent / false");

  const flagConf  = await resolveConfig("heymarket_texting_enabled");
  const flagNow   = await isSmsEnabled();

  ok("heymarket_texting_enabled DB row", flagConf ?? "(absent)");
  ok("isSmsEnabled() result",            flagNow);

  assert(flagConf === null,    "heymarket_texting_enabled has no row in platform_configs");
  assert(flagNow === false,    "isSmsEnabled() returns false");

  // ── Provider self-report ──────────────────────────────────────────────────

  section("HeymarketProvider.getConfigurationStatus() — flag absent");

  const provider = new HeymarketProvider();
  const provStatus = await provider.getConfigurationStatus();

  ok("provStatus.ready",  provStatus.ready);
  ok("provStatus.reason", provStatus.reason);

  assert(provStatus.ready === false,
    "Provider reports ready=false");
  assert(provStatus.reason === "sms_feature_flag_disabled",
    "Provider reason = sms_feature_flag_disabled (not missing_api_token or missing_inbox_id)");

  // Verify isConfigured() delegates to getConfigurationStatus()
  const isConf = await provider.isConfigured();
  assert(isConf === false,
    "isConfigured() returns false (delegates to getConfigurationStatus)");

  const testStart = new Date();

  // ── Path A: sendBulkSms() ─────────────────────────────────────────────────

  section("Path A — sendBulkSms(): requirement checks");

  const bulkResult = await sendBulkSms({
    accountId:     TEST_ACCOUNT_ID,
    driverIds:     [TEST_DRIVER_ID],
    message:       TEST_MESSAGE,
    sentByUserId:  TEST_USER_ID,
    contextModule: "flag_off_explicit_test",
  });

  ok("integrationActive",    bulkResult.integrationActive);
  ok("summary",              bulkResult.summary);
  ok("sent",                 bulkResult.sent);
  ok("recipientResults[0]",  JSON.stringify(bulkResult.recipientResults[0]));

  // Requirement 1: send is blocked
  assert(bulkResult.integrationActive === false,
    "Req 1: integrationActive=false — flag check blocked the send path");

  // Requirement 2: no provider dispatch
  const withMsgId = bulkResult.recipientResults.filter(r => r.externalMessageId !== null);
  assert(bulkResult.sent === 0,
    "Req 2: sent=0 — no provider dispatch attempted");
  assert(withMsgId.length === 0,
    "Req 2: zero externalMessageId values (no Heymarket API response)");

  // Requirement 3: no record marked sent
  const sentRecips = bulkResult.recipientResults.filter(r => r.status === "sent");
  assert(sentRecips.length === 0,
    "Req 3: zero recipients with status=sent");

  // Requirement 4: result clearly states SMS is disabled by feature flag
  const disabledRecips = bulkResult.recipientResults.filter(r => r.status === "sms_disabled");
  assert(disabledRecips.length > 0,
    "Req 4: at least one recipient has status=sms_disabled");
  assert(
    disabledRecips.every(r => r.error?.includes("feature flag")),
    "Req 4: every sms_disabled recipient carries an error mentioning 'feature flag'",
  );
  assert(
    bulkResult.summary.includes("feature flag"),
    `Req 4: summary string mentions 'feature flag': "${bulkResult.summary}"`,
  );

  // ── Path B: CommunicationOrchestrator.send() ──────────────────────────────

  section("Path B — CommunicationOrchestrator.send(): requirement checks");

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
    relatedModule:     "flag_off_explicit_test",
    relatedEntityType: "driver",
    relatedEntityId:   TEST_DRIVER_ID,
    createdByUserId:   TEST_USER_ID,
  });

  ok("orchResult.status",   orchResult.status);
  ok("orchResult.sent",     orchResult.sent);
  ok("orchResult.excluded", orchResult.excluded);
  ok("orchResult.errors",   orchResult.errors);

  // Requirement 1: send is blocked
  assert(orchResult.status === "failed",
    "Req 1: orchestrator result status=failed — send is blocked");

  // Requirement 2: no provider dispatch
  assert(orchResult.sent === 0,
    "Req 2: sent=0 — no provider dispatch");

  // Requirement 3: no record marked sent — validated via DB audit below

  // Requirement 4: result clearly states SMS is disabled by feature flag
  assert(orchResult.errors.length > 0,
    "Req 4: at least one error in result");
  assert(
    orchResult.errors.some(e =>
      e.includes("feature flag") ||
      e.toLowerCase().includes("sms_feature_flag_disabled") ||
      e.toLowerCase().includes("not enabled"),
    ),
    `Req 4: error message references feature flag: ${JSON.stringify(orchResult.errors)}`,
  );

  // ── Path C: sendTestSms() ─────────────────────────────────────────────────

  section("Path C — sendTestSms(): blocked at credential gate (flag not checked — documented gap)");

  const testResult = await sendTestSms("+19294284675", TEST_MESSAGE, TEST_USER_ID);
  ok("testResult.success",   testResult.success);
  ok("testResult.error",     testResult.error ?? "(none)");

  assert(testResult.success === false,
    "Path C: returns success=false — no dispatch");
  assert(!testResult.messageId,
    "Path C: no messageId — no API call");

  console.log(
    "\n  NOTE: sendTestSms() is blocked by missing credentials, not by the flag.",
    "\n  Documented gap — flag check absent in this path.",
  );

  // ── DB audit ──────────────────────────────────────────────────────────────

  section("DB Audit — driver_communication_logs (Path A)");

  const logs = await queryLogsCreatedAfter(testStart);
  ok("log rows created", logs.length);
  assert(logs.length >= 1, "At least one log row written");

  for (const log of logs) {
    console.log(`\n  Log ID: ${log.id.slice(0, 8)}…`);
    console.log(`    status             : ${log.status}`);
    console.log(`    provider           : ${log.provider}`);
    console.log(`    error_message      : ${log.error_message}`);
    console.log(`    external_message_id: ${log.external_message_id ?? "(null)"}`);
    console.log(`    sent_at            : ${log.sent_at ?? "(null)"}`);
    console.log(`    failed_at          : ${log.failed_at ?? "(null)"}`);

    // Req 3: not marked sent
    assert(log.status !== "sent",
      `  log ${log.id.slice(0, 8)}: status != sent`);

    // Req 4: clearly identifies feature flag block
    assert(log.status === "sms_disabled",
      `  log ${log.id.slice(0, 8)}: status = sms_disabled (flag-specific value)`);
    assert(
      log.error_message?.includes("feature flag"),
      `  log ${log.id.slice(0, 8)}: error_message mentions 'feature flag'`,
    );

    // Req 2: no API call
    assert(log.external_message_id === null,
      `  log ${log.id.slice(0, 8)}: external_message_id = null`);
    assert(log.sent_at === null,
      `  log ${log.id.slice(0, 8)}: sent_at = null`);
  }

  section("DB Audit — communication_messages + recipients (Path B)");

  const commMsgs = await queryCommMessagesCreatedAfter(testStart);
  ok("communication_messages rows", commMsgs.length);

  for (const msg of commMsgs) {
    console.log(`\n  Message ID: ${msg.id.slice(0, 8)}…`);
    console.log(`    status        : ${msg.status}`);
    console.log(`    error_message : ${msg.error_message}`);
    console.log(`    sent_at       : ${msg.sent_at ?? "(null)"}`);

    // Req 3: not marked sent
    assert(msg.status !== "sent",
      `  msg ${msg.id.slice(0, 8)}: status != sent`);
    assert(msg.sent_at === null,
      `  msg ${msg.id.slice(0, 8)}: sent_at = null`);

    // Req 4: error message references feature flag
    assert(
      msg.error_message?.includes("feature flag") ||
      msg.error_message?.includes("not enabled"),
      `  msg ${msg.id.slice(0, 8)}: error_message references feature flag`,
    );

    const recipients = await queryCommRecipientsFor(msg.id);
    console.log(`    recipient rows: ${recipients.length}`);

    for (const r of recipients) {
      console.log(
        `      [recipient]  delivery_status=${r.delivery_status}` +
        `  excluded_reason=${r.excluded_reason ?? "—"}` +
        `  provider_message_id=${r.provider_message_id ?? "(null)"}`,
      );

      // Req 3: not marked sent
      assert(r.delivery_status !== "sent",
        `  recipient ${r.id.slice(0, 8)}: delivery_status != sent`);

      // Req 4: excluded_reason explicitly identifies feature flag
      assert(
        r.excluded_reason === "sms_feature_flag_disabled",
        `  recipient ${r.id.slice(0, 8)}: excluded_reason = sms_feature_flag_disabled`,
      );

      // Req 2: no API call
      assert(r.provider_message_id === null,
        `  recipient ${r.id.slice(0, 8)}: provider_message_id = null`);
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────

  section("Requirements Summary");

  console.log("  1. Send blocked              ✓  integrationActive=false; orchResult.status=failed");
  console.log("  2. No provider dispatch      ✓  sent=0; no externalMessageId or provider_message_id");
  console.log("  3. No record marked sent     ✓  status!=sent in all tables; sent_at=null everywhere");
  console.log("  4. Result clearly states flag:");
  console.log("       sendBulkSms   → status=sms_disabled; error='…feature flag…'; summary='…feature flag disabled…'");
  console.log("       Orchestrator  → error='SMS is disabled by feature flag…'");
  console.log("       Provider      → reason=sms_feature_flag_disabled");
  console.log("       DB log row    → status=sms_disabled; error_message='…feature flag…'");
  console.log("       DB recipient  → excluded_reason=sms_feature_flag_disabled");
  console.log("\n  All assertions passed.\n");

  process.exit(0);
}

run().catch(err => {
  console.error("\n  SCRIPT FAILED:", err);
  process.exit(1);
});
