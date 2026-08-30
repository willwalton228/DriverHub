/**
 * Claim event handlers for the Communication Event Bus.
 * Registers handlers for all claim communication events:
 *   - CLAIM_CREATED
 *   - CLAIM_UPDATED
 *   - CLAIM_AMOUNT_UPDATED
 *   - CLAIM_CLOSED
 *
 * Each handler:
 *   1. Checks the comm_automations enabled flag before sending
 *   2. Sends an email via the Communication Service (Microsoft 365)
 *   3. Routes in-app notifications through the centralized Notification Rules Engine
 *      (which applies module-access filtering and recipient deduplication)
 */

import { commEventBus, type ClaimCreatedPayload, type ClaimUpdatedPayload, type ClaimAmountUpdatedPayload, type ClaimClosedPayload } from "../commEventBus";
import { sendEmail, APP_URL } from "../commService";
import { notify } from "../../notificationEngine";
import { pool } from "../../../db";
import { buildClaimCreatedEmailContext } from "../claimCreatedEmail";
import { claimCategoryOptions } from "@shared/schema";

// Claim Type (Insurance Claim / Internal Claim) display label — claimCategory
// is the sole authoritative field for this. DH-002340.
function claimCategoryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return claimCategoryOptions.find((o) => o.value === value)?.label || null;
}

// ── Automation enabled check ──────────────────────────────────────────────────

async function isAutomationEnabled(automationKey: string): Promise<boolean> {
  try {
    const r = await pool.query(
      `SELECT enabled FROM comm_automations WHERE automation_key = $1 LIMIT 1`,
      [automationKey]
    );
    if (!r.rows.length) return true; // Default to enabled if record not found
    return r.rows[0].enabled === true;
  } catch {
    return true; // Default to enabled on DB errors
  }
}

