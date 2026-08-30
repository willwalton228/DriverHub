# DriverHub iPadOS Phase 3A — Native Shell Architecture Audit

**Audit date:** August 29, 2026  
**Status:** Audit complete; native implementation intentionally not started  
**Decision gate:** STOP before structural native changes

## Executive conclusion

DriverHub is a React/Vite web application served by the same Express application that provides its authenticated APIs. There is no Capacitor, Cordova, Expo, React Native, Swift, Xcode, or other native Apple project in this repository.

The recommended implementation is a **small, dedicated Swift/SwiftUI iPad application containing a controlled `WKWebView` shell that loads an explicitly configured, deployed HTTPS DriverHub environment**. It should not bundle or fork the DriverHub frontend and should not contain business logic. This preserves one frontend, backend, database, permissions model, and business-rule set.

This is not a trivial packaging switch. It requires:

- A new Xcode/iOS project and build structure.
- Apple application identity, signing, and App Store Connect configuration.
- Native navigation policy and environment allowlisting.
- Persistent WebKit cookie/session handling.
- Native handling for external URLs, new windows, downloads, and documents.
- Camera, microphone, and location permission delegation.
- Physical-iPad validation.

Because this is significant new project structure and the repository has not been migrated to host multiple application artifacts, the ticket's explicit stop condition applies. No native dependencies, wrapper project, Apple identifiers, signing settings, or web/backend changes were made.

## 1. Current DriverHub frontend and build structure

- The frontend is a React 18 single-page application under `client/`.
- Vite builds the web frontend into `dist/public`.
- Express serves the built frontend and the API from one origin.
- The client uses `wouter` for browser-side routing.
- TanStack Query and the shared request client call relative `/api/...` URLs with `credentials: "include"`.
- The server is bundled separately with esbuild into `dist/index.js`.
- Development runs through `tsx server/index.ts`; production runs the bundled Express server.
- The approved iPad experience is responsive web UI. Existing iPad/Safari viewport handling and the corporate sidebar breakpoint live in the web application; there is no native navigation layer.

Evidence:

- `package.json`
- `vite.config.ts`
- `server/index.ts`
- `client/src/App.tsx`
- `client/src/lib/queryClient.ts`

## 2. Existing native wrapper inventory

No native wrapper exists.

The audit found no:

- Capacitor configuration or dependencies.
- Cordova configuration or dependencies.
- Expo or React Native application.
- `ios/` or `android/` native directory.
- Xcode project or workspace.
- `Podfile`.
- `Info.plist`.
- Entitlements file.
- Provisioning profile, certificate, signing key, or App Store Connect configuration.

The `artifacts/mockup-sandbox` application is a Vite design-preview artifact, not a mobile application.

## 3. Recommended iPadOS packaging approach

Create a dedicated **Swift/SwiftUI iPad shell using `WKWebView`**.

The shell should:

1. Select one approved DriverHub HTTPS origin from build configuration.
2. Load that origin in a persistent `WKWebsiteDataStore`.
3. Keep same-origin DriverHub navigation inside the shell.
4. Open external web destinations outside DriverHub.
5. Route `mailto:` and `tel:` to the appropriate system application.
6. Intercept downloads and present them through Quick Look, Files, or the share sheet.
7. Delegate camera, microphone, file picker, and location permission requests.
8. Show explicit loading, authentication-expired, connectivity-lost, and retry states.
9. Add no business logic and store no API credentials.

### Why not bundled web assets

Bundling `dist/public` inside an iOS application would change the frontend origin to an app-local WebView origin. DriverHub currently relies on:

- Relative `/api` URLs.
- Same-origin secure session cookies.
- Browser redirects for authentication.
- Same-origin server routes and generated documents.

A bundled frontend would therefore require API-base configuration, cross-origin access, cookie/session changes, and likely authentication callback changes. That would violate the Phase 3 boundary against changing APIs, permissions, authentication architecture, or server behavior.

### Why not Capacitor as the first choice

Capacitor can host a WebView, but DriverHub does not need a JavaScript-to-native business bridge. A production shell would still require custom iOS handling for:

- New-window navigation.
- Blob and generated-file downloads.
- Quick Look and share-sheet presentation.
- External scheme routing.
- WebKit media permission decisions.
- Environment allowlisting.

