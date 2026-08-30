#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail() { echo "ERROR: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

required=(
  DriverHub.xcodeproj/project.pbxproj
  DriverHub/DriverHubApp.swift
  DriverHub/WebViewModel.swift
  DriverHub/Downloads.swift
  DriverHub/Info.plist
  Configuration/Base.xcconfig
  Configuration/Development.xcconfig
  Configuration/Staging.xcconfig
  Configuration/Production.xcconfig
  DriverHub/Assets.xcassets/AppIcon.appiconset/DriverHub-AppIcon-1024.png
)
for file in "${required[@]}"; do [[ -f "$file" ]] || fail "missing $file"; done
pass "required project files exist"

command -v plutil >/dev/null && plutil -lint DriverHub/Info.plist >/dev/null
command -v jq >/dev/null && find DriverHub/Assets.xcassets -name Contents.json -print0 | xargs -0 -n1 jq empty
command -v xmllint >/dev/null && find DriverHub.xcodeproj -name '*.xcscheme' -print0 | xargs -0 -n1 xmllint --noout
pass "available plist, JSON, and XML parsers accepted files"

grep -q 'PRODUCT_BUNDLE_IDENTIFIER = com.placeholder.driverhub.REPLACE_ME' Configuration/Base.xcconfig || fail "bundle ID is not marked placeholder"
grep -q 'MARKETING_VERSION = 1.0.0' Configuration/Base.xcconfig || fail "wrong marketing version"
grep -q 'CURRENT_PROJECT_VERSION = 1' Configuration/Base.xcconfig || fail "wrong build number"
grep -q 'TARGETED_DEVICE_FAMILY = 2' Configuration/Base.xcconfig || fail "target is not iPad-only"
for cfg in Development Staging Production; do
  grep -q '[.]invalid' "Configuration/$cfg.xcconfig" || fail "$cfg URL is not a non-production placeholder"
done
pass "identity, version, device family, and placeholder environments are safe"

for key in NSCameraUsageDescription NSMicrophoneUsageDescription NSLocationWhenInUseUsageDescription; do
  grep -q "<key>$key</key>" DriverHub/Info.plist || fail "missing $key"
done
! grep -Eq 'NSPhotoLibrary|UIBackgroundModes|aps-environment|NSLocationAlways|NSAllowsArbitraryLoads' DriverHub/Info.plist || fail "disallowed permission/capability found"
orientation_block="$(awk '
  /<key>UISupportedInterfaceOrientations~ipad<\/key>/ { in_block = 1 }
  in_block { print }
  in_block && /<\/array>/ { exit }
' DriverHub/Info.plist)"
[[ "$(grep -c 'UIInterfaceOrientationLandscape' <<<"$orientation_block")" -eq 2 ]] || fail "expected exactly two supported landscape orientations"
[[ "$(grep -c 'UIInterfaceOrientationPortrait' <<<"$orientation_block")" -eq 2 ]] || fail "portrait must remain technically available for iPad multitasking"
! grep -q 'UIRequiresFullScreen' DriverHub/Info.plist || fail "full-screen requirement disables iPad multitasking"
grep -q '<string>UIInterfaceOrientationLandscapeLeft</string>' DriverHub/Info.plist || fail "landscape is not the preferred launch orientation"
pass "least-privilege plist and landscape-first multitasking checks passed"

! grep -RniE 'print[(]|NSLog|os_log|cookie|authorization:|bearer |password *=|token *=' DriverHub --include='*.swift' | grep -v 'cookies, tokens' || fail "possible sensitive logging or credential handling found"
! grep -RniE 'http://|[.]hasSuffix[(]' DriverHub Configuration --include='*.swift' --include='*.xcconfig' || fail "insecure transport or broad host matching found"
! grep -RniE 'case "http":[[:space:][:print:]]*UIApplication[.]shared[.]open' DriverHub --include='*.swift' || fail "cleartext links are opened externally"
grep -q 'websiteDataStore = .default()' DriverHub/WebViewModel.swift || fail "persistent WebKit store missing"
grep -q 'maximumBytes = 25' DriverHub/Downloads.swift || fail "bounded generated-file bridge missing"
grep -q 'mimeType == "application/pdf"' DriverHub/WebViewModel.swift || fail "PDF native preview routing missing"
grep -q 'popupWebView = popup' DriverHub/WebViewModel.swift || fail "managed popup handling missing"
pass "security and WebKit static checks passed"

if command -v identify >/dev/null; then
  geometry="$(identify -format '%wx%h' DriverHub/Assets.xcassets/AppIcon.appiconset/DriverHub-AppIcon-1024.png)"
  [[ "$geometry" == "1024x1024" ]] || fail "AppIcon is $geometry, expected 1024x1024"
  channels="$(identify -format '%[channels]' DriverHub/Assets.xcassets/AppIcon.appiconset/DriverHub-AppIcon-1024.png)"
  [[ "$channels" != *a* ]] || fail "AppIcon still contains an alpha channel ($channels)"
  pass "AppIcon is 1024x1024 and opaque"
else
  echo "SKIP: ImageMagick not installed; inspect AppIcon opacity on Mac"
fi

echo "Static DriverHub iPadOS validation completed successfully."