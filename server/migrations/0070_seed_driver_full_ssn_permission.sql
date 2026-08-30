-- DH-002227: Explicitly grant full Driver SSN/EIN reveal to the four
-- approved active corporate accounts. Stable user IDs and the organization
-- constraint prevent same-named users in another tenant from being granted.
UPDATE users
SET action_permissions = jsonb_set(
  COALESCE(action_permissions, '{}'::jsonb),
  '{view_full_driver_ssn}',
  'true'::jsonb,
  true
),
updated_at = now()
WHERE status = 'ACTIVE'
  AND org_id = '26c087eb-0d86-4a4c-b48e-e2049323ccfd'
  AND id IN (
    '210f319a-31c9-486c-a9ca-38887544e6da',
    'afc340e5-a252-41d7-af3c-de3f24d9deb0',
    'b621047d-5ff7-4a04-8c31-367909a7ff01',
    'd63afddb-85a3-429d-9bda-9164343b77fe'
  )