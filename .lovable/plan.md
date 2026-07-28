## Matlab kya hai

`rate_limiter_unavailable` aapki apni error string hai (edge functions me). Payment functions rate-limit check ko **fail-closed** rakhte hain: agar rate limiter call fail ho jaaye, request ko allow karne ke bajaye 503 return kar dete hain. To ye "aap bahut requests bhej rahe ho" wala 429 nahi hai — iska matlab hai **rate limiter khud call nahi ho pa raha**, aur isliye checkout block ho raha hai.

## Root cause (verified against the live database)

Do alag problems hain, dono confirmed:

**1. RPC ka naam mismatch — yahi actual blocker hai.**
Edge functions (`create-razorpay-order`, `verify-razorpay-payment`, `self-enroll-free`, `recover-enrollment`, `send-phone-otp`, `_shared/rateLimit.ts`, `dependency-scan`) `supabaseAdmin.rpc('n', …)` call karte hain, aur `platform-stats` / `content-redirect` `rpc('n_text', …)`.
Database me `public.n` aur `public.n_text` **exist hi nahi karte** — sirf `public.check_rate_limit(text, uuid, int, int)` mojood hai (verified via `pg_proc`). Jis migration ne `n` banaya tha wo effectively apply nahi hua / rename ho gaya. PostgREST 404 return karta hai → `rlError` set hota hai → function fail-closed hoke 503 `rate_limiter_unavailable` bhejta hai. Isliye **har** payment attempt fail ho raha hai, sirf heavy usage par nahi.

**2. Latent second bug — naam theek karne ke baad bhi fail hota.**
`check_rate_limit` ke andar `_caller uuid := auth.uid(); IF _caller IS NULL THEN RAISE EXCEPTION 'authentication required'`. Lekin edge functions ise **service-role client** se call karte hain (user JWT ke bina), jahan `auth.uid()` NULL hota hai → 42501 exception → phir wahi 503. Iske alawa `check_rate_limit_text` bhi isi function ko call karta hai, to wo bhi service-role path par toot-ta hai.

## Fix plan

**Step 1 — Database migration**
- `public.check_rate_limit(_bucket, _user_id, _max, _window_seconds)` ko redefine karo: caller identity aise resolve ho —
  - agar `auth.uid()` non-null hai → wahi use karo (client-side spoofing se bachav barqarar),
  - warna (service-role / no session) → passed `_user_id` use karo,
  - dono NULL hon tabhi exception.
- `public.check_rate_limit_text` waise hi rahe (ab parent theek hone se ye bhi chalega).
- `public.n(text, uuid, int, int)` aur `public.n_text(text, text, int, int)` ko thin SECURITY DEFINER wrappers ke taur par (re)create karo jo respective canonical function ko call karein — taaki deployed code aur legacy migrations dono naam se kaam karein.
- Grants: `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO service_role` (aur `authenticated` sirf `n` / `check_rate_limit` par, jaisa abhi hai).

**Step 2 — Edge functions**
- Comment drift theek karo (kuch files me comment `check_rate_limit` kehta hai jabki code `n` call karta hai).
- Error logging me RPC error message ko explicitly log karo taaki agli baar naam/permission failure logs me turant dikhe.
- Affected functions redeploy karo.

**Step 3 — Verify**
- Migration ke baad DB se direct `select public.n('test', <uuid>, 5, 60)` chala kar `true` confirm karo.
- `create-razorpay-order` ko real request se test karo aur response + edge function logs padho — 503 khatam hona chahiye aur checkout Razorpay sheet tak pahunchna chahiye.
- 6 rapid calls karke confirm karo ki 6th par proper `429` aata hai (limiter actually enforce ho raha hai, sirf bypass nahi ho gaya).

## Kya nahi badlega

Fail-closed behaviour intact rahega (limiter tootne par payment allow nahi hoga), limits wahi (5 req / 60 s), aur koi UI/pricing change nahi.
