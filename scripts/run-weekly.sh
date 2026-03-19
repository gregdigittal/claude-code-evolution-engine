#!/usr/bin/env bash
# ============================================================
# CCEE Weekly Pipeline Runner
# Called by cron: 0 0 * * 0 (Sunday 00:00 UTC = 02:00 SAST)
# ============================================================

set -e

# Ensure PATH includes Node, npm global bins, and ~/.local/bin (yt-dlp)
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$HOME/.ccee/runs"
RUN_DATE="$(date -u +%Y-%m-%d)"
LOG_FILE="$LOG_DIR/cron.log"

mkdir -p "$LOG_DIR"

echo "" >> "$LOG_FILE"
echo "=== CCEE CRON RUN START: $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG_FILE"

cd "$PROJECT_DIR"

# Run full pipeline
npm run ccee:run >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

echo "=== CCEE CRON RUN END: $(date -u +%Y-%m-%dT%H:%M:%SZ) (exit: $EXIT_CODE) ===" >> "$LOG_FILE"

exit $EXIT_CODE
