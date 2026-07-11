#!/usr/bin/env bash
# Local APK build script — mirrors .github/workflows/build-apk.yml
# Usage: ./scripts/build-apk-local.sh
set -euo pipefail

echo "🔍 Checking prerequisites..."
command -v node >/dev/null || { echo "❌ Node.js not found. Install Node 22 LTS."; exit 1; }
command -v java >/dev/null || { echo "❌ Java not found. Install JDK 21 (Temurin)."; exit 1; }
[ -n "${ANDROID_HOME:-}" ] || { echo "❌ ANDROID_HOME not set. Install Android Studio + SDK 35."; exit 1; }

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
[ "$NODE_MAJOR" = "22" ] || echo "⚠️  Node $NODE_MAJOR detected; workflow uses Node 22. Continuing..."

JAVA_MAJOR=$(java -version 2>&1 | head -n1 | sed -E 's/.*"([0-9]+).*/\1/')
[ "$JAVA_MAJOR" = "21" ] || echo "⚠️  Java $JAVA_MAJOR detected; workflow uses JDK 21. Continuing..."

echo ""
echo "📦 Installing npm dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund

echo ""
echo "🔍 TypeScript typecheck..."
npx tsc --noEmit -p tsconfig.app.json

echo ""
echo "🏗️  Building web app..."
npm run build

echo ""
echo "🔄 Syncing Capacitor (dist → android)..."
npx cap sync android

echo ""
echo "🔧 Making gradlew executable..."
chmod +x android/gradlew

echo ""
echo "🤖 Building Debug APK (this can take a few minutes)..."
( cd android && ./gradlew assembleDebug --no-daemon --parallel --build-cache )

APK="android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  SIZE=$(du -sh "$APK" | cut -f1)
  echo ""
  echo "✅ APK built successfully!"
  echo "   Path: $APK"
  echo "   Size: $SIZE"
  echo ""
  echo "📲 Install on device:"
  echo "   adb install -r $APK"
else
  echo "❌ APK not found at $APK"
  exit 1
fi
