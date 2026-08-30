-- Migration 0036: Uber Trip and Transaction Tables
-- One Uber Trip per Trip/Eats ID. Multiple Uber Transactions per trip.
-- Fare/Tip/Adjustment tied to trip; Service & Technology Fee is account-level;
-- Payment is reconciliation-only.

-- ── Uber Trips ─────────────────────────────────────────────────────────────────
CREATE TABLE uber_trips (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id              VARCHAR NOT NULL REFERENCES data_import_batches(id) ON DELETE CASCADE,

  -- Source identifier
  trip_eats_id          VARCHAR NOT NULL,   -- Uber UUID (Trip/Eats ID)

  -- Ride details
  service               VARCHAR,            -- "Travel | UberX"
  city                  VARCHAR,
  country               VARCHAR,
  pickup_address        TEXT,
  dropoff_address       TEXT,
  request_date          DATE,
  request_datetime_utc  TIMESTAMP WITH TIME ZONE,
  dropoff_datetime_utc  TIMESTAMP WITH TIME ZONE,
  timezone_offset       VARCHAR(10),
  distance_miles        DECIMAL(10,4),
  duration_minutes      DECIMAL(10,2),

  -- Driver
  driver_first_name     VARCHAR,
  driver_last_name      VARCHAR,
  driver_email          VARCHAR,
  employee_id           VARCHAR,
  linked_driver_id      VARCHAR REFERENCES drivers(id) ON DELETE SET NULL,

  -- Grouping / program
  uber_group            VARCHAR,
  uber_program          VARCHAR,
  expense_code          VARCHAR,    -- may contain a RedCap trip ID
  expense_memo          TEXT,
  payment_method        VARCHAR,

  -- Guest
  guest_first_name      VARCHAR,
  guest_last_name       VARCHAR,

  -- Move matching
  linked_trip_id        VARCHAR REFERENCES trips(id) ON DELETE SET NULL,
  linked_move_entry_id  VARCHAR REFERENCES move_report_entries(id) ON DELETE SET NULL,
  match_status          VARCHAR(20) NOT NULL DEFAULT 'unmatched',
  -- matched | low_confidence | unmatched
  match_confidence      DECIMAL(5,4),
  match_method          VARCHAR(50),
  -- expense_code | driver_date_city | driver_date | manual

  -- Dedup / correction
  source_system_key     VARCHAR(50) NOT NULL DEFAULT 'uber',
  is_superseded         BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by_trip_id VARCHAR,
  raw_data              JSONB,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One active trip record per (trip_eats_id) across all batches for dedup
  UNIQUE(trip_eats_id, batch_id)
);

CREATE INDEX idx_ut_batch_id       ON uber_trips(batch_id);
CREATE INDEX idx_ut_trip_eats_id   ON uber_trips(trip_eats_id);
CREATE INDEX idx_ut_request_date   ON uber_trips(request_date);
CREATE INDEX idx_ut_match_status   ON uber_trips(match_status);
CREATE INDEX idx_ut_linked_trip    ON uber_trips(linked_trip_id);
CREATE INDEX idx_ut_expense_code   ON uber_trips(expense_code);
CREATE INDEX idx_ut_driver         ON uber_trips(driver_last_name, driver_first_name);
CREATE INDEX idx_ut_is_superseded  ON uber_trips(is_superseded);

-- ── Uber Transactions ──────────────────────────────────────────────────────────
CREATE TABLE uber_transactions (
  id                            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id                      VARCHAR NOT NULL REFERENCES data_import_batches(id) ON DELETE CASCADE,
  uber_trip_id                  VARCHAR REFERENCES uber_trips(id) ON DELETE SET NULL,

  -- Source composite key
  trip_eats_id                  VARCHAR,
  network_transaction_id        VARCHAR,
  transaction_type              VARCHAR(60) NOT NULL,
  -- Fare | Tip | Adjustment | Service & Technology Fee | Payment
  transaction_category          VARCHAR(30) NOT NULL DEFAULT 'expense',
  -- expense | fee | reconciliation | adjustment
  transaction_timestamp_utc     TIMESTAMP WITH TIME ZONE,
  transaction_amount_usd        DECIMAL(12,2),
  transaction_amount_local      DECIMAL(12,2),
  local_currency_code           VARCHAR(10),

  -- Fare breakdown
  trip_meal_fare_local          DECIMAL(12,2),
  booking_service_fee_local     DECIMAL(12,2),
  airport_fee_local             DECIMAL(12,2),
  city_fee_local                DECIMAL(12,2),
  toll_fee_local                DECIMAL(12,2),
  delivery_fee_local            DECIMAL(12,2),
  promotions_discounts_local    DECIMAL(12,2),
  tip_local                     DECIMAL(12,2),
  other_charges_local           DECIMAL(12,2),
  total_fare_local              DECIMAL(12,2),
  total_taxes_local             DECIMAL(12,2),
  employee_payments_local       DECIMAL(12,2),
  membership_savings_local      DECIMAL(12,2),
  tip_usd                       DECIMAL(12,2),
  total_fare_usd                DECIMAL(12,2),
  total_taxes_usd               DECIMAL(12,2),
  employee_payments_usd         DECIMAL(12,2),
  service_tech_fee_usd          DECIMAL(12,2),
  integration_fee_usd           DECIMAL(12,2),

  -- Billing
  invoice_number                VARCHAR,
  payment_method                VARCHAR,
  cancellation_type             VARCHAR,
  fulfilment_type               VARCHAR,

  -- Voucher
  voucher_program               VARCHAR,
  voucher_program_expense_memo  TEXT,

  -- Dedup / correction
  source_system_key             VARCHAR(50) NOT NULL DEFAULT 'uber',
  is_superseded                 BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by_transaction_id  VARCHAR,
  raw_data                      JSONB,
  created_at                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Composite dedup for trip-linked transactions (Fare, Tip, Adjustment)
CREATE UNIQUE INDEX idx_utx_dedup
  ON uber_transactions(trip_eats_id, transaction_type, transaction_timestamp_utc, transaction_amount_usd)
  WHERE is_superseded = FALSE
    AND trip_eats_id IS NOT NULL
    AND transaction_timestamp_utc IS NOT NULL;

-- Dedup for account-level fees with no trip (Service & Technology Fee, Payment)
CREATE UNIQUE INDEX idx_utx_fee_dedup
  ON uber_transactions(batch_id, transaction_type, transaction_timestamp_utc, transaction_amount_usd)
  WHERE is_superseded = FALSE
    AND (trip_eats_id IS NULL OR trip_eats_id = '--')
    AND transaction_timestamp_utc IS NOT NULL;

CREATE INDEX idx_utx_batch_id       ON uber_transactions(batch_id);
CREATE INDEX idx_utx_uber_trip_id   ON uber_transactions(uber_trip_id);
CREATE INDEX idx_utx_trip_eats_id   ON uber_transactions(trip_eats_id);
CREATE INDEX idx_utx_type           ON uber_transactions(transaction_type);
CREATE INDEX idx_utx_category       ON uber_transactions(transaction_category);
CREATE INDEX idx_utx_is_superseded  ON uber_transactions(is_superseded);

-- Update uber source system parser config
UPDATE import_source_systems
  SET parser_config = '{"skipLinesUntilHeader":"Request Date (UTC)","dateFormat":"MM/DD/YYYY","primaryMatchField":"expense_code","importTypes":["uber_transaction"]}'::jsonb,
      import_types = ARRAY['uber_transaction']
  WHERE source_key = 'uber';
