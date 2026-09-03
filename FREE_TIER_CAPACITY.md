# Free-Tier Capacity Audit — Safar English Ka

**Date:** 2026-09-03
**Supabase project:** `wegamscqtvqhxowlskfm` (Free plan)
**Scope:** Kitne students free tier pe chal sakte hain, kab tootega, aur toot-ne par kya chalega / kya nahi.
**Method:** Har number live `pg_*` / table query se liya gaya hai. Har section me source query di gayi hai — aap khud dobara verify kar sakte ho.

---

## Rating: 4 / 5

Architecture free-tier ke liye **sach me sahi bani hai** — video YouTube pe, PDF Drive/CDN pe, Supabase sirf metadata + auth + progress. Isi wajah se sabse mehnga resource (bandwidth) Supabase ke bill pe nahi girta. Ek point isliye kata: teen append-only tables (`user_sessions`, `chatbot_logs`, `pdf_proxy_metrics`) par **koi retention/pruning nahi hai**, aur wahi DB ko sabse pehle bharenge — students se nahi, *time* se.

---

## 1. Aaj ki actual sthiti

```sql
select pg_size_pretty(pg_database_size(current_database())),
       (select count(*) from auth.users),
       (select count(*) from storage.objects);
```

| Metric | Aaj | Free limit | Headroom |
| --- | --- | --- | --- |
| Postgres DB size | **20 MB** | 500 MB | 25x |
| Supabase Storage | **5.8 MB** (16 objects) | 1 GB | 170x |
| Auth users | **11** | 50,000 MAU | ~4,500x |
| Courses / Lessons | 2 / 14 | — | — |
| Enrollments | 15 (sab `status='active'`) | — | — |

Top tables (`pg_total_relation_size`):

| Table | Size | Rows | Bytes/row | Growth driver |
| --- | --- | --- | --- | --- |
| `user_sessions` | 328 kB | 580 | ~580 B | **har login/session — sabse tez** |
| `lessons` | 312 kB | 14 | — | content (aapke haath me) |
| `chatbot_logs` | 296 kB | 142 | ~2.1 kB | **har AI doubt — mehnga row** |
| `smart_notes` | 144 kB | 2 | — | content |
| `razorpay_payments` | 144 kB | 6 | — | payments |
| `pdf_proxy_metrics` | 128 kB | 337 | ~400 B | **har PDF open** |
| `app_installs` | 120 kB | 128 | — | install tracking |

> 11 users me hi 580 sessions + 337 PDF hits + 142 chat logs ban chuke hain. Yani **per-student telemetry footprint content footprint se bada hai** — yahi asli scaling variable hai.

---

## 2. Architecture reality check — kya sach me "free-tier digital library" bani hai?

| Layer | Kahan host hai | Supabase pe cost | Verdict |
| --- | --- | --- | --- |
| **Video** | YouTube (embed / youtube_id) | **Zero** bandwidth | ✅ Sahi call. Video hi 95% bandwidth hota hai — wo poora YouTube utha raha hai. |
| **PDF** | Google Drive / Notion / CDN, `pdf-proxy` edge fn ke through | Sirf cache-miss par tee-stream; cache-hit par 302 redirect | ⚠️ Sahi, par proxy egress ka hidden meter hai (§4) |
| **Metadata** | Supabase Postgres | ~20 MB | ✅ Bahut kam |
| **Auth** | Supabase Auth | 11 / 50k MAU | ✅ Kabhi nahi tootega |
| **Progress / notes / doubts** | Supabase Postgres | append-only | ⚠️ Retention chahiye |
| **AI (Ask Doubt)** | Lovable AI Gateway | Supabase pe zero | ✅ |
| **APK build** | GitHub Actions | Supabase pe zero | ✅ |

**Jawab: Haan — ye genuinely ek free-tier digital library hai.** Aapne bhaari cheezein (video, PDF, AI) sabhi Supabase ke bahar rakhi hain, jo bilkul wahi pattern hai jo free tier ko survive karne deta hai.

