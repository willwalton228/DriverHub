-- Migration: 0029_product_library
-- Expands the products table into a full Product Library with commercial,
-- proposal, marketing, operations, billing, and relationship capabilities.
-- Adds product_relationships and product_documents tables.
-- All alterations are idempotent (ADD COLUMN IF NOT EXISTS).

-- ── Expand products table ─────────────────────────────────────────────────────

-- General / Identity
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_code        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS internal_notes      TEXT;

-- Commercial Pricing
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS min_price           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS max_price           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS suggested_price     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS margin_target       NUMERIC(5,4);   -- e.g. 0.30 = 30%

-- Proposal & Marketing Content
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS headline            VARCHAR(255),
  ADD COLUMN IF NOT EXISTS executive_summary   TEXT,
  ADD COLUMN IF NOT EXISTS customer_description TEXT,
  ADD COLUMN IF NOT EXISTS what_it_delivers    TEXT,
  ADD COLUMN IF NOT EXISTS benefits            TEXT,
  ADD COLUMN IF NOT EXISTS best_for            TEXT,
  ADD COLUMN IF NOT EXISTS call_to_action      VARCHAR(255);

-- Media Assets
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hero_image          TEXT,
  ADD COLUMN IF NOT EXISTS product_icon        TEXT,
  ADD COLUMN IF NOT EXISTS flyer_url           TEXT,
  ADD COLUMN IF NOT EXISTS video_urls          JSONB DEFAULT '[]'::jsonb;

-- Operations Extensions
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS markets             JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS driver_requirements TEXT,
  ADD COLUMN IF NOT EXISTS scheduling_rules    TEXT,
  ADD COLUMN IF NOT EXISTS compliance_rules    TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_rules      TEXT;

-- Billing Extensions
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tax_rules           TEXT,
  ADD COLUMN IF NOT EXISTS revenue_recognition TEXT,
  ADD COLUMN IF NOT EXISTS pass_through_rules  TEXT;

-- ── product_relationships ─────────────────────────────────────────────────────
-- Stores cross-selling and bundling relationships between products.
-- relationship_type: 'suggested' | 'required' | 'addon' | 'exclusive'

CREATE TABLE IF NOT EXISTS product_relationships (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  related_product_id  VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relationship_type   VARCHAR(50) NOT NULL DEFAULT 'suggested',
  notes               TEXT,
  created_by          VARCHAR REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_relationships_no_self CHECK (product_id <> related_product_id),
  CONSTRAINT product_relationships_unique  UNIQUE (product_id, related_product_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS product_relationships_product_idx
  ON product_relationships(product_id);
CREATE INDEX IF NOT EXISTS product_relationships_related_idx
  ON product_relationships(related_product_id);

-- ── product_documents ─────────────────────────────────────────────────────────
-- Stores references to uploaded documents, images, and videos for a product.
-- doc_type: 'flyer' | 'video' | 'image' | 'document' | 'presentation'

CREATE TABLE IF NOT EXISTS product_documents (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  doc_type     VARCHAR(50) NOT NULL DEFAULT 'document',
  label        VARCHAR(255),
  file_url     TEXT NOT NULL,
  file_name    VARCHAR(255),
  file_size    INTEGER,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_by   VARCHAR REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_documents_product_idx
  ON product_documents(product_id);
