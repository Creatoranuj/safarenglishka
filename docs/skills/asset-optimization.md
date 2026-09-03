# Skill: asset-optimization

**Goal:** the first frame on a 3G phone is cheap.

## Rules
1. No shipped raster asset over **200 KB**. Exceptions are explicit in the guard allowlist (PWA 192/512 icons, OG image). Guard: `asset-size` (blocking).
2. Photos → WebP/AVIF; icons/logos → SVG. PNG only when the platform demands PNG.
3. Everything below the fold is `loading="lazy"` with explicit `width`/`height` to avoid layout shift.
4. Hero/LCP image is preloaded, never lazy.
5. Fonts: subset, `font-display: swap`, self-hosted — no render-blocking remote CSS.
6. Android launcher/splash assets are generated, not hand-exported; regenerate after any logo change.

## Repo anchors
`public/`, `src/assets/`, `scripts/check-bundle-size.mjs`
