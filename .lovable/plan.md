# Deep-fix: Safar Agent + Ask-Doubt (Lesson View)

## Diagnosis (verified)

- Screenshot shows the exact string: "AI service abhi setup nahi hai. Admin ko batayein — Lovable AI Gateway enable karna hoga." That string only appears in `supabase/functions/chatbot/index.ts:405`, and it is emitted **only when the gateway response body contains `lovable_api_key_not_registered` or `unauthorized`** — i.e. the key exists but the gateway rejects it.
- `secrets--fetch_secrets` confirms `LOVABLE_API_KEY` is present as a managed secret. So the problem is a stale/unregistered key at the gateway, not a missing env var.
- `resolve-doubt` (used by Ask-Doubt in Lesson View and by `LiveSarthiPanel`) uses the same key via `_shared/aiGateway.ts` and already returns `code: "gateway_unauthorized"` (503) on the same upstream signature — so both surfaces fail from the same root cause.
- Both functions still hard-code `google/gemini-2.5-flash`, which is now a "prior" generation model in the catalog; the current default is `openai/gpt-5.5` and the current Gemini equivalents are `google/gemini-3.5-flash` / `google/gemini-3.1-pro-preview`. Keeping 2.5-flash is not the cause of the failure but is worth refreshing while we're in there.

## Fix

1. **Re-provision the Lovable AI key** using `ai_gateway--create` (idempotent — creates only if missing, but pairing it with `ai_gateway--enable` re-registers the current key at the gateway so `lovable_api_key_not_registered`/`unauthorized` stops).
2. **`supabase/functions/resolve-doubt/index.ts`**
   - Switch the model to the current-generation Gemini equivalent: `google/gemini-3.5-flash` (keeps behavior/cost close to 2.5-flash; multimodal support unchanged for photo-doubt).
   - No other logic changes — auth, RAG, transcript resolution, sanitize, retry, and error mapping stay as-is.
3. **`supabase/functions/chatbot/index.ts`**
   - Update the default model fallback from `google/gemini-2.5-flash` to `google/gemini-3.5-flash` (still honors `settings.model` from admin config if set).
   - Leave the FAQ shortcut, RAG, greeting-strip, and error-mapping paths untouched.
4. **Verify** by calling each edge function once from the preview after redeploy:
   - Safar Agent: send "Quiz me on Physics" → expect a real reply (no yellow warning card).
   - Lesson View Ask-Doubt: open any lesson, ask a short doubt → expect a streamed answer instead of the "AI service abhi reconnect ho raha hai" toast.
   - Watch the function logs for `AI gateway error` lines to be gone.

## Out of scope

- No UI changes to `LiveSarthiPanel`, `useLessonChat`, or `ChatWidget` — the client-side error handling is already correct; it just has nothing to display because the gateway rejects the key.
- No schema or RLS changes.
- Not migrating to the AI SDK / Responses API in this pass — that's a bigger refactor and unrelated to the reported breakage.

## Technical notes

- `ai_gateway--create` is safe to call when the key already exists; it will leave the existing key in place and just ensure gateway registration. If registration alone doesn't clear the `unauthorized` upstream, follow up with `lovable_api_key--rotate_lovable_api_key` and Supabase will pick up the new value automatically (managed secret).
- Model id must stay in `vendor/model` form with the `google/` prefix — the gateway rejects bare ids.
