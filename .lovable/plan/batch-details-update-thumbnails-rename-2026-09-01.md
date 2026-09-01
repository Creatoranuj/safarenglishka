# Batch Details Update — Thumbnails + Rename

Do batches update honge (`courses` table, IDs confirm ho chuke hain):

## 1. CG Lecturer Batch (id=34) — naya thumbnail
- **CG Vyapam exam style** AI banner generate hoga: professional education poster, Chhattisgarh lecturer/recruitment exam ki feel — classroom, books, teacher visual, warm brand colors (project ke ink-blue + terracotta tokens se matching), text: **"CG Lecturer Batch"**.
- Landscape 1200x675 (16:9) jpg — course cards me perfect fit.

## 2. Neet 2027 (id=30) — rename + Teacher's Day image
- Title: `Neet 2027` → **`VIP Offline Batch 2027`**
- Naya AI banner: **Teacher's Day Special** theme — books, chalkboard, festive-but-premium education poster, prominent text **"Class 12th 2027"** + "Teacher's Day Special" badge feel. Premium quality tier (text legibility ke liye).
- 1200x675 jpg.

## Technical steps
1. Dono images `imagegen--generate_image` se generate → `src/assets/` me save.
2. `lovable-assets` CLI se CDN par upload (existing thumbnails doosre project ke preview domain point karte hain — fragile; ab stable CDN URLs milenge).
3. `run_sql` se `courses` update:
   - id=34: `thumbnail_url` + `image_url` = naya CG banner URL
   - id=30: `title='VIP Offline Batch 2027'`, `thumbnail_url` + `image_url` = naya Teacher's Day banner URL
4. Images user ko chat me preview ke liye dikhenge; approve karne par DB update.
5. Verification: `read_query` se confirm + course cards render check.

No code changes. No RLS/schema change — sirf image files + 2 row updates.
