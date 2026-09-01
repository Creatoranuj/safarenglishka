# Batch Updates — Verify + Dashboard Card Fix

## Current state (verified in DB)

- Course 34 = "CG Lecturer Batch" — new AI banner set on both `thumbnail_url` and `image_url`.
- Course 30 = "VIP Offline Batch 2027" (renamed from Neet 2027) — Teacher's Day / "Class 12th 2027" banner set.
- Problem found: both URLs are saved as **absolute preview-domain links**
  (`https://id-preview--...lovable.app/__l5e/assets-v1/...`). On the published app or the
  Android build these can break. They should be stored as the plain CDN path `/__l5e/assets-v1/...`.

## What gets fixed

### 1. Image URLs made environment-safe
Update courses 30 and 34 to store the relative CDN path instead of the preview host, so the
banners load in preview, published web, and the Capacitor app alike.

### 2. Dashboard "continue where you left" card (the cut card)
In the screenshot the 16:9 banner is force-cropped inside a fixed 144px-tall box, so the bottom
strip of the artwork ("Admissions Open" band) gets sliced off, and the card looks broken.

Changes in `src/pages/Dashboard.tsx`:
- On mobile, render the thumbnail in its natural 16:9 aspect ratio instead of a fixed `h-36` crop.
- Desktop keeps the side-by-side layout with a matched-height image column.
- Tighten the text block spacing so the card stays compact, with the title on one line,
  progress bar, and a 44px-tall Resume button (tap-target compliant).
- Course title/labels stay translated via the existing `useT()` keys.

### 3. Hero carousel overlap (same screenshot)
The prev/next arrows and dots sit on top of the headline and CTA button.
In `src/components/dashboard/HeroCarousel.tsx`:
- Add side padding to the slide content so text never runs under the arrows.
- Move dots to the bottom-right and shrink arrows slightly; keep 44px hit areas via padding.

### 4. End-to-end verification
- Query the DB again to confirm titles and URLs.
- Load the dashboard in a headless browser at 411x745 (the user's viewport), screenshot the
  card and carousel, and confirm no clipping and both banners render.
- Run build + typecheck + test suite.

## Technical notes
- DB change is a data `UPDATE` on `public.courses` (ids 30, 34) — no schema change.
- No new components; edits stay in `Dashboard.tsx` and `HeroCarousel.tsx`.
- No hardcoded colors added; existing tokens reused.
