-- Product Library management permission and operational-flag audit trail.
-- Existing Finance users retain their current Product Library write capability;
-- Super Admins continue to bypass explicit Finance grants.

ALTER TABLE finance_permissions
  ADD COLUMN IF NOT EXISTS can_manage_products BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE finance_permissions
SET can_manage_products = can_view_module
WHERE can_manage_products = FALSE
  AND can_view_module = TRUE;

CREATE TABLE IF NOT EXISTS product_operational_flag_audit (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name  VARCHAR(255) NOT NULL,
  flag_name     VARCHAR(100) NOT NULL,
  previous_value BOOLEAN NOT NULL,
  new_value      BOOLEAN NOT NULL,
  changed_by    VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  changed_by_name VARCHAR(255),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_operational_flag_audit_product_idx
  ON product_operational_flag_audit(product_id);

CREATE INDEX IF NOT EXISTS product_operational_flag_audit_changed_at_idx
  ON product_operational_flag_audit(changed_at);