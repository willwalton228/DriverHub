import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeScheduler } from "./schedulerService";
import { scheduledMoveImportJob } from "./jobs/scheduledMoveImport";
import { bootstrapAdminUser } from "./bootstrapAdmin";
import { seedRetentionPolicies } from "./retentionService";
import { seedRecruitingRetentionRules } from "./recruitingService";
import { seedGlobalDefaults } from "./services/platformConfigService";
import { validateRequiredSecretsAtStartup } from "./services/providerRegistry";
import { initRideshareCanonicalViews } from "./services/rideshareViewsInit";
import { initCommunicationFramework } from "./services/communications/initComms";
import { randomUUID } from "crypto";
import { printEnvironmentBanner, APP_ENV, ENV_LOG_PREFIX } from "./config/environment";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

app.use((req: Request, _res: Response, next: NextFunction) => {
  req.traceId = (req.headers["x-request-id"] as string) || randomUUID().replace(/-/g, "").slice(0, 32);
  _res.setHeader("x-trace-id", req.traceId);
  next();
});
// Skip JSON/urlencoded body parsing for raw binary upload endpoints
const RAW_UPLOAD_PATHS = new Set([
  '/api/objects/upload-file',
  '/api/documents/upload',
  '/api/documents/upload-proxy',
]);
const isRawUploadPath = (path: string) =>
  RAW_UPLOAD_PATHS.has(path) ||
  /^\/api\/tickets\/[^/]+\/attachments$/.test(path) ||
  /^\/api\/corporate\/invoicing\/invoices\/[^/]+\/attachments$/.test(path) ||
  /^\/api\/claims\/[^/]+\/evidence$/.test(path);

