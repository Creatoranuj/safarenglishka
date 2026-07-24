## Goal

Portrait mode (only) me — video ke center wale skip-back / play-pause / skip-forward buttons ko slightly upar shift karna (~12px), aur bottom progress bar (seek bar) ko slightly neeche shift karna (~12px). Landscape / fake-fullscreen / rotated mode ko touch nahi karna. Baaki sab kuch unchanged.

## File

`src/components/video/MahimaGhostPlayer.tsx`

## Changes

### 1. Center controls (skip-back / play / skip-forward) — move up ~12px in portrait

Currently (line ~1457) the center controls cluster uses:
```
<div className="absolute inset-0 pointer-events-none flex items-center justify-center px-4 md:px-6">
```
This vertically centers the three buttons in the video frame.

Add a portrait-only upward transform on the inner wrapper (line ~1458) so the trio sits 12px higher — only when `isPortrait && !isLandscapeRotation && !isFakeFullscreen`. Landscape/fullscreen keep true center.

Approach: apply `style={{ transform: 'translateY(-12px)' }}` conditionally on the inner `relative h-full w-full` container (buttons already use `top-1/2 -translate-y-1/2`, so the parent translate shifts all three together, preserving horizontal alignment of skip-back / play / skip-forward).

### 2. Bottom progress bar — move down ~12px in portrait

The bottom controls container (line ~1544) has:
```
"absolute left-0 right-0 bottom-0 z-50 pt-1 md:pt-2 pb-1.5 md:pb-2.5"
```
and a `SeekBar` (line ~1581) with `className="mb-0 md:mb-0.5"` sitting above the controls row.

To move the progress bar down without pushing the controls row off-screen, reduce the top padding of the bottom bar in portrait so the seek bar sits lower relative to the video area. Concretely: in portrait-only (not landscape, not fake-fullscreen), change container `pt-1 md:pt-2` → effectively `pt-0` and add a small negative top margin to the SeekBar wrapper (~12px translateY down), OR simply wrap the SeekBar in a `<div style={{ transform: 'translateY(12px)' }}>` gated on `isPortrait && !isLandscapeRotation && !isFakeFullscreen`.

Chosen approach: wrap the `<SeekBar ... />` in a conditional `div` with `style={{ transform: 'translateY(12px)' }}` in portrait-only. This nudges only the seek bar down 12px, leaves controls row where it is, does not affect landscape.

### 3. Guardrails

- Both shifts gated on `isPortrait && !isLandscapeRotation && !isFakeFullscreen` (portrait, not rotated, not fullscreen).
- No new imports, no logic changes, no landscape/fullscreen changes.
- Horizontal alignment of skip-back / play / skip-forward preserved (parent-level translate).
- All other UI (top bar, watermarks, end screen, brand mask, bookmark dialog, speed menu) untouched.

## Verify

- Preview at 480×871 portrait: skip/play/skip trio should sit ~12px above vertical center; seek bar ~12px lower than before.
- Rotate to landscape (rotate button): positions identical to current behavior — no shift applied.
