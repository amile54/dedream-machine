#!/usr/bin/env bash
set -euo pipefail

target="${1:-aarch64-apple-darwin}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
bundle_root="$repo_root/src-tauri/target/$target/release/bundle"

app_path="$(find "$bundle_root/macos" -maxdepth 1 -type d -name '*.app' -print -quit 2>/dev/null || true)"
dmg_path="$(find "$bundle_root/dmg" -maxdepth 1 -type f -name '*.dmg' -print -quit 2>/dev/null || true)"

if [[ -z "$app_path" ]]; then
  echo "No .app bundle found under $bundle_root/macos" >&2
  exit 1
fi

if [[ -z "$dmg_path" ]]; then
  echo "No DMG found under $bundle_root/dmg" >&2
  exit 1
fi

app_name="$(basename "$app_path")"
volume_name="${app_name%.app}"

echo "Clearing extended attributes: $app_path"
xattr -cr "$app_path" || true

echo "Ad-hoc signing executable payloads"
while IFS= read -r executable; do
  codesign --force --sign - "$executable"
done < <(find "$app_path/Contents/MacOS" -type f -perm -111 -print)

echo "Ad-hoc signing app bundle: $app_path"
codesign --force --deep --sign - "$app_path"
codesign --verify --deep --strict --verbose=2 "$app_path"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/dedream-dmg-rebuild.XXXXXX")"
stage_dir="$work_dir/stage"
tmp_dmg="$work_dir/$volume_name.dmg"
cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

mkdir -p "$stage_dir"
ditto "$app_path" "$stage_dir/$app_name"
ln -s /Applications "$stage_dir/Applications"

echo "Rebuilding DMG: $dmg_path"
hdiutil create \
  -volname "$volume_name" \
  -srcfolder "$stage_dir" \
  -ov \
  -format UDZO \
  "$tmp_dmg"
mv "$tmp_dmg" "$dmg_path"

"$script_dir/verify-macos-dmg.sh" "$dmg_path"