app.use((req, res, next) => {
  if (isRawUploadPath(req.path)) return next();
  express.json({
    limit: '20mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })(req, res, next);
});
app.use((req, res, next) => {
  if (isRawUploadPath(req.path)) return next();
  express.urlencoded({ extended: false })(req, res, next);
});

// Simple health check that works even if everything else fails
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Prevent Replit's CDN / browser from caching any API responses.
// Without this, the CDN caches GET /api/auth/me and returns stale 304s,
// making the client believe it's authenticated even after the session has
// expired — then POST requests (which bypass the cache) are rejected with 403.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("Starting server initialization...");
    printEnvironmentBanner();
    console.log("SESSION_SECRET:", process.env.SESSION_SECRET ? "present" : "MISSING");
    console.log("REPL_ID:", process.env.REPL_ID ? "present" : "MISSING");

    const s3Ready = !!(process.env.S3_BUCKET && process.env.S3_REGION && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
    if (s3Ready) {
      console.log("[Storage] Provider: AWS S3");
      console.log("[Storage] S3_BUCKET:", process.env.S3_BUCKET);
      console.log("[Storage] S3_REGION:", process.env.S3_REGION);
    } else if (process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
      console.log("[Storage] Provider: Replit Object Storage");
      console.log("[Storage] Bucket:", process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID.substring(0, 20) + "...");
    } else {
      console.warn("[Storage] WARNING: No storage provider configured. File uploads will be unavailable.");
      console.warn("[Storage] Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY for S3, or DEFAULT_OBJECT_STORAGE_BUCKET_ID for Replit Object Storage.");
    }

    const providerValidation = validateRequiredSecretsAtStartup();
    if (providerValidation.warnings.length > 0) {
      console.log("[Provider Registry] Warnings:");
      providerValidation.warnings.forEach(w => console.log(`  ${w}`));
    }
    if (providerValidation.errors.length > 0) {
      console.error("[Provider Registry] Errors:");
      providerValidation.errors.forEach(e => console.error(`  ${e}`));
    }
    if (!providerValidation.valid) {
      console.error("[Provider Registry] FATAL: Required provider secrets are missing and PROVIDER_FAIL_FAST=true. Shutting down.");
      process.exit(1);
    }
    
    await registerRoutes(app);
    console.log("Routes registered successfully");

    // Initialize Communication Framework event handlers (non-fatal)
    try {
      initCommunicationFramework();
    } catch (commErr: any) {
      console.warn("[startup] Communication framework init non-fatal:", commErr?.message ?? commErr);
    }

    // Initialize canonical rideshare reporting views (non-fatal)
    initRideshareCanonicalViews().catch(e =>
      console.warn("[startup] rideshareViewsInit non-fatal:", e?.message ?? e)
    );

    // Bootstrap and seed are non-fatal — server must start even if DB is temporarily unavailable.
    try {
      await bootstrapAdminUser();
    } catch (bootstrapErr: any) {
      const msg: string = bootstrapErr?.message || "";
      const isDbDisabled =
        msg.includes("endpoint has been disabled") ||
        msg.includes("endpoint is disabled") ||
        msg.includes("Control plane request failed");
      if (isDbDisabled) {
        console.error("╔══════════════════════════════════════════════════════════════╗");
        console.error("║  DATABASE ENDPOINT IS DISABLED — SERVER IN MAINTENANCE MODE  ║");
        console.error("╠══════════════════════════════════════════════════════════════╣");
        console.error("║  Fix: console.neon.tech → project → Branches → main →       ║");
        console.error("║       Computes → ⋮ menu → Resume compute                    ║");
        console.error("╚══════════════════════════════════════════════════════════════╝");
      } else {
        console.error("[Bootstrap] Non-fatal startup error — continuing:", msg);
      }
    }
    try {
      const { seedSystemReports } = await import("./seedSystemReports");
      await seedSystemReports();
    } catch (seedErr: any) {
      console.error("[SystemReports] Non-fatal seed error:", seedErr?.message ?? seedErr);
    }

    // Boot-time enum sanity check: import_row_status DB enum must match IMPORT_ROW_STATUSES constant.
    // Fails loudly if the enum drifts so future developers catch it immediately.
    try {
      const { pool } = await import('./db');
      const { IMPORT_ROW_STATUSES } = await import('@shared/schema');
      const { rows } = await pool.query("SELECT enum_range(NULL::import_row_status) AS vals");
      const dbVals: string[] = rows[0]?.vals?.replace(/[{}]/g, "").split(",").map((v: string) => v.trim()) || [];
      const codeVals: string[] = [...IMPORT_ROW_STATUSES];
      const missing = codeVals.filter(v => !dbVals.includes(v));
      const extra   = dbVals.filter(v => !codeVals.includes(v));
      if (missing.length > 0 || extra.length > 0) {
        console.error("╔═══════════════════════════════════════════════════════════════════╗");
        console.error("║  ENUM MISMATCH: import_row_status is out of sync!                ║");
        if (missing.length) console.error(`║  In code but NOT in DB: ${missing.join(", ").padEnd(42)}║`);
        if (extra.length)   console.error(`║  In DB but NOT in code: ${extra.join(", ").padEnd(42)}║`);
        console.error("║  Run: ALTER TYPE import_row_status ADD VALUE '<missing_value>';  ║");
        console.error("║  AND:  update IMPORT_ROW_STATUSES in shared/schema.ts            ║");
        console.error("╚═══════════════════════════════════════════════════════════════════╝");
        // Fatal: import jobs will fail with cryptic DB errors if enum is wrong
        process.exit(1);
      } else {
        console.log(`[EnumCheck] import_row_status OK: ${dbVals.join(", ")}`);
      }
    } catch (enumCheckErr: any) {
      // Non-fatal if DB unreachable at startup (e.g. cold start) — log and continue
      console.warn("[EnumCheck] Could not verify import_row_status enum:", enumCheckErr?.message);
    }

    // Recover orphaned import batches — background jobs are in-process and die on server restart.
    try {
      const { sql } = await import("drizzle-orm");
      const { db } = await import("./db.js");

      // Reset stuck validating batches back to mapped so the user can re-trigger validation.
      const validatingResult = await db.execute(sql`
        WITH reset AS (
          UPDATE import_batches
          SET status = 'mapped'::import_batch_status
          WHERE status = 'validating'::import_batch_status
            AND started_at < NOW() - INTERVAL '2 minutes'
          RETURNING id
        )
        SELECT COUNT(*) AS cnt FROM reset
      `);
      const validatingReset = Number((validatingResult.rows?.[0] as any)?.cnt ?? 0);
      if (validatingReset > 0) {
        console.warn(`[ImportRecovery] Reset ${validatingReset} orphaned validating batch(es) to mapped`);
      }

      // Auto-resume committing batches — the commit background job picks up from where it left off
      // by skipping staging rows already marked 'committed', so this is completely safe to call.
      const { resumeInFlightCommits } = await import("./routes/driverImport.js");
      await resumeInFlightCommits();

      if (validatingReset === 0) {
        console.log("[ImportRecovery] No orphaned batches found");
      }
    } catch (recoveryErr: any) {
      console.warn("[ImportRecovery] Could not recover orphaned batches:", recoveryErr?.message);
    }

    // Recover stale Draiver import batches stuck in 'processing'
    try {
      const { recoverStaleDraiverBatches } = await import("./routes/draiverImport.js");
      await recoverStaleDraiverBatches();
    } catch (draiverRecoveryErr: any) {
      console.warn("[DraiverRecovery] Startup recovery failed:", draiverRecoveryErr?.message);
    }

    // Seed default retention policies
    try {
      await seedRetentionPolicies();
    } catch (err) {
      console.error("Failed to seed retention policies:", err);
    }

    // Seed recruiting-specific retention rules
    try {
      await seedRecruitingRetentionRules();
    } catch (err) {
      console.error("Failed to seed recruiting retention rules:", err);
    }

    // Seed platform config global defaults
    try {
      await seedGlobalDefaults();
    } catch (err) {
      console.error("Failed to seed platform config defaults:", err);
    }

    // Startup safety check: warn if spreadsheet files exist in attached_assets/.
    // These files could be inadvertently consumed by a future filesystem-scan import route.
    // This is visibility only — the server continues to start normally.
    try {
      const fs = await import("fs");
      const path = await import("path");
      const assetDir = path.resolve("attached_assets");
      if (fs.existsSync(assetDir)) {
        const spreadsheets = fs.readdirSync(assetDir).filter((f: string) =>
          f.endsWith(".xlsx") || f.endsWith(".xls") || f.endsWith(".csv")
        );
        if (spreadsheets.length > 0) {
          console.warn("╔══════════════════════════════════════════════════════════════════╗");
          console.warn("║  [IMPORT SAFETY] Spreadsheet files found in attached_assets/:   ║");
          spreadsheets.forEach((f: string) => console.warn(`║    • ${f.padEnd(60)}║`));
          console.warn("║  These files are NOT automatically imported.                    ║");
          console.warn("║  Use the Claims Import Wizard (/claims/import) for all imports. ║");
          console.warn("║  Remove these files if they are no longer needed.               ║");
          console.warn("╚══════════════════════════════════════════════════════════════════╝");
        }
      }
    } catch {
      // Non-fatal: visibility only
    }

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    // Create HTTP server AFTER all routes are registered
    const server = createServer(app);
    console.log("HTTP server created");
    
    if (app.get("env") === "development") {
      console.log("Setting up Vite for development");
      await setupVite(app, server);
    } else {
      console.log("Serving static files for production");
      serveStatic(app);
    }

    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error(`[HTTP] Unhandled error for ${req.method} ${req.originalUrl}:`, err);
      if (res.headersSent) {
        return next(err);
      }

      res.status(status).json({
        error: "INTERNAL_ERROR",
        message: status >= 500 ? "Something went wrong. Please try again." : message,
      });
    });

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
      console.log("Server started successfully on port", port);
      
      // Initialize scheduled tasks
      initializeScheduler();

      // The one-time corrective Updated Alert is never allowed to run from normal
      // application startup. It requires an explicit, operator-controlled opt-in
      // so a deployment restart cannot unexpectedly send outbound email/SMS.
      // It intentionally does not change the recurring Saturday 2 PM scheduler.
      if (
        process.env.NODE_ENV === "production" &&
        process.env.UPDATED_ALERT_SEND_APPROVED === "production-approved" &&
        Date.now() < Date.parse("2026-08-26T00:00:00.000Z")
      ) {
        console.log("[UpdatedAlert] Starting approved production corrective send.");
        import("./services/updatedAlertCorrectiveService")
          .then(({ runUpdatedAlertCorrectiveSend }) => runUpdatedAlertCorrectiveSend("2026-08-24"))
          .then((result) => {
            console.log("[UpdatedAlert] Production corrective send complete:", JSON.stringify(result.waves));
          })
          .catch((error: any) => {
            console.error("[UpdatedAlert] Production corrective send blocked or failed:", error?.message ?? error);
          });
      }

      // Holiday confirmation reminders are evaluated daily. The job only sends
      // 30/14/7-day requests for unconfirmed Accounts and never infers status
      // from WIW schedule data.
      const runHolidayOperationsReminders = async () => {
        try {
          const { runHolidayReminderSweep } = await import("./services/holidayOperationsService");
          const result = await runHolidayReminderSweep();
          if (result.attempted) console.log(`[HolidayOperations] Sent ${result.sent}/${result.attempted} due reminder(s)`);
        } catch (err: any) {
          console.warn("[HolidayOperations] Reminder sweep failed:", err?.message);
        }
      };
      setInterval(runHolidayOperationsReminders, 24 * 60 * 60 * 1000);
      setTimeout(runHolidayOperationsReminders, 45_000);
      
      // Scheduled move import (disabled by default)
      // Controlled by env var: ENABLE_SCHEDULED_IMPORT=false by default
      if (process.env.ENABLE_SCHEDULED_IMPORT === "true") {
        const IMPORT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
        console.log("[Scheduler] Scheduled move import enabled, running every 15 minutes");
        setInterval(scheduledMoveImportJob, IMPORT_INTERVAL_MS);
        scheduledMoveImportJob(); // Run once immediately
      }

      // Readiness regression sweep - checks for expired docs and stale readiness every hour
      const REGRESSION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
      const runRegressionSweep = async () => {
        try {
          const { sweepExpiredDocuments, sweepExpiredConsents, sweepStaleReadiness } = await import("./services/readinessRegressionService");
          const docResult = await sweepExpiredDocuments();
          const consentResult = await sweepExpiredConsents();
          const staleResult = await sweepStaleReadiness();
          if (docResult.downgraded > 0 || consentResult.downgraded > 0 || staleResult.downgraded > 0) {
            console.log(`[RegressionSweep] Docs: ${docResult.scanned} scanned, ${docResult.downgraded} downgraded. Consents: ${consentResult.scanned} scanned, ${consentResult.downgraded} downgraded. Stale: ${staleResult.scanned} scanned, ${staleResult.downgraded} downgraded.`);
          }
        } catch (err) {
          console.error("[RegressionSweep] Error:", err);
        }
      };
      setInterval(runRegressionSweep, REGRESSION_SWEEP_INTERVAL_MS);
      setTimeout(runRegressionSweep, 30000);

      // Neon keep-alive: ping the DB every 4 minutes to prevent auto-suspend
      // (Neon free tier suspends after 5 min of inactivity — this keeps it warm)
      const DB_KEEPALIVE_MS = 4 * 60 * 1000;
      const runDbKeepAlive = async () => {
        try {
          const { pool } = await import('./db');
          await pool.query('SELECT 1');
        } catch (err: any) {
          // Log but never crash — keep-alive is best-effort
          console.warn('[DB] Keep-alive ping failed:', err?.message);
        }
      };
      setInterval(runDbKeepAlive, DB_KEEPALIVE_MS);

      // Periodic stale Draiver batch sweep — runs every 20 minutes
      // Catches any batches that get stuck if the process dies mid-import
      const DRAIVER_STALE_SWEEP_MS = 20 * 60 * 1000;
      const runDraiverStaleSweep = async () => {
        try {
          const { recoverStaleDraiverBatches } = await import("./routes/draiverImport.js");
          await recoverStaleDraiverBatches();
        } catch (err: any) {
          console.warn("[DraiverRecovery] Periodic sweep failed:", err?.message);
        }
      };
      setInterval(runDraiverStaleSweep, DRAIVER_STALE_SWEEP_MS);
      console.log("[Scheduler] Draiver stale batch sweep scheduled every 20 minutes");
    });
  } catch (error) {
    console.error("FATAL ERROR during server startup:");
    console.error(error);
    process.exit(1);
  }
})();
