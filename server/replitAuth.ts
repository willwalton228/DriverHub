// Based on javascript_log_in_with_replit blueprint
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

// In-memory fallback cache for sessions.  Keeps the last known good session
// data so that a brief Neon DB hiccup doesn't log users out.
// TTL: 10 minutes — short enough that a truly-expired session won't be served
// for too long, long enough to bridge any Neon cold-start / network blip.
const SESSION_CACHE_TTL_MS = 10 * 60 * 1000;
interface CachedSession { data: session.SessionData; expiresAt: number }
const sessionMemCache = new Map<string, CachedSession>();

// Prune expired entries every 5 minutes so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of sessionMemCache) {
    if (entry.expiresAt <= now) sessionMemCache.delete(sid);
  }
}, 5 * 60 * 1000).unref();

function makeFaultTolerantStore(rawStore: session.Store): session.Store {
  const original = {
    get: rawStore.get.bind(rawStore),
    set: rawStore.set.bind(rawStore),
    destroy: rawStore.destroy.bind(rawStore),
  };

  // Retry the session get up to MAX_RETRIES times with exponential back-off
  // before falling back to the in-memory cache.  Neon PostgreSQL (serverless)
  // can have brief connection hiccups that resolve in 1-2 seconds.
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 500; // 500 ms → 1 s → 2 s

  rawStore.get = function (sid, callback) {
    let attempt = 0;

    const tryGet = () => {
      try {
        original.get(sid, (err, sessionData) => {
          if (err) {
            attempt++;
            if (attempt < MAX_RETRIES) {
              const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
              console.warn(
                `[Session] DB error on get (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms:`,
                err.message?.slice(0, 120),
              );
              setTimeout(tryGet, delay);
              return;
            }
            // All retries exhausted — try the in-memory fallback cache.
            const cached = sessionMemCache.get(sid);
            if (cached && cached.expiresAt > Date.now()) {
              console.warn("[Session] DB unavailable after retries — serving from memory cache for sid:", sid.slice(0, 8));
              return callback(null, cached.data);
            }
            console.warn("[Session] DB unavailable on get after retries — no cache hit, proceeding without session:", err.message?.slice(0, 120));
            return callback(null, null);
          }
          // Success — refresh the in-memory cache entry.
          if (sessionData) {
            sessionMemCache.set(sid, { data: sessionData, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
          }
          callback(null, sessionData);
        });
      } catch (e: any) {
        attempt++;
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[Session] Unexpected error on get (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms:`, e.message?.slice(0, 120));
          setTimeout(tryGet, delay);
          return;
        }
        const cached = sessionMemCache.get(sid);
        if (cached && cached.expiresAt > Date.now()) {
          console.warn("[Session] Unexpected error after retries — serving from memory cache for sid:", sid.slice(0, 8));
          return callback(null, cached.data);
        }
        console.warn("[Session] Unexpected error on get after retries:", e.message?.slice(0, 120));
        callback(null, null);
      }
    };

    tryGet();
  };

  rawStore.set = function (sid, sessionData, callback) {
    // Always update the memory cache immediately so it reflects the latest data.
    sessionMemCache.set(sid, { data: sessionData, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
    try {
      original.set(sid, sessionData, (err) => {
        if (err) {
          console.warn("[Session] DB unavailable on set — session will not persist:", err.message?.slice(0, 120));
        }
        // Authentication/session-establishment callers must be able to fail
        // closed when the durable store rejects a save.
        callback?.(err);
      });
    } catch (e: any) {
      console.warn("[Session] Unexpected error on set:", e.message?.slice(0, 120));
      callback?.(e);
    }
  };

  rawStore.destroy = function (sid, callback) {
    // Remove from memory cache on logout / destroy.
    sessionMemCache.delete(sid);
    try {
      original.destroy(sid, (err?: any) => {
        if (err) {
          console.warn("[Session] DB unavailable on destroy:", err.message?.slice(0, 120));
        }
        callback?.();
      });
    } catch (e: any) {
      console.warn("[Session] Unexpected error on destroy:", e.message?.slice(0, 120));
      callback?.();
    }
  };

  return rawStore;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  
  // Prefer NEON_DATABASE_URL to avoid being overridden by Replit's injected DATABASE_URL
  const resolvedDbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

  // Use PostgreSQL session store if a DB URL is available, otherwise use memory store.
  // The PG store is wrapped in a fault-tolerant proxy so that a disabled/unreachable DB
  // does not propagate errors to Express (which would cause HTTP 500 on every request,
  // including the static-file health check at /).
  let sessionStore: session.Store;
  if (resolvedDbUrl) {
    const pgStore = connectPg(session);
    const raw = new pgStore({
      conString: resolvedDbUrl,
      createTableIfMissing: false,
      ttl: sessionTtl,
      tableName: "sessions",
    });
    sessionStore = makeFaultTolerantStore(raw);
    console.log("[auth] Using PostgreSQL session store (fault-tolerant)");
  } else {
    const MemoryStore = require('memorystore')(session);
    sessionStore = new MemoryStore({
      checkPeriod: sessionTtl,
    });
    console.warn("[auth] WARNING: Using memory session store - sessions will not persist across server restarts");
  }
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
      sameSite: 'lax',
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  return storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    ssoSubjectId: claims["sub"],
  }, {
    source: "replit_oidc_login",
    reason: "OIDC claims synchronized during authentication; sparse identity claims must not clear an active human name.",
    metadata: { claimFields: Object.keys(claims ?? {}).filter((key) => ["sub", "email", "first_name", "last_name", "profile_image_url"].includes(key)) },
  });
}

export async function setupAuth(app: Express) {
  // Check if required environment variables are present
  if (!process.env.REPL_ID || !process.env.SESSION_SECRET) {
    console.error("WARNING: Missing required environment variables for Replit Auth");
    console.error("REPL_ID:", process.env.REPL_ID ? "present" : "MISSING");
    console.error("SESSION_SECRET:", process.env.SESSION_SECRET ? "present" : "MISSING");
    console.error("App will run without authentication. Configure these variables in deployment settings.");
    
    // Set up minimal session middleware even without auth
    app.set("trust proxy", 1);
    
    // Provide stub auth routes that redirect to landing
    app.get("/api/login", (_req, res) => {
      res.status(503).json({ 
        error: "Authentication not configured", 
        message: "Please configure REPL_ID and SESSION_SECRET in deployment settings" 
      });
    });
    
    app.get("/api/callback", (_req, res) => {
      res.redirect("/");
    });
    
    app.get("/api/logout", (_req, res) => {
      res.redirect("/");
    });
    
    app.get("/api/auth/user", (_req, res) => {
      res.status(401).json({ message: "Unauthorized - Auth not configured" });
    });
    
    return;
  }

  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  let config;
  try {
    config = await getOidcConfig();
  } catch (error) {
    console.error("Failed to get OIDC config:", error);
    throw new Error("Authentication setup failed - please check REPL_ID and network connectivity");
  }

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    const driverHubUser = await upsertUser(tokens.claims());
    // Keep the persistent DriverHub identity on the authenticated session.
    // OIDC subjects are external identifiers and may differ for imported or
    // invited users whose historical records predate their first OIDC login.
    (user as any).driverHubUserId = driverHubUser.id;
    verified(null, user);
  };

  // Get the correct external URL for callbacks based on request
  const getExternalUrl = (req?: any) => {
    // If we have a request, try to use the actual host
    if (req) {
      const host = req.get('host') || req.hostname;
      // Always use https for Replit
      return `https://${host}`;
    }
    
    // Check if we're in a deployment
    if (process.env.REPLIT_DEPLOYMENT) {
      return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.app`;
    }
    // In development, use the dev domain
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    }
    // Fallback to constructed URL
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.app`;
  };

  // Track registered strategies by domain
  const registeredStrategies = new Map<string, boolean>();

  const ensureStrategy = (externalUrl: string) => {
    if (!registeredStrategies.has(externalUrl)) {
      const strategyName = `replitauth:${externalUrl}`;
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `${externalUrl}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.set(externalUrl, true);
      console.log("[auth] Registered strategy for:", externalUrl);
    }
    return `replitauth:${externalUrl}`;
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    // Store invite code in session if provided
    const inviteCode = req.query.invite_code as string;
    if (inviteCode && req.session) {
      (req.session as any).pendingInviteCode = inviteCode;
    }

    const externalUrl = getExternalUrl(req);
    const strategyName = ensureStrategy(externalUrl);
    passport.authenticate(strategyName, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", async (req, res, next) => {
    const externalUrl = getExternalUrl(req);
    const strategyName = ensureStrategy(externalUrl);
    
    passport.authenticate(strategyName, async (err: any, user: any, info: any) => {
      if (err) {
        console.error("Auth callback error:", err);
        return res.redirect("/api/login");
      }
      if (!user) {
        console.error("Auth callback no user:", info);
        return res.redirect("/api/login");
      }

      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return res.redirect("/api/login");
        }

        try {
          // Check for pending invite code
          const pendingInviteCode = (req.session as any)?.pendingInviteCode;
          if (pendingInviteCode) {
            // Clear the pending invite code
            delete (req.session as any).pendingInviteCode;

            // Get the invitation
            const invitation = await storage.getInvitationByCode(pendingInviteCode);
            if (invitation && !invitation.usedAt && new Date() <= invitation.expiresAt) {
              const userClaims = user.claims;
              const userEmail = userClaims?.email;
              
              // Verify email matches or allow any email for the invite
              if (userEmail) {
                // Mark invitation as used
                await storage.markInvitationAsUsed(pendingInviteCode, userClaims.sub);

                // Set the user's role
                const driverHubUserId = user.driverHubUserId || userClaims.sub;
                await storage.updateUserRole(driverHubUserId, invitation.role);

                // Link user to their driver/employee record if applicable
                if (invitation.role === "driver") {
                  // Find driver by user email (drivers use the linked user's email)
                  const drivers = await storage.getAllDriversWithUsers();
                  const matchingDriver = drivers.find(d => d.user?.email === userEmail);
                  if (matchingDriver) {
                    // Update driver's userId to link it to this user
                    await storage.updateDriver(matchingDriver.id, { userId: driverHubUserId });
                  }
                } else if (invitation.role === "employee") {
                  // Find employee by work email
                  const employees = await storage.getAllEmployees();
                  const matchingEmployee = employees.find(e => e.workEmail === userEmail || e.email === userEmail);
                  if (matchingEmployee) {
                    // Link the employee to this user
                    await storage.updateEmployee(matchingEmployee.id, { userId: driverHubUserId });
                  }
                }

                console.log(`Invitation ${pendingInviteCode} used by user ${userClaims.sub} for role ${invitation.role}`);
              }
            }
          }
        } catch (inviteError) {
          console.error("Error processing invitation:", inviteError);
          // Continue with login even if invitation processing fails
        }

        try {
          const { db } = await import("./db");
          const { users } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          const userClaims = user.claims;
          const driverHubUserId = user.driverHubUserId || userClaims?.sub;
          if (driverHubUserId) {
            const [persistentUser] = await db.update(users)
              .set({ lastLoginAt: new Date() })
              .where(eq(users.id, driverHubUserId))
              .returning({
                forcePasswordReset: users.forcePasswordReset,
                passwordSetAt: users.passwordSetAt,
              });
            (req.session as any).oidcUserId = driverHubUserId;
            (req.session as any).mustReset = persistentUser?.forcePasswordReset === true;
            (req.session as any).credentialVersion = persistentUser?.passwordSetAt?.getTime() ?? 0;
          }
        } catch (loginTrackErr) {
          console.error("[Auth] Failed to update lastLoginAt via OIDC (non-blocking):", loginTrackErr);
        }

        return res.redirect("/");
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    const externalUrl = getExternalUrl(req);
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: externalUrl,
        }).href
      );
    });
  });
}

// Paths that are always accessible even during a restricted (must-reset) session
const RESET_EXEMPT_PATHS = new Set([
  "/api/auth/forced-reset",
  "/api/auth/logout",
  "/api/auth/bootstrap",
  "/api/auth/bootstrap/verify",
]);

// Paths that are accessible during a pending MFA session (before OTP verification completes)
const MFA_EXEMPT_PATHS = new Set([
  "/api/auth/mfa/status",
  "/api/auth/mfa/enroll",
  "/api/auth/mfa/confirm-enrollment",
  "/api/auth/mfa/verify",
  "/api/auth/mfa/resend",
  "/api/auth/logout",
  "/api/auth/me",
]);

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Check for password-based session authentication first
  const sessionUserId = (req.session as any)?.userId;

  // A forced-reset login is intentionally not an authenticated application
  // session. It can only call reset/logout endpoints and cannot hydrate /me.
  const passwordResetPending = (req.session as any)?.passwordResetPending;
  if (!sessionUserId && passwordResetPending?.userId) {
    if (typeof passwordResetPending.expiresAt !== "number" || passwordResetPending.expiresAt <= Date.now()) {
      return res.status(401).json({
        error: "RESET_SESSION_EXPIRED",
        message: "Your password reset session has expired. Please sign in again to continue.",
      });
    }
    if (RESET_EXEMPT_PATHS.has(req.path)) {
      return next();
    }
    return res.status(403).json({
      error: "MUST_RESET_PASSWORD",
      message: "You must set a new password before accessing the platform.",
    });
  }

  // Handle MFA-pending sessions: user authenticated credentials but MFA not yet verified
  const mfaPending = (req.session as any)?.mfaPending;
  if (!sessionUserId && mfaPending?.userId) {
    const path = req.path;
    if (MFA_EXEMPT_PATHS.has(path)) {
      (req as any).user = { claims: { sub: mfaPending.userId } };
      return next();
    }
    return res.status(403).json({
      error: "MFA_REQUIRED",
      message: "Two-factor authentication is required to access this resource.",
    });
  }

  if (sessionUserId) {
    // Password-based login - set up req.user for compatibility
    if (!req.user) {
      (req as any).user = { claims: { sub: sessionUserId } };
    } else if (!(req.user as any).claims?.sub) {
      (req.user as any).claims = { sub: sessionUserId };
    }

    // Enforce status check: reject sessions for SUSPENDED or DISABLED users
    try {
      const { db } = await import("./db");
      const { users } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      const [sessionUser] = await db.select({
        status: users.status,
        forcePasswordReset: users.forcePasswordReset,
        passwordSetAt: users.passwordSetAt,
      }).from(users).where(eq(users.id, sessionUserId)).limit(1);
      if (!sessionUser) {
        (req.session as any).destroy?.(() => {});
        return res.status(401).json({ error: "SESSION_REVOKED", message: "Your session is no longer valid. Please sign in again." });
      }
      if (sessionUser && sessionUser.status === "SUSPENDED") {
        (req.session as any).destroy?.(() => {});
        return res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Contact your administrator." });
      }
      if (sessionUser && sessionUser.status === "DISABLED") {
        (req.session as any).destroy?.(() => {});
        return res.status(403).json({ error: "ACCOUNT_DISABLED", message: "Your DriverHub access is inactive. Please contact an administrator for assistance." });
      }
      const currentVersion = sessionUser.passwordSetAt?.getTime() ?? 0;
      const sessionCredentialVersion = (req.session as any)?.credentialVersion;
      // Sessions created before credential-version enforcement do not carry the
      // marker. Adopt them once after validating the durable user record so a
      // deploy does not log out every existing user. A marker that is present
      // and stale still revokes the session after a credential change.
      if (sessionCredentialVersion !== undefined && sessionCredentialVersion !== currentVersion) {
        (req.session as any).destroy?.(() => {});
        return res.status(401).json({ error: "SESSION_REVOKED", message: "Your credentials changed. Please sign in again." });
      }
      if (sessionCredentialVersion === undefined) {
        (req.session as any).credentialVersion = currentVersion;
      }
      (req.session as any).mustReset = sessionUser.forcePasswordReset === true;
    } catch (error) {
      console.error("[Auth] Session validation failed:", error);
      return res.status(503).json({ error: "AUTH_VALIDATION_UNAVAILABLE", message: "We could not verify your session. Please retry." });
    }

    // Enforce restricted session: block all non-exempt endpoints when mustReset is true
    if ((req.session as any)?.mustReset === true) {
      const path = req.path;
      if (!RESET_EXEMPT_PATHS.has(path)) {
        return res.status(403).json({
          error: "MUST_RESET_PASSWORD",
          message: "You must set a new password before accessing the platform.",
        });
      }
    }

    return next();
  }

  // Check for OIDC (Replit Auth) authentication
  const user = req.user as any;

  // Passport is not installed for password-session requests. A missing
  // Passport helper must be treated as an unauthenticated request, not an
  // uncaught TypeError that turns a protected page into a blank state.
  if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { db } = await import("./db");
    const { users } = await import("../shared/schema");
    const { eq } = await import("drizzle-orm");
    const persistentUserId = (req.session as any)?.oidcUserId || user.driverHubUserId || user.claims?.sub;
    const [persistentUser] = await db.select({
      status: users.status,
      forcePasswordReset: users.forcePasswordReset,
      passwordSetAt: users.passwordSetAt,
    }).from(users).where(eq(users.id, persistentUserId)).limit(1);
    if (!persistentUser) {
      return res.status(401).json({ error: "SESSION_REVOKED", message: "Your account could not be resolved. Please sign in again." });
    }
    if (persistentUser.status === "DISABLED" || persistentUser.status === "SUSPENDED") {
      return res.status(403).json({ error: "ACCOUNT_INACTIVE", message: "Your account is inactive. Contact your administrator." });
    }
    const currentVersion = persistentUser.passwordSetAt?.getTime() ?? 0;
    const sessionCredentialVersion = (req.session as any)?.credentialVersion;
    if (sessionCredentialVersion !== undefined && sessionCredentialVersion !== currentVersion) {
      return res.status(401).json({ error: "SESSION_REVOKED", message: "Your credentials changed. Please sign in again." });
    }
    if (sessionCredentialVersion === undefined) {
      (req.session as any).credentialVersion = currentVersion;
    }
    (req.session as any).mustReset = persistentUser.forcePasswordReset === true;
    if (persistentUser.forcePasswordReset && !RESET_EXEMPT_PATHS.has(req.path)) {
      return res.status(403).json({ error: "MUST_RESET_PASSWORD", message: "You must set a new password before accessing the platform." });
    }
  } catch (error) {
    console.error("[Auth] OIDC session validation failed:", error);
    return res.status(503).json({ error: "AUTH_VALIDATION_UNAVAILABLE", message: "We could not verify your session. Please retry." });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
