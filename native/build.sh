#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${APP_OUTPUT_DIR:-${HOME}/Applications/Z-Library 阅读室.app}"
BUILD_DIR="$(mktemp -d /tmp/zlib-native-build.XXXXXX)"
trap 'rm -rf "$BUILD_DIR"' EXIT

mkdir -p "$BUILD_DIR/AppIcon.iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$PROJECT_DIR/public/app-icon.png" --out "$BUILD_DIR/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
  retina_size=$((size * 2))
  sips -z "$retina_size" "$retina_size" "$PROJECT_DIR/public/app-icon.png" --out "$BUILD_DIR/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$BUILD_DIR/AppIcon.iconset" -o "$BUILD_DIR/AppIcon.icns"
xcrun swiftc "$PROJECT_DIR/native/ReadingRoom.swift" -o "$BUILD_DIR/ReadingRoom" -framework AppKit -framework WebKit -module-cache-path /tmp/zlib-swift-cache
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources/runtime/public"
cp "$BUILD_DIR/ReadingRoom" "$APP_DIR/Contents/MacOS/ReadingRoom"
cp "$PROJECT_DIR/native/Info.plist" "$APP_DIR/Contents/Info.plist"
cp "$BUILD_DIR/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
cp "$PROJECT_DIR/server.mjs" "$APP_DIR/Contents/Resources/runtime/server.mjs"
cp "$PROJECT_DIR/public/"{index.html,app.js,style.css,app-icon.png} "$APP_DIR/Contents/Resources/runtime/public/"
rm -f "$APP_DIR/Contents/MacOS/launch"
codesign --force --sign - "$APP_DIR"
printf 'Built %s\n' "$APP_DIR"
