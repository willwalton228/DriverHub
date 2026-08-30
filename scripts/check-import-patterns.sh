#!/usr/bin/env bash
# ============================================================
# CI Guard: Filesystem-Scan Import Pattern Detector
# ============================================================
# Fails the build if any server-side code introduces patterns
# that scan the filesystem to auto-discover files for import.
# This prevents recurrence of the 2026-03-03 bulk import incident
# where attached_assets/ was scanned and 587 claims were silently
# imported without a user upload, mapping review, or approval.
#
# Usage:
#   bash scripts/check-import-patterns.sh
#
# Exit codes:
#   0 — No forbidden patterns found
#   1 — Forbidden pattern(s) detected (fails CI)
# ============================================================

set -euo pipefail

SEARCH_DIRS=("server" "shared")
EXCLUDE_DIRS=("node_modules" ".git" "dist" "build")

FORBIDDEN_PATTERNS=(
  "readdirSync.*attached_assets"
  "readdirSync.*tmp.*import"
  "readdirSync.*uploads.*import"
  "readdir.*attached_assets"
  "glob.*attached_assets.*xlsx"
  "glob.*attached_assets.*xls"
  "attached_assets.*endsWith.*xlsx"
  "attached_assets.*endsWith.*xls"
  "files\[files\.length.*-.*1\].*import"
  "last.*xlsx.*import"
  "last.*xls.*import"
)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "========================================================"
echo "  CI Guard: Filesystem-Scan Import Pattern Check"
echo "========================================================"
echo ""

FOUND=0

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  for dir in "${SEARCH_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
      continue
    fi

    matches=$(grep -rn \
      --include="*.ts" \
      --include="*.js" \
      --exclude-dir=node_modules \
      --exclude-dir=.git \
      --exclude-dir=dist \
      --exclude-dir=build \
      -E "$pattern" \
      "$dir" 2>/dev/null || true)

    if [ -n "$matches" ]; then
      echo -e "${RED}FAIL${NC}: Forbidden filesystem-scan import pattern detected:"
      echo -e "  Pattern: ${YELLOW}${pattern}${NC}"
      echo ""
      echo "$matches" | while IFS= read -r line; do
        echo -e "  ${RED}>${NC} $line"
      done
      echo ""
      FOUND=1
    fi
  done
done

if [ "$FOUND" -eq 0 ]; then
  echo -e "${GREEN}PASS${NC}: No filesystem-scan import patterns found."
  echo ""
  echo "  All import routes must require an explicit uploaded file"
  echo "  tied to an import batch record. Do not scan directories."
  echo ""
  exit 0
else
  echo "========================================================"
  echo -e "${RED}BUILD FAILED: Filesystem-scan import pattern detected${NC}"
  echo "========================================================"
  echo ""
  echo "  RULE: No import route may read from server filesystem"
  echo "  directories (attached_assets/, tmp/, uploads/, etc.)."
  echo "  Imports MUST require an explicit multipart file upload"
  echo "  tied to an import batch record."
  echo ""
  echo "  INCIDENT: On 2026-03-03, a filesystem-scan route silently"
  echo "  imported 587 claims without user review or approval."
  echo "  Use the Claims Import Wizard (/claims/import) instead."
  echo ""
  exit 1
fi
