-- Migration 0010: Transportation Method Master
-- Platform-managed master list of transportation methods (e.g. Company Driver,
-- Independent Contractor, Rideshare Standard, Courtesy Shuttle, Rental Vehicle,
-- Third Party Carrier). Managed exclusively by Super Admins; consumed by Move
-- Type configuration and other platform modules.

CREATE TABLE IF NOT EXISTS transportation_methods (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_user_id  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id  VARCHAR REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS transportation_methods_name_unique
  ON transportation_methods (name);

-- Seed the initial master list from the ticket's examples so the list is
-- immediately usable for Move Type configuration.
INSERT INTO transportation_methods (name, description, sort_order, is_active)
SELECT * FROM (VALUES
  ('Company Driver',       'A W-2 driver employed directly by the company.', 0, TRUE),
  ('Independent Contractor','A 1099 contracted driver operating their own vehicle.', 1, TRUE),
  ('Rideshare Standard',   'Standard-capacity rideshare service (e.g. UberX, Lyft).', 2, TRUE),
  ('Rideshare XL',         'Larger-capacity rideshare service for groups or extra luggage.', 3, TRUE),
  ('Courtesy Shuttle',     'A complimentary shuttle service, typically dealership or hotel operated.', 4, TRUE),
  ('Walking',              'The move is completed on foot with no vehicle required.', 5, TRUE),
  ('Rental Vehicle',       'A rental car or van used for the move.', 6, TRUE),
  ('Third Party Carrier',  'An external carrier or vendor performing the transportation.', 7, TRUE)
) AS seed(name, description, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM transportation_methods);
