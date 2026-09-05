# Selling this codebase as a template on Gumroad

A checklist for turning this repository into a clean, buyer-ready starter kit with **zero personal or project-specific data** left inside.

---

## 1. Start from a fresh copy, never the live repo

```sh
git clone --depth 1 https://github.com/<you>/<repo>.git template
cd template
rm -rf .git
git init
```

The template must have **no git history** — old commits contain keys, URLs, emails and screenshots that scrubbing the working tree will not remove.

---

## 2. Remove every secret and identifier

| Item | Action |
|---|---|
| `.env`, `.env.local`, `.env.production` | delete; ship only `.env.example` with empty values |
| Supabase project URL + anon key | replace with `YOUR_SUPABASE_URL` / `YOUR_SUPABASE_ANON_KEY` |
| Supabase project ref in `supabase/config.toml` | replace with `your-project-ref` |
| Razorpay key id and webhook URLs | replace with `rzp_test_XXXXXXXX` placeholders |
| CDN / object storage / meeting / AI provider keys | remove, document as required env vars |
| Service-account JSON, keystores, `*.jks`, `*.p12` | delete |
| Android `applicationId`, iOS bundle id | change to `com.example.app` |
| Push certificates, sender ids | delete |
| Analytics / error-tracking DSNs | remove |

Then verify nothing survived:

```sh
grep -rInE "rzp_(live|test)_|sb_secret_|service_role|eyJhbGciOi|@gmail\.com|\+91[0-9]{10}" . \
  --exclude-dir=node_modules --exclude-dir=dist
```

This must return **no results** before you package anything.

---

## 3. Remove personal and business content

- Brand name, logo, favicon, splash screens, app icons — replace with neutral placeholders.
- Course names, teacher names, photos, testimonials, chat/social links, phone numbers, addresses.
- Legal pages (Privacy, Terms, Refund) — keep the page structure, replace the body with `TODO: add your own policy`.
- Real user data, seed SQL containing real rows, exported CSVs, database dumps.
- Internal docs: audit reports, release reports, credential notes — anything naming people, projects or infrastructure.
- Screenshots and demo videos showing real users or real dashboards.

---

## 4. What the buyer receives

```text
template/
  src/                    app code, no branding
  supabase/
    migrations/           schema only, no data rows
    functions/            edge functions reading placeholder env vars
  .env.example
  README.md               what it is, stack, features
  SETUP.md                step-by-step install
  LICENSE                 your chosen license
  CHANGELOG.md            fresh, starting at 1.0.0
```

### `SETUP.md` must cover

1. Prerequisites (Node/Bun version, package manager).
2. `cp .env.example .env` and where each value comes from.
3. Create a Supabase project, run migrations, deploy edge functions.
4. Which secrets go into Edge Function secrets (never into the frontend).
5. Payment gateway setup: test keys first, webhook registration, how to switch to live.
6. Local run, production build, mobile build if the Capacitor shell is included.
7. Known limitations and what is intentionally not included.

---

## 5. Licensing

Pick one, put it in `LICENSE` and in the Gumroad description:

- **Single-site / personal** — one project per purchase, no resale.
- **Extended / commercial** — unlimited own projects, still no resale as a template.

State clearly: source code is provided as-is; no hosting, database or third-party account is included, and buyers pay their own infrastructure bills.

---

## 6. Third-party check

Every dependency, font, icon set and image you ship must be redistributable. Remove paid assets, licensed fonts and stock images you cannot resell. Keep license notices for MIT libraries.

---

## 7. Gumroad listing

- **Title:** what it builds, in one line.
- **Description:** stack, feature list, screenshots of the *neutral* template (not the live site), what is and is not included, refund policy.
- **Product file:** a single ZIP of the scrubbed template. Re-extract the ZIP and re-run the grep from section 2 before uploading.
- **Versioning:** bump the ZIP on each update; buyers get notified.
- **Support:** state the window, e.g. "email support for setup issues, 30 days".

---

## 8. Final pre-upload gate

```sh
rm -rf node_modules dist .output android/app/build ios/App/build
grep -rInE "rzp_(live|test)_|sb_secret_|service_role|eyJhbGciOi" . | head
npm install && npm run build
```

Ship only when the build passes from the clean clone and the secret grep is empty.
