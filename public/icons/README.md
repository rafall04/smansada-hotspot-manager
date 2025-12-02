# PWA Icons

This directory should contain the following icon files for Progressive Web App support:

## Required Icons

1. **icon-192x192.png** (192x192 pixels)
   - Used for Android home screen icons
   - Used as Apple touch icon fallback

2. **icon-512x512.png** (512x512 pixels)
   - Used for Android splash screens
   - Used for PWA installation prompts

## Icon Design Guidelines

- **Background**: Use the primary theme color (#4f46e5) or a gradient
- **Icon**: Router/Network icon (matching the app's branding)
- **Style**: Clean, minimalist, high contrast
- **Format**: PNG with transparency support
- **Maskable**: Icons should be "maskable" (safe area in center, important content within 80% of icon)

## Quick Generation

You can generate these icons using:
- Online tools: https://www.pwabuilder.com/imageGenerator
- Design tools: Figma, Adobe Illustrator, Canva
- Command line: ImageMagick, Sharp

## Example Command (ImageMagick)

```bash
# Create 192x192 icon
convert input-icon.png -resize 192x192 public/icons/icon-192x192.png

# Create 512x512 icon
convert input-icon.png -resize 512x512 public/icons/icon-512x512.png
```

Note: Replace `input-icon.png` with your source icon file.

