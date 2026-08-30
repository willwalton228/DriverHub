#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
npm install --legacy-peer-deps

echo "[post-merge] Running migrations..."
npx tsx server/migrations/runner.ts

echo "[post-merge] Done."