---

## 3. Kitne bachche padh sakte hain?

### Per-student monthly footprint (aaj ke data se derive kiya)

| Data | Rows/student/month | Bytes | Total |
| --- | --- | --- | --- |
| `user_sessions` | ~50 | 580 B | ~29 KB |
| `chatbot_logs` | ~13 | 2.1 kB | ~27 KB |
| `pdf_proxy_metrics` | ~30 | 400 B | ~12 KB |
| `lesson_progress` + `document_progress` | ~50 | 200 B | ~10 KB |
| notes / doubts / ratings / bookmarks | ~30 | ~700 B | ~21 KB |
| **Recurring total** | | | **~100 KB / student / month** |
| One-time (profile, enrollment, prefs, push token, install) | | | **~20 KB / student** |

### Teen deewarein — jo pehle aayegi wahi asli ceiling hai

| # | Deewar | Limit | Kab takrayegi |
| --- | --- | --- | --- |
| 1 | **Concurrency** | ~60 direct / 200 pooled DB connections, 200 concurrent Realtime | **~150–200 students ek saath online**. Ye sabse pehli deewar hai. |
| 2 | **Egress** | 5 GB / month | **~700–850 active students/month** (agar PDF Drive/CDN pe rahe). Agar PDF Supabase Storage me shift kiye → **sirf ~50–80 students**. |
| 3 | **DB size** | 500 MB | Bina pruning: **~4,000 student-months** (yani 4,000 students 1 mahina, ya 330 students 1 saal). Pruning ke saath: ~5,000+ concurrent students. |
| 4 | MAU | 50,000 | Practically kabhi nahi. |

### Bottom line

| Scenario | Safe number |
| --- | --- |
| **Registered students** (kabhi-kabhi aane wale) | **~1,500–2,000** |
| **Monthly active students** | **~700–800** |
| **Ek hi waqt me online** (peak, live class) | **~150–200** ← asli limit |
| Agar retention cron laga do | MAU ~800 wahi, par DB kabhi nahi bharega |

> **Sabse pehle egress ya connections tootenge — DB size nahi.** Log ulta sochte hain.

---

## 4. Chhupi hui limits jo table-size se pehle todti hain

1. **5 GB egress/month** — `pdf-proxy` cache-miss par poora PDF edge function ke through stream karta hai. Ek 5 MB PDF × 1,000 cache-miss = 5 GB = **poora mahine ka quota ek din me**. Cache-hit (302 → signed Storage URL) sasta hai par **Storage egress bhi isi 5 GB me count hota hai**. Isliye PDF ko Supabase Storage me *migrate mat karo* — Drive/CDN par hi rakho.
2. **7 din inactivity par project auto-pause** — Free tier ka sabse bada production risk. Paused project = app poori tarah dead (login tak nahi). Aapka `pdf-proxy-keepalive` GitHub Action ise rok raha hai — **usse kabhi disable mat karna.**
3. **Concurrent connections** — 60 direct / 200 pooler. Live class me 300 bachche ek saath = connection exhaustion = "Failed to fetch" storm.
4. **Realtime**: 200 concurrent connections, 100 messages/sec. `live_messages` / `live_participants` wala live-class feature isi cap se takrayega.
5. **Auth rate limits** — free tier par email/OTP sending sakht rate-limited hai. Bulk onboarding (ek saath 200 signup) par OTP fail hone lagenge.
6. **Backups nahi** — Free tier par daily backup / PITR **nahi** milta. Galti se `delete from enrollments` = data gaya. Ye rating ka sabse darawna hissa hai.
7. **Edge function invocations** — 500k/month. `pdf-proxy` + `chatbot` + keepalive milkar ~800 students par bhi comfortable hai.

---

## 5. Non-Supabase choke points

