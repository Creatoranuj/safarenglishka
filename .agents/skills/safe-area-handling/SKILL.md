---
name: safe-area-handling
description: Handle notch, Dynamic Island, status bar, and Android gesture bar safe areas in the Naveen Bharat Capacitor app using Tailwind utilities, CSS env() insets, and StatusBar config. Use when UI is clipped by the notch, hidden behind the status bar, or overlapping the Android gesture pill.
---

# Safe Area Handling — Naveen Bharat

This project uses Tailwind v3 + Radix, not Ionic. Safe-area work is done with CSS env() variables and the project's `.safe-area-*` utility classes.

## When to Use

- "Header is hidden under the status bar"
- "Buttons cut off at the bottom on iPhone 15"
- "Bottom nav overlaps the Android gesture bar"
- Adding any `fixed` / `sticky` / `absolute` element that touches a screen edge

## How it's wired in this project

1. **`index.html`** has `<meta name="viewport" content="..., viewport-fit=cover">` — required for `env(safe-area-inset-*)` to be non-zero on iOS.
2. **`capacitor.config.ts`** sets `StatusBar.overlaysWebView: false` — the WebView is inset below the status bar on Android by default. Flip to `true` only when you want a true edge-to-edge layout, and then YOU must add `pt-[env(safe-area-inset-top)]` to the top container.
3. **`src/index.css`** defines the utilities you should use everywhere:
   ```css
   .safe-area-top    { padding-top:    env(safe-area-inset-top); }
   .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
   .safe-area-left   { padding-left:   env(safe-area-inset-left); }
   .safe-area-right  { padding-right:  env(safe-area-inset-right); }
   ```

## The Rules

- **Every `fixed` / `sticky` element that touches the top edge** → add `.safe-area-top` (or `pt-[env(safe-area-inset-top)]` Tailwind arbitrary).
- **Every `fixed` bottom bar / FAB** → add `.safe-area-bottom`.
- **Modals / sheets** that go full-bleed → apply both; Radix sheets do not auto-inset.
- **Fullscreen overlays** (PDF viewer, video player) → choose: keep status bar visible (default) OR call `StatusBar.hide()` on enter / `show()` on exit. Don't half-do it.
- **Never** use `100vh` — Android keyboard + iOS dynamic toolbar both break it. Use `100dvh` or the project's `--nb-keyboard-h` var pattern.

## Quick snippets

```tsx
// Top app bar
<header className="fixed top-0 inset-x-0 safe-area-top bg-background z-40">…</header>

// Bottom tab bar
<nav className="fixed bottom-0 inset-x-0 safe-area-bottom bg-background border-t">…</nav>

// Sheet content
<SheetContent className="safe-area-bottom pb-4">…</SheetContent>

// Floating Action Button on the bottom-right
<button className="fixed bottom-4 right-4" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
```

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Insets are 0 on iOS | Missing `viewport-fit=cover` | Add it to the viewport meta |
| Insets are 0 on Android | `overlaysWebView: false` (WebView already inset) — this is correct; don't add `.safe-area-top` then | Only use insets when WebView truly overlays |
| Bottom bar still clipped | Used `mb-4` instead of `safe-area-bottom` | Replace |
| Modal scroll content hidden behind keyboard | No `--nb-keyboard-h` accounting | See `capacitor-keyboard` skill |

## Verify

1. Run on a notched device (iPhone 14+ or Pixel 7+).
2. Header content should sit fully below the status bar / Dynamic Island.
3. Tap the very bottom of any FAB / nav — it must register, not be eaten by the gesture pill.
4. Rotate to landscape — insets must update; nothing should jump.

## Related

- `capacitor-keyboard` — keyboard inset var
- `tailwind-capacitor` — touch targets, dvh
- `capacitor-splash-screen` — first-paint color must match status bar
