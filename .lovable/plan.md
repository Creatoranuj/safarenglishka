# Fix Plan — LOW batch + Root guards

## Next (LOW batch)

### 1. Self-host BuyCourse success sound
- Download the ~10 KB WAV from `https://cdn.pixabay.com/audio/2021/08/04/audio_aad70ee296.mp3` to `/tmp`, upload via `lovable-assets create` to get a stable CDN pointer at `src/assets/success.mp3.asset.json`.
- Replace the hardcoded `SUCCESS_SOUND_URL` in `src/pages/BuyCourse.tsx:24` with an import from the pointer.
- Removes an untrusted third-party CDN dependency that isn't in `network_security_config.xml`.

### 2. AbortController on 5 admin useEffect fetches
Add an `AbortController` + `if (signal.aborted) return` guard (or wrap with React Query where the file already uses it) in:
- `src/components/admin/TimetableManager.tsx:28`
- `src/pages/AdminUpload.tsx:227` and `:250`
- `src/pages/AdminStudyMaterials.tsx:76`
- `src/pages/Attendance.tsx:38`
- `src/hooks/useTrustedHosts.ts:49`

Pattern (unified):
```ts
useEffect(() => {
  const ctrl = new AbortController();
  (async () => {
    const { data, error } = await supabase.from("...").select("...").abortSignal(ctrl.signal);
    if (ctrl.signal.aborted) return;
    // setState...
  })();
  return () => ctrl.abort();
}, [deps]);
```

## Root (regression guards)

### 3. ESLint `no-restricted-syntax` on raw `window.open`
- Add a rule in `eslint.config.js` banning `CallExpression[callee.object.name='window'][callee.property.name='open']`.
- Allowlist the four legitimate funnel files via file-scoped overrides:
  - `src/lib/openResource.ts`
  - `src/lib/native/browser.ts`
  - `src/lib/downloadDocument.ts`
  - `src/pages/AdminLiveManager.tsx` (admin new-tab)
- Error message: `"Use openResource() from src/lib/openResource instead — window.open ejects users out of the Capacitor WebView."`

### 4. Playwright test — comment image opens DocReaderShell
- New spec at `tests/e2e/comment-image-opens-in-app.spec.ts`.
- Flow: restore Supabase session → open a lesson with a known comment attachment → tap the image → assert `[data-testid="doc-reader-shell"]` mounts and no new browser tab was opened (`context.pages().length === 1`).
- Requires adding `data-testid="doc-reader-shell"` to the root of `DocReaderShell` (single-line change).

## Technical notes

- Success sound: use `lovable-assets create --file /tmp/success.mp3 --filename success.mp3` and commit only the pointer.
- `AdminUpload.tsx` has two independent fetches on the same effect chain — each gets its own controller share via the same signal.
- ESLint rule uses AST selector (not regex) so template literals like `window.open(\`https://...\`)` are still caught.
- Playwright spec runs against `http://localhost:8080` with the pre-injected Supabase session (per browser-use protocol).

## Out of scope
- Migrating remaining `link`-kind `window.open` sites (Zoom, Amazon, YouTube) — those are intentional external handoffs.
- Rewriting admin fetches into React Query — deferred; only the abort guard is in scope here.