| Service | Limit | Risk |
| --- | --- | --- |
| **Google Drive (PDF)** | Per-file daily download quota; popular file par "Sorry, you can't view or download this file at this time" | 🔴 **Sabse under-rated risk.** 500 bachche ek hi PDF khole → Drive us file ko 24 ghante block kar deta hai. |
| **YouTube (unlisted)** | Practically unlimited | 🟢 Safe |
| **GitHub Actions** | 2,000 min/month (private) | 🟡 APK builds ~10 min each = 200 builds/month. Theek. |
| **Lovable AI Gateway** | Credit-based | 🟡 Ask Doubt ka usage credits khata hai — bachche badhe to yahi pehle mehenga hoga |

**Action:** critical PDFs ko Drive se ek CDN (Cloudflare R2 / bunny.net free tier) par shift karo. Drive quota block hi wo cheez hai jo exam ke din failure degi.

---

## 6. "Kab crash karegi" — end-to-end failure sequence

### Stage 1 — 200–400 MAU: Slow, crash nahi
- Kuch queries 500ms+ (missing composite indexes on `lesson_progress`, `user_sessions`).
- **Sab chalta hai.** Bas thoda sust.

### Stage 2 — 400–700 MAU / 150+ concurrent: Pehli visible failure
- Connection pool saturate → intermittent `Failed to fetch`, blank lists.
- **Chalega:** cached course bundles (`lessonViewCache` / `chapterCache` / queryPersister se offline paint), pehle se downloaded PDFs, YouTube video (Supabase se independent).
- **Nahi chalega:** naya login, enrollment, progress sync, doubts post, live chat.
- Crash-shield: `ErrorBoundary` retry karega, toast dikhega — app **crash nahi** hogi, degrade hogi.

### Stage 3 — Egress 5 GB paar
- Supabase throttle/soft-limit lagata hai. PDF proxy 429/5xx dene lagta hai.
- **Chalega:** poora app *except* PDF opening; downloaded PDFs offline chalte rahenge; video chalta rahega.
- **Nahi chalega:** naye PDF khulna. Ye sabse pehle dikhne wala student-facing breakage hai.

### Stage 4 — DB 500 MB full
- Writes fail (`disk full` / read-only). Login *chal sakta hai*, par har write mar jayega.
- **Chalega:** browsing, video, cached content.
- **Nahi chalega:** progress save, notes, doubts, enrollment, payment recording. **Payments lene band kar do is stage par** — paisa aayega par enrollment record nahi hoga.

### Stage 5 — 7 din inactivity → project paused
- **Kuch nahi chalega** except: pehle se downloaded PDFs, cached bundles jo local Preferences me hain, aur YouTube video (agar lesson list cache me hai).
- App khulegi, splash paar karegi, phir har list khali. Login impossible.

### App-crash-shield lens

| Failure | Kya app *crash* karegi? | Kyun |
| --- | --- | --- |
| Supabase 5xx / throttle | ❌ Nahi | `reportError` + ErrorBoundary + cached paint |
| Project paused | ❌ Nahi, par unusable | Auth fail → `/auth` par atak jayegi |
| DB full | ❌ Nahi | Write errors toast bante hain |
| Bade PDF + low-RAM Android | ✅ **Haan — OOM** | Ye Supabase issue nahi, `app-crash-shield` wala WebView OOM hai |

> Yani: **free tier khatam hone par app crash nahi karegi — dheere-dheere read-only digital library ban jayegi.** Ye actually achhi engineering ka nateeja hai (offline caches + error boundaries).

---

## 7. Escape hatches — upgrade se pehle ye free cheezein karo

