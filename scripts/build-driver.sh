#!/bin/bash
set -e
echo "🚕 Building Yala Driver..."

# Build React with driver environment
cd "$(dirname "$0")/../frontend"
cp .env.driver .env.local
npm run build

# Copy to Capacitor project
rm -rf ../driver-app/www
cp -r build ../driver-app/www

# Sync native plugins
cd ../driver-app
npx cap sync

echo "✅ Yala Driver build complete!"
echo "   Open in Xcode: npx cap open ios"
echo "   Open in Android Studio: npx cap open android"
