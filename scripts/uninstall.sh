#!/usr/bin/env bash
# ============================================================
# CCEE Uninstall Script
# Removes cron, systemd service, and runtime dirs.
# ============================================================

set -e

echo "=== CCEE Uninstaller ==="
echo ""
echo "WARNING: This will remove:"
echo "  - CCEE cron entry"
echo "  - ccee-review.service (if installed)"
echo "  - ~/.ccee/ runtime directories (runs, backups, repo-cache, test-env)"
echo ""
read -r -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Remove cron entry
echo "Removing cron entry..."
if crontab -l 2>/dev/null | grep -q "run-weekly.sh"; then
  crontab -l 2>/dev/null | grep -v "run-weekly.sh" | crontab -
  echo "  [OK] cron entry removed"
else
  echo "  [SKIP] no cron entry found"
fi

# Stop and remove systemd service
echo "Removing systemd service..."
if systemctl is-enabled ccee-review.service &>/dev/null 2>&1; then
  sudo systemctl stop ccee-review.service 2>/dev/null || true
  sudo systemctl disable ccee-review.service 2>/dev/null || true
  sudo rm -f /etc/systemd/system/ccee-review.service
  sudo systemctl daemon-reload
  echo "  [OK] ccee-review.service removed"
else
  echo "  [SKIP] ccee-review.service not installed"
fi

# Remove runtime dirs
echo "Removing runtime directories..."
for dir in "$HOME/.ccee/runs" "$HOME/.ccee/backups" "$HOME/.ccee/repo-cache" "$HOME/.ccee/test-env"; do
  if [ -d "$dir" ]; then
    rm -rf "$dir"
    echo "  [OK] removed $dir"
  else
    echo "  [SKIP] $dir not found"
  fi
done

# Remove parent if empty
rmdir "$HOME/.ccee" 2>/dev/null && echo "  [OK] removed ~/.ccee/" || true

echo ""
echo "=== CCEE uninstall complete ==="
echo ""
echo "Note: The project directory was NOT removed."
echo "Note: Obsidian staging (~/$HOME/ccee-obsidian-staging) was NOT removed."
