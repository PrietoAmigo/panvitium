#!/bin/bash
set -euo pipefail

# Install workspace dependencies so tests, linters and typecheck work in
# Claude Code on the web sessions. Web-only (skip locally), idempotent.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Activate the pinned pnpm (packageManager field) if corepack is present.
corepack enable >/dev/null 2>&1 || true

# --frozen-lockfile is reproducible and cache-friendly (keeps node_modules).
pnpm install --frozen-lockfile
