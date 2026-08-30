-- ============================================================
-- Production User Cleanup: Retain only will@driverondemand.co
-- Will's user ID: fa2311e0-2ee8-4fe7-9619-9c7cd507717c
-- ============================================================

BEGIN;

-- Safety: lock the target user row so we cannot accidentally delete it
SELECT id, email, role, org_id FROM users
WHERE id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
FOR UPDATE;

-- ── Step 1: Remove NO ACTION child records that block driver cascade ──────────
-- expenses.driver_id → NO ACTION (1 row); delete test-driver expenses
DELETE FROM expenses
WHERE driver_id IN (
  SELECT d.id FROM drivers d
  WHERE d.user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
    AND d.user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c')
);

-- ── Step 2: Reassign all NO ACTION FK columns to Will ────────────────────────
-- Any row that references a test user via a NO ACTION FK is reassigned to Will.
-- This preserves the referencing rows while making the test user deletable.

UPDATE accident_attachments SET uploaded_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE uploaded_by IS NOT NULL AND uploaded_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND uploaded_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE accident_category_meta SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE accidents SET carrier_handling_mode_set_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE carrier_handling_mode_set_by IS NOT NULL AND carrier_handling_mode_set_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND carrier_handling_mode_set_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE accidents SET carrier_reported_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE carrier_reported_by_user_id IS NOT NULL AND carrier_reported_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND carrier_reported_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE accidents SET gl_reporting_acknowledged_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE gl_reporting_acknowledged_by IS NOT NULL AND gl_reporting_acknowledged_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND gl_reporting_acknowledged_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE accidents SET gl_training_reviewed_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE gl_training_reviewed_by IS NOT NULL AND gl_training_reviewed_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND gl_training_reviewed_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE accidents SET litigation_hold_activated_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE litigation_hold_activated_by_user_id IS NOT NULL AND litigation_hold_activated_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND litigation_hold_activated_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE accidents SET litigation_hold_released_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE litigation_hold_released_by_user_id IS NOT NULL AND litigation_hold_released_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND litigation_hold_released_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE accidents SET reported_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE reported_by IS NOT NULL AND reported_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND reported_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_activities SET performed_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE performed_by_user_id IS NOT NULL AND performed_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND performed_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_activity_events SET created_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by_user_id IS NOT NULL AND created_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_documents SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_documents SET uploaded_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE uploaded_by_user_id IS NOT NULL AND uploaded_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND uploaded_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_documents SET verified_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE verified_by IS NOT NULL AND verified_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND verified_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_notes SET deleted_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE deleted_by IS NOT NULL AND deleted_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND deleted_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_notes SET edited_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE edited_by IS NOT NULL AND edited_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND edited_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_notes SET submitted_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE submitted_by_user_id IS NOT NULL AND submitted_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND submitted_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_registry SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE account_registry SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE accounting_settings SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE application_activities SET performed_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE performed_by IS NOT NULL AND performed_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND performed_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE applications SET assigned_to = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE assigned_to IS NOT NULL AND assigned_to != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND assigned_to IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE applications SET rejected_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE rejected_by IS NOT NULL AND rejected_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND rejected_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE ar_ledger_entries SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE availability_windows SET user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE user_id IS NOT NULL AND user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE bill_lines SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE bill_lines SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE billable_charges SET approved_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE approved_by IS NOT NULL AND approved_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND approved_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE billable_charges SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE billing_entities SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE billing_entities SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE billing_entity_audit_log SET performed_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE performed_by IS NOT NULL AND performed_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND performed_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE billing_locations SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE billing_locations SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE bills SET approved_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE approved_by IS NOT NULL AND approved_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND approved_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE bills SET coded_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE coded_by IS NOT NULL AND coded_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND coded_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE bills SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE bills SET voided_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE voided_by IS NOT NULL AND voided_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND voided_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE candidate_training_records SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE candidate_training_records SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE candidates SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE candidates SET referred_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE referred_by IS NOT NULL AND referred_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND referred_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE carrier_narratives SET approved_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE approved_by_user_id IS NOT NULL AND approved_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND approved_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE carrier_narratives SET created_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by_user_id IS NOT NULL AND created_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE carrier_narratives SET last_edited_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE last_edited_by_user_id IS NOT NULL AND last_edited_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND last_edited_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE carrier_submission_events SET changed_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE changed_by_user_id IS NOT NULL AND changed_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND changed_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE claim_audit_logs SET user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE user_id IS NOT NULL AND user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE claim_events SET changed_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE changed_by_user_id IS NOT NULL AND changed_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND changed_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE claim_import_profiles SET created_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by_user_id IS NOT NULL AND created_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE claim_recoveries SET created_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by_user_id IS NOT NULL AND created_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE claim_recoveries SET updated_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by_user_id IS NOT NULL AND updated_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE claim_recovery_audit_logs SET user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE user_id IS NOT NULL AND user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE collections_customer_flags SET ach_only_set_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE ach_only_set_by IS NOT NULL AND ach_only_set_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND ach_only_set_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE collections_customer_flags SET escalated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE escalated_by IS NOT NULL AND escalated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND escalated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE collections_customer_flags SET require_prepay_set_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE require_prepay_set_by IS NOT NULL AND require_prepay_set_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND require_prepay_set_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE collections_notes SET assigned_to_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE assigned_to_user_id IS NOT NULL AND assigned_to_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND assigned_to_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE collections_notes SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE corrective_action_audit_logs SET user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE user_id IS NOT NULL AND user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE corrective_actions SET assigned_to_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE assigned_to_user_id IS NOT NULL AND assigned_to_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND assigned_to_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE corrective_actions SET completed_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE completed_by_user_id IS NOT NULL AND completed_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND completed_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE corrective_actions SET created_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by_user_id IS NOT NULL AND created_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE corrective_actions SET waived_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE waived_by_user_id IS NOT NULL AND waived_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND waived_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE credit_limit_overrides SET overridden_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE overridden_by IS NOT NULL AND overridden_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND overridden_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE credit_memo_applications SET applied_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE applied_by IS NOT NULL AND applied_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND applied_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE credit_memos SET approved_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE approved_by IS NOT NULL AND approved_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND approved_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE credit_memos SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE customer_statements SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE customer_statements SET sent_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE sent_by IS NOT NULL AND sent_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND sent_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE deletion_override_requests SET approved_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE approved_by_user_id IS NOT NULL AND approved_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND approved_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE deletion_override_requests SET requested_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE requested_by_user_id IS NOT NULL AND requested_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND requested_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE deposit_batch_audit_log SET performed_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE performed_by IS NOT NULL AND performed_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND performed_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE deposit_batches SET closed_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE closed_by IS NOT NULL AND closed_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND closed_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE deposit_batches SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE deposit_batches SET locked_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE locked_by IS NOT NULL AND locked_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND locked_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE deposit_batches SET reconciled_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE reconciled_by IS NOT NULL AND reconciled_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND reconciled_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE deposit_batches SET submitted_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE submitted_by IS NOT NULL AND submitted_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND submitted_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE documents SET uploaded_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE uploaded_by_user_id IS NOT NULL AND uploaded_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND uploaded_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE document_events SET performed_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE performed_by_user_id IS NOT NULL AND performed_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND performed_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE drivers SET status_changed_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE status_changed_by IS NOT NULL AND status_changed_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND status_changed_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE drivers SET termination_updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE termination_updated_by IS NOT NULL AND termination_updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND termination_updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE invoices SET approved_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE approved_by IS NOT NULL AND approved_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND approved_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE invoices SET collections_owner_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE collections_owner_id IS NOT NULL AND collections_owner_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND collections_owner_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE invoices SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE invoices SET finance_approved_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE finance_approved_by IS NOT NULL AND finance_approved_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND finance_approved_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE invoices SET late_fee_reversed_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE late_fee_reversed_by IS NOT NULL AND late_fee_reversed_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND late_fee_reversed_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE invoices SET sent_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE sent_by IS NOT NULL AND sent_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND sent_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE invoices SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE invoices SET voided_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE voided_by IS NOT NULL AND voided_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND voided_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE invoices SET written_off_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE written_off_by IS NOT NULL AND written_off_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND written_off_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE legal_holds SET created_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by_user_id IS NOT NULL AND created_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE legal_holds SET released_by_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE released_by_user_id IS NOT NULL AND released_by_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND released_by_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE pay_period_snapshots SET approved_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE approved_by IS NOT NULL AND approved_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND approved_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE pay_period_snapshots SET locked_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE locked_by IS NOT NULL AND locked_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND locked_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE pay_stubs SET approved_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE approved_by IS NOT NULL AND approved_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND approved_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE release_notes SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE risp_control_registry SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE risp_control_registry SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE scheduling_shifts SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE system_audit_log SET performed_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE performed_by IS NOT NULL AND performed_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND performed_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE ticket_comments SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE tickets SET assigned_to = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE assigned_to IS NOT NULL AND assigned_to != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND assigned_to IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE tickets SET closed_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE closed_by IS NOT NULL AND closed_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND closed_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE tickets SET created_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE created_by IS NOT NULL AND created_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND created_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_access_requests SET requestor_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE requestor_id IS NOT NULL AND requestor_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND requestor_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_access_requests SET resulting_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE resulting_user_id IS NOT NULL AND resulting_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND resulting_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_access_requests SET reviewer_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE reviewer_id IS NOT NULL AND reviewer_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND reviewer_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_dashboard_layouts SET user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE user_id IS NOT NULL AND user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_feedback SET user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE user_id IS NOT NULL AND user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_invitations SET invited_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE invited_by IS NOT NULL AND invited_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND invited_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_invitations SET used_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE used_by IS NOT NULL AND used_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND used_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_invoicing_permissions SET granted_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE granted_by IS NOT NULL AND granted_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND granted_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_invoicing_permissions SET user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE user_id IS NOT NULL AND user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_provisioning_audit_log SET actor_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE actor_id IS NOT NULL AND actor_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND actor_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_scheduling_entity_access SET granted_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE granted_by IS NOT NULL AND granted_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND granted_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE user_scheduling_entity_access SET user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE user_id IS NOT NULL AND user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE vendors SET updated_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE updated_by IS NOT NULL AND updated_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND updated_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE wiw_employee_map SET driverhub_user_id = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE driverhub_user_id IS NOT NULL AND driverhub_user_id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND driverhub_user_id IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

