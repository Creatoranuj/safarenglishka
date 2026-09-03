# Cloudflare R2 Setup — Step by Step (Hindi/Hinglish)

Iska maqsad: PDF delivery Supabase se hata kar Cloudflare R2 pe le jaana.
R2 free tier = **10 GB storage, $0 egress**. Iske baad PDF kabhi bhi
bottleneck nahi banegi.

Code pehle se ready hai (`supabase/functions/_shared/r2.ts`,
`pdf-proxy`, `r2-upload`). Sirf **secrets** set karne hain aur **deploy**.

---

## Part A — Cloudflare (aapke 4 click, ~3 minute)

### A1. R2 enable karo
1. https://dash.cloudflare.com pe login
2. Left sidebar → **R2 Object Storage**
3. Pehli baar ho to **"Enable R2"** / "Purchase R2" pe click.
   Card add karna pad sakta hai, par **10 GB tak koi charge nahi** hota.

### A2. Bucket banao
1. **Create bucket**
2. Name: `safar-pdfs` (bilkul yahi, chhote akshar)
3. Location: **Automatic**
4. **Create bucket**

### A3. Public access ON karo  ← ye step miss mat karna
1. Bucket `safar-pdfs` kholo → tab **Settings**
2. Section **Public Development URL** (ya "R2.dev subdomain")
3. **Enable** → confirm me `allow` type karna pad sakta hai
4. Ab ek URL dikhega jaisa:
   `https://pub-xxxxxxxxxxxxxxxx.r2.dev`
   **Ye URL copy karke rakho** → yahi `R2_PUBLIC_URL` hai.

> Aage chal ke custom domain (`pdf.safarenglishka.com`) bhi laga sakte ho —
> tab bas `R2_PUBLIC_URL` badal dena, aur kuch nahi.

### A4. API token banao
1. R2 ke main page pe upar right → **Manage R2 API Tokens**
2. **Create API Token**
3. Token name: `safar-pdf-upload`
4. Permissions: **Object Read & Write**
5. Specify bucket: `safar-pdfs` (ya "Apply to all buckets")
6. **Create API Token**

Ab screen pe teen cheezein dikhengi — **ye page dobara nahi khulega**, isliye
turant copy karo:

| Screen pe naam | Kis secret me jayega |
| --- | --- |
| **Access Key ID** | `R2_ACCESS_KEY_ID` |
| **Secret Access Key** | `R2_SECRET_ACCESS_KEY` |
| Account ID (dashboard URL me `dash.cloudflare.com/<yahan>`) | `R2_ACCOUNT_ID` |

---

## Part B — Supabase Edge Secrets (5 values)

| Secret naam | Value | Example |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare Account ID | `a1b2c3d4e5f6...` (32 hex chars) |
| `R2_ACCESS_KEY_ID` | A4 se | `f0e1d2c3...` |
| `R2_SECRET_ACCESS_KEY` | A4 se | `9a8b7c6d...` (lamba) |
| `R2_BUCKET` | bucket ka naam | `safar-pdfs` |
| `R2_PUBLIC_URL` | A3 wala URL, **bina trailing slash** | `https://pub-xxxx.r2.dev` |

### Rasta 1 — Dashboard se (mouse se, aasan)
1. https://supabase.com/dashboard/project/wegamscqtvqhxowlskfm/settings/functions
2. **Edge Function Secrets** section
3. Upar wali table ke 5 naam-value **Add new secret** se ek-ek karke daalo
4. Save

### Rasta 2 — CLI se (ek command)
```bash
supabase login
supabase link --project-ref wegamscqtvqhxowlskfm

supabase secrets set \
  R2_ACCOUNT_ID=<account-id> \
  R2_ACCESS_KEY_ID=<access-key-id> \
  R2_SECRET_ACCESS_KEY=<secret-access-key> \
  R2_BUCKET=safar-pdfs \
  R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

---

## Part C — Deploy (repo root se)

```bash
supabase functions deploy pdf-proxy
supabase functions deploy r2-upload
```

Ya ek saath:
```bash
supabase functions deploy pdf-proxy r2-upload
```

Deploy ke baad secrets automatically function ko mil jaate hain — restart
karne ki zaroorat nahi.

---

## Part D — Verify (chal gaya ya nahi?)

### D1. Browser se
1. App me koi PDF wala lesson kholo
2. DevTools → **Network** → `pdf-proxy` wali request dhoondo
3. Response headers me dekho:
   - `X-Pdf-Cache: hit-r2` → **R2 se aa raha hai, perfect**
   - `X-Pdf-Cache: miss` pehli baar normal hai — dusri baar `hit-r2` hona chahiye
   - Status `302` aur `Location:` me `pub-xxxx.r2.dev` → sahi

### D2. SQL se
```sql
select event, count(*)
from pdf_proxy_metrics
where created_at > now() - interval '1 day'
group by 1 order by 2 desc;
```
Kya dekhna hai: `drive_cache_hit` **badhna** chahiye, `drive_success`
**girna** chahiye. Do-teen din me `drive_cache_hit` sabse upar aa jayega.

### D3. Cloudflare se
R2 → `safar-pdfs` → Objects — PDF files dikhni chahiye.
Metrics tab me requests ka graph.

---

## Part E — Troubleshooting

| Kya dikh raha hai | Matlab | Fix |
| --- | --- | --- |
| `503 {"error":"R2 is not configured on the server"}` | koi secret missing hai ya deploy nahi hua | Part B dobara check, phir Part C |
| `403` upload pe | API token me write permission nahi | A4 dobara, "Object Read & Write" chuno |
| Public URL pe `401` / `Unauthorized` | bucket public nahi hai | A3 — Public Development URL enable karo |
| `X-Pdf-Cache: miss` hamesha | R2 me store fail ho raha hai | Supabase → Functions → `pdf-proxy` → Logs dekho |
| PDF 128 MB se bada | proxy ka cap hai | Admin panel se `r2-upload` use karo (100 MB cap) ya file compress |
| Function logs me `SignatureDoesNotMatch` | Secret Access Key galat copy hui | A4 dobara, naya token banao |

Logs: https://supabase.com/dashboard/project/wegamscqtvqhxowlskfm/functions/pdf-proxy/logs

---

## Part F — Rollback (agar kuch bhi gadbad ho)

Bas secrets hata do:
```bash
supabase secrets unset R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_PUBLIC_URL
```
Code apne aap purane Drive/Supabase path pe wapas chala jayega.
**Koi data loss nahi** — R2 me padi files waise hi rahengi, aur secrets wapas
set karte hi phir se use hone lagengi.

---

## Security note

- `R2_SECRET_ACCESS_KEY` kabhi kisi ko na bhejo, na code me likho — sirf
  Supabase Edge Secrets me.
- Bucket public hai, matlab **direct R2 link share ho sakta hai**. Ye wahi
  accepted risk hai jo pehle jsDelivr-hosted PDFs ka tha. Paywall gate
  `pdf-proxy` ke enrollment check pe hai, file pe nahi.
- `r2-upload` sirf admin/teacher role ko allow karta hai, magic-byte `%PDF-`
  check karta hai, 100 MB cap lagata hai, aur filename sanitize karke random
  128-bit prefix lagata hai (path traversal impossible).
- Agar token kabhi leak ho: Cloudflare → Manage R2 API Tokens → **Roll/Delete**
  → naya banao → Part B + C dobara.
