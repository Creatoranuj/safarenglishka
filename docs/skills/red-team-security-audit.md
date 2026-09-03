# Skill: red-team-security-audit

**Goal:** think like the attacker before shipping.

## Rules
1. No privileged credential in client code — service-role JWT, `sk_live_`, `rzp_live_`, `sbp_`. The Supabase **anon** key is intentional and allowed (guard decodes the JWT role). Guard: `secrets-and-webview` (blocking).
2. `webContentsDebuggingEnabled` and `cleartext` must never be hardcoded `true` in `capacitor.config.ts` — dev-gated only.
3. Payments: verify the Razorpay HMAC server-side with the shared helper, check the amount against the server-side order, enforce idempotency and replay protection. Never trust a client-sent amount.
4. Every edge function validates input and authenticates the caller before touching data; `/api/public/*` verifies signatures itself.
5. Screenshots/artifacts from CI must use a dedicated non-admin test account.
6. Rotate any credential that ever appeared in chat, logs, or an artifact.

## Repo anchors
`supabase/functions/_shared/razorpay.ts`, `capacitor.config.ts`
