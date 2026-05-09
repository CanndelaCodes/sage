# Sage Branding Assets - TODO

> **Status**: Placeholder emerald orb icons generated for all platforms.
> **Created**: February 6, 2026
> **Aesthetic**: JARVIS-inspired -- futuristic, clean, sophisticated

---

## Brand Specifications

### Color Palette

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Primary** | Emerald | `#14F195` | Logo, primary actions, highlights |
| **Background** | Charcoal | `#1A1A2E` | App background, dark surfaces |
| **Accent** | Cyan | `#00E5CC` | Secondary highlights, links, interactive elements |
| **Text Primary** | White | `#FFFFFF` | Primary text on dark backgrounds |
| **Text Secondary** | Gray | `#A0A0B0` | Secondary/muted text |
| **Error** | Red | `#EF4444` | Error states |
| **Success** | Emerald | `#14F195` | Success states (matches primary) |

### Typography

| Role | Font | Weight | Fallback |
|------|------|--------|----------|
| **Body** | Inter | 400 (Regular) | system-ui, -apple-system, sans-serif |
| **Headings** | Inter | 600 (SemiBold) | system-ui, -apple-system, sans-serif |
| **Code** | JetBrains Mono | 400 | ui-monospace, Menlo, Monaco, monospace |
| **UI Labels** | Inter | 500 (Medium) | system-ui, -apple-system, sans-serif |

### Logo Concept

**Abstract AI Orb** (JARVIS-inspired):
- Glowing emerald orb with subtle geometric patterns
- Represents S.A.G.E. (Sentient Adaptive Guidance Entity)
- Clean, futuristic, recognizable at small sizes
- Works on both dark and light backgrounds

---

## Completed Replacements

### SVG Assets (replaced with Sage emerald orb)

- [x] `ui/public/favicon.svg` -- Emerald orb with geometric rings and glow
- [x] `assets/avatar-placeholder.svg` -- Emerald orb on charcoal rounded rectangle
- [x] `docs/assets/pixel-lobster.svg` -- Pixel art emerald orb (retains pixel aesthetic)

### PNG Icons (generated from SVG via sharp)

- [x] `ui/public/favicon-32.png` (32x32)
- [x] `ui/public/apple-touch-icon.png` (180x180)
- [x] `ui/public/favicon.ico` (16+32 multi-size ICO)

### Chrome Extension Icons

- [x] `assets/chrome-extension/icons/icon16.png` (16x16)
- [x] `assets/chrome-extension/icons/icon32.png` (32x32)
- [x] `assets/chrome-extension/icons/icon48.png` (48x48)
- [x] `assets/chrome-extension/icons/icon128.png` (128x128)

### iOS App Icons (full set)

- [x] `apps/ios/Sources/Assets.xcassets/AppIcon.appiconset/icon-1024.png` (1024x1024)
- [x] All @1x, @2x, @3x sizes (20, 29, 40, 60, 76, 83.5 points)

### Android Launcher Icons (all densities)

- [x] `mipmap-mdpi/ic_launcher.png` (48x48)
- [x] `mipmap-hdpi/ic_launcher.png` (72x72)
- [x] `mipmap-xhdpi/ic_launcher.png` (96x96)
- [x] `mipmap-xxhdpi/ic_launcher.png` (144x144)
- [x] `mipmap-xxxhdpi/ic_launcher.png` (192x192)
- [x] All adaptive foreground icons (108-432px)

### macOS

- [x] `apps/macos/Icon.icon/Assets/sage-mac.png` (512x512)
- [x] `apps/macos/Sources/Sage/Resources/Sage.icns` (multi-size ICNS: 32-1024px)

### App Titles (text-only updates)

- [x] `ui/index.html` -- `<title>Sage Control</title>`
- [x] `assets/chrome-extension/manifest.json` -- name, description, default_title
- [x] `assets/chrome-extension/options.html` -- title, h1, body text
- [x] `apps/macos/Sources/Sage/Resources/Info.plist` -- CFBundleName + permission descriptions
- [x] `apps/ios/Sources/Info.plist` -- CFBundleDisplayName + permission descriptions
- [x] `apps/android/app/src/main/res/values/strings.xml` -- app_name
- [x] `docs/docs.json` -- site name, colors (#14F195), fonts (Inter), GitHub links
- [x] `appcast.xml` -- channel title

---

## Still Needs Professional Design

These items have placeholder content but should be replaced with professional designs:

| File | Current State | Needs |
|------|---------------|-------|
| `assets/dmg-background.png` | Original OpenClaw DMG bg | Sage-branded DMG installer background |
| `assets/dmg-background-small.png` | Original OpenClaw DMG bg | Sage-branded DMG background (small) |
| `docs/assets/sage-logo-text.png` | Original renamed file | Sage logo with wordmark (light bg) |
| `docs/assets/sage-logo-text-dark.png` | Original renamed file | Sage logo with wordmark (dark bg) |
| `README-header.png` | Original renamed file | Sage GitHub banner header |
| All SVGs/PNGs above | Programmatic placeholder | Professional designer refinement |

---

## Design Notes

- All icons work at minimum 16x16 (recognizable emerald circle)
- SVG preferred where supported (scales perfectly)
- Emerald orb has subtle glow effect on charcoal (#1A1A2E) background
- Android adaptive icons have separate foreground (orb only) + background layers
- macOS ICNS includes all standard sizes (32, 64, 128, 256, 512, 1024)
- iOS requires exact sizes per Apple HIG (all generated)
- The S.A.G.E. character (full mascot) is separate from the app icon/logo
- The web Control UI uses **Lit web components** (not React) -- CSS custom properties for theming
- The docs site uses **Mintlify** -- updated to Inter font and emerald (#14F195) colors
