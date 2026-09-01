# PDF Reader: 100% default zoom, pinch-only, admin toggle

## Goal
PDF reader video jaisa clean rahe — koi zoom UI nahi. Default hamesha 100% (fit width). Zoom sirf ungli (pinch) se, aur 100% se neeche kabhi na jaaye.

## What changes

### 1. Zoom controls hatao (default state)
- `ReaderZoomControls` (floating −  / 100% / + pill) reader se hata diya jayega — plus/minus buttons aur percentage chip dono gayab.
- Reader har baar 100% (fit width) par khulega; purani saved zoom value (localStorage `nb_pdf_zoom`) ignore/clear hogi.

### 2. Zoom-out floor = 100%
- Pinch, double-tap aur wheel — sabka minimum 1.0 (100%) ho jayega, maximum 4x rahega.
- Pinch se zoom-in freely adjustable; pinch-in karke chhodne par wapas 100% par snap, 100% se neeche kabhi nahi.
- Double-tap 1x ↔ 2x toggle bana rahega (100% se neeche kabhi nahi).

### 3. Admin panel toggle (default OFF)
- Admin → CMS → Social tab me naya switch: "PDF zoom controls (+/−)".
- OFF (default): reader me koi zoom button nahi — sirf pinch.
- ON: purane floating zoom controls wapas dikhenge (min 100% rule tab bhi lagu).

## Technical notes
- `src/components/video/FastPdfReader.tsx`: `MIN_ZOOM = 1` constant, saare `Math.max(0.5, ...)` → `Math.max(1, ...)`; initial state localStorage se na lekar hamesha `1`; persist hata denge.
- `src/components/library/DocReaderShell.tsx`: `ReaderZoomControls` render ko naye setting flag ke peeche daalenge.
- Naya site_settings key `pdf_zoom_controls_enabled` (allowlist CHECK constraint me migration se add), `usePlayerOverlaySettings.ts` pattern par ek hook (ya usi hook me extend) se read.
- Admin UI: `src/components/admin/PlayerOverlayToggles.tsx` me ek aur switch (already AdminCMS Social tab me mounted).
- Default false — DB row absent ho to OFF.
