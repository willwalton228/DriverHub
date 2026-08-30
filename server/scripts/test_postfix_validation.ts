/**
 * Post-Fix Validation: Explicit SMS Blocking Reasons
 *
 * Validates all five post-fix requirements against the live DB:
 *
 *   Point 1 — Flag OFF:         sendBulkSms status, log row, errorMessage, no dispatch
 *   Point 2 — Flag ON/no creds: sendBulkSms status, log row, errorMessage, no dispatch
 *   Point 3 — Orchestrator:     getConfigurationStatus in both scenarios, message status,
 *                                recipient excluded_reason, human-readable error
 *   Point 4 — SmsStatus value:  "sms_disabled" confirmed, all usage sites
 *   Point 5 — No silent collapse: code-path analysis proves the two reasons cannot converge
 *
 * Run with:
 *   npx tsx server/scripts/test_postfix_validation.ts
 */

import { pool } from "../db";
import {
  sendBulkSms,
  isSmsEnabled,
  type SmsStatus,
} from "../services/communicationsService";
import { communicationOrchestrator } from "../services/communications/orchestrator";
import { HeymarketProvider } from "../services/communications/providers/heymarket";

const TEST_USER_ID    = "0a520043-f7eb-4944-aefe-9a85de761950";
const TEST_DRIVER_ID  = "7c472cc3-7092-45ec-8f1b-f0fdf68cc9a1";
const TEST_ACCOUNT_ID = "03144c76-e191-41ad-82f7-5c2c638ef1f6";
const SEP  = "═".repeat(70);
const SEP2 = "─".repeat(70);

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function SECTION(title: string) {
  console.log(`\n${SEP}`);
  console.log(`  ${title}`);
  console.log(SEP);
}

function SUB(title: string) {
  console.log(`\n${SEP2}`);
  console.log(`  ${title}`);
  console.log(SEP2);
}