Capacitor would add Node packages, generated iOS structure, CocoaPods/SPM dependencies, third-party SDK review obligations, and wrapper lifecycle without removing those native requirements. A small first-party Swift shell is the narrower dependency and security surface.

Capacitor remains a viable alternative only if the product owner explicitly prefers JavaScript-managed native plugins and accepts the added framework.

## 4. Architectural limitations

1. **The application remains online-only.** No offline data synchronization should be added.
2. **Remote availability is required.** The configured DriverHub environment must be deployed and reachable over HTTPS.
3. **A remote shell changes independently from the App Store binary.** Review notes must clearly explain that it is a secure corporate operations client, not a generic website bookmark.
4. **App Review minimum-functionality risk exists.** Apple may reject a thin wrapper under guideline 4.2 if it does not provide sufficient app-like value. Native launch, secure environment control, document handling, media permissions, connectivity handling, and managed corporate distribution help, but do not guarantee acceptance.
5. **WebKit is not Safari.** Downloads, `_blank`, media capture, cookie behavior, and external authentication require explicit testing and sometimes native delegates.
6. **There is no macOS/Xcode toolchain in this environment.** An iPad archive, signed `.ipa`, or TestFlight upload cannot be produced or verified on this Linux host. Final compilation and signing require a Mac with current Xcode or an approved macOS CI service.
7. **Physical-device verification is mandatory.** Simulator testing cannot fully validate camera, file providers, keyboard behavior, background/foreground transitions, or managed-device policies.

## 5. Required project dependencies

For the recommended first-party shell:

- Xcode 26 or later.
- Apple Swift and SwiftUI.
- WebKit (`WKWebView`).
- SafariServices for external web presentation if `SFSafariViewController` is chosen.
- QuickLook for document previews if used.
- UniformTypeIdentifiers for download/file typing.

No third-party runtime dependency is required for the minimum shell.

The repository must first be reorganized to support the existing full-stack web application and the new native application as separately buildable artifacts. That migration must preserve the current web workflow and deployment unchanged.

## 6. Required Apple developer/account configuration

Account-owner action is required for:

- An active Apple Developer Program organization membership.
- Confirmation of the legal Apple developer organization.
- Apple Team ID.
- App Store Connect access for the people who will manage builds and TestFlight.
- Agreements, tax, and banking items as applicable to the organization's distribution path.
- Confirmation of whether eventual distribution is public, unlisted, or a private Custom App through Apple Business Manager.
- TestFlight internal and/or external tester groups.
- Export-compliance responses.
- App privacy responses and a privacy policy URL.
- Current age-rating questionnaire.

No Apple account values were found or inferred.

## 7. Proposed application identity

These are proposals only. Nothing has been registered, and availability/ownership must be confirmed by the Apple Account Holder.

| Field | Proposed value | Status |
|---|---|---|
| Display name | `DriverHub 360` | Proposed |
| Bundle identifier | `com.driverondemand.driverhub360` | Candidate; ownership and availability unverified |
| App Store Connect name | `DriverHub 360` | Candidate; availability unverified |
| Internal SKU | `DRIVERHUB-IPAD-001` | Candidate; organization may substitute its convention |
| Marketing version | `1.0.0` | Proposed first TestFlight version |
| Build number | `1` | Proposed first TestFlight build |

The MoveNow Mobile bundle identifier must not be reused.

## 8. Signing, certificate, and provisioning requirements

Required:

- A unique explicit App ID matching the approved DriverHub bundle identifier.
- The correct Apple Team selected in Xcode.
- Apple Development signing for device development.
- Apple Distribution signing for App Store Connect/TestFlight.
- An App Store distribution provisioning profile containing the application identifier, unless Xcode automatic signing is approved and manages these assets.
- A registered test iPad only for direct development/ad hoc installation; TestFlight devices do not need to be registered.
- App Store Connect API credentials only if an approved CI upload process is later selected. Such credentials must live in protected CI secrets, never in the repository.

No certificate, Team ID, profile, or signing identity may be guessed or copied from MoveNow.

## 9. Required App Store Connect record

Create a new App Store Connect application after the Bundle ID is registered:

