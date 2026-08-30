-- Migration 0034: Import Domain Tables
-- Dedicated storage for Move Report and DriverReturn data,
-- plus persistent entity mapping for account/driver name reconciliation.

-- ── Move Report Entries ────────────────────────────────────────────────────────
-- One row per RedCap trip financial record. Linked to trips.id when a match
-- exists by redcap_trip_id; stub trips are created when no match is found.
CREATE TABLE move_report_entries (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id              VARCHAR NOT NULL REFERENCES data_import_batches(id) ON DELETE CASCADE,

  -- Source identifiers
  redcap_trip_id        VARCHAR,          -- TripId from source ("22366837")
  linked_trip_id        VARCHAR REFERENCES trips(id) ON DELETE SET NULL,

  -- Core move data
  trip_date             DATE NOT NULL,
  rc_status             VARCHAR(50),      -- RCStatus: Completed, Cancelled, etc.
  owrt                  VARCHAR(20),      -- OWRT: One Way / Round Trip
  minutes               INTEGER,
  dealer_name           VARCHAR,          -- Dealer (source account name)
  driver_name           VARCHAR,          -- Driver (source driver name)
  linked_dealer_id      VARCHAR REFERENCES customers(id) ON DELETE SET NULL,
  linked_driver_id      VARCHAR REFERENCES drivers(id) ON DELETE SET NULL,

  -- Financial summary
  pay_total             DECIMAL(12,2),
  chg_total             DECIMAL(12,2),
  net_total             DECIMAL(12,2),

  -- Pay breakdown
  pay_min               DECIMAL(12,2),
  pay_ovg               DECIMAL(12,2),
  pay_1099r             DECIMAL(12,2),
  pay_bonus             DECIMAL(12,2),
  pay_other             DECIMAL(12,2),
  pay_gas               DECIMAL(12,2),
  pay_tolls             DECIMAL(12,2),
  pay_rs                DECIMAL(12,2),
  lmcw                  DECIMAL(12,2),
  lmcw_2023             DECIMAL(12,2),
  pay_1099m             DECIMAL(12,2),

  -- Charge breakdown
  chg_bonus             DECIMAL(12,2),
  chg_cxl               DECIMAL(12,2),
  chg_gas               DECIMAL(12,2),
  chg_minimum           DECIMAL(12,2),
  chg_incentive         DECIMAL(12,2),
  chg_other             DECIMAL(12,2),
  chg_overage           DECIMAL(12,2),
  chg_rideshare         DECIMAL(12,2),
  chg_rideshare_sql     DECIMAL(12,2),
  chg_service_fee       DECIMAL(12,2),
  chg_tolls             DECIMAL(12,2),
  chg_total_rt          DECIMAL(12,2),

  -- RT Pay components
  rt_pay_incentive      DECIMAL(12,2),
  rt_pay_incentive_total DECIMAL(12,2),
  rt_pay_service_fee    DECIMAL(12,2),

  -- Raw source data
  raw_data              JSONB,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ── Driver Return Entries ──────────────────────────────────────────────────────
-- Child records of moves. TripId from the source is a DriverHub trip UUID.
CREATE TABLE driver_return_entries (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id              VARCHAR NOT NULL REFERENCES data_import_batches(id) ON DELETE CASCADE,

  -- Source identifiers
  redcap_id             BIGINT,           -- RedCapId
  source_trip_id        VARCHAR,          -- TripId from source (DriverHub UUID)
  linked_trip_id        VARCHAR REFERENCES trips(id) ON DELETE SET NULL,

  -- Core return data
  dealer_name           VARCHAR,
  dealer_id             INTEGER,
  trip_date             DATE,
  trip_time             TIMESTAMP WITH TIME ZONE,
  trip_type_group       VARCHAR,
  status                VARCHAR(30),
  cancellation_reason   TEXT,
  minutes               DECIMAL(12,4),
  miles_estimate        DECIMAL(12,6),

  -- Driver info
  driver_name           VARCHAR,
  driver_cell           VARCHAR,
  linked_driver_id      VARCHAR REFERENCES drivers(id) ON DELETE SET NULL,
  linked_dealer_id      VARCHAR REFERENCES customers(id) ON DELETE SET NULL,

  -- Financial
  base_estimate         DECIMAL(12,2),
  base_cost             DECIMAL(12,2),
  customer_estimate     DECIMAL(12,2),
  customer_billed       DECIMAL(12,2),
  customer_refund       DECIMAL(12,2),
  customer_total        DECIMAL(12,2),
  customer_total_with_fee DECIMAL(12,2),
  cost_over_estimate    DECIMAL(14,8),

  -- Repair Order / Vehicle
  ro_number             VARCHAR,
  customer_vin          VARCHAR,
  customer_name         VARCHAR,
  customer_trip_address VARCHAR,
  customer_trip_city    VARCHAR,
  customer_phone        VARCHAR,
  customer_email        VARCHAR,
  vehicle_year          VARCHAR,
  vehicle_make          VARCHAR,
  vehicle_model         VARCHAR,
  ro_customer_pay       DECIMAL(12,2),
  ro_internal_pay       DECIMAL(12,2),
  ro_warranty_pay       DECIMAL(12,2),
  ro_total_pay          DECIMAL(12,2),

  -- Booking flags
  booked                SMALLINT DEFAULT 0,
  completed             SMALLINT DEFAULT 0,

  -- Parent match status
  parent_match_status   VARCHAR(20) DEFAULT 'unmatched', -- matched | unmatched | pending_review

  -- Raw source data
  raw_data              JSONB,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ── Import Entity Mappings ─────────────────────────────────────────────────────
-- Persistent mapping of source names → DriverHub entity IDs.
-- Survives across import batches; enables consistent auto-resolution.
CREATE TABLE import_entity_mappings (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  entity_type       VARCHAR(20) NOT NULL,     -- 'account' | 'driver'
  source_name       TEXT NOT NULL,             -- Exact name from source file
  source_system     VARCHAR(50) DEFAULT 'redcap',
  mapped_entity_id  VARCHAR NOT NULL,          -- customers.id or drivers.id
  mapped_entity_name TEXT,                     -- Cached display name
  confidence        VARCHAR(20) DEFAULT 'auto', -- 'auto' | 'fuzzy' | 'manual'
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, source_name)
);

-- Indexes
CREATE INDEX idx_mre_batch_id        ON move_report_entries(batch_id);
CREATE INDEX idx_mre_trip_date       ON move_report_entries(trip_date);
CREATE INDEX idx_mre_redcap_trip_id  ON move_report_entries(redcap_trip_id);
CREATE INDEX idx_mre_linked_trip_id  ON move_report_entries(linked_trip_id);
CREATE INDEX idx_mre_dealer_name     ON move_report_entries(dealer_name);

CREATE INDEX idx_dre_batch_id        ON driver_return_entries(batch_id);
CREATE INDEX idx_dre_trip_date       ON driver_return_entries(trip_date);
CREATE INDEX idx_dre_source_trip_id  ON driver_return_entries(source_trip_id);
CREATE INDEX idx_dre_linked_trip_id  ON driver_return_entries(linked_trip_id);
CREATE INDEX idx_dre_redcap_id       ON driver_return_entries(redcap_id);
CREATE INDEX idx_dre_parent_status   ON driver_return_entries(parent_match_status);

CREATE INDEX idx_iem_lookup          ON import_entity_mappings(entity_type, source_name);
CREATE INDEX idx_iem_entity_id       ON import_entity_mappings(mapped_entity_id);