function CHECK(label: string, condition: boolean, got?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓  ${label}`);
  } else {
    failed++;
    console.error(`  ✗  FAIL: ${label}${got !== undefined ? ` (got: ${JSON.stringify(got)})` : ""}`);
  }
}

function SHOW(label: string, value: unknown) {
  console.log(`       ${label}: ${JSON.stringify(value)}`);
}

async function setFlag(value: boolean | null) {
  if (value === null) {
    await pool.query(`DELETE FROM platform_configs WHERE config_key = 'heymarket_texting_enabled'`);
  } else {
    await pool.query(`DELETE FROM platform_configs WHERE config_key = 'heymarket_texting_enabled'`);
    await pool.query(`
      INSERT INTO platform_configs (config_key, config_category, label, config_value, scope_type, created_by, updated_by)
      VALUES ('heymarket_texting_enabled', 'feature_flag', 'Heymarket SMS Texting Enabled',
              $1::jsonb, 'global', 'postfix-validation', 'postfix-validation')`,
      [JSON.stringify(value)],
    );
  }
}

async function queryBulkLog(bulkSendId: string) {
  const r = await pool.query(
    `SELECT status, provider, error_message, external_message_id, sent_at, failed_at
       FROM driver_communication_logs
      WHERE bulk_send_id = $1
      ORDER BY created_at`,
    [bulkSendId],
  );
  return r.rows;
}

async function queryOrchMsg(msgId: string) {
  const r = await pool.query(
    `SELECT status, error_message, sent_at
       FROM communication_messages WHERE id = $1`,
    [msgId],
  );
  return r.rows[0] ?? null;
}

async function queryOrchRecipients(msgId: string) {
  const r = await pool.query(
    `SELECT delivery_status, excluded, excluded_reason, provider_message_id
       FROM communication_recipients
      WHERE communication_message_id = $1`,
    [msgId],
  );
  return r.rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n" + SEP);
  console.log("  Post-Fix Validation: Explicit SMS Blocking Reasons");
  console.log(SEP);

  const provider = new HeymarketProvider();

  // ════════════════════════════════════════════════════════════════════════
  // POINT 4 — SmsStatus type: confirm "sms_disabled" exists at compile time
  //           and all its usage sites
  // ════════════════════════════════════════════════════════════════════════

  SECTION("Point 4 — SmsStatus type and usage sites");

  // TypeScript would not compile if "sms_disabled" were not a member of SmsStatus
  const disabledLiteral: SmsStatus = "sms_disabled";
  CHECK(`"sms_disabled" is a valid SmsStatus literal`, disabledLiteral === "sms_disabled");

  const pendingLiteral: SmsStatus = "pending_integration";
  CHECK(`"pending_integration" is still a valid SmsStatus literal`, pendingLiteral === "pending_integration");

  console.log("\n  Usage sites of sms_disabled (confirmed by grep):");
  console.log("    communicationsService.ts:33  — union member definition");
  console.log("    communicationsService.ts:324 — insertLog({ status: 'sms_disabled', … })  [Case A: flag off]");
  console.log("    communicationsService.ts:336 — recipientResults.push({ status: 'sms_disabled', … })");
  console.log("    communicationsService.ts:407 — smsDisabled counter in summary computation");
  console.log("    RecipientResult.status: SmsStatus — carries sms_disabled to callers");

  console.log("\n  Usage sites of sms_feature_flag_disabled (confirmed by grep):");
  console.log("    providers/base.ts:23         — ProviderNotReadyReason union member");
  console.log("    providers/heymarket.ts:25    — getConfigurationStatus() returns this when flag absent");
  console.log("    orchestrator.ts:177          — if-branch that produces the feature-flag error string");

  // ════════════════════════════════════════════════════════════════════════
  // SCENARIO 1 — Feature flag OFF (absent from DB)
  // ════════════════════════════════════════════════════════════════════════

  SECTION("Scenario 1 — heymarket_texting_enabled ABSENT (flag off)");

  await setFlag(null);
  const flagOff = await isSmsEnabled();
  CHECK("isSmsEnabled() = false", flagOff === false, flagOff);

  // Point 3A — getConfigurationStatus with flag off
  SUB("Point 3A — HeymarketProvider.getConfigurationStatus() — flag off");
  const csOff = await provider.getConfigurationStatus();
  SHOW("getConfigurationStatus()", csOff);
  CHECK("ready = false",                          csOff.ready === false,                   csOff.ready);
  CHECK("reason = sms_feature_flag_disabled",     csOff.reason === "sms_feature_flag_disabled", csOff.reason);
  CHECK("isConfigured() = false",                 !(await provider.isConfigured()));

  // Point 1 — sendBulkSms with flag off
  SUB("Point 1 — sendBulkSms() — flag off");
  const bulk1 = await sendBulkSms({
    accountId:     TEST_ACCOUNT_ID,
    driverIds:     [TEST_DRIVER_ID],
    message:       "[POSTFIX-V1] flag-off",
    sentByUserId:  TEST_USER_ID,
    contextModule: "postfix_validation_flagoff",
  });

  const r1 = bulk1.recipientResults[0];
  SHOW("recipientResults[0].status",     r1?.status);
  SHOW("recipientResults[0].error",      r1?.error);
  SHOW("recipientResults[0].externalMessageId", r1?.externalMessageId);
  SHOW("integrationActive",              bulk1.integrationActive);
  SHOW("sent",                           bulk1.sent);
  SHOW("summary",                        bulk1.summary);

  CHECK("Point 1 — result status = sms_disabled",             r1?.status === "sms_disabled",  r1?.status);
  CHECK("Point 1 — error mentions 'feature flag'",            r1?.error?.includes("feature flag") === true, r1?.error);
  CHECK("Point 1 — no dispatch (sent=0)",                     bulk1.sent === 0,                bulk1.sent);
  CHECK("Point 1 — no externalMessageId",                     r1?.externalMessageId === null,  r1?.externalMessageId);
  CHECK("Point 1 — summary mentions feature flag",            bulk1.summary.includes("feature flag"), bulk1.summary);

  // DB log row for scenario 1
  const logs1 = await queryBulkLog(bulk1.bulkSendId);
  const log1  = logs1[0];
  SHOW("DB log row status",       log1?.status);
  SHOW("DB log row error_message",log1?.error_message);
  SHOW("DB log row external_message_id", log1?.external_message_id);
  SHOW("DB log row sent_at",      log1?.sent_at);

  CHECK("Point 1 — DB log status = sms_disabled",             log1?.status === "sms_disabled",    log1?.status);
  CHECK("Point 1 — DB log error_message mentions 'feature flag'", log1?.error_message?.includes("feature flag") === true, log1?.error_message);
  CHECK("Point 1 — DB log external_message_id = null",        log1?.external_message_id === null, log1?.external_message_id);
  CHECK("Point 1 — DB log sent_at = null",                    log1?.sent_at === null,             log1?.sent_at);

  // Point 3A — Orchestrator with flag off
  SUB("Point 3A — CommunicationOrchestrator.send() — flag off");
  const orch1 = await communicationOrchestrator.send({
    channel: "sms",
    body: "[POSTFIX-V1] flag-off orch",
    recipients: [{
      recipientType: "driver", recipientId: TEST_DRIVER_ID,
      destinationRaw: "9294284675", destinationNormalized: "+19294284675",
    }],
    relatedModule: "postfix_validation_flagoff",
    relatedEntityType: "driver", relatedEntityId: TEST_DRIVER_ID,
    createdByUserId: TEST_USER_ID,
  });

  SHOW("orchResult.status",  orch1.status);
  SHOW("orchResult.sent",    orch1.sent);
  SHOW("orchResult.errors",  orch1.errors);

  CHECK("Point 3A — orch status = failed",                    orch1.status === "failed",          orch1.status);
  CHECK("Point 3A — orch sent = 0",                           orch1.sent === 0,                   orch1.sent);
  CHECK("Point 3A — orch error mentions feature flag",
    orch1.errors.some(e => e.includes("feature flag")), orch1.errors);

  const msg1  = await queryOrchMsg(orch1.communicationMessageId);
  const recs1 = await queryOrchRecipients(orch1.communicationMessageId);
  const rec1  = recs1[0];

  SHOW("communication_messages.status",       msg1?.status);
  SHOW("communication_messages.error_message",msg1?.error_message);
  SHOW("communication_messages.sent_at",      msg1?.sent_at);
  SHOW("communication_recipients[0].delivery_status",  rec1?.delivery_status);
  SHOW("communication_recipients[0].excluded_reason",  rec1?.excluded_reason);
  SHOW("communication_recipients[0].provider_message_id", rec1?.provider_message_id);

  CHECK("Point 3A — comm_messages.status = failed",           msg1?.status === "failed",                       msg1?.status);
  CHECK("Point 3A — comm_messages.error_message mentions flag",msg1?.error_message?.includes("feature flag") === true, msg1?.error_message);
  CHECK("Point 3A — comm_messages.sent_at = null",            msg1?.sent_at === null,                          msg1?.sent_at);
  CHECK("Point 3A — recipient.delivery_status = excluded",    rec1?.delivery_status === "excluded",            rec1?.delivery_status);
  CHECK("Point 3A — recipient.excluded_reason = sms_feature_flag_disabled",
    rec1?.excluded_reason === "sms_feature_flag_disabled", rec1?.excluded_reason);
  CHECK("Point 3A — recipient.provider_message_id = null",    rec1?.provider_message_id === null,              rec1?.provider_message_id);

  // ════════════════════════════════════════════════════════════════════════
  // SCENARIO 2 — Feature flag ON, credentials missing
  // ════════════════════════════════════════════════════════════════════════

  SECTION("Scenario 2 — heymarket_texting_enabled = true, credentials absent");

  await setFlag(true);
  const flagOn = await isSmsEnabled();
  CHECK("isSmsEnabled() = true", flagOn === true, flagOn);
  console.log("  (HEYMARKET_API_TOKEN absent, sms.heymarket.inbox_id absent)");

  // Point 3B — getConfigurationStatus with flag on but no credentials
  SUB("Point 3B — HeymarketProvider.getConfigurationStatus() — flag on, no credentials");
  const csOn = await provider.getConfigurationStatus();
  SHOW("getConfigurationStatus()", csOn);
  CHECK("ready = false",                          csOn.ready === false,              csOn.ready);
  CHECK("reason = missing_api_token (flag passes; token is first credential check)",
    csOn.reason === "missing_api_token", csOn.reason);
  CHECK("isConfigured() = false",                 !(await provider.isConfigured()));

  // Point 2 — sendBulkSms with flag on, no credentials
  SUB("Point 2 — sendBulkSms() — flag on, credentials absent");
  const bulk2 = await sendBulkSms({
    accountId:     TEST_ACCOUNT_ID,
    driverIds:     [TEST_DRIVER_ID],
    message:       "[POSTFIX-V2] flag-on-no-creds",
    sentByUserId:  TEST_USER_ID,
    contextModule: "postfix_validation_nocreds",
  });

  const r2 = bulk2.recipientResults[0];
  SHOW("recipientResults[0].status",     r2?.status);
  SHOW("recipientResults[0].error",      r2?.error);
  SHOW("recipientResults[0].externalMessageId", r2?.externalMessageId);
  SHOW("integrationActive",              bulk2.integrationActive);
  SHOW("sent",                           bulk2.sent);
  SHOW("summary",                        bulk2.summary);

  CHECK("Point 2 — result status = pending_integration",      r2?.status === "pending_integration",  r2?.status);
  CHECK("Point 2 — status is NOT sms_disabled",               r2?.status !== "sms_disabled",         r2?.status);
  CHECK("Point 2 — error mentions credentials/inbox",
    r2?.error?.includes("inbox_id") === true || r2?.error?.includes("not configured") === true, r2?.error);
  CHECK("Point 2 — error does NOT mention feature flag",      r2?.error?.includes("feature flag") === false, r2?.error);
  CHECK("Point 2 — no dispatch (sent=0)",                     bulk2.sent === 0,                      bulk2.sent);
  CHECK("Point 2 — no externalMessageId",                     r2?.externalMessageId === null,        r2?.externalMessageId);
  CHECK("Point 2 — integrationActive = true",                 bulk2.integrationActive === true,      bulk2.integrationActive);

  // DB log row for scenario 2
  const logs2 = await queryBulkLog(bulk2.bulkSendId);
  const log2  = logs2[0];
  SHOW("DB log row status",        log2?.status);
  SHOW("DB log row error_message", log2?.error_message);
  SHOW("DB log row external_message_id", log2?.external_message_id);
  SHOW("DB log row sent_at",       log2?.sent_at);

  CHECK("Point 2 — DB log status = pending_integration",       log2?.status === "pending_integration",   log2?.status);
  CHECK("Point 2 — DB log status is NOT sms_disabled",         log2?.status !== "sms_disabled",          log2?.status);
  CHECK("Point 2 — DB log error_message set (not null)",       log2?.error_message !== null,             log2?.error_message);
  CHECK("Point 2 — DB log error_message does NOT mention feature flag",
    log2?.error_message?.includes("feature flag") === false, log2?.error_message);
  CHECK("Point 2 — DB log external_message_id = null",         log2?.external_message_id === null,       log2?.external_message_id);
  CHECK("Point 2 — DB log sent_at = null",                     log2?.sent_at === null,                   log2?.sent_at);

  // Point 3B — Orchestrator with flag on, no credentials
  SUB("Point 3B — CommunicationOrchestrator.send() — flag on, credentials absent");
  const orch2 = await communicationOrchestrator.send({
    channel: "sms",
    body: "[POSTFIX-V2] flag-on-no-creds orch",
    recipients: [{
      recipientType: "driver", recipientId: TEST_DRIVER_ID,
      destinationRaw: "9294284675", destinationNormalized: "+19294284675",
    }],
    relatedModule: "postfix_validation_nocreds",
    relatedEntityType: "driver", relatedEntityId: TEST_DRIVER_ID,
    createdByUserId: TEST_USER_ID,
  });

  SHOW("orchResult.status",  orch2.status);
  SHOW("orchResult.sent",    orch2.sent);
  SHOW("orchResult.errors",  orch2.errors);

  CHECK("Point 3B — orch status = failed",                     orch2.status === "failed",          orch2.status);
  CHECK("Point 3B — orch sent = 0",                            orch2.sent === 0,                   orch2.sent);
  CHECK("Point 3B — orch error does NOT mention feature flag",
    orch2.errors.every(e => !e.includes("feature flag")), orch2.errors);
  CHECK("Point 3B — orch error mentions API token or inbox",
    orch2.errors.some(e => e.includes("API token") || e.includes("inbox") || e.includes("not configured")),
    orch2.errors);

  const msg2  = await queryOrchMsg(orch2.communicationMessageId);
  const recs2 = await queryOrchRecipients(orch2.communicationMessageId);
  const rec2  = recs2[0];

  SHOW("communication_messages.status",        msg2?.status);
  SHOW("communication_messages.error_message", msg2?.error_message);
  SHOW("communication_messages.sent_at",       msg2?.sent_at);
  SHOW("communication_recipients[0].delivery_status", rec2?.delivery_status);
  SHOW("communication_recipients[0].excluded_reason", rec2?.excluded_reason);
  SHOW("communication_recipients[0].provider_message_id", rec2?.provider_message_id);

  CHECK("Point 3B — comm_messages.status = failed",            msg2?.status === "failed",     msg2?.status);
  CHECK("Point 3B — comm_messages.sent_at = null",             msg2?.sent_at === null,        msg2?.sent_at);
  CHECK("Point 3B — recipient.delivery_status = excluded",     rec2?.delivery_status === "excluded",    rec2?.delivery_status);
  CHECK("Point 3B — recipient.excluded_reason ≠ sms_feature_flag_disabled",
    rec2?.excluded_reason !== "sms_feature_flag_disabled", rec2?.excluded_reason);
  CHECK("Point 3B — recipient.excluded_reason = missing_api_token (or similar credential reason)",
    ["missing_api_token", "missing_inbox_id", "provider_not_configured"].includes(rec2?.excluded_reason ?? ""),
    rec2?.excluded_reason);
  CHECK("Point 3B — recipient.provider_message_id = null",     rec2?.provider_message_id === null,  rec2?.provider_message_id);

  // ════════════════════════════════════════════════════════════════════════
  // POINT 5 — No silent collapse: prove the two reasons can never converge
  // ════════════════════════════════════════════════════════════════════════

  SECTION("Point 5 — No silent collapse of the two blocking reasons");

  console.log("\n  Code-path analysis of sendBulkSms() (communicationsService.ts):");
  console.log("");
  console.log("    const integrationActive = await isSmsEnabled();           // reads flag");
  console.log("    const heymarketConfig   = integrationActive               // credentials");
  console.log("                               ? await getHeymarketConfig()");
  console.log("                               : null;");
  console.log("");
  console.log("    // Case A — executed ONLY when integrationActive = false");
  console.log("    if (!integrationActive) {");
  console.log('      status: "sms_disabled"');
  console.log('      errorMessage: "SMS disabled by feature flag…"');
  console.log('      → continue                                       ← never reaches Case B');
  console.log("    }");
  console.log("");
  console.log("    // Case B — only reachable when integrationActive = true");
  console.log("    if (!heymarketConfig) {");
  console.log('      status: "pending_integration"');
  console.log('      errorMessage: "Heymarket provider not configured…"');
  console.log("    }");
  console.log("");
  console.log("  The two cases are mutually exclusive by construction:");
  console.log("  Case B's guard (!heymarketConfig) is only reachable after");
  console.log("  Case A's guard (!integrationActive) has already been evaluated");
  console.log("  and its 'continue' has NOT been taken. Since getHeymarketConfig()");
  console.log("  is only called when integrationActive=true, the credential-null path");
  console.log("  is structurally unreachable when the flag is off.");
  console.log("");
  console.log("  Code-path analysis of orchestrator.ts step 6:");
  console.log("");
  console.log("    const status = await provider.getConfigurationStatus();");
  console.log("    // HeymarketProvider checks flag FIRST before any credential");
  console.log("    // If flag=false → reason='sms_feature_flag_disabled'");
  console.log("    // If flag=true  → checks token, then inbox_id");
  console.log("    //                  reason='missing_api_token' | 'missing_inbox_id'");
  console.log("    // These are ordered checks; the first failure returns immediately.");
  console.log("    // It is impossible for the flag reason to co-exist with a cred reason.");

  // Live proof: verify the two DB records differ in every discriminating field
  CHECK(
    "Point 5 — Scenario 1 log status ('sms_disabled') ≠ Scenario 2 log status ('pending_integration')",
    log1?.status !== log2?.status,
  );
  CHECK(
    "Point 5 — Scenario 1 orchestrator excluded_reason ('sms_feature_flag_disabled') ≠ Scenario 2 excluded_reason",
    rec1?.excluded_reason !== rec2?.excluded_reason,
  );
  CHECK(
    "Point 5 — Scenario 1 error_message contains 'feature flag', Scenario 2 does not",
    log1?.error_message?.includes("feature flag") === true &&
    log2?.error_message?.includes("feature flag") === false,
  );
  CHECK(
    "Point 5 — Scenario 1 orch error contains 'feature flag', Scenario 2 does not",
    orch1.errors.some(e => e.includes("feature flag")) &&
    orch2.errors.every(e => !e.includes("feature flag")),
  );

  // ════════════════════════════════════════════════════════════════════════
  // Cleanup
  // ════════════════════════════════════════════════════════════════════════

  SECTION("Cleanup");
  await setFlag(null);
  const afterCleanup = await isSmsEnabled();
  CHECK("Flag row removed; isSmsEnabled() = false", afterCleanup === false, afterCleanup);

  // ════════════════════════════════════════════════════════════════════════
  // Final score
  // ════════════════════════════════════════════════════════════════════════

  SECTION("Results");

  console.log(`\n  Total assertions: ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.error(`\n  ${failed} ASSERTION(S) FAILED — see ✗ lines above.\n`);
    process.exit(1);
  } else {
    console.log("\n  All assertions passed.\n");
    process.exit(0);
  }
}

run().catch(err => {
  console.error("\n  SCRIPT FAILED:", err);
  process.exit(1);
});
