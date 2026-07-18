## Phase 1 — Unblock APK build. 

##   
/skill:asset-optimization

`bun run build` fails because `scripts/check-png-sizes.mjs` rejects three social icons > 30KB:

- `src/assets/social/videos-red.png` (89.8KB)
- `src/assets/social/broadcast-blue.png` (78.3KB)
- `src/assets/social/messenger-green.png` (66.8KB)

Without a successful build, `dist/` is missing, so `npx cap sync android` and the whole APK pipeline breaks.

**Fix:**

1. Re-encode all three icons to WebP (`cwebp -q 85 -resize 128 128`, target < 20KB each) → `videos-red.webp`, `broadcast-blue.webp`, `messenger-green.webp`.
2. Delete the original oversized PNGs.
3. Update the three imports in `src/components/Landing/Footer.tsx` to point at the `.webp` files (no JSX/logic changes).
4. Run `bun run build` locally to confirm the PNG check passes and `dist/` is produced. Then a fresh `npx cap sync android` will succeed and the GitHub Actions APK workflow will go green on the next tag.

No behavior, layout, or icon-appearance change — same artwork, smaller file.

## Phase 2 — Polish the outer dashed ring around Raj Sir

Current (`src/components/Landing/HeroIllustration.tsx:77–80`):

```
absolute -inset-[8%] rounded-full border-2 border-dashed border-primary/40
```

Reads a bit thin, uneven dash rhythm (Tailwind's default dash pattern), and washed-out color on the coral hero background.

**Refinements (visual-only, one element):**

- Swap the Tailwind `border-dashed` (browser-default dash) for an inline SVG ring so we control stroke width, dash length, gap, and color precisely — crisp on all DPRs.
- Ring spec: stroke `2.5px`, `stroke-dasharray="6 8"`, `stroke-linecap="round"`, color `hsl(var(--primary))` at 70% opacity with a soft `drop-shadow` for depth.
- Slight inset tightening (`-inset-[6%]` → tighter halo, less empty gap noticed earlier).
- Keep the slow rotation (`animate-[spin_18s_linear_infinite]`), respect `prefers-reduced-motion` via `motion-safe:` prefix.
- No change to Raj Sir's portrait, chat bubbles, floating badges, or the girl's portrait.

## Files touched

- `src/assets/social/*.webp` (new, 3 files)
- `src/assets/social/*.png` (deleted, 3 files)
- `src/components/Landing/Footer.tsx` (import paths only)
- `src/components/Landing/HeroIllustration.tsx` (dashed ring block only, ~10 lines)

## Verification

- `bun run build` exits 0, PNG-size check passes, `dist/index.html` exists.
- `npx cap sync android` succeeds (no `Could not find the web assets directory` error).
- Mobile preview at 480×871: Raj Sir's ring appears crisp, evenly dashed, subtle rotation, no overlap with the girl's portrait.