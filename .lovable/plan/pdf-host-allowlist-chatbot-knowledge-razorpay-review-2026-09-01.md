# PDF Host Allowlist + Chatbot Knowledge + Razorpay Review

## 1. Admin → PDF Links (naya chip tab)

Abhi `pdf-proxy` edge function ke andar allow-list **hardcoded** hai (`ALLOWED_HOSTS` — sirf jsdelivr, raw.githubusercontent, blob.core.windows.net, 2 vercel hosts). `trusted_hosts` table admin panel me exist karti hai lekin `pdf-proxy` use nahi karti (grep: edge functions me `trusted_hosts` ka koi reference nahi). Isi wajah se NCERT / crwilladmin ke PDF proxy se nahi khulte.

Kya banega:
- Admin → Trusted Hosts page par ek naya **"PDF Links"** chip tab, jisme:
  - Poora PDF URL paste karke "Add" — host apne aap nikal kar `trusted_hosts` me `category = 'frame'` ke saath save hoga (jaise `ncert.nic.in`, `cwmediabkt99.crwilladmin.com`).
  - Chip list: har allowed host ka chip, on/off toggle aur delete.
  - "Test link" button — URL ko reader me kholke check karega ki proxy se stream ho raha hai.
- Aapke diye 3 links ke hosts pre-seed honge (`cwmediabkt99.crwilladmin.com`, `ncert.nic.in`).

Backend:
- `pdf-proxy` me DB-driven allow-list: service-role client se `trusted_hosts` (enabled, category `frame`/`website`) padhega, 60s in-memory cache, aur usko static baseline list ke saath merge karega.
- Saare SSRF guards jaise ke waise rahenge: sirf `https`, koi port/credentials nahi, IP-literal aur private ranges block, har redirect hop dobara validate.

## 2. Chatbot knowledge (Founder + VIP Coaching)

Chatbot `chatbot_faq` + `knowledge_base` se context leta hai. Do entries add hongi (admin panel se baad me edit ho sakengi):

- **Founder:** "Safar English ke Founder **Raj Sir** hain." + channel link `https://www.youtube.com/channel/UCciFMAOMrbJs3RxY9fKlgGQ`
- **VIP Coaching:** "VIP Coaching **Gyanpur** me hai — Gyanpur ki pehli **Offline + Online Hybrid** coaching."

Saath me chatbot ke system prompt me ek chhota "Institute facts" block, taki FAQ retrieval miss ho jaye tab bhi bot galat naam (jaise "Anuj Kumar Yadav") na bole.

## 3. Razorpay code review (no key changes)

Aap ne kaha abhi sirf review — koi test key add nahi hogi, live flow ko haath nahi lagega. Main dunga:
- Web + Capacitor checkout, order-create, signature-verify, webhook fallback aur refund path ka rating (X/5) findings ke saath.
- Report `docs/audit/2026-09-01-razorpay-review.md` me.

## Technical notes

- `src/pages/AdminTrustedHosts.tsx` — naya chip tab + URL→host normalize + test action.
- `supabase/functions/pdf-proxy/index.ts` — `isAllowedPdfUrl` ko async DB-backed allow-list ke saath (static list fallback), cached.
- Seed rows `trusted_hosts` me insert (migration/data insert) + chatbot ke liye `chatbot_faq` / `knowledge_base` rows.
- `supabase/functions/chatbot/index.ts` — system prompt me institute-facts block.
- Verify: build + typecheck, aur teeno PDF links proxy se load hone ka live test.
