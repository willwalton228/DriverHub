# DriverHub iPadOS shell

This directory contains the first-party **Swift + SwiftUI + WKWebView** iPad application approved in the Phase 3A audit. It is intentionally separate from the DriverHub web/server application and contains no duplicated business logic or credentials.

## What is implemented

- Manually defined Xcode project with iPad-only target, landscape left/right, version `1.0.0` build `1`.
- Shared Development, Staging, and Production schemes backed by one xcconfig model.
- Persistent `WKWebsiteDataStore.default()` for same-origin cookies, local storage, MFA, reset, and login state.
- Separate exact-host HTTPS allowlists for DriverHub and its configured authentication issuer. External HTTPS, `mailto:`, `tel:`, and `maps:` links route to iPadOS; cleartext HTTP and unknown schemes fail closed.
- Deliberate `target=_blank` / `window.open` handling, including a managed sheet for blank-first popups.
- Loading, connectivity, server failure, configuration failure, and retry UI.
- Back/forward swipe gestures, without a redundant browser toolbar.
- Native `WKDownload`, Quick Look, and share/Files workflows.
- A main-frame, configured-origin-only JavaScript bridge for generated `blob:`/`data:` downloads. It is bounded at 25 MB, sanitizes filenames, uses protected temporary files, and removes a file when its presentation ends.
- WebKit-owned file inputs and just-in-time media capture prompts.
- No foreground-time unconditional reload and no offline synchronization.

## Environment and allowlist

`Configuration/Base.xcconfig` is authoritative for common settings. Each environment file defines:

| Setting | Meaning |
|---|---|
| `DRIVERHUB_BASE_URL` | Absolute HTTPS DriverHub origin loaded at launch |
| `DRIVERHUB_ALLOWED_HOSTS` | Comma-separated exact hosts allowed inside WebKit |
| `DRIVERHUB_AUTHENTICATION_HOSTS` | Comma-separated exact identity-provider hosts allowed only for existing redirect authentication |
| `DRIVERHUB_ENVIRONMENT` | User-visible environment name |

All committed URLs use reserved `.invalid` hosts and cannot reach production. Replace the URL and matching host only after the environment owner approves them. xcconfig represents `//` as `/$()/` so it is not parsed as a comment.

The base host **must** be in the DriverHub allowlist or the app shows a configuration error. Entries are exact hosts: no suffix matching and no wildcards. `replit.com` is listed separately because `server/replitAuth.ts` uses `https://replit.com/oidc` as its default issuer; revalidate the deployed issuer and every redirect before signing. Other HTTPS hosts open in Safari, while HTTP is rejected.

Development and Staging display an in-app environment badge. Production is intentionally non-routable and is not selected automatically.

## Identity and signing

The committed bundle identifier is the unmistakable placeholder:

`com.placeholder.driverhub.REPLACE_ME`

The Phase 3A candidate `com.driverondemand.driverhub360` may be considered, but is **not approved or registered**. An Apple Account Holder must approve availability, legal ownership, display name, Team ID, and distribution route. Never use MoveNow's identifier, profile, certificate, or App Store Connect record.

No entitlements are enabled. Automatic signing can be used after an authorized Team is selected.

## Privacy and security

Included usage descriptions are limited to audited existing workflows:

- Camera: user-initiated claim/document and profile-photo capture.
- Microphone: user-initiated existing audio/video recording workflows.
- Location When In Use: Schedule clock-in/out.

There is no photo-library usage key (system pickers provide scoped selection), push/APNs, background mode, always-location, ATS exception, arbitrary-load permission, or custom URL callback.

The app does not read or log cookies, tokens, credentials, navigation headers, or page content. It does not move auth data into `UserDefaults` or Keychain. TLS remains enforced by ATS. Temporary downloads use complete file protection and UUID directories.

### Replit OIDC limitation

