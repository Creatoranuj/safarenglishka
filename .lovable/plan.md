
## Sentry Triage Fix Plan (v1.0.17)

Analyzed `user-uploads://1.md` (1,480 breadcrumbs) + existing `docs/observer/2026-07-13-sentry-triage.md`. Verified against live DB — some report guesses were wrong; corrected below.

### Verified (via live Supabase probe)
- ✅ `public.get_dashboard_snapshot()` **already has** `EXECUTE` grant to `authenticated` → APP-4/APP-3 42501 error is stale (pre-migration event). No new migration needed.
- ✅ `lesson_progress.watched_intervals` column **exists** in prod → 400 storm is NOT schema-missing. Real cause = something else in the upsert payload/RLS. Need to reproduce.
- ❌ Lovable AI Gateway shows **0 requests in last 24h** → Chatbot's "Connection mein problem hai" (screenshot) is from `AI API error: 403`. `LOVABLE_API_KEY` is either missing/rotated/invalid in the edge-function env.

### Fixes to ship

**P0 — Chatbot AI 403 (blocks Safar English Agent entirely)**
1. Verify `LOVABLE_API_KEY` secret exists on the project; if missing, provision via `ai_gateway--create`; if present but 403 persists, `rotate_lovable_api_key` once.
2. Update `supabase/functions/chatbot/index.ts`:
   - Swap `Authorization: Bearer` → `Lovable-API-Key` header (Lovable's canonical header; Bearer still works but sending both future-proofs).
   - Add `X-Lovable-AIG-SDK: edge-function` telemetry tag.
   - Surface the upstream body on non-OK so the Hindi toast carries actionable text instead of "Connection mein problem hai."
   - Bump default model from `google/gemini-2.5-flash` → `google/gemini-3-flash-preview` (2.5 flash is deprecated on the gateway; a 403 with "model not available" is a classic symptom).

**P0 — lesson_progress 400 storm (~70 events/session)**
3. Reproduce with a direct upsert probe in edge SQL to capture the exact PostgREST error. Then patch `src/hooks/useLessonProgress.ts` payload (suspects: `updated_at` triggers a check, or `watched_intervals` needs `JSON.stringify` wrap when the client type coerces).

**P1 — remaining Sentry issues (already scoped in prior report, ship in this batch)**
4. APP-D/APP-2 — `FastPdfReader.tsx`: check `content-type` before decoding; re-sign & retry once on `text/html`.
5. APP-1 — clone ArrayBuffer with `.slice(0)` before postMessage to pdf.js worker.
6. APP-9/APP-A — `useDownloads`: log `err?.message ?? String(err)`; try `Directory.Documents` first, fall back to blob-URL anchor.
7. APP-H/APP-F/APP-G — wrap `downloadFile` native fallback in try/catch → Hindi toast + `beforeSend` filter for `Failed to fetch` when `navigator.onLine === false`.
8. APP-5/APP-8 — `resumeRecovery.ts`: `AbortController.abort()` in-flight queries before `location.reload()`.
9. APP-7 — tag Eruda-wrapped fetches with `source: 'admin-devtools'`; filter in Sentry `beforeSend`.
10. APP-B — dedupe Razorpay error path (throw OR console.error, not both).
11. `data:` URL fetch — detect prefix in `fileUtils.ts`, decode via `atob` + `Uint8Array`, skip fetch on Capacitor.

**P2 — observability polish**
12. Feature-flag `lesson_quiz_markers` / `lesson_chapters` calls to kill 404 breadcrumb noise.

### History-observer output
Update `docs/observer/2026-07-13-sentry-triage.md` in-place with:
- corrections (grant + column already live)
- new P0: AI key + chatbot model
- what shipped this batch vs deferred
Then append a short "post-fix status" section.

### Files to touch (≈8 files, ~150 LOC net)
```
supabase/functions/chatbot/index.ts          # AI headers, model, error surfacing
src/hooks/useLessonProgress.ts               # 400 payload fix (after probe)
src/components/pdf/FastPdfReader.tsx         # content-type guard + ArrayBuffer.slice
src/hooks/useDownloads.ts                    # error logging + Directory fallback
src/lib/fileUtils.ts                         # data: URL branch + offline guard
src/lib/resumeRecovery.ts                    # abort in-flight before reload
src/lib/sentry.ts                            # beforeSend filters (offline, eruda)
docs/observer/2026-07-13-sentry-triage.md    # corrected report
```

### Out of scope (won't do this pass)
- Full `lesson_quiz_markers` / `lesson_chapters` feature build — only silence noise.
- Razorpay 500 root cause (needs edge fn logs from live payment attempt — deferred until user retries).
- Lockfile / build system changes.

### Risk
Zero client-visible regressions expected. Model bump is the highest-risk item — Gemini 3 flash-preview accepts the same OpenAI-compat schema, but if prompt style breaks, admin can override via `chatbot_settings.model` (already dynamic per line 366).

Approve to proceed to build mode.
