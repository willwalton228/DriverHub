/**
 * DriverConnect API v1 — API Key Authentication Middleware
 *
 * Accepts credentials via two equivalent mechanisms (in precedence order):
 *   1. Authorization: Bearer <api-key>    ← DriverConnect standard
 *   2. X-API-Key: <api-key>              ← legacy / backward-compatible
 *
 * Optional headers processed here:
 *   X-Tenant-Id: <org-uuid>   — validated against the key's org_id when provided
 *   X-Idempotency-Key: <uuid> — extracted and made available as req.v1IdempotencyKey;
 *                                injected into req.body.idempotencyKey as a fallback
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { v1ApiKeys } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export interface V1ApiKeyContext {
  apiKeyId: string;
  orgId: string | null;
  scopes: string[];
  keyName: string;
}

declare global {
  namespace Express {
    interface Request {
      v1ApiKey?: V1ApiKeyContext;
    }
  }
}

/** Extract the raw API key from either the Authorization Bearer header or the X-API-Key header. */
function extractRawKey(req: Request): string | undefined {
  // 1. Authorization: Bearer <token>  (DriverConnect standard)
  const auth = req.headers['authorization'] as string | undefined;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  // 2. X-API-Key: <key>  (legacy)
  const xKey = req.headers['x-api-key'] as string | undefined;
  if (xKey?.trim()) return xKey.trim();

  return undefined;
}

export async function requireV1ApiKey(req: Request, res: Response, next: NextFunction) {
  const rawKey = extractRawKey(req);

  if (!rawKey) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Provide Authorization: Bearer <token> or X-API-Key header.',
    });
  }

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  let apiKey;
  try {
    const rows = await db
      .select()
      .from(v1ApiKeys)
      .where(and(eq(v1ApiKeys.keyHash, keyHash), eq(v1ApiKeys.isActive, true)))
      .limit(1);
    apiKey = rows[0];
  } catch (err) {
    console.error('[v1Auth] DB lookup error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Authentication check failed.' });
  }

  if (!apiKey) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'The provided token is invalid or has been revoked.',
    });
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return res.status(401).json({
      error: 'TOKEN_EXPIRED',
      message: 'The provided token has expired. Contact your administrator to issue a new key.',
    });
  }

  // ── X-Tenant-Id validation ─────────────────────────────────────────────
  const tenantId = req.headers['x-tenant-id'] as string | undefined;
  if (tenantId && apiKey.orgId && tenantId !== apiKey.orgId) {
    return res.status(403).json({
      error: 'TENANT_MISMATCH',
      message: 'X-Tenant-Id does not match the organization associated with this token.',
    });
  }
  // Store resolved tenant on request
  req.v1TenantId = tenantId ?? apiKey.orgId ?? undefined;

  // ── X-Idempotency-Key extraction ──────────────────────────────────────
  const headerIdempKey = req.headers['x-idempotency-key'] as string | undefined;
  if (headerIdempKey) {
    req.v1IdempotencyKey = headerIdempKey;
    // Inject into body as fallback so existing route handlers that read
    // req.body.idempotencyKey work without modification.
    if (req.body && typeof req.body === 'object' && !req.body.idempotencyKey) {
      req.body.idempotencyKey = headerIdempKey;
    }
  }

  // Update last-used timestamp (non-blocking)
  db.update(v1ApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(v1ApiKeys.id, apiKey.id))
    .catch(err => console.error('[v1Auth] Failed to update lastUsedAt:', err));

  req.v1ApiKey = {
    apiKeyId: apiKey.id,
    orgId: apiKey.orgId ?? null,
    scopes: (apiKey.scopes as string[]) || [],
    keyName: apiKey.name,
  };

  next();
}

export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = req.v1ApiKey;
    if (!ctx) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
    }
    if (ctx.scopes.includes('*') || ctx.scopes.includes(scope)) {
      return next();
    }
    return res.status(403).json({
      error: 'INSUFFICIENT_SCOPE',
      message: `This operation requires the '${scope}' scope.`,
      required_scope: scope,
    });
  };
}
