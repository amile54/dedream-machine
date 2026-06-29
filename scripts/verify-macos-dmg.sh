#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <path-to-dmg>" >&2
  exit 2
fi

dmg_path="$1"
if [[ ! -f "$dmg_path" ]]; then
  echo "DMG not found: $dmg_path" >&2
  exit 2
fi

mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/dedream-dmg-verify.XXXXXX")"
cleanup() {
  hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
  rm -rf "$mount_dir"
}
trap cleanup EXIT

hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_dir" -quiet

app_path="$(find "$mount_dir" -maxdepth 1 -type d -name '*.app' -print -quit)"
if [[ -z "$app_path" ]]; then
  echo "No .app bundle found in DMG: $dmg_path" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$app_path"
