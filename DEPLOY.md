# Deployment Guide - Sadguru Coaching Classes PWA

## Prerequisites
- Node.js 18+ and npm/bun installed
- A Lovable Cloud project (backend is auto-provisioned)

## Local Development
```bash
npm install
npm run dev
```

## Build for Production
```bash
npm run build
```
This creates an optimized `dist/` folder with PWA assets (service worker, manifest, icons).

## Deployment Options

### 1. Lovable Cloud (Recommended)
Click **Publish** in the Lovable editor. Your app is instantly live with HTTPS and PWA support.

### 2. Vercel
```bash
npm i -g vercel
vercel --prod
```
The included `vercel.json` handles SPA routing.

### 3. Netlify
1. Connect your GitHub repo on [netlify.com](https://netlify.com)
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add a `_redirects` file in `public/`: `/* /index.html 200`

### 4. Static Hosting (Nginx, Apache, etc.)
Serve the `dist/` folder. Ensure all routes fallback to `index.html` for SPA routing.

### 5. Android APK (Capacitor)
See [`docs/APK-BUILD-GUIDE.md`](docs/APK-BUILD-GUIDE.md) for the full step-by-step guide.

Quick summary:
```bash
npm install
npm run build
npx cap add android
npx cap sync
npx cap open android
# Build → Build APK in Android Studio
```

## PWA Installation
Once deployed with HTTPS:
- **Android**: Browser menu → "Install app" or "Add to Home Screen"
- **iOS**: Safari → Share → "Add to Home Screen"
- **Desktop**: Click the install icon in the browser address bar
- Visit `/install` in the app for a guided installation walkthrough

## Environment Variables
| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Auto-set by Lovable Cloud |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Auto-set by Lovable Cloud |

## Post-Deployment Checklist
- [ ] Verify PWA installs on mobile
- [ ] Check service worker registers (`/sw.js`)
- [ ] Test offline fallback
- [ ] Confirm app icon and splash screen appear correctly
- [ ] Test APK installation on Android device (if generated)
