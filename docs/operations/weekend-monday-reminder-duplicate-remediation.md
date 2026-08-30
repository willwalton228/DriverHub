# Weekend Monday reminder duplicate remediation

## Confirmed incident pattern

On Saturday, August 22, 2026, the database recorded **136 duplicated logical
Driver + Shift + Monday-date groups**. Every duplicate group contained a
successful SMS and a successful email. The matching WIW shift query returned
one row per shift, so a duplicate schedule join was not the source.

The application log recorded a full scheduler run beginning at 2:00 PM Central
for Monday, August 24. The duplicate records demonstrate that a second full
execution context also processed the same shift set. The legacy implementation
did not persist a run identifier or source on its communications, so the
historical records cannot distinguish a second application instance from a
manual trigger. This lack of durable idempotency was the functional defect:
any second execution was allowed to call both providers again.

## Remediation

- Delivery is now keyed in the database by **Driver + Shift + Channel +
  Reminder Type**. The unique constraint is the authority across process
  restarts, concurrent invocations, manual runs, and application instances.
- SMS and email claim their records before a provider call. A `sent` channel
  is never claimable again; `failed` channels retry independently.
- A claim left in `sending` fails closed rather than risking a duplicate after
  an interrupted provider call.
- Each shift now receives its own individual SMS and email. Multiple shifts
  therefore produce multiple isolated messages, never a shared recipient
  message.
- New records carry a run UUID and a source (`scheduler` or `manual`) so a
  future second execution is attributable in the delivery ledger.
- Existing records were preserved. Their successful historical channels were
  backfilled into the ledger, preventing another send for the same historical
  shift/channel.

## Validation

Focused mocked-provider tests cover a successful one-shift run, two shifts for
one driver, concurrent runs, a fresh service import, email-only retry, and
SMS-only retry. No live SMS or email was sent during remediation validation.