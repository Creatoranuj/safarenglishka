# Batch banner cleanup + full thumbnail fix

## 1. Remove the redundant "Viewing: <batch>" strip

On the All Classes screen there is a strip that repeats the batch name with an "X Show All" link. Since the batch is already chosen on the Home screen (and the page header already shows the batch title), this strip is duplicate noise and gets deleted.

- File: `src/pages/AllClasses.tsx` — remove the `selectedBatch && (...)` banner block (the "Viewing: … / Show All" row).
- Keep everything else identical: header title still shows the selected batch, search, sort, Courses/Resources tabs, and the batch filtering logic stay exactly as they are.
- The `X` icon import is dropped only if it becomes unused.

No other screen changes.

## 2. Dashboard "Continue where you left" card — show the full thumbnail

Current behaviour: the image sits in a fixed 16:9 box, so a wide banner (the VIP Offline Batch 2027 / CG Lecturer artwork) either gets letterboxed or visually clipped at the top and bottom, cutting the "Teacher's Day Special" ribbon and the bottom feature strip.

Fix in `src/pages/Dashboard.tsx`:
- On mobile, drop the fixed aspect box: render the banner as a full-width image with automatic height (natural aspect ratio), so nothing is ever cropped.
- Keep the loading placeholder background so layout does not jump before the image decodes.
- Desktop (`sm:` and up) keeps the side-by-side layout with a fixed-width image column and `object-cover`, which is correct there.
- Remove the hover-zoom scale on the banner so no part slides out of view on touch devices.

## 3. Verification

- Reload All Classes with a batch selected from Home: the duplicate strip is gone, the list still shows only that batch's courses.
- Open Dashboard on a 411px-wide viewport and confirm the batch banner renders end-to-end (top ribbon and bottom strip fully visible), the card text and Resume button unchanged.
- Also check All Classes → All Content chapter list still loads normally after the edit.
- Run the build and test suite.
