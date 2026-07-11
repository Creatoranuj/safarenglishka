# Plan: Study Material feature + Senior-architect re-audit

## Part A — Study Material feature

**Scope:** Admin uploads (PDF, DOCX/PPTX/XLSX, images, external links) attachable to a **course/batch** OR a **specific subject (chapter)** within it. Students see a merged, filterable list on the "Study Material" tab that's currently empty.

### 1. Schema

New table `study_materials`:

| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `course_id` | int8 FK → courses | required |
| `chapter_id` | uuid FK → chapters | nullable — null = batch-wide |
| `title` | text | required |
| `description` | text | nullable |
| `kind` | text | check in (`pdf`,`doc`,`image`,`link`) |
| `file_url` | text | Supabase storage public URL, null for links |
| `external_url` | text | null unless kind='link' |
| `file_size` | int | bytes, null for links |
| `mime_type` | text | for correct in-app opener |
| `sort_order` | int default 0 | admin ordering |
| `created_by` | uuid | admin user id |
| `created_at` | timestamptz default now() | |

Indexes: `(course_id, chapter_id, sort_order)`, `(course_id) where chapter_id is null`.

GRANTs (per house rules):
```
GRANT SELECT ON public.study_materials TO authenticated;
GRANT ALL ON public.study_materials TO service_role;
```

RLS:
- **SELECT**: enrolled students (`exists in enrollments where user_id = auth.uid() and course_id = study_materials.course_id`) OR admin/teacher via `has_role`.
- **INSERT/UPDATE/DELETE**: admin/teacher only via `has_role`.

### 2. Storage

New private bucket `study-materials` (10MB per-file limit; MIME allow-list: pdf, docx, pptx, xlsx, jpg, png, webp).
`storage.objects` RLS:
- Read: enrolled students of the parent course, or admin/teacher.
- Write/Delete: admin/teacher only.

### 3. Admin UI

New route `/admin/study-materials` (also linked from `AdminCMS.tsx`):
- Course picker → optional chapter picker → upload form.
- Tabs: **Files** (upload) | **Links** (title + URL).
- List view grouped by chapter with drag-to-reorder (`sort_order`).
- Signed-URL download preview for admins to verify.

### 4. Student UI

Update `MyCourseDetail.tsx` "Study Material" tab:
- Segmented filter chips: `All | PDF | Docs | Images | Links` (uses upgraded Lovable pill Tabs from Phase 4).
- Two sections: **Batch-wide** (chapter_id null) and **By subject** (grouped by chapter title).
- Cards: kind icon + title + description + size + open/download button.
- Empty state: Lovable gradient-tile `EmptyState` (already built in Phase 4).
- PDFs open in existing hybrid PDF reader; office docs download via `nativeFileOpener`; images open in lightbox; links open in in-app browser.

### 5. Offline
Cache downloaded files in existing `savedDownloads` service so students can access them offline (reuses Phase-6 blob-URL disposer refactor).

---

## Part B — Full session re-audit (senior-architect + designer lens)

Reconcile every claim made in this session against live code. Delegated to a read-only subagent so the output stays scannable. Report format:

```
Audit: Session 2026-07-10 (Lovable design polish + Study Material plan)
Rating: X/5 — one-sentence verdict spanning engineering AND design.

Reconciliation table
| Claim (session) | Live state (grep/read) | Verdict |
|---|---|---|
| Header spacer + pt-3 fix on Dashboard | src/pages/Dashboard.tsx:218 | ✅ / ⚠️ / ❌ |
| MyCourses breadcrumb removed | src/pages/MyCourses.tsx | |
| BackButton on 9 pages | grep BackButton usage | |
| Composers: rounded-2xl shell + circular send | ChatWidget/AskDoubtSheet/LiveChat | |
| Tabs → segmented pill | src/components/ui/tabs.tsx | |
| EmptyState wired | Notices/Messages | |
| CORS + rate-limit shared helpers | supabase/functions/_shared/* | |
| Self-enroll-free edge fn | supabase/functions/self-enroll-free | |
| RouteSkeleton + error envelope | src/components/RouteSkeleton.tsx, _shared/errors.ts | |
| Blob-URL disposers | savedDownloads / useOfflineResolvedUrl / Downloads | |
| Screen protection FLAG_SECURE hook | useScreenProtection usage | |
| Design skill applied | .agents/skills/lovable-design-language | |

Findings — [SEVERITY] [CATEGORY] Title, Where, Symptom, Root, Fix
Wins
Fix Plan — Now / Next / Root
Skill tracker deltas
```

**Rules honored:** no HIGH/CRITICAL edits without your approval; LOW nits applied inline (typos, missing `text-base` on inputs, arbitrary `duration-[Nms]`, missing safe-area on new fixed elements, missing haptics on primary CTAs).

**Anti-pattern sweep:** roles-on-profiles, RLS-without-GRANT, `any`-cast supabase queries, `setState` in render, `useEffect` fetch without cleanup, hardcoded URLs, localStorage auth tokens, `key={index}` on reordered lists, `webContentsDebuggingEnabled:true` in release, `cleartext:true` outside dev, static plugin imports without web fallback, safe-area missing on fixed elements, double-mounted `backButton` listener, splash without JS safety timeout.

---

## Order of operations

1. **Audit first** — spawn read-only re-audit subagent, get full reconciliation report before touching new code.
2. **Ship LOW fixes** the audit surfaces (inline).
3. **Study Material Phase 1** — migration (table + GRANTs + RLS) + storage bucket + RLS on objects.
4. **Phase 2** — admin upload UI at `/admin/study-materials` (+ CMS link).
5. **Phase 3** — student "Study Material" tab list + filters + openers.
6. **Phase 4** — offline caching + haptics/press states + re-run audit against final surface.

## Out of scope

- MCP integration (still blocked on your OAuth vs. public auth answer).
- Community pagination and `LessonView` decomposition (deferred Root items from prior audit).
- Redesigning existing PDF reader.

## Technical notes

- Migration uses validation trigger (not CHECK) for `kind` cross-consistency (e.g. `link` requires `external_url`, others require `file_url`).
- Signed URLs generated in a batched `createSignedUrls` call to avoid N+1 (from prior audit item).
- Admin route guarded by existing `has_role('admin' | 'teacher')` check.
- Types regenerated automatically after migration — do not edit `src/integrations/supabase/types.ts`.