- Platform: iOS/iPadOS.
- Name: approved DriverHub app name.
- Primary language.
- Explicit Bundle ID.
- Internal SKU.
- User access restrictions.
- App privacy disclosures and privacy policy URL.
- Age rating.
- Category and company/support information.
- Export-compliance response.
- Test information and review contact.
- A review account or review instructions appropriate for a restricted corporate system.
- TestFlight groups.

The record must remain separate from MoveNow Mobile.

## 10. Native permissions and entitlements

### Required based on existing DriverHub workflows

- `NSCameraUsageDescription`
  - Claim/document photo capture and profile photo capture.
- `NSMicrophoneUsageDescription`
  - Existing application/video workflows request audio with media capture.
- `NSLocationWhenInUseUsageDescription`
  - Driver Schedule uses high-accuracy geolocation for clock-in/out behavior.

Each description must explain the real DriverHub workflow in plain language. Generic placeholder text should not be submitted.

### Not currently required

- Push Notifications/APNs entitlement.
- Background Modes.
- Always-on location.
- Bluetooth, NFC, HealthKit, or motion permissions.
- Broad Photo Library access, provided the standard system photo/file picker is used.

If a future native photo-library integration reads the library directly, add the appropriate photo-library usage description at that time. Do not request it preemptively.

### Conditional

- Associated Domains, only if universal links or an external authentication callback design requires them.
- Keychain Access Groups, only if credentials or cookies are deliberately shared across apps. This is not recommended for Phase 3.

## 11. Existing camera, file, notification, and location requirements

The web application currently includes:

- PDF, Office document, spreadsheet, CSV, and image uploads.
- `<input type="file">` workflows with camera capture hints.
- `getUserMedia` profile-photo capture.
- Video and audio recording through `MediaRecorder`.
- Browser geolocation for Schedule clock-in/out.
- Client-generated PDF/CSV/XLSX/blob downloads.
- Object URLs and `download` links.
- New-window PDF/document opening.
- Clipboard writes.
- Browser local and session storage.

No service worker, browser Push API registration, or native push dependency was found. Existing notifications are server/in-app features, so APNs is out of scope for the first build.

Representative evidence:

- `client/src/components/DirectFileUploader.tsx`
- `client/src/components/ProfilePhotoUploader.tsx`
- `client/src/pages/Apply.tsx`
- `client/src/pages/driver/Schedule.tsx`
- `client/src/lib/excelExport.ts`
- `client/src/components/invoicing/BillingStatementsTab.tsx`

## 12. Authentication and session implications

DriverHub must keep its existing authentication system.

Current behavior:

- Password and Replit OIDC authentication both exist.
- Server sessions are stored in PostgreSQL when configured.
- The browser receives an HTTP-only session cookie with a one-week maximum age.
- Production cookies are secure and `SameSite=Lax`.
- MFA and forced-password-reset states are held in the server session.
- Password changes, disabled accounts, and credential-version changes can revoke sessions.
- The client checks `/api/auth/me` regularly and after focus.

Required shell behavior:

- Use a persistent, non-ephemeral `WKWebsiteDataStore`.
- Do not copy the session token into native user defaults.
- Do not log cookies, auth redirects, passwords, or tokens.
- Clear the DriverHub website data/cookies when the application performs a confirmed logout if WebKit does not already reflect the server cookie deletion.
- Reload or route to login after a `401`.
- Preserve the MFA/reset cookie and WebView state across the complete flow.
- Verify account suspension and permission changes take effect after refocus/reload.

### OIDC blocker requiring explicit validation

Embedded user-agent restrictions can prevent identity-provider login inside `WKWebView`. If Replit OIDC must work in the iPad shell, it may require `ASWebAuthenticationSession` plus a secure callback and session handoff. The current web callback is host-based and the resulting browser cookie may not automatically transfer into the app's WebView.

Password login, forced reset, and MFA should remain same-origin and are expected to work in a persistent WebView, but must be tested. Native implementation must not assume OIDC works until this is proven.

## 13. External-link handling

Use an explicit navigation policy:

