#!/bin/bash
set -e
echo "🚗 Building Yala Rider..."

# Build React with rider environment
cd "$(dirname "$0")/../frontend"
cp .env.rider .env.local
npm run build

# Copy to Capacitor project
rm -rf ../rider-app/www
cp -r build ../rider-app/www

# Sync native plugins
cd ../rider-app
npx cap sync

echo "✅ Yala Rider build complete!"
echo "   Open in Xcode: npx cap open ios"
echo "   Open in Android Studio: npx cap open android"
