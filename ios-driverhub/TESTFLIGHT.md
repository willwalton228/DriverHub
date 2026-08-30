# TestFlight preparation (account-owner action)

No TestFlight or App Store Connect action is performed by this project.

## Required Apple information

- Active organization Apple Developer Program membership, Account Holder, Team ID, and authorized App Store Connect roles.
- Approved display name, registered explicit Bundle ID, App Store Connect name, SKU, primary language, and distribution intent (private Custom App, unlisted, or public only if later approved).
- Privacy-policy and support URLs; review contact; restricted corporate review credentials/instructions.
- App Privacy answers covering both native behavior and data collected by the remotely delivered DriverHub service.
- Age rating, category, export-compliance response, agreements, and internal/external tester groups.

Create a **new DriverHub** App ID and App Store Connect record. Do not reuse MoveNow identity, SKU, record, signing assets, entitlements, or artwork.

## Build readiness gate

Before archive:

1. Replace the placeholder Bundle ID and select the authorized Team.
2. Replace the selected `.invalid` environment with the approved stable UAT origin and exact allowlist.
3. Keep version `1.0.0` and build `1` for this initial build unless the upload system reports that build `1` was already used.
4. Complete simulator and physical-iPad checks in `MAC_HANDOFF.md`.
5. Document the embedded Replit OIDC result. Do not ship token/cookie copying as a workaround.
6. Have brand/privacy/security owners approve icon, launch presentation, usage descriptions, disclosures, and review notes.
7. Confirm there are no production credentials or endpoints in source and run `scripts/validate.sh`.

## Archive and upload

1. In Xcode select the approved distribution scheme and a generic/connected iPadOS device.
2. **Product → Archive**.
3. In Organizer, inspect version/build, Bundle ID, Team, environment, icon, and privacy details.
4. Run **Validate App**.
5. Only with upload authorization: **Distribute App → App Store Connect → Upload** using organization-managed credentials.
6. Wait for processing; answer export-compliance questions.
7. Add beta description, feedback email, test notes, and review access instructions.
8. Assign internal testers. Submit external testing for Beta App Review when required.

TestFlight builds expire after 90 days. Production/public submission is a separate authorization. Private Custom App distribution through Apple Business Manager may be preferable for this corporate operations client.