# Plan: Rebuild Safar English User Manual PDF (v2) — Readable End-to-End

## Root cause (verified from uploaded PDF)
PDF pages 1–23 render cleanly. The unreadable parts are the audit tables:
- **Page 24 (Wins table)**: "Win" and "Skill" columns overlap — text like "smoothing + tap-to-toggle" collides with "senior-architect-audit". Column widths too tight, no word-wrap.
- **Page 25 (Risks table)**: "Risk" and "Fix" columns overflow the page — text clipped past the right margin ("toggle" → "togglf", "Dashboard" cut off).
- Root cause in `/tmp/manual/build_pdf.py`: table cells use plain `str` values instead of wrapped `Paragraph` objects, and `colWidths` don't fit A4 print margins.

Body text, headings, screenshots, callouts all render fine — no rebuild needed for those.

## What v2 will do

1. **Regenerate** `/mnt/documents/Safar-English-User-Manual-v2.pdf` (keeps v1 intact for reference).
2. **Rewrite every table** in the audit section (Wins, Risks, Terms) so:
   - Every cell is a `Paragraph` with `wordWrap='CJK'` → guarantees wrap even for long tokens like `complete_paid_enrollment`.
   - `colWidths` sum to the printable A4 width (≈170 mm) with sensible ratios (#: 8mm, Area/Severity: 28mm, Win/Risk: 62mm, Skill/Fix: 72mm).
   - Header row styled, `repeatRows=1` so tables that break across pages keep the header.
   - `LongTable` instead of `Table` so pagination is automatic.
3. **Keep everything else identical**: cover, TOC, section walkthroughs, all 22 mobile screenshots, captions, callouts, footer.
4. **QA loop**: render every page of v2 to JPEG at 150 dpi, view each one, confirm no overlap/clip/blank; fix and re-render until clean. Then ship.

## Technical section

- Script: `/tmp/manual/build_pdf_v2.py` (fresh file, adapted from v1 build script).
- Library: reportlab Platypus (`SimpleDocTemplate`, `LongTable`, `Paragraph`, `TableStyle`).
- Table cell style: 9pt DejaVuSans, leading 11, `VALIGN=TOP`, `LEFTPADDING=4`, `RIGHTPADDING=4`, `GRID` at 0.25pt neutral.
- Output: `/mnt/documents/Safar-English-User-Manual-v2.pdf` + `<presentation-artifact>` tag.
- QA: `pdftoppm -jpeg -r 150` → view each page → fix → re-run until every page passes visual inspection. Summary of QA (issues found + fixed, or "none found") included in final reply.

## Out of scope
- Re-taking screenshots (existing 22 are clean).
- Content/copy changes.
- New sections.
