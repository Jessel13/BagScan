# BagScan 🛒

Scan your groceries **before** dropping them in your bag. At checkout, show each barcode from your phone screen to the Sheng Siong self-checkout kiosk — no unpacking needed.

## How it works

1. Tap **Start scanning** and point your camera at each item's barcode
2. The app looks up the product name automatically (Open Food Facts)
3. Enter the shelf price once — the app remembers it forever
4. Drop the item in your bag and scan the next one
5. At the kiosk, tap **Go to checkout** and step through each barcode

## Features

- Live EAN-13 barcode scanning via phone camera
- Auto product name lookup (no typing)
- Price memory — type once, remembered for all future trips
- Handles weighed items (price-embedded barcodes starting with 2)
- Checkout mode — full-screen barcodes optimised for kiosk scanners
- Works offline for returning items (only lookup needs internet)
- Installable as a home screen app (PWA)
- ~50KB storage used on device — invisible

## Tech stack

| Tool | Purpose | Cost |
|------|---------|------|
| ZXing-js | Camera barcode scanning | Free |
| Open Food Facts API | Product name lookup | Free |
| JsBarcode | EAN-13 barcode display | Free |
| localStorage | Remember items on device | Built-in |
| GitHub Pages | Hosting | Free |

## Setup & deploy to GitHub Pages

### 1. Fork or upload this repo to GitHub

### 2. Enable GitHub Pages
- Go to your repo → **Settings** → **Pages**
- Under **Source**, select **Deploy from a branch**
- Choose **main** branch, **/ (root)** folder
- Click **Save**

### 3. Your app is live at:
```
https://YOUR-USERNAME.github.io/bagscan/
```

Open this URL on your phone. Tap **Add to Home Screen** in your browser menu to install it like an app.

## Tested at

Sheng Siong supermarkets with self-checkout kiosks (no weight sensor).

## Notes

- Camera permission is required for scanning
- Price lookup is not available — Sheng Siong prices are not in any public database
- Loose produce must be weighed and stickered by store staff before scanning
- Set phone to maximum brightness in checkout mode for best kiosk scan results
