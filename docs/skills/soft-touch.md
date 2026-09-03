# Skill: soft-touch

**Goal:** interactions feel physical without shipping the plugin to the web bundle.

## Rules
1. Haptics only via `@/lib/native/haptics`. Direct `@capacitor/haptics` imports are banned. Guard: `soft-touch` (advisory, budget 0).
2. The wrapper no-ops on web and swallows plugin absence.
3. Intensity map: selection → `Impact light`; confirm/success → `Notification success`; destructive/error → `Notification error`. Never vibrate on scroll or on every keystroke.
4. Pair haptics with a visual state change; haptics alone is not feedback.
5. Respect `prefers-reduced-motion` for the accompanying animation.

## Repo anchors
`src/lib/native/haptics.ts`