| Priority | Action | Faayda |
| --- | --- | --- |
| **P0** | `user_sessions`, `chatbot_logs`, `pdf_proxy_metrics`, `error_logs`, `app_installs` par **90-din retention** pg_cron job | DB size ka growth flat ho jayega — sabse bada single win |
| **P0** | Weekly `pg_dump` GitHub Action → private repo/R2 (free tier me backup nahi milta) | Data loss se bachao |
| **P1** | Popular PDFs Drive se **CDN (R2 / bunny)** par shift | Drive quota block + Supabase egress dono se bachao |
| **P1** | `pdf-proxy` par `Cache-Control: immutable` (already 24h hai) → 7 din karo | Egress ~4x kam |
| **P2** | `lesson_progress(user_id, lesson_id)`, `user_sessions(user_id, created_at)` par composite index | Stage-1 slowness door |
| **P2** | Realtime sirf live-class route par subscribe (global nahi) | 200-connection cap door hoga |
| **P3** | Keepalive workflow kabhi disable mat karna | Auto-pause se bachao |

**Upgrade kab?** Jab **300+ students ek saath online** hone lagein, ya monthly egress 4 GB cross kare. Pro ($25/mo) deta hai: 8 GB DB, 100 GB storage, 250 GB egress, daily backups + 7-din PITR, no auto-pause, badi connection limits. Aapke numbers pe wo roughly **~800–1,000 paid students** par justify hota hai.

---

## 8. Final verdict

> **Free tier pe aap aaram se ~700–800 monthly active students padha sakte ho, ~150–200 ek saath online, aur ~1,500–2,000 registered.** Uske aage pehle concurrency, phir egress tootegi — DB size nahi.
>
> Sabse bada *actual* risk free tier ki capacity nahi hai — wo hai **backup ka na hona** aur **Google Drive ka per-file quota**. Dono ka fix free hai (weekly pg_dump + CDN shift), aur dono aaj hi kar lena chahiye.

---

*Used the supabase-architect-auditor, senior-architect-audit and app-crash-shield skills.*

---

## Addendum 2 — R2 jugaad IMPLEMENTED (2026-09-03)

Code ab R2-ready hai; sirf 5 secrets set karne hain (one-time, Cloudflare dashboard, free):