OIDC cannot be proven on Linux or by static inspection. The exact configured authentication host is allowed to complete the existing redirect flow inside persistent WebKit. If the identity provider refuses embedded user agents, opening login externally will not securely hand its browser cookie to WKWebView. `ASWebAuthenticationSession` requires an approved app callback and server-side session handoff that do not currently exist. This build deliberately does **not** copy cookies, intercept tokens, or invent a callback. Validate embedded OIDC on a physical iPad; if blocked, treat it as an authentication architecture blocker. Password login/MFA/reset remain same-origin candidates for first UAT.

## App icon and launch

The AppIcon is derived from the existing approved `attached_assets/dh-icon-light.png`, flattened onto an opaque DriverHub navy background at 1024×1024. Launch uses the existing DriverHub `dh` mark and matching corporate colors; it contains no MoveNow asset. Brand owners must visually approve both before upload.

## Static validation on Linux

Run:

```sh
./scripts/validate.sh
```

This checks project references, plist/JSON/XML syntax where host tools exist, environment fail-closed settings, permissions, orientation, identity/version values, icon dimensions/opacity, and common security regressions. It does not compile Swift or substitute for Xcode validation.

## Mac/Xcode handoff

1. Clone/pull this repository on a Mac with Xcode 26 or later.
2. Approve an exact non-production HTTPS URL and edit `Configuration/Development.xcconfig` or `Staging.xcconfig`; update both base URL and exact allowlist.
3. Open `ios-driverhub/DriverHub.xcodeproj`.
4. Select the DriverHub target, **Signing & Capabilities**, and an authorized Apple Development Team.
5. Replace `PRODUCT_BUNDLE_IDENTIFIER` in `Base.xcconfig` with the separately approved, registered explicit Bundle ID.
6. Select **DriverHub Development** or **DriverHub Staging** and an iPad simulator. Build and run.
7. Resolve any current-SDK migration warning only after reviewing its diff; do not accept new capabilities or permissions.
8. Connect a physical iPad, trust the development Mac, select the device, and run.
9. Test standard login/logout, relaunch persistence, expiration, forced reset, MFA, permission denial/revocation, and (if required) Replit OIDC.
10. Smoke-test Accounts, Drivers, Claims, Recruiting, Scheduling, and Moves; search/filter/table and software-keyboard behavior.
11. Test Files/photo-picker/camera uploads, camera switching, microphone/MediaRecorder, Schedule geolocation, PDF/CSV/XLS/XLSX/image downloads, blob exports, Quick Look/share/Files, popup links, phone/mail/maps, back gestures, network loss/recovery, and short/long backgrounding.
12. Repeat on all managed iPad sizes and iPadOS baselines. Landscape is the preferred launch orientation; portrait remains technically supported so Split View, Stage Manager, and other iPad multitasking modes are not disabled. No portrait redesign is included. Simulator alone is insufficient.

## TestFlight preparation (not performed)

1. Account Holder confirms legal organization, Team ID, final explicit Bundle ID, display/App Store name, SKU, primary language, and public/unlisted/Custom App strategy.
2. Register a new DriverHub App ID; create a separate App Store Connect record. Do not reuse MoveNow.
3. Complete agreements and provide privacy-policy/support URLs, App Privacy responses covering native **and remote web** collection, age rating, export compliance, review contact, restricted-system review account/instructions, and tester groups.
4. Confirm the exact UAT destination and use the **DriverHub Staging** scheme. Do not archive committed placeholder URLs.
5. Complete physical-iPad UAT and document the OIDC result.
6. Select a generic/connected iPadOS device, **Product → Archive**, then Organizer **Validate App**.
7. After authorized review, **Distribute App → App Store Connect → Upload**.
8. Wait for processing, add beta description/feedback details/test notes, and assign internal testers. External testing may require Beta App Review.

No archive, signing, upload, Apple ID/App ID creation, deployment, simulator run, or physical-device test was performed in the Linux environment.