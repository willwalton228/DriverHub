-- 0026_user_layout_preferences.sql
-- Establishes the canonical per-user dashboard layout persistence layer.
--
-- Architecture notes:
--   layout_context  — dashboard scope, e.g. "claims-kpi", "employee-kpi"
--   layout_name     — "" (empty) = default layout; non-empty = future named layouts
--   placement       — JSONB reserved for future grid/size positioning
--   The unique index enforces one default layout per user per context while
--   leaving room for named layouts, shared layouts, and role-based overrides
--   as additional rows — no schema changes required to unlock those features.

CREATE TABLE IF NOT EXISTS user_layout_preferences (
  id              VARCHAR      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         VARCHAR      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layout_context  VARCHAR(100) NOT NULL,
  layout_name     VARCHAR(100) NOT NULL DEFAULT '',
  widget_order    TEXT[]       NOT NULL DEFAULT '{}',
  hidden_widgets  TEXT[]       NOT NULL DEFAULT '{}',
  placement       JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_layout_prefs_unique
  ON user_layout_preferences (user_id, layout_context, layout_name);

-- Seed from claims_widget_preferences so no existing user loses their saved layout
INSERT INTO user_layout_preferences
  (user_id, layout_context, layout_name, widget_order, hidden_widgets)
SELECT user_id, 'claims-kpi', '', widget_order, hidden_widgets
FROM   claims_widget_preferences
ON CONFLICT (user_id, layout_context, layout_name) DO NOTHING;