- Approved DriverHub origin: remain inside the shell.
- Approved DriverHub API/document URLs: remain inside or route to document handling.
- External `https:` destinations: open in Safari or `SFSafariViewController`.
- `mailto:`: open Mail through the system.
- `tel:`: open the system handler when supported.
- Unknown/custom schemes: deny by default unless explicitly allowlisted.
- Popups and `target="_blank"`: inspect the destination instead of creating an unmanaged trapped WebView.

The codebase contains numerous `window.open` and `_blank` uses, so omitting `WKUIDelegate` handling would break real workflows.

## 14. Download and file handling

The shell must implement:

- `WKDownloadDelegate` where supported.
- Response/navigation interception for downloadable MIME types.
- Temporary-file storage with cleanup.
- Quick Look for supported documents.
- Files/share-sheet export.
- Correct filenames and MIME/UTType mapping.
- Blob/object URL validation for client-generated exports.
- A visible error when a download cannot be completed.

Special attention is required for:

- Immediate `URL.revokeObjectURL` after synthetic link clicks.
- `XLSX.writeFile`.
- Server-generated PDFs opened in a new window.
- CSV content served with an Excel filename or MIME type.

Files must not be retained indefinitely in application storage.

## 15. Safari/WKWebView compatibility risks

Validate:

- `MediaRecorder` output and playback for the current WebM workflow.
- `getUserMedia` camera switching and audio permission delegation.
- `<input capture="environment">` behavior on iPad.
- Blob URLs, synthetic anchor downloads, and immediate URL revocation.
- Multiple-window requests.
- Browser history and back navigation.
- Persistent cookies after termination/relaunch.
- Local/session storage persistence.
- Visual viewport updates while the software keyboard opens.
- Sticky table headers/columns and nested horizontal scrolling.
- Date/time controls, dropdown portals, modals, and focus.
- Clipboard writes.
- Background/foreground refetch behavior.
- Loss and restoration of network connectivity.

## 16. Secure environment selection

Use one centralized native configuration:

- `DriverHubBaseURL` supplied through `.xcconfig` files or an equivalent build setting.
- Separate Development, Staging, and Production schemes/configurations.
- A strict HTTPS origin allowlist.
- A visible non-production environment indicator.
- Release builds that fail closed when configuration is missing or not allowlisted.
- No API keys, database credentials, or user credentials in the application.

Suggested configuration model:

| Build configuration | Destination |
|---|---|
| Development | Approved development URL |
| Staging/TestFlight UAT | Approved stable staging URL |
| Production | Approved production URL |

The first TestFlight environment is **not selected by this audit**. The ticket requires explicit approval, and production must not be chosen automatically.

The current web app's relative API URLs make remote same-origin loading the safest option. Existing server-side generated-link configuration should be reviewed separately because some services use different environment fallbacks; Phase 3 must not silently change those values.

## 17. MoveNow Mobile reuse assessment

No MoveNow Apple project, bundle identifier, Team ID, profile, certificate, App Store record, or native asset catalog exists in this repository.

May be reused only if independently supplied and confirmed:

- Organization-level Apple developer membership.
- The same Apple Team, if DriverHub is owned by the same legal organization.
- Organization signing-management process.
- CI conventions and App Store Connect operational procedures.
- General UAT/checklist experience.

Must not be reused:

- MoveNow bundle identifier or App ID.
- MoveNow App Store Connect record or SKU.
- MoveNow provisioning profile.
- MoveNow entitlements unless separately justified.
- MoveNow app icon, display name, or product branding.
- MoveNow-specific API configuration or secrets.

DriverHub brand assets already in the web project can provide native icon and launch-art source. The preferred source is a high-resolution DriverHub icon/vector, but it must be exported into a valid opaque Apple AppIcon set and reviewed visually.

## 18. Apple policy and review concerns

As of August 29, 2026:

- Apple requires uploads to App Store Connect to be built with Xcode 26 or later using the iOS/iPadOS 26 SDK or later.
- TestFlight builds must include application identifiers in their provisioning profiles.
- External TestFlight testing may require Beta App Review.
- TestFlight builds expire after 90 days.
- A privacy policy URL and accurate App Privacy disclosures are required.
- Third-party SDK privacy manifests/signatures must be evaluated if third-party native SDKs are introduced.

Primary review risks:

