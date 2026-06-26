---
name: tailwind-capacitor
description: Tailwind v3 patterns for the Naveen Bharat Capacitor app — touch targets, dvh units, dark mode synced with native StatusBar, keyboard inset var, reduced-motion. Use when styling mobile screens or fixing layout issues that only show up in the APK.
---

# Tailwind for Capacitor — Naveen Bharat

Project stack: Tailwind v3 + Radix (no Ionic, no Konsta). Design tokens live in `src/index.css` and `tailwind.config.ts`. **Never** use raw color classes like `bg-white` / `text-black` in components — always go through semantic tokens (`bg-background`, `text-foreground`, etc.).

## When to Use

- Adding a new screen or component
- "Looks fine in browser, broken in APK"
- Buttons too small to tap on a real phone
- Keyboard covers the submit button
- Dark mode doesn't theme the status bar

## The Non-Negotiables

### 1. Touch targets ≥ 44×44

```tsx
// Icon-only button — pad to 44px even if the icon is 20px
<button className="min-h-11 min-w-11 inline-flex items-center justify-center">
  <Icon className="h-5 w-5" />
</button>
```

### 2. Height: `100dvh`, never `100vh`

`100vh` is wrong on iOS (Safari toolbar) and Android (keyboard). Use the dynamic variant:

```tsx
<div className="min-h-dvh">…</div>     // ✅
<div className="min-h-screen">…</div>  // ❌ on mobile
```

### 3. Keyboard inset variable

`installKeyboardInsetTracker()` sets `--nb-keyboard-h` on `<html>`. Use it to push fixed footers above the keyboard:

```tsx
<div
  className="fixed bottom-0 inset-x-0 safe-area-bottom"
  style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + var(--nb-keyboard-h, 0px))' }}
>
  <Button>Save</Button>
</div>
```

### 4. Safe areas

See the `safe-area-handling` skill. TL;DR: `.safe-area-top` on top bars, `.safe-area-bottom` on bottom bars.

### 5. Dark mode + native StatusBar

The Tailwind `dark:` variant alone is not enough — the native StatusBar must match. `src/lib/nativeChrome.ts` handles this; when toggling theme, call `applyNativeChrome(theme)` so the status bar text color flips with the UI.

### 6. Reduced motion

Wrap framer-motion intros so the OS preference is respected:

```tsx
import { useReducedMotion } from 'framer-motion';
const reduced = useReducedMotion();
<motion.div animate={reduced ? {} : { opacity: 1, y: 0 }} />
```

### 7. Hover is desktop-only

Don't gate behavior on `:hover` — touch devices fire it sticky. Use `active:` and explicit press states.

```tsx
<button className="active:scale-95 transition-transform hover:bg-accent">
```

## Tailwind config snippets that matter

```ts
// tailwind.config.ts (already in repo)
theme: {
  extend: {
    minHeight: { 'dvh': '100dvh' },
    height:    { 'dvh': '100dvh' },
    spacing:   { 'safe-top': 'env(safe-area-inset-top)' },
  },
},
```

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Layout jumps when keyboard opens | Fixed footer ignores `--nb-keyboard-h` | Use the calc() pattern above |
| Status bar text invisible in dark mode | `applyNativeChrome` not called on toggle | Wire it in `ThemeContext` |
| Bottom of page hidden by gesture bar | `min-h-screen` used | Switch to `min-h-dvh` + `safe-area-bottom` |
| Tap registers twice on Android | 300 ms tap delay because no `touch-action` | Add `touch-action: manipulation` (already in `src/index.css` body) |
| Component uses `text-white` directly | Bypasses theme tokens | Refactor to `text-primary-foreground` etc. |

## Verify

1. APK on a real phone — every interactive element passes the "tap with thumb" test.
2. Open any form, focus an input — submit button stays visible above the keyboard.
3. Toggle dark mode — status bar icons flip color.
4. Rotate device — no jump, no clipped content.

## Related

- `safe-area-handling`
- `capacitor-keyboard`
- `capacitor-accessibility`
