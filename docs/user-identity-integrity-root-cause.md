# Active User Identity Integrity Investigation

## Scope

This investigation covers the active DriverHub user record for
`joanna@driverondemand.co` and the broader risk of sparse authentication or
partial user updates clearing human names.

## Confirmed facts

- The existing account is user ID `5d5a234d-d6bc-43da-be9b-6c410158bb53`.
- It is an `ACTIVE` `corporate_admin` account in the Driver on Demand
  organization.
- The email, role, access, password authentication capability, and user ID
  were retained.
- Before repair, both stored name fields were blank. There were no duplicate
  normalized email records.
- The account was invited on 2026-07-22 20:41 UTC and its password
  reset/invite acceptance was recorded on 2026-07-23 15:47 UTC.
- The account last logged in on 2026-08-19 13:46 UTC. Its `updated_at` was
  2026-08-21 15:37 UTC before the repair.
- No user access request, DriverConnect provisioning record, retained
  authentication name payload, or explicit name-change audit identifies the
  clearing event.
- The account has 48 historical AMR references as submitter, assignee, and
  product owner. Those references remain attached to the original user ID.

## Root-cause conclusion

The exact final clearing request cannot be proven from retained evidence:
the existing audit tables record provisioning and authentication events, but
not field-level user identity changes, and the database does not retain a
before-image for the `first_name` and `last_name` columns.

The responsible destructive capability is confirmed. The shared
`DatabaseStorage.upsertUser()` path previously copied incoming
`firstName`/`lastName` values directly onto an existing email match. Both the
Replit OIDC login synchronizer and several account/profile creation paths pass
claims or defaults that may be absent, `null`, or blank. A sparse login or
partial reconciliation could therefore clear an existing active human name
without changing authentication, role, access, or AMR ownership. Direct
administrative updates were also not protected by a shared identity policy.

This explains how the corruption could occur, but it does not establish
whether JoAnna’s final clearing write came from OIDC login, an unlogged
administrative update, or another caller of the shared storage method. The
earliest reliably observable blank state is the investigation snapshot on
2026-08-21; `updated_at` alone cannot identify which fields were written.

## Why existing validation did not prevent it

Provisioning audits tracked account lifecycle actions rather than individual
identity fields. The users table had no append-only identity audit trail, no
active-human invariant for nonblank names, and no integrity scan for blank
names or duplicate identity links. The update method also accepted a narrow
TypeScript type while callers passed dynamic objects, so compile-time typing
did not enforce partial-update safety.

## Impact review

All active corporate users are now covered by the integrity scan at
`GET /api/admin/users/identity-integrity/scan`. It reports blank names,
normalized duplicate emails, duplicate SSO subjects, duplicate internal
driver/employee links, active corporate users with neither password nor SSO
linkage, and AMR references to missing users. The initial pre-repair review
found JoAnna as the only active corporate user with blank identity fields and
found no duplicate normalized emails or alternate provisioning identity.

## Repair

The existing user ID was repaired in place to the verified identity
**JoAnna Holmes**. No user was inserted, no email was remapped, and no AMR
row was changed. The repair is recorded in the append-only
`user_identity_audit_log` with source `identity-integrity-migration`.

## Permanent prevention

- Shared storage identity updates now preserve active human names when values
  are missing, `undefined`, `null`, blank, or invalid.
- Explicit valid names are accepted as partial updates without touching the
  other name field.
- Attempts to clear an active human identity field are blocked and audited.
- Integration accounts remain outside the active-human protection rule.
- OIDC, authenticated profile, feedback actor creation, and driver-import
  paths identify their source and actor/process context.
- Identity changes, blocked clears, repairs, and future integrity findings
  have durable audit fields for user, field, old/new value, actor/process,
  source, reason, and timestamp.
- Focused regression tests cover sparse OIDC claims, partial updates,
  blocked clears, service-account isolation, and incomplete-identity scan
  findings.