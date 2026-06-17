# Yala Store Listing Assets

Production-ready marketing assets for Google Play Store and Apple App Store.

## Directory Structure

```
assets/store/
├── README.md                          ← You are here
├── rider/
│   ├── feature-graphic.svg            ← 1024x500 (Google Play)
│   ├── screenshot-1-booking.svg       ← Phone screenshot: Ride booking
│   ├── screenshot-2-tracking.svg      ← Phone screenshot: Live tracking
│   ├── screenshot-3-safety.svg        ← Phone screenshot: Safety center
│   └── store-listing.md              ← Full store description + metadata
├── driver/
│   ├── feature-graphic.svg            ← 1024x500 (Google Play)
│   ├── screenshot-1-dashboard.svg     ← Phone screenshot: Earnings dashboard
│   ├── screenshot-2-workflow.svg      ← Phone screenshot: Ride workflow
│   └── store-listing.md              ← Full store description + metadata
```

## Converting SVGs to PNG

### Option 1: Using sharp (Node.js)
```bash
npm install sharp
node scripts/generate-store-assets.js
```

### Option 2: Using Inkscape (CLI)
```bash
inkscape --export-type=png --export-width=1024 --export-height=500 assets/store/rider/feature-graphic.svg
inkscape --export-type=png --export-width=1080 --export-height=1920 assets/store/rider/screenshot-1-booking.svg
```

### Option 3: Using rsvg-convert (Linux/macOS)
```bash
rsvg-convert -w 1024 -h 500 assets/store/rider/feature-graphic.svg > feature-graphic.png
rsvg-convert -w 1080 -h 1920 assets/store/rider/screenshot-1-booking.svg > screenshot-1.png
```

### Option 4: Any SVG editor
Open SVGs in Figma, Illustrator, or Canva and export as PNG.

## Required Sizes

### Google Play Store
| Asset | Size | Format |
|-------|------|--------|
| Feature Graphic | 1024×500 | PNG or JPEG |
| Phone Screenshots | 1080×1920 (minimum 320px on short side) | PNG or JPEG |
| Tablet Screenshots | 1920×1200 (7" min) | PNG or JPEG |
| App Icon | 512×512 | PNG (32-bit, no alpha) |

### Apple App Store
| Asset | Size | Format |
|-------|------|--------|
| iPhone 6.5" Screenshots | 1242×2688 or 1284×2778 | PNG or JPEG |
| iPad Pro 12.9" Screenshots | 2048×2732 | PNG or JPEG |
| App Icon | 1024×1024 (no rounded corners) | PNG |

## Branding Reference

### Yala Rider
- **Primary:** Green #00A651
- **Background:** White or light green #E8F5E9
- **Identity:** Map pin + "Y" logo
- **Tagline:** "Ride Anywhere in Mauritania"

### Yala Driver
- **Primary:** Gold #D4AF37
- **Background:** Dark Navy #0B1220
- **Identity:** Steering wheel + "Y" logo
- **Tagline:** "Earn Money. Drive with Yala."

## Languages

Store descriptions should be translated to:
- **French** (primary language in Mauritania)
- **Arabic** (official language)
- **English** (international)
