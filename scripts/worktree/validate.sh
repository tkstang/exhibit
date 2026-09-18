#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

assert_clean() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Worktree must be clean before and after validation." >&2
    git status --short
    exit 1
  fi
}

assert_clean
pnpm check
pnpm test:browser
pnpm test:package
assert_clean
