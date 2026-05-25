#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SRC_DIR/dist-package"

FILES=(
  manifest.json
  settings.js
  content.js
  overlay.css
  popup.html
  popup.css
  popup.js
  options.html
  options.css
  options.js
)

ICON_DIR="assets/icons"
ICON_FILES=(
  icon-16.png
  icon-32.png
  icon-48.png
  icon-128.png
)

echo "[INFO] Source: $SRC_DIR"
echo "[INFO] Output: $DIST_DIR"

if [ -d "$DIST_DIR" ]; then
  echo "[INFO] Removing existing dist-package..."
  rm -rf "$DIST_DIR"
fi

mkdir -p "$DIST_DIR"

for file in "${FILES[@]}"; do
  if [ ! -f "$SRC_DIR/$file" ]; then
    echo "[ERROR] Missing required file: $file"
    exit 1
  fi
done

for file in "${ICON_FILES[@]}"; do
  if [ ! -f "$SRC_DIR/$ICON_DIR/$file" ]; then
    echo "[ERROR] Missing required icon: $ICON_DIR/$file"
    exit 1
  fi
done

for file in "${FILES[@]}"; do
  cp "$SRC_DIR/$file" "$DIST_DIR/"
done

mkdir -p "$DIST_DIR/$ICON_DIR"
cp "$SRC_DIR/$ICON_DIR/"* "$DIST_DIR/$ICON_DIR/"

echo "[INFO] Package folder created successfully."
echo "[INFO] Files:"
ls -1 "$DIST_DIR"
