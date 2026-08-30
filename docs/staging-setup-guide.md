# DriverHub 360 — Staging Environment Setup Guide

## Overview

The codebase now supports three isolated environments controlled by the `APP_ENV` secret:

| `APP_ENV` value | Database secret used              | WIW token used                    |
|-----------------|-----------------------------------|-----------------------------------|
| `development`   | `NEON_DATABASE_URL`               | `WHENIWORK_API_TOKEN`             |
| `staging`       | `NEON_DATABASE_URL_STAGING`       | `WHENIWORK_API_TOKEN_STAGING`     |
| `production`    | `NEON_DATABASE_URL`               | `WHENIWORK_API_TOKEN`             |

Environments never share databases or API keys.

---

## Step 1 — Create the Staging Neon Database

1. Go to [console.neon.tech](https://console.neon.tech)
2. Open your existing DriverHub project
3. Click **Branches** → **New Branch** → name it `staging`
   - Or create a separate Neon **project** named `driverhub-staging` for full isolation
4. Copy the connection string — it looks like:
   ```
   postgresql://<user>:<password>@<staging-host>/<database>?sslmode=require
   ```
5. You'll set this as `NEON_DATABASE_URL_STAGING` in the staging Repl

---

## Step 2 — Fork This Repl for Staging

1. In Replit, open this project
2. Click the **⋮** menu (top right) → **Fork**
3. Name it: `DriverHub 360 — Staging`
4. This gives you an isolated copy with its own URL and secrets

---

## Step 3 — Set Secrets in the Staging Repl

In the staging Repl, go to **Secrets** and set these values:

### Required
| Secret | Value |
|--------|-------|
| `APP_ENV` | `staging` |
| `NEON_DATABASE_URL_STAGING` | Neon staging branch connection string |
| `SESSION_SECRET` | Generate a new random string (different from prod!) |
| `ROOT_SUPER_ADMIN_PASSWORD` | A staging-specific admin password |
| `DRIVER_DATA_ENCRYPTION_KEY_STAGING` | New 32-char key (never reuse prod key) |

### WhenIWork Integration
| Secret | Value |
|--------|-------|
| `WHENIWORK_API_TOKEN_STAGING` | WIW API token for staging account/environment |

> **Important:** WIW tokens should point to a staging sub-account or test account, never to production data.

### Optional (if using same services as prod)
| Secret | Value |
|--------|-------|
| `RESEND_API_KEY` | Can reuse prod key but use a staging sender domain |
| `HUBSPOT_ACCESS_TOKEN` | Use a staging HubSpot sandbox if available |

### Do NOT set in staging
- `NEON_DATABASE_URL` — staging uses `NEON_DATABASE_URL_STAGING`
- `WHENIWORK_API_TOKEN` — staging uses `WHENIWORK_API_TOKEN_STAGING`

---

## Step 4 — Run Schema Migrations on Staging DB

After the staging Repl starts up the first time, its database is empty. Run:

```
npx drizzle-kit push
```

This will push the full schema to the staging database. The startup logs will show:

```
┌────────────────────────────────────────────────────────────┐
│  DriverHub 360 — STAGING                                   │
│  DB host : ep-xxxx.us-east-1.aws.neon.tech                │
│  WIW API : CONFIGURED                                      │
│  Encrypt : CONFIGURED                                      │
└────────────────────────────────────────────────────────────┘
```

---

## Step 5 — Deploy Staging

In the staging Repl:
1. Click **Deploy** → **Reserved VM** (same as prod)
2. The staging app will get its own `.replit.app` URL

---

## Identifying Environments in Logs

All WIW API log lines are now prefixed with the environment:

- Production: `[PROD][WIW] ...`
- Staging: `[STAGING][WIW] ...`
- Development: `[DEV][WIW] ...`

This makes it easy to trace staging WIW API activity without pollution from prod.

---

## Cross-Environment Isolation Guarantees

| Concern | How it's enforced |
|---------|------------------|
| Database | `APP_ENV` selects a different `NEON_DATABASE_URL_*` secret |
| WIW API | `APP_ENV` selects a different `WHENIWORK_API_TOKEN_*` secret |
| Encryption keys | Different `DRIVER_DATA_ENCRYPTION_KEY_STAGING` — staging cannot decrypt prod data |
| Session cookies | Different `SESSION_SECRET` — staging sessions are invalid on prod |
| App URL | Separate Replit deployment → separate domain |

---

## Generating a Secure Encryption Key

```bash
# In any terminal:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the output as `DRIVER_DATA_ENCRYPTION_KEY_STAGING`.