1. **Guideline 4.2 minimum functionality:** a shell that merely displays a website can be rejected. Review notes should explain the corporate operational use, controlled access, native document/media handling, connectivity handling, and why iPad distribution is required.
2. **Restricted login:** Apple review must receive a working review account/instructions or an approved explanation of the restricted enterprise model.
3. **Privacy:** DriverHub handles employee, driver, scheduling, location, document, and potentially claim information. App privacy answers must cover both native and web-delivered collection.
4. **Account deletion:** DriverHub does not expose public self-registration. The organization should document that accounts are administrator-provisioned. If in-app account creation is later added, Apple's account-deletion requirement must be addressed.
5. **Dynamic remote content:** the shell must not be used to bypass review or introduce prohibited functionality.
6. **Private corporate distribution:** Apple Business Manager Custom App distribution may fit the eventual audience better than public App Store distribution. This is an account-owner business decision and does not prevent TestFlight UAT.

Apple references:

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [TestFlight Overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Upcoming SDK Requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)

## 19. Exact process for the first TestFlight build

The following process applies after the architecture gate is approved:

1. Confirm the Apple legal organization, Account Holder, Team ID, and App Store Connect roles.
2. Approve the display name, Bundle ID, App Store Connect name, SKU, version, and build number.
3. Approve the exact environment for the first TestFlight build.
4. Register a new explicit DriverHub App ID.
5. Create the new DriverHub App Store Connect record.
6. On a Mac with Xcode 26 or later, create the dedicated iPadOS SwiftUI project.
7. Set the deployment target based on the organization's managed-iPad fleet.
8. Configure iPad support and landscape orientations; keep portrait safe if technically enabled.
9. Add Development, Staging, and Production `.xcconfig` files with one centralized base URL.
10. Implement the `WKWebView` shell with persistent data storage, navigation allowlisting, back behavior, retry/error UI, and background/foreground handling.
11. Implement external-link, popup, download, Quick Look, Files, and share-sheet handling.
12. Add only the camera, microphone, and location usage descriptions justified above.
13. Create the AppIcon and launch assets from approved DriverHub brand sources.
14. Configure signing with the approved Team and explicit App ID.
15. Compile and run on a physical iPad against the approved non-production environment.
16. Complete login, logout, relaunch, forced reset, MFA, session timeout, and permission-revocation tests.
17. Complete the six-module, search/filter/table, keyboard, upload/download, external-link, network-loss, and background/foreground UAT checklist.
18. Run the existing DriverHub web build/regression checks to prove the shell work did not alter web behavior.
19. Update version/build values and select the approved release configuration.
20. In Xcode, choose a generic/connected iOS device and run **Product → Archive**.
21. In Organizer, run **Validate App**.
22. Choose **Distribute App → App Store Connect → Upload**.
23. Complete export-compliance information and wait for App Store Connect processing.
24. Select the processed build in TestFlight and provide beta description, feedback contact, and testing notes.
25. Assign the build to an internal tester group.
26. If external testers are required, submit the build for Beta App Review and invite testers only after approval.

No upload, App Store submission, public release, or production deployment is authorized by this audit.

## 20. Gate recommendation and blockers

### Recommendation

Approve a separate first-party Swift/SwiftUI `WKWebView` shell using a controlled remote HTTPS DriverHub origin.

### Must be decided or supplied before implementation

1. Approval to introduce a new native application artifact and restructure the repository accordingly.
2. Confirmation of the Apple legal organization and Team ID.
3. Final application identity and Bundle ID availability.
4. Exact staging/TestFlight UAT URL.
5. Supported iPadOS/device baseline.
6. Whether Replit OIDC must work in the first TestFlight build or password/MFA is the approved initial authentication path.
7. Eventual distribution intent: public, unlisted, or Apple Business Manager Custom App.
8. Account-owner authorization to create the App ID and App Store Connect record.
9. Access to a Mac with Xcode 26+ and a physical iPad for compilation and UAT.

### Current readiness

- Architecture audit: **Complete**
- Native project: **Not created**
- Apple identity/signing: **Not configured**
- TestFlight environment: **Not approved**
- Native compilation: **Not possible on the current Linux host**
- Physical-iPad testing: **Not performed**
- TestFlight readiness: **Blocked pending architecture approval and Apple configuration**
