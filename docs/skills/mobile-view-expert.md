# Skill: mobile-view-expert

**Goal:** it feels native on a 360 px Android, not like a shrunk desktop page.

## Rules
1. Inputs are `text-base` (16 px) minimum — `text-sm` makes iOS zoom on focus. Guard: `mobile-view` (advisory).
2. Any `fixed bottom-0` bar uses `env(safe-area-inset-bottom)`; same for top bars and notches.
3. Tap targets ≥ 44×44 px with real spacing between them.
4. Design at 360 px first, then scale up. No horizontal scroll at 320 px.
5. Sticky headers must not cover the focused input when the keyboard opens.
6. Long lists virtualize; images reserve space.

## Repo anchors
`src/index.css` safe-area utilities, `src/components/layout/`
