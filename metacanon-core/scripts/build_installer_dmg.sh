#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/installer-ui/desktop"
BUNDLE_APP_PATH="$APP_DIR/src-tauri/target/release/bundle/macos/MetaCanon Installer.app"
OUTPUT_DIR="$ROOT_DIR/deliverables/installer-packages"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DMG_BASENAME="MetaCanon-Installer-macos-arm64-${TIMESTAMP}"
FINAL_DMG_PATH="$OUTPUT_DIR/${DMG_BASENAME}.dmg"
CHECKSUM_PATH="$FINAL_DMG_PATH.sha256"
SIGNING_IDENTITY="${METACANON_CODESIGN_IDENTITY:-}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

require_cmd npm
require_cmd cargo
require_cmd codesign
require_cmd hdiutil
require_cmd xattr
require_cmd shasum
require_cmd ditto

cd "$APP_DIR"
if [[ ! -d node_modules ]]; then
  echo "==> Installing npm dependencies"
  npm install
fi

echo "==> Building MetaCanon Installer bundle"
npm run tauri:build

if [[ ! -d "$BUNDLE_APP_PATH" ]]; then
  echo "error: app bundle not found at $BUNDLE_APP_PATH" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
WORK_DIR="$(mktemp -d /tmp/metacanon-dmg-build-XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

STAGING_DIR="$WORK_DIR/staging"
STAGED_APP_PATH="$STAGING_DIR/MetaCanon Installer.app"
RW_DMG_PATH="$WORK_DIR/${DMG_BASENAME}-rw.dmg"

mkdir -p "$STAGING_DIR"
ditto "$BUNDLE_APP_PATH" "$STAGED_APP_PATH"

# Remove Finder/file-provider metadata that can invalidate signatures on other machines.
xattr -cr "$STAGED_APP_PATH"

if [[ -n "$SIGNING_IDENTITY" ]]; then
  echo "==> Signing app with identity: $SIGNING_IDENTITY"
  codesign --force --deep --options runtime --timestamp --sign "$SIGNING_IDENTITY" "$STAGED_APP_PATH"
else
  echo "==> Signing app ad-hoc (set METACANON_CODESIGN_IDENTITY for Developer ID signing)"
  codesign --force --deep --sign - "$STAGED_APP_PATH"
fi

echo "==> Verifying app signature"
codesign --verify --deep --strict --verbose=2 "$STAGED_APP_PATH"

ln -s /Applications "$STAGING_DIR/Applications"

echo "==> Creating DMG"
hdiutil create -volname "MetaCanon Installer" -srcfolder "$STAGING_DIR" -ov -format UDRW "$RW_DMG_PATH" >/dev/null
hdiutil convert "$RW_DMG_PATH" -format UDZO -imagekey zlib-level=9 -o "$FINAL_DMG_PATH" >/dev/null

# Remove nonessential metadata on the final artifact.
xattr -c "$FINAL_DMG_PATH" || true
shasum -a 256 "$FINAL_DMG_PATH" > "$CHECKSUM_PATH"

echo "==> DMG ready"
echo "$FINAL_DMG_PATH"
echo "$CHECKSUM_PATH"
