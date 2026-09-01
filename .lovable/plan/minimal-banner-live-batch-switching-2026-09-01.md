# Minimal banner + live batch switching

## 1. Hero banner — minimal, expert-grade

`src/components/dashboard/HeroCarousel.tsx` currently stacks a lot of chrome on a small mobile card: badge pill, title, subtitle, description, CTA, big translucent arrows on both sides, dot indicators, a duplicated background image layer, a second floating image on the right, a heavy black gradient wash, and a "Featured / New" corner ribbon. On a 411px screen these collide (as seen in the screenshots).

Cleanup:
- Remove the "Featured / New" corner ribbon entirely.
- Remove the second (right-side) decorative image layer; keep one soft background image with a single restrained overlay so text contrast still passes.
- Slimmer content stack: badge + title + one short supporting line + CTA. Description stays desktop-only.
- Arrows become small, low-contrast, edge-hugging controls that no longer sit on top of the headline; they keep a 44px hit area but a smaller visible circle.
- Dots move to bottom-center as small, quiet indicators clear of the CTA.
- Slightly shorter card on mobile so the batch card below stays visible.
- All colors via existing semantic tokens — no hardcoded palette additions.

## 2. Batch dropdown must update the card instantly

Confirmed cause: `src/pages/Dashboard.tsx` always renders `myCourses[0]` for the "Continue where you left" card. The batch dropdown (`BatchSelector`) writes to `BatchContext`, but the Dashboard never reads `selectedBatch`, so picking "CG Lecturer Batch" leaves the VIP 2027 card on screen.

Fix:
- Dashboard reads `selectedBatch` from `BatchContext` and picks the matching enrolled course by id for the card (thumbnail, title, class badge, progress, Resume target).
- If the selected batch has no matching enrollment, fall back to the first enrolled course as today.
- Progress percent is derived from the same selected course, so the bar and the Resume link always agree with the dropdown.
- Change is instant (context state), no refetch.

## 3. Screenshot 1 strip

The strip marked in screenshot 1 ("Viewing: VIP Offline Batch 2027 / X Show All" on the All Classes page) was already deleted in the previous change — that screenshot was captured while the preview was stale ("Preview is behind the latest changes"). Verified in the code and re-verified in a live preview run; nothing else on that screen changes.

## 4. Verification

- Live preview at 411px: switch batches in the dropdown and confirm the card thumbnail/title/progress change immediately.
- Banner renders clean at 411px, arrows and dots do not overlap the headline or CTA, autoplay still works.
- All Classes page shows no duplicate "Viewing" strip.
- Build + test suite.
