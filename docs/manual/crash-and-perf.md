# Crash & performance

## Crash shield

- Har `console.error` production me Sentry ko forward hota hai
  (`installConsoleErrorForwarder` in `src/lib/sentry.ts`). Console noisy = Sentry noisy.
- Naya code `reportError(err, { surface })` use kare, bare `console.error` nahi.
- `catch {}` (empty) allowed nahi — kam se kam `reportError`.
- Noise suppression hamesha narrowest point par (`isExpectedCapacitorNoise`),
  global regex se nahi.

Known noise: `AbortError` (unmount), `Keyboard.setResizeMode UNIMPLEMENTED` (web
fallback), `ResizeObserver loop limit`.

## Performance

- Dashboard ab `HeroCarousel` + `UpcomingLiveSessions` + `UpcomingSchedule` ko
  `lazy()` + `Suspense` skeleton ke peechhe mount karta hai — pehla frame sirf
  header + active-course card. Low-end Android ka hitch isi se gaya.
- `Profile.tsx` ab khud fetch karta hai (pehle sirf cached `AuthContext` par
  depend karta tha aur hamesha skeleton me atak sakta tha) + bounded
  loading/error/retry.
- Query rules: `staleTime` set karein, list virtualize karein, blob URLs unmount
  par revoke karein.

## Debug on device

- `?debug=1` kisi bhi route par → last 50 console lines overlay.
- `scripts/logs-android.sh` / `scripts/logs-ios.sh` native logs.
