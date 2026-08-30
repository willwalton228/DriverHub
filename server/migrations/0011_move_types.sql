-- Migration 0011: Move Type Master
-- Platform-managed master list of Move Types. Managed exclusively by Super
-- Admins; reusable across all Accounts and not tied directly to Departments.

CREATE TABLE IF NOT EXISTS move_types (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  category            VARCHAR(255),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_user_id  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id  VARCHAR REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS move_types_name_unique
  ON move_types (name);

-- Seed a reasonable initial master list so the list is immediately usable.
INSERT INTO move_types (name, description, category, sort_order, is_active)
SELECT * FROM (VALUES
  ('One-Way Move',        'A single trip transporting a vehicle or passenger from origin to destination.', 'Standard', 0, TRUE),
  ('Round Trip Move',     'A move that returns to the original origin point after reaching the destination.', 'Standard', 1, TRUE),
  ('Multi-Stop Move',     'A move involving multiple stops before reaching the final destination.', 'Standard', 2, TRUE),
  ('Dealer Trade',        'A vehicle transfer between dealerships.', 'Dealer Services', 3, TRUE),
  ('Auction Run',         'Transporting a vehicle to or from an auction.', 'Dealer Services', 4, TRUE),
  ('Loaner/Service Shuttle','Shuttling a customer or loaner vehicle for service purposes.', 'Service', 5, TRUE),
  ('Emergency/Rush Move', 'A time-critical move requiring expedited handling.', 'Expedited', 6, TRUE),
  ('Yard/Lot Shuffle',    'Repositioning a vehicle within a lot or yard, not leaving the property.', 'Internal', 7, TRUE)
) AS seed(name, description, category, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM move_types);
