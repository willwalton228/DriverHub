# Mac and physical-iPad handoff

## Before opening Xcode

Obtain these approved values from the Apple Account Holder/environment owner:

- Legal Apple developer organization and Team ID.
- Registered explicit DriverHub Bundle ID (the committed value is a placeholder).
- Exact non-production DriverHub HTTPS URL and every exact host that is permitted to remain embedded.
- Supported managed-iPad/iPadOS baseline.
- Whether password/MFA is sufficient for initial UAT or Replit OIDC is mandatory.

Use Xcode 26 or later. Pull the repository without moving `ios-driverhub` or its `Configuration` directory.

## Configure and run

1. Edit `Configuration/Development.xcconfig` or `Staging.xcconfig`. Replace the reserved `.invalid` base URL and DriverHub host together. Revalidate the separate exact authentication-host list against the deployed OIDC issuer and redirects.
2. Edit `PRODUCT_BUNDLE_IDENTIFIER` in `Base.xcconfig` only after the explicit App ID is approved and registered.
3. Open `DriverHub.xcodeproj`; select the DriverHub target.
4. In **Signing & Capabilities**, enable automatic signing if organization policy permits and select the authorized Team. Do not add capabilities merely to silence warnings.
5. Select the matching shared scheme. Development/Staging show a visible environment badge; never point one silently at production.
6. Select an iPad simulator, then Build and Run. Confirm the expected environment before entering credentials.
7. Connect a physical iPad, accept trust/developer-mode prompts, select it as the run destination, and Build and Run again.

## Required validation

- Login/logout, terminated-app relaunch, session expiration, forced reset, MFA, suspended/disabled account, permission denial and revocation.
- Replit OIDC on a physical device. If the provider blocks WKWebView, stop: a secure `ASWebAuthenticationSession` callback/handoff needs approved server architecture.
- Accounts, Drivers, Claims, Recruiting, Scheduling, and Moves routing/rendering.
- Search, filters, wide/sticky tables, nested horizontal scrolling, modal/dropdown/date controls, software keyboard, clipboard.
- Files and scoped photo selection; camera capture and switching; audio/video capture; Schedule clock-in/out geolocation.
- PDF, CSV, XLS/XLSX, image and report downloads; generated blob links; popup documents; Quick Look and Files/share export.
- Internal links, external HTTPS, rejected cleartext HTTP, mail, telephone, maps, unknown schemes, managed blank-first popups, and swipe back/forward.
- Offline at launch, interruption while active, restored network, server errors, short/long backgrounding, and memory-pressure content-process recovery.
- All supported iPad sizes/orientations, Split View/Stage Manager boundaries, and managed-device policies. Landscape is preferred at launch; portrait remains technically enabled for multitasking compatibility.

Record OS/device, scheme, URL host, account type, result, and evidence without recording credentials, cookies, tokens, or sensitive documents.

## Archive handoff

After UAT and account approval, select the intended scheme and inspect its resolved build settings. Production is committed fail-closed; never archive a `.invalid` destination. Select a generic/connected iPadOS device, choose **Product → Archive**, then use Organizer **Validate App**. Resolve validation errors before any separately authorized upload.