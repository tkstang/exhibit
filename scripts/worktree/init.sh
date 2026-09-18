#!/usr/bin/env bash
# Bootstrap only this checkout; Exhibit config and password receipts stay in user state.
set -euo pipefail

current_root="$(git rev-parse --show-toplevel)"
common_git_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
main_root="$(cd "${common_git_dir}/.." && pwd -P)"
cd "$current_root"

if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  echo "Use Node 24 (nvm use) before running worktree:init." >&2
  exit 1
fi

# Copy only missing local configuration; never replace worktree-specific settings.
if [[ "$current_root" != "$main_root" ]]; then
  for relative in .env .env.local .oat/config.local.json .mcp.json .claude/settings.local.json .cursor/mcp.json; do
    source_file="${main_root}/${relative}"
    target_file="${current_root}/${relative}"
    if [[ -f "$source_file" && ! -L "$source_file" && ! -e "$target_file" && ! -L "$target_file" ]]; then
      mkdir -p "$(dirname "$target_file")"
      (umask 077; cp -p "$source_file" "$target_file")
      chmod 600 "$target_file"
      echo "copied local config: ${relative}"
    fi
  done
fi

pnpm install --frozen-lockfile
pnpm run prepare
pnpm run build

if command -v oat >/dev/null 2>&1 && [[ -d .oat ]]; then
  if [[ "$current_root" != "$main_root" ]]; then
    (cd "$main_root" && oat local sync "$current_root")
  fi
  oat sync --scope project
  oat pjm doctor --json
  # Archive downloads use credentials; opt in explicitly, as in the other repo bootstraps.
  if [[ "${SYNC_S3_ARCHIVES:-0}" == "1" && "${SKIP_S3_ARCHIVE_SYNC:-0}" != "1" ]]; then
    oat repo archive sync
  fi
fi

echo "Worktree initialized. Browser setup: pnpm exec playwright install chromium"
