import type { CapacitorConfig } from '@capacitor/cli';

// Production APK ships fully self-contained from dist/. To run a live-reload
// dev build pointed at a sandbox URL, add a local `server.url` in an untracked
// override — do NOT commit it (the prior hard-coded URL leaked the wrong
// sandbox ID into the repo).

const config: CapacitorConfig = {
  appId: 'com.safarenglish.app',
  appName: 'Safar English Ka',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    // Enable WebView remote debugging (chrome://inspect) ONLY in dev builds.
    // Production APKs ship with this OFF so attackers can't attach a debugger.
    // Toggle locally by setting CAP_DEBUG=1 before `npm run build`.
    // Explicit `=== '1'` keeps the default `false` for every CI invocation.
    webContentsDebuggingEnabled: process.env.CAP_DEBUG === '1',
  },
  ios: {
    // Same rule for iOS — Safari Web Inspector available only in dev builds.
    webContentsDebuggingEnabled: process.env.CAP_DEBUG === '1',
  },
  server: {
    androidScheme: 'https',
    // Native document surfaces: allow these hosts to complete their internal
    // redirects when opened in Capacitor browser surfaces. Without this,
    // Drive/Docs/Notion can silently land on a white WebView.
    allowNavigation: [
      'drive.google.com',
      '*.google.com',
      '*.googleusercontent.com',
      '*.gstatic.com',
      '*.notion.site',
      '*.notion.so',
      '*.notion.com',
    ],
  },
  plugins: {
    SplashScreen: {
      // JS-controlled: SplashHider.tsx hides splash on first React paint
      // for the fastest possible cold-start. A 2s safety timeout in JS
      // guarantees the splash never hangs even if React fails to mount.
      launchAutoHide: false,
      launchFadeOutDuration: 200,
      backgroundColor: '#F7F4EE',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    // CapacitorUpdater (Capgo) removed — paid SaaS, not used. Updates ship via Play Store APK.
    StatusBar: {
      // Native defaults applied before JS boots so the first frame matches
      // the app theme (warm paper-white). Runtime overrides in nativeChrome.ts
      // re-apply on dark-mode toggle.
      style: 'LIGHT',
      backgroundColor: '#F7F4EE',
      // SA2: WebView flows behind the status bar; CSS env(safe-area-inset-top)
      // provides the visual gutter. Avoids double-padding (status-bar height +
      // safe-area inset) that occurred with `false` on notched devices.
      overlaysWebView: true,
    },
    Keyboard: {
      // `native` lets the WebView shrink so fixed footers stay visible
      // (paired with --nb-keyboard-h CSS var set by installKeyboardInsetTracker).
      resize: 'native',
      style: 'DEFAULT',
      resizeOnFullScreen: true,
      // Hide the iOS "Done" accessory bar above the keyboard — it overlaps
      // our input footers and is redundant with the native return key.
      accessoryBarVisible: false,
    },
  },
};

export default config;
