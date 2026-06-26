---
name: capacitor-video-player-master
description: Master architecture for Capacitor/web video players — gesture grammar, controls auto-hide state machine, and synchronization between player chrome and the Android system navigation bar (immersive mode). Apply whenever building, auditing, or fixing tap-to-toggle controls, fullscreen UX, swipe gestures, or nav-bar peek behavior in a Mahima/MX/YouTube-style player.
---

# Capacitor Video Player — Master Skill

A production video player has THREE independent visibility surfaces that must stay in sync:

1. **Player chrome** (top bar, seek bar, play button) — owned by `useAutoHideControls`.
2. **Android system nav bar + status bar** — owned by `AndroidImmersive` bridge.
3. **Gesture overlay** (taps / double-taps / swipes / long-press) — owned by the touch handlers on the ghost overlay.

The drawback this skill exists to prevent: **chrome and the system nav bar drift out of sync**. Classic symptom — user is in fullscreen, taps to bring controls back, sees the top "back" arrow but the Android system back gesture is still hidden because immersive mode was never released.

## The Golden Rule

> In fullscreen, system nav bar visibility MUST equal player chrome visibility.

When `showControls === true` → call `exitImmersive()` (system bars peek).
When `showControls === false` → call `enterImmersive()` (sticky immersive).
Outside fullscreen, the global `installImmersiveAutoToggle()` MutationObserver owns state — do not fight it.

Wire it once, near the controls hook:

```ts
useEffect(() => {
  if (!isFakeFullscreen) return;
  if (showControls) exitImmersive();
  else enterImmersive();
}, [isFakeFullscreen, showControls]);
```

## Controls State Machine (`useAutoHideControls`)

| Input | Action |
|---|---|
| `kick()` | clear `userHiddenRef`, show, arm 3s timer if playing+unlocked |
| `forceHide()` | set `userHiddenRef`, hide immediately |
| `toggle()` | if visible → forceHide; else kick |
| isLocked flips ON | show (unless `userHiddenRef`) and clear timer |
| isPlaying false → true | arm timer (don't force-show if user hid) |
| isPlaying true → false | reveal once, clear timer |

`isLocked` is the union of: `menuOpen || seekDrag || lastTenSeconds || endScreen || !playerReady || isBuffering`.

**Critical invariant:** an explicit user hide (`forceHide` via tap) must SURVIVE transient lock flips (a 200ms buffering blip on rotation must not yank chrome back).

## Gesture Grammar (single overlay, touchStart → touchEnd)

| Gesture | Trigger | Result |
|---|---|---|
| Single tap | `touchEnd` with no swipe lock, no double, no long-press | `toggleControls()` |
| Double tap center | 2 taps <300ms in middle 30% axis | `togglePlay()` (no skip ripple) |
| Double tap edge | 2 taps <300ms on same side | `skip ±10s` + ripple |
| Long press (500ms) | timer fires before any move | 2× speed until release |
| Vertical swipe (left half) | locked when `vertMag > horizMag && vertMag > 8` | brightness |
| Vertical swipe (right half) | same lock, right side | volume |
| Horizontal swipe (landscape only) | `horizMag > vertMag*1.5 && horizMag > 20` | scrub ±60s |

**Why defer tap-toggle to `touchEnd`:** toggling on `touchStart` flashes chrome at the start of every swipe/double-tap/long-press. Use `suppressTapToggleRef` set true by swipe lock, double-tap branch, or long-press timer.

**Rotation-aware axes:** when using CSS `transform: rotate(90/180/270)` for pseudo-fullscreen, remap `(deltaX, deltaY) → (gHoriz, gVert)` BEFORE classifying the gesture. Otherwise a vertical volume swipe in landscape gets misread as a seek.

```
rotation=90 : gVert = -deltaX, gHoriz =  deltaY
rotation=270: gVert =  deltaX, gHoriz = -deltaY
rotation=180: gVert = -deltaY, gHoriz = -deltaX
rotation=0  : gVert =  deltaY, gHoriz =  deltaX
```

## WebView Hardening (Android)

On the overlay element:

```tsx
style={{
  touchAction: 'manipulation',      // kills 300ms double-tap-zoom delay
  WebkitTapHighlightColor: 'transparent',
}}
onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
onDragStart={(e) => e.preventDefault()}
```

If a touch lands on a child `<button>` or `[data-player-control="true"]`, set `touchStartedOnControlRef = true` and **return early** — never let gesture logic compete with control taps.

## Back-Button Integration

In fullscreen + rotated, the first hardware-back press should reset rotation to 0° / exit fullscreen — not pop the route. Push a sentinel `history.pushState({ rotationGuard: true }, '')` and intercept `popstate`. This is separate from the global `useAndroidBackButton` singleton — do NOT register a second `App.addListener('backButton', …)`.

## Audit Checklist (apply when reviewing any player)

- [ ] Single `useAutoHideControls` instance; no parallel `setShowControls` writes
- [ ] `isLocked` enumerates every transient lock (buffering, menus, seek, end screen, not-ready, last-10s)
- [ ] `userHiddenRef` survives lock flips
- [ ] Tap-toggle is on `touchEnd`, not `touchStart`
- [ ] `suppressTapToggleRef` set by: child-control hit, swipe lock, double-tap branch, long-press
- [ ] Rotation-aware axis remap before mode classification
- [ ] `touchAction: 'manipulation'` on overlay
- [ ] In fullscreen, `exitImmersive` on show / `enterImmersive` on hide
- [ ] Hardware back resets rotation before navigating
- [ ] No second `App.backButton` listener registered by the player

## File Map (this project)

- `src/components/video/MahimaGhostPlayer.tsx` — main player, owns gestures + chrome sync
- `src/components/video/hooks/useAutoHideControls.ts` — state machine
- `src/lib/androidImmersive.ts` — JS bridge to MainActivity ImmersiveBridge
- `src/lib/screenOrientation.ts` — native landscape lock
- `src/hooks/useAndroidBackButton.ts` — global singleton, DO NOT duplicate

## Done When

- Audit checklist passes on `MahimaGhostPlayer`
- Tap-to-show in fullscreen reveals BOTH chrome AND system nav bar
- Tap-to-hide restores sticky immersive
- Closing reply mentions "Used the capacitor-video-player-master skill."