UPDATE wiw_import_runs SET imported_by = 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
WHERE imported_by IS NOT NULL AND imported_by != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c'
  AND imported_by IN (SELECT id FROM users WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c');

-- ── Step 3: Delete all non-Will users ────────────────────────────────────────
-- CASCADE on drivers.user_id auto-deletes driver records and their children.
-- SET NULL constraints auto-null their FK columns.
DELETE FROM users
WHERE id != 'fa2311e0-2ee8-4fe7-9619-9c7cd507717c';

-- ── Step 4: Verify ───────────────────────────────────────────────────────────
DO $$
DECLARE
  cnt integer;
  uid text;
  uemail text;
BEGIN
  SELECT COUNT(*) INTO cnt FROM users;
  SELECT id, email INTO uid, uemail FROM users LIMIT 1;
  IF cnt != 1 THEN
    RAISE EXCEPTION 'SAFETY ABORT: Expected 1 user, found %', cnt;
  END IF;
  IF uemail != 'will@driverondemand.co' THEN
    RAISE EXCEPTION 'SAFETY ABORT: Remaining user is % not will@driverondemand.co', uemail;
  END IF;
  RAISE NOTICE 'SUCCESS: users table contains exactly 1 record: % (%)', uemail, uid;
END;
$$;

COMMIT;