async function touchAutomationLastRun(automationKey: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE comm_automations SET last_run_at = now(), updated_at = now() WHERE automation_key = $1`,
      [automationKey]
    );
  } catch {
    // Non-critical
  }
}

async function getClaimCreatedEmailContext(payload: ClaimCreatedPayload) {
  const claimUrl = `${APP_URL}/claims/${encodeURIComponent(payload.claimId)}`;

  try {
    const result = await pool.query(
      `SELECT
          a.display_claim_id,
          a.incident_date,
          a.accident_date,
          a.location,
          a.claim_category,
          a.incident_type,
          a.status,
          a.claim_status,
          a.claim_severity,
          a.execution_system,
          a.estimated_damage_amount,
          a.probable_cost,
          a.total_estimate,
          a.actual_cost,
          NULLIF(TRIM(CONCAT(driver_user.first_name, ' ', driver_user.last_name)), '') AS driver_name,
          customer.name AS customer_name,
          market.name AS market_name,
          COALESCE((
            SELECT COUNT(*)
              FROM move_media media
             WHERE media.claim_id = a.id
               AND media.is_deleted = false
          ), 0)
          + COALESCE((
            SELECT COUNT(*)
              FROM accident_attachments attachment
             WHERE attachment.accident_id = a.id
               AND attachment.is_deleted = false
               AND (
                 attachment.file_type ILIKE 'image/%'
                 OR attachment.category IN ('scene_photos', 'vehicle_damage_photos', 'driver_photos', 'video_photos')
               )
          ), 0) AS photo_count,
          COALESCE((
            SELECT COUNT(*)
              FROM accident_attachments attachment
             WHERE attachment.accident_id = a.id
               AND attachment.is_deleted = false
               AND attachment.file_type NOT ILIKE 'image/%'
               AND attachment.category NOT IN ('scene_photos', 'vehicle_damage_photos', 'driver_photos', 'video_photos')
          ), 0) AS document_count,
          COALESCE((
            SELECT COUNT(*)
              FROM work_plan_items work_item
             WHERE work_item.record_id = a.id
               AND work_item.status IN ('open', 'snoozed')
          ), 0) AS open_item_count
       FROM accidents a
       LEFT JOIN drivers driver ON driver.id = a.driver_id
       LEFT JOIN users driver_user ON driver_user.id = driver.user_id
       LEFT JOIN customers customer ON customer.id = a.customer_id
       LEFT JOIN markets market ON market.id = a.market_id
      WHERE a.id = $1
      LIMIT 1`,
      [payload.claimId],
    );

    const claim = result.rows[0];
    if (claim) {
      return buildClaimCreatedEmailContext({
        claimNumber: claim.display_claim_id || payload.claimNumber,
        driverName: claim.driver_name || payload.driverName,
        incidentDate: claim.incident_date || claim.accident_date || payload.incidentDate,
        customerName: claim.customer_name || payload.customerName,
        location: claim.location || payload.location,
        market: claim.market_name || payload.market,
        claimType: claimCategoryLabel(claim.claim_category) || payload.claimType,
        incidentType: claim.incident_type || payload.incidentType,
        resolutionStatus: claim.status || claim.claim_status || payload.status,
        severity: claim.claim_severity || payload.severity,
        executionSystem: claim.execution_system,
        estimatedDamageOrProbableCost:
          claim.estimated_damage_amount ?? claim.probable_cost ?? claim.total_estimate ?? null,
        actualCost: claim.actual_cost,
        photoCount: claim.photo_count,
        documentCount: claim.document_count,
        openItemCount: claim.open_item_count,
        claimUrl,
      });
    }
  } catch (error) {
    console.error(`[ClaimEvents] Could not enrich CLAIM_CREATED email for ${payload.claimId}:`, error);
  }

  return buildClaimCreatedEmailContext({
    claimNumber: payload.claimNumber,
    driverName: payload.driverName,
    incidentDate: payload.incidentDate,
    customerName: payload.customerName,
    location: payload.location,
    market: payload.market,
    claimType: payload.claimType,
    incidentType: payload.incidentType ?? null,
    resolutionStatus: payload.status,
    severity: payload.severity,
    executionSystem: null,
    estimatedDamageOrProbableCost: null,
    actualCost: null,
    photoCount: null,
    documentCount: null,
    openItemCount: null,
    claimUrl,
  });
}

async function recordClaimCreatedNotificationStep(
  payload: ClaimCreatedPayload,
  eventType: string,
  actionSummary: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO claim_audit_logs
         (claim_id, user_id, event_type, action_summary, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        payload.claimId,
        payload.createdByUserId,
        eventType,
        actionSummary,
        JSON.stringify(metadata),
      ],
    );
  } catch (error) {
    console.error(`[ClaimEvents] Failed to record ${eventType} for ${payload.claimId}:`, error);
  }
}

export function registerClaimEventHandlers(): void {

  // ── CLAIM_CREATED ──────────────────────────────────────────────────────────
  commEventBus.onAsync("CLAIM_CREATED", async (payload: ClaimCreatedPayload) => {
    await recordClaimCreatedNotificationStep(
      payload,
      "CLAIM_CREATED_COMMUNICATION_RECEIVED",
      "Communication Service received CLAIM_CREATED",
      { event: "CLAIM_CREATED" },
    );

    const claimUrl = `${APP_URL}/claims/${payload.claimId}`;
    const context = await getClaimCreatedEmailContext(payload);

    // The Claims Controls switch governs email only. In-app notifications remain
    // available when email is disabled or has no configured recipients.
    const emailEnabled = await isAutomationEnabled("claim_created_notification");
    await recordClaimCreatedNotificationStep(
      payload,
      "CLAIM_CREATED_CONTROLS_EVALUATED",
      `New Claim Notification evaluated as ${emailEnabled ? "ON" : "OFF"}`,
      { automationKey: "claim_created_notification", enabled: emailEnabled },
    );

    if (emailEnabled) {
      const emailResult = await sendEmail({
        templateSlug:      "CLAIM_CREATED",
        context,
        relatedModule:     "claims",
        relatedEntityType: "claim",
        relatedEntityId:   payload.claimId,
        createdByUserId:   payload.createdByUserId,
      });

      if (!emailResult.ok) {
        const reason = emailResult.error === "No recipients configured"
          ? "Claims Controls has email delivery enabled but no internal recipients are configured."
          : emailResult.error;
        console.warn(`[ClaimEvents] CLAIM_CREATED email not delivered for ${payload.claimId}: ${reason}`);
        await recordClaimCreatedNotificationStep(
          payload,
          "CLAIM_CREATED_EMAIL_FAILED",
          "New Claim email was not delivered",
          { provider: "microsoft_365", error: reason },
        );
      } else {
        console.log(`[ClaimEvents] CLAIM_CREATED email sent for claim ${payload.claimId}`);
        await touchAutomationLastRun("claim_created_notification");
        await recordClaimCreatedNotificationStep(
          payload,
          "CLAIM_CREATED_EMAIL_ACCEPTED",
          "Microsoft 365 accepted the New Claim email",
          { provider: "microsoft_365" },
        );
      }
    } else {
      console.log(`[ClaimEvents] CLAIM_CREATED email skipped — email delivery disabled`);
      await recordClaimCreatedNotificationStep(
        payload,
        "CLAIM_CREATED_EMAIL_SKIPPED",
        "New Claim email skipped because Claims Controls is OFF",
        { automationKey: "claim_created_notification", enabled: false },
      );
    }

    // ── In-app: routed through the Notification Rules Engine ────────────────
    await notify("CLAIM_CREATED", {
      actorUserId: payload.createdByUserId,
      payload: {
        claimId:      payload.claimId,
        claimNumber:  payload.claimNumber,
        claimType:    payload.claimType,
        driverName:   payload.driverName,
        incidentDate: payload.incidentDate,
        severity:     payload.severity,
        status:       payload.status,
        customerName: payload.customerName,
        createdBy:    payload.createdBy,
        createdByUserId: payload.createdByUserId,
        claimUrl,
      },
    });
  });

  // ── CLAIM_UPDATED ──────────────────────────────────────────────────────────
  commEventBus.onAsync("CLAIM_UPDATED", async (payload: ClaimUpdatedPayload) => {
    const claimUrl = `${APP_URL}/claims/${payload.claimId}`;
    const context = {
      claimId:    payload.claimId,
      driverName: payload.driverName,
      claimType:  payload.claimType,
      oldStatus:  payload.oldStatus,
      newStatus:  payload.newStatus,
      updatedBy:  payload.updatedBy,
      notes:      payload.notes || "—",
      claimUrl,
    };

    // ── Email ────────────────────────────────────────────────────────────────
    const emailResult = await sendEmail({
      templateSlug:      "CLAIM_UPDATED",
      context,
      relatedModule:     "claims",
      relatedEntityType: "claim",
      relatedEntityId:   payload.claimId,
      createdByUserId:   payload.updatedByUserId,
    });

    if (!emailResult.ok) {
      console.warn(`[ClaimEvents] CLAIM_UPDATED email failed for ${payload.claimId}: ${emailResult.error}`);
    } else {
      console.log(`[ClaimEvents] CLAIM_UPDATED email sent for claim ${payload.claimId}`);
    }

    // ── In-app ───────────────────────────────────────────────────────────────
    await notify("CLAIM_UPDATED", {
      actorUserId: payload.updatedByUserId,
      payload: {
        claimId:    payload.claimId,
        driverName: payload.driverName,
        claimType:  payload.claimType,
        oldStatus:  payload.oldStatus,
        newStatus:  payload.newStatus,
        updatedBy:  payload.updatedBy,
        updatedByUserId: payload.updatedByUserId,
        claimUrl,
      },
    });
  });

  // ── CLAIM_AMOUNT_UPDATED ───────────────────────────────────────────────────
  commEventBus.onAsync("CLAIM_AMOUNT_UPDATED", async (payload: ClaimAmountUpdatedPayload) => {
    if (!(await isAutomationEnabled("claim_amount_updated_notification"))) {
      console.log(`[ClaimEvents] CLAIM_AMOUNT_UPDATED skipped — automation disabled`);
      return;
    }

    const claimUrl = `${APP_URL}/claims/${payload.claimId}`;

    const formatCurrency = (v: number | null) =>
      v != null ? `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

    const fieldLabels: Record<string, string> = {
      estimatedCost:     "Estimated Cost",
      reserveAmount:     "Reserve Amount",
      settlementAmount:  "Settlement Amount",
      totalClaimAmount:  "Total Claim Amount",
    };

    const changeLines = payload.changedFields
      .map(f => `${fieldLabels[f] ?? f}: ${formatCurrency(payload.previousValues[f])} → ${formatCurrency(payload.newValues[f])}`)
      .join(", ");

    const context = {
      claimNumber:   payload.claimNumber,
      driverName:    payload.driverName,
      claimType:     payload.claimType,
      updatedBy:     payload.updatedBy,
      changedFields: payload.changedFields.map(f => fieldLabels[f] ?? f).join(", "),
      changeLines,
      claimUrl,
    };

    // ── Email ────────────────────────────────────────────────────────────────
    const emailResult = await sendEmail({
      templateSlug:      "CLAIM_AMOUNT_UPDATED",
      context,
      relatedModule:     "claims",
      relatedEntityType: "claim",
      relatedEntityId:   payload.claimId,
      createdByUserId:   payload.updatedByUserId,
    });

    if (!emailResult.ok) {
      console.warn(`[ClaimEvents] CLAIM_AMOUNT_UPDATED email failed for ${payload.claimId}: ${emailResult.error}`);
    } else {
      console.log(`[ClaimEvents] CLAIM_AMOUNT_UPDATED email sent for claim ${payload.claimId}`);
      await touchAutomationLastRun("claim_amount_updated_notification");
    }

    // ── In-app ───────────────────────────────────────────────────────────────
    await notify("CLAIM_AMOUNT_UPDATED", {
      actorUserId: payload.updatedByUserId,
      payload: {
        claimId:         payload.claimId,
        claimNumber:     payload.claimNumber,
        driverName:      payload.driverName,
        claimType:       payload.claimType,
        updatedBy:       payload.updatedBy,
        updatedByUserId: payload.updatedByUserId,
        changeLines,
        claimUrl,
      },
    });
  });

  // ── CLAIM_CLOSED ───────────────────────────────────────────────────────────
  commEventBus.onAsync("CLAIM_CLOSED", async (payload: ClaimClosedPayload) => {
    if (!(await isAutomationEnabled("claim_closed_notification"))) {
      console.log(`[ClaimEvents] CLAIM_CLOSED skipped — automation disabled`);
      return;
    }

    const claimUrl = `${APP_URL}/claims/${payload.claimId}`;
    const context = {
      claimNumber:  payload.claimNumber,
      driverName:   payload.driverName,
      claimType:    payload.claimType,
      finalStatus:  payload.finalStatus,
      closedBy:     payload.closedBy,
      notes:        payload.notes || "—",
      claimUrl,
    };

    // ── Email ────────────────────────────────────────────────────────────────
    const emailResult = await sendEmail({
      templateSlug:      "CLAIM_CLOSED",
      context,
      relatedModule:     "claims",
      relatedEntityType: "claim",
      relatedEntityId:   payload.claimId,
      createdByUserId:   payload.closedByUserId,
    });

    if (!emailResult.ok) {
      console.warn(`[ClaimEvents] CLAIM_CLOSED email failed for ${payload.claimId}: ${emailResult.error}`);
    } else {
      console.log(`[ClaimEvents] CLAIM_CLOSED email sent for claim ${payload.claimId}`);
      await touchAutomationLastRun("claim_closed_notification");
    }

    // ── In-app ───────────────────────────────────────────────────────────────
    await notify("CLAIM_CLOSED", {
      actorUserId: payload.closedByUserId,
      payload: {
        claimId:       payload.claimId,
        claimNumber:   payload.claimNumber,
        claimType:     payload.claimType,
        driverName:    payload.driverName,
        finalStatus:   payload.finalStatus,
        closedBy:      payload.closedBy,
        closedByUserId: payload.closedByUserId,
        claimUrl,
      },
    });
  });

  console.log("[CommEventBus] Claim event handlers registered (CREATED, UPDATED, AMOUNT_UPDATED, CLOSED)");
}