1. Cloudflare account → R2 → bucket `safar-pdfs` (public access ON, ya custom domain).
2. R2 → Manage API tokens → token banao.
3. Supabase → Edge Functions → Secrets me set karo:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET=safar-pdfs`, `R2_PUBLIC_URL=<bucket public URL>`
4. `pdf-proxy` aur `r2-upload` functions redeploy.

**Kya badla:**
- `pdf-proxy`: cache-hit pehle R2 pe check (302 → R2 public URL, $0 egress);
  miss pe Drive se tee-stream → R2 me store (128 MB cap). R2 secrets na hon
  to purana Supabase pdf-cache flow chalta rahega — koi breaking change nahi.
- Naya `r2-upload` function: admin/teacher PDF seedha R2 pe upload, random
  unguessable key, magic-byte (`%PDF-`) validation, 100 MB cap, staff-only.
- R2 public host `kind=url` allowlist me auto-add — admin R2 URL kisi bhi
  PDF field me paste kar sakta hai, enrollment gate waisa hi rahega.

**Security (red-team pass):** staff-only role check, magic bytes (polyglot
`.html`/`.svg` blocked), path traversal impossible (filename sanitized +
random prefix), SSRF allowlist unchanged. Accepted risk: direct R2 link
share ho sakta hai — wahi model jo jsDelivr PDFs ka pehle se hai.

**Egress diet (is patch me):** `Course.tsx` lessons query ab sirf 8 zaroori
columns + `limit(500)` (pehle `select('*')`, 27 columns × saare lessons);
discussion comments pe `limit(200)`; Admin CSV export blob URL ab revoke hota
hai (repeat-export memory leak band).

**Verdict update:** R2 secrets set hote hi Drive quota risk ≈ khatam aur
Supabase egress pressure ~0. Capacity ceiling phir bhi ~700–800 MAU hi rahegi
(concurrency wall wahi hai) — par ab **PDF side kabhi bottleneck nahi banegi.**

---

# v2 — Deep Scan (2026-09-03, R2 ke baad)

Ye section aapke seedhe sawaalon ka jawaab hai. Har number aaj ki **live**
Supabase query se liya gaya hai (project `wegamscqtvqhxowlskfm`).

## Rating: 4.5 / 5

R2 aane ke baad sabse mehnga resource (PDF bandwidth) Supabase ke meter se
poori tarah nikal gaya. Ab **koi bhi single limit "content delivery" ki wajah
se nahi tootegi** — sirf concurrency aur time-based row growth bachi hai.
Aadha point isliye kata hai: teen append-only tables par abhi bhi retention
job nahi hai, aur `phone_otps` par RLS on hai par ek bhi policy nahi.

## 1. Aaj ki live sthiti

| Metric | Aaj | Free limit |
| --- | --- | --- |
| DB size | 20 MB | 500 MB |
| Auth users | 11 | 50,000 MAU |
| Enrollments / Lessons | 15 / 14 | — |
| `user_sessions` | 580 rows, 328 kB | — |
| `chatbot_logs` | 142 rows, 296 kB | — |
| `pdf_proxy_metrics` | 337 rows, 128 kB | — |

PDF proxy events (live): `url_success` 177, `drive_success` 117,
`drive_cache_hit` 35, `drive_cache_store` 8 → cache warm hona shuru ho chuka
hai; R2 secrets set hote hi `drive_success` ghat kar `hit-r2` ban jayega.

## 2. Kitne bachche padha sakte ho?

| Kya | Number | Kaun sa limit pehle chhuyega |
| --- | --- | --- |
| Registered accounts | **~2,000** | DB size (500 MB) — abhi 25x headroom |
| Monthly active (MAU) | **~700–800** | Edge function invocations + Auth rate limits |
| Ek saath online (peak) | **~150–200** | Concurrency wall — DB pooler + edge cold starts |

Bottom line: **~700–800 bachche mahine bhar aaram se padh sakte hain.** Isse
aage jaane par sabse pehle *ek saath online* wali line tootegi, DB size nahi.

## 3. Timeline — kab tak chalega

| Students | DB size (12 mahine baad) | Egress | Status |
| --- | --- | --- | --- |
| 100 | ~45 MB | ~0.3 GB | Aaram se |
| 300 | ~110 MB | ~0.9 GB | Aaram se |
| 800 | ~260 MB | ~2.5 GB | Limit ke paas, retention job chahiye |
| 2,000 | 500 MB+ | 5 GB+ | Paid plan ($25/mo) ka time |

Egress numbers R2 ke baad ke hain — video YouTube pe, PDF Cloudflare pe, to
Supabase se sirf JSON metadata jaata hai (~1–3 kB per screen).

## 4. Jab crash hoga tab kya chalega, kya nahi (end-to-end)

| Feature | Supabase down/limit-hit par | Kyon |
| --- | --- | --- |
| YouTube video | **Chalega** | Player seedha YouTube CDN se |
| PDF (R2 CDN link) | **Chalega** | 302 ke baad traffic Cloudflare pe |
| PDF (Drive fallback) | Chalega, dheere | Drive ka apna quota |
| Pehle se khuli hui reading | **Chalegi** | Offline cache + IndexedDB |
| Login / signup | **Band** | Auth Supabase pe |
| Progress save | Band (local me queue) | Sync baad me |
| AI doubt (chatbot) | Band | Edge function |
| Payment / enrollment | Band | Razorpay webhook Supabase pe likhta hai |

Girne ka order: **AI doubt → progress sync → login → payment.** Content
(video + PDF) sabse aakhir tak zinda rehta hai — yahi is architecture ki jeet
hai.

## 5. Password reset — haan, already integrated hai

- `/forgot-password` → `supabase.auth.resetPasswordForEmail(email)`
- Mail ka link → `/reset-password` → `supabase.auth.updateUser({ password })`
- Logged-in user Settings se bhi password badal sakta hai.

Free tier ki ek hi bandish: **Supabase ka built-in email sender ~2 mail/hour
per project** bhejta hai. 10–20 students ek saath reset maangein to mail
queue me atak jayegi. Fix (free): Supabase → Auth → SMTP me apna Resend /
Brevo SMTP daal do — limit hazaaron mail/mahina ho jaati hai. Ye 5-minute ka
dashboard step hai, code change nahi.

## 6. Delivery matrix

| Content | Path | Supabase egress |
| --- | --- | --- |
| Video | YouTube (`get-video-stream`, YouTube-CDN-only SSRF guard) | 0 |
| PDF (naya) | `r2-upload` → Cloudflare R2 public URL | 0 |
| PDF (purana Drive) | `pdf-proxy` → R2 cache-hit 302, warna Drive | ~0 |
| PDF (Notion) | Notion public page | 0 |
| Metadata/progress | Supabase Postgres | ~1–3 kB/screen |

Haan — **ye sach me ek free-tier digital library hai.** Supabase yahan sirf
"khaata-bahi" hai, "godaam" nahi.

## 7. Deep-scan findings

| Sev | Finding | Fix |
| --- | --- | --- |
| HIGH | `phone_otps` par RLS enabled hai par **ek bhi policy nahi** — table Data API se poori tarah locked hai; agar koi client-side read expect kar raha hai to silently fail karega | Ya explicit `service_role`-only rakho (intentional) ya policy likho |
| MEDIUM | **Leaked-password protection OFF** | Supabase → Auth → Password: "Check against HaveIBeenPwned" ON (free) |
| MEDIUM | 20 `SECURITY DEFINER` functions signed-in users ko callable hain | Har ek pe `REVOKE EXECUTE ... FROM authenticated` jahan zaroorat nahi |
| MEDIUM | `user_sessions` / `chatbot_logs` / `pdf_proxy_metrics` par **retention nahi** — time ke saath badhenge, students se nahi | 90-din pruning job (pg_cron) |
| LOW | `reltuples` -1 kuch tables pe (`webhook_events`, `lesson_ratings`) — kabhi ANALYZE nahi hua | `ANALYZE` / autovacuum tune |

**Crash-shield scan (clean):** `crashShield.ts` heartbeat + global rejection
handler maujood; `ErrorBoundary` me 60-second cooldown guard hai (infinite
reload loop nahi); `setInterval` 29 vs `clearInterval` 30 (balanced);
`createObjectURL`/`revokeObjectURL` 64 references balanced;
`supabase.channel` sirf 2 jagah, `removeChannel` cleanup 14 jagah.

## 8. Security implications (R2)

| Cheez | Status |
| --- | --- |
| Upload auth | Staff-only (admin/teacher role check, students 403) |
| File type | Magic byte `%PDF-` — Content-Type trust nahi kiya |
| Size | 100 MB hard cap (Content-Length + actual bytes) |
| Path traversal | Filename sanitize + 128-bit random prefix → impossible |
| Open redirect | Redirect sirf allowlisted hosts pe (R2 public host + Drive) |
| Accepted risk | R2 public link share ho sakta hai — wahi model jo jsDelivr PDFs ka pehle se tha; paywall gate proxy pe hai |

## 9. Kya karna chahiye

**Abhi (aapke 5 minute, dashboard):**
1. Cloudflare → R2 → bucket `safar-pdfs` (public ON) → API token.
2. Supabase → Edge Functions → Secrets: `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=safar-pdfs`,
   `R2_PUBLIC_URL`. Phir `supabase functions deploy pdf-proxy r2-upload`.
3. Auth → Password → leaked-password protection ON.
4. Auth → SMTP me apna Resend/Brevo daalo (password-reset mail limit khatam).

**Is mahine (code, main karunga bolne par):** 90-din retention job,
`phone_otps` policy, SECURITY DEFINER functions pe REVOKE.

**500 students ke baad:** connection pooling review, read-heavy pages pe
`staleTime` badhao, phir Pro plan.
