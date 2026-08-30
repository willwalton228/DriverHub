/**
 * Communication Template Engine
 * Renders comm_templates subject/body by replacing {{variable}} placeholders.
 * Loads templates from the database by slug. Supports HTML and text variants.
 */

import { pool } from "../../db";

export interface CommTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  bodyTextTemplate: string | null;
  variables: string[];
  channel: string;
  version: number;
  isActive: boolean;
}

export interface RenderedTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

// ── Template cache (refreshed every 5 minutes) ────────────────────────────────
const _cache = new Map<string, { template: CommTemplate; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getTemplate(slug: string): Promise<CommTemplate | null> {
  const cached = _cache.get(slug);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.template;

  const result = await pool.query(
    `SELECT id, slug, name, description,
            subject_template AS "subjectTemplate",
            body_html_template AS "bodyHtmlTemplate",
            body_text_template AS "bodyTextTemplate",
            variables, channel, version, is_active AS "isActive"
     FROM comm_templates
     WHERE slug = $1 AND is_active = true
     LIMIT 1`,
    [slug]
  );

  if (!result.rows.length) return null;
  const row = result.rows[0];
  const template: CommTemplate = {
    ...row,
    variables: Array.isArray(row.variables) ? row.variables : [],
  };
  _cache.set(slug, { template, cachedAt: Date.now() });
  return template;
}

export function invalidateTemplateCache(slug?: string) {
  if (slug) _cache.delete(slug);
  else _cache.clear();
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/** Replaces {{variable}} placeholders with values from context. */
function render(template: string, context: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    return val !== null && val !== undefined ? String(val) : "";
  });
}

export async function renderTemplate(
  slug: string,
  context: Record<string, string | number | null | undefined>
): Promise<RenderedTemplate | null> {
  const template = await getTemplate(slug);
  if (!template) {
    console.error(`[TemplateEngine] Template not found: ${slug}`);
    return null;
  }

  return {
    subject:  render(template.subjectTemplate, context),
    bodyHtml: render(template.bodyHtmlTemplate, context),
    bodyText: template.bodyTextTemplate ? render(template.bodyTextTemplate, context) : "",
  };
}
