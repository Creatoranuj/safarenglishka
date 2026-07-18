# Fix Hero Images + Hamburger Menu on Vercel

## Root cause (verified with curl)

Screenshot is from `safarenglishka.vercel.app` — the production Vercel deployment. The hero circles are empty because the WebP images point at Lovable's private CDN route `/__l5e/assets-v1/...`. That route only exists on Lovable preview hosts. On Vercel it falls through to the SPA `index.html` (returns 200 but with `content-disposition: filename="index.html"`), so the `<img>` fails silently → empty circle.

Verified:
- Lovable preview: `HTTP/2 200 · content-type: image/webp · 46,948 bytes` ✅
- Vercel prod: `HTTP/2 200 · content-disposition: inline; filename="index.html"` ❌

This affects **every** `.asset.json`-pointed image on Vercel — not just hero. Landing course thumbnails, fonts, audio, `nb-mark.webp` (logo), etc. all break the same way.

## Fix strategy

**Bundle the small, above-the-fold, always-visible assets locally** (import through Vite → Vercel serves from `/assets/*` with hash). Keep the `.asset.json` CDN pattern for admin-uploaded / large / infrequent assets, but make Vercel proxy `/__l5e/*` to Lovable's CDN so nothing else breaks either.

### Step 1 — Bundle the two hero portraits (fixes the visible bug)

- Download the two WebPs from Lovable CDN once, commit into `src/assets/landing/` as regular files: `raj-sir.webp` (46 KB) and `student-girl.webp` (101 KB).
- Delete the two `.asset.json` pointers.
- Update `src/components/Landing/HeroIllustration.tsx` to `import rajSir from ".../raj-sir.webp"` and use `src={rajSir}`.
- Total bundle addition: ~148 KB (both are marked `loading="eager"` / LCP-critical anyway, so this is a net win — no CDN round-trip).

### Step 2 — Add a Vercel rewrite so every other `.asset.json` keeps working in prod

Add to `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/__l5e/assets-v1/:asset_id/:filename",
      "destination": "https://cdn.lovable.dev/__l5e/assets-v1/:asset_id/:filename" }
  ]
}
```

(Exact origin host to be confirmed against a working Lovable-served asset — I'll `curl -sIL` the redirect chain from the Lovable preview to lock in the correct upstream before writing the rewrite.) This lets every remaining `.asset.json` — course thumbnails, fonts, audio, hero carousel banners uploaded from admin — resolve on Vercel without touching each component.

### Step 3 — Hamburger menu

Screenshot shows the icon rendering; user says it's broken. Two most likely causes on Vercel-only:
1. Sheet portal target missing because a lazy chunk 404'd (Vercel + stale build hash after redeploy).
2. `SheetContent` z-index sitting under the sticky mobile CTA / WhatsApp float (both `fixed`, high z).

Plan:
- Load `/` in Playwright against `safarenglishka.vercel.app`, tap the hamburger, capture console + screenshot to identify which of the two.
- If (1): add `<link rel="modulepreload">` for the sheet chunk in `index.html` or eagerly import `Sheet` in `Index.tsx` (it's already imported eagerly — so unlikely).
- If (2): bump `SheetContent` `z-[60]` and lower `StickyMobileCTA` / `WhatsAppFloat` to `z-40`.

### Step 4 — Verify

- `bun run build` locally → confirm `dist/assets/raj-sir-*.webp` exists.
- Playwright against Vercel preview after deploy: hero images render, hamburger opens, no 404s in network, no console errors.
- Re-run `check-png-sizes.mjs` (already passing — only touching WebP).

## Files touched

- `src/assets/landing/raj-sir.webp` (new binary)
- `src/assets/landing/student-girl.webp` (new binary)
- `src/assets/landing/raj-sir.webp.asset.json` (delete)
- `src/assets/landing/student-girl.webp.asset.json` (delete)
- `src/components/Landing/HeroIllustration.tsx` (swap imports)
- `vercel.json` (add `/__l5e/*` rewrite)
- Optional: `src/components/ui/sheet.tsx` or CTA/FAB z-index (after Playwright diagnosis)

## Out of scope (as requested — narrow fix only)

The 27-skill progress tracker is aspirational; this plan only addresses the two concrete regressions you flagged (assets not showing + hamburger). I'll mention `senior-architect-audit` + `asset-optimization` + `capacitor-best-practices` in the closing note, since those are what actually governed the fix. Rest can be follow-ups.

## Approvals needed before I build

1. **OK to commit the two WebPs into the repo?** (adds 148 KB to the bundle, but makes LCP faster and Vercel-safe.)
2. **OK to add the `/__l5e/*` rewrite in `vercel.json`?** (keeps admin-uploaded assets working without touching every component.)
