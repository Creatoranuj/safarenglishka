# Skill: capacitor-back-button

**Goal:** hardware Back behaves like Android users expect, and never exits by surprise.

## Rules
1. Exactly **one** `App.addListener('backButton', ...)` in the whole app. Two listeners means the first press exits. Guard: `back-button` (blocking, budget 1).
2. Priority order: open sheet/modal/drawer → close it; video fullscreen → exit fullscreen; nav history → `history.back()`; on the root route → "press again to exit" toast within 2s.
3. Overlays register/unregister themselves with a stack in the single hook — they never add their own listener.
4. Never call `App.exitApp()` outside the double-press root case.

## Repo anchors
`src/hooks/useAndroidBackButton.ts`
