# Safar English — Operator Manual (Hinglish)

Ye file 10 minute me poora project chalana sikhati hai. Deep detail har topic ke
liye `docs/manual/` folder me hai.

---

## 1. Project kya hai

| Layer | Tech |
| --- | --- |
| Web app | React + Vite + TypeScript + Tailwind |
| Mobile app | Capacitor (Android), APK GitHub Actions se banti hai |
| Backend | Supabase (Postgres + RLS + Edge Functions + Storage) |
| AI | Lovable AI Gateway (`LOVABLE_API_KEY` edge-function secret) |
| Payments | Razorpay (UPI intent: PhonePe / GPay / Paytm) |
| E2E | Maestro (Android emulator) + Playwright (web) |

---

## 2. Local setup (5 command)

```bash
bun install
bun run dev            # http://localhost:8080
bun x tsgo --noEmit -p tsconfig.app.json
bun run test
bun run build
```

---

## 3. Secrets — kaun kahan

**Kabhi bhi secret value ko code, chat ya commit me mat daalein.**

| Secret | Kahan set hota hai | Kis kaam ka |
| --- | --- | --- |
| `LOVABLE_API_KEY` | Supabase → Edge Functions → Secrets | Chatbot / doubt / summarizer |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Supabase Edge Function secrets | Order create + webhook verify |
| `MAESTRO_EMAIL` / `MAESTRO_PASSWORD` | GitHub → Settings → Secrets → Actions | E2E student login |

---

## 4. "⚠️ AI abhi busy hai" aaye to

Ye message ab sirf ek matlab rakhta hai — **AI key invalid ya unregistered hai**.
Check karne ka ek command:

```bash
curl -s -X POST https://wegamscqtvqhxowlskfm.supabase.co/functions/v1/ai-health \
  -H "apikey: <anon key>" -H "Content-Type: application/json"
```

- `{"ok":true}` → AI theek hai, problem kahin aur hai.
- `{"ok":false,"code":"gateway_unauthorized"}` → **key rotate karein**:
  Lovable project → Cloud/AI settings → rotate `LOVABLE_API_KEY` → edge functions
  re-deploy. 30 second ka kaam hai.

Detail: [docs/manual/ai-chatbot.md](docs/manual/ai-chatbot.md)

---

## 5. Android APK

```bash
bun run build
npx cap sync android
cd android && ./gradlew assembleDebug --no-daemon
# → android/app/build/outputs/apk/debug/app-debug.apk
```
CI: GitHub Actions → **Build APK** workflow (`v*` tag ya manual dispatch).
Detail: [docs/manual/android-build.md](docs/manual/android-build.md)

---

## 6. Release karna

1. `main` green ho (typecheck + tests + build).
2. Tag banayein: `v1.3.0` jaisa numeric tag (versionName numeric hona chahiye).
3. Release publish karein, debug APK attach karein.

Checklist: [docs/manual/release-checklist.md](docs/manual/release-checklist.md)

---

## 7. Topic-wise deep manual

- [AI chatbot](docs/manual/ai-chatbot.md)
- [Payments & UPI](docs/manual/payments-upi.md)
- [Android build](docs/manual/android-build.md)
- [CI & E2E](docs/manual/ci-e2e.md)
- [Crash & performance](docs/manual/crash-and-perf.md)
- [Security](docs/manual/security.md)
- [Supabase](docs/manual/supabase.md)
- [Release checklist](docs/manual/release-checklist.md)
