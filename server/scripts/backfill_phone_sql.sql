-- Bulk Phone Normalization Backfill — Ticket 2
-- ─────────────────────────────────────────────────────────────────────────────
-- Normalizes all driver phone numbers in one UPDATE using PostgreSQL regex.
-- Idempotent: safe to re-run (last_phone_validation_at will be refreshed).
--
-- NANP NXX rules:
--   digits[0]  = area code first digit  → must NOT be 0 or 1
--   digits[3]  = exchange first digit   → must NOT be 0 or 1
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE drivers
SET
  mobile_phone_normalized  = CASE
    -- Valid 10-digit: +1 + digits
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 10
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) NOT IN ('0','1')
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 4, 1) NOT IN ('0','1')
      THEN '+1' || REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')
    -- Valid 11-digit starting with 1: + + digits
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 11
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) = '1'
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 2, 1) NOT IN ('0','1')
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 5, 1) NOT IN ('0','1')
      THEN '+' || REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')
    -- 10-digit failing NXX check: store the +1 form for reference even though invalid
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 10
      THEN '+1' || REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')
    -- 11-digit US failing NXX: store +prefix form for reference
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 11
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) = '1'
      THEN '+' || REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')
    ELSE NULL
  END,

  mobile_phone_is_valid = CASE
    WHEN COALESCE(phone_number,'') = ''
      THEN false
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 10
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) NOT IN ('0','1')
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 4, 1) NOT IN ('0','1')
      THEN true
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 11
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) = '1'
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 2, 1) NOT IN ('0','1')
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 5, 1) NOT IN ('0','1')
      THEN true
    ELSE false
  END,

  sms_eligible = CASE
    WHEN COALESCE(phone_number,'') = ''
      THEN false
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 10
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) NOT IN ('0','1')
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 4, 1) NOT IN ('0','1')
      THEN true
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 11
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) = '1'
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 2, 1) NOT IN ('0','1')
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 5, 1) NOT IN ('0','1')
      THEN true
    ELSE false
  END,

  sms_invalid_reason = CASE
    WHEN COALESCE(phone_number,'') = ''
      THEN 'missing_phone'
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) < 10
      THEN 'too_short'
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) > 11
      THEN 'too_long'
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 11
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) != '1'
      THEN 'unrecognized_format'
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 10
         AND (
           SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) IN ('0','1')
           OR SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 4, 1) IN ('0','1')
         )
      THEN 'invalid_format'
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g')) = 11
         AND SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 1, 1) = '1'
         AND (
           SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 2, 1) IN ('0','1')
           OR SUBSTRING(REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '', 'g'), 5, 1) IN ('0','1')
         )
      THEN 'invalid_format'
    ELSE NULL
  END,

  last_phone_validation_at = now();
