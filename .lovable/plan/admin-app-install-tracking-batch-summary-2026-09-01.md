# Admin: App Install Tracking + Batch Summary

## Kya banega

### 1. APK downloads (GitHub) — already hai, verify + upgrade
Admin → Analytics → Payments tab me "APK Downloads (GitHub)" card pehle se hai aur `MrAnujBabu/Safar-Englishka-Install` repo se live count laata hai. Ise Analytics ka apna hissa banaya jayega:
- Card ko Payments tab se hata kar ek naye "App / Installs" tab me le jayenge (Analytics page par).
- Har release ke saath per-asset (APK file) download count aur latest version highlight.
- Note: GitHub sirf **anonymous total downloads** deta hai — kaun student ne download kiya, ye GitHub nahi bata sakta. Isliye niche in-app tracking add ho rahi hai.

### 2. In-app install tracking (naya)
App pehli baar khulne par ek install record banega (Android APK, Android WebView, ya Web).
- Har device ka ek stable local device-id (localStorage/Preferences) banega.
- Record hoga: device id, platform (android/web), app version, first_seen, last_seen, aur logged-in hone par user_id.
- Login hone par usi device record se user_id link ho jayega — to "kitne students ne app install kiya" ka real answer milega.

Admin me dikhega (naya "App / Installs" tab):
- Total installs, Android app installs vs Web users
- Linked students (jinka account juda hai) vs unknown devices
- Active in last 7 / 30 days
- Naye installs ka daily chart (chuni hui date range me)
- Recent installs ki list: student naam/email, platform, app version, last seen

### 3. Batch-wise students — dashboard summary
Batch Monitor page (`/admin/batch-monitor`) pehle se per-batch roster deta hai. Ab Admin dashboard par ek summary card add hoga:
- Har batch (course) ka naam + total students, active students, avg progress
- Total students across batches
- "View" click par us batch ka Batch Monitor khulega

## Technical notes

**DB migration (new table `public.app_installs`)**
- Columns: `id uuid pk`, `device_id text unique`, `user_id uuid null`, `platform text`, `os_version text null`, `app_version text null`, `source text` (github_apk / web / unknown), `first_seen_at timestamptz default now()`, `last_seen_at timestamptz default now()`.
- GRANTs pehle, phir RLS: `anon`/`authenticated` ko sirf ek SECURITY DEFINER RPC `record_app_install(...)` ke through upsert milega (direct table INSERT/SELECT nahi). Read policy: sirf `has_role(auth.uid(),'admin')`.
- RPC `record_app_install` — `SET search_path = public`, rate-limited via existing `check_rate_limit_text`, device_id par upsert, logged-in hone par user_id set.
- Admin summary ke liye RPC `admin_get_install_stats(_from, _to)` aur `admin_get_batch_summary()` (SECURITY DEFINER + admin check), taaki dashboard ek hi call me data le.

**Frontend**
- `src/lib/installTracker.ts` — device id generate/persist (Capacitor Preferences + localStorage fallback), app boot par ek baar RPC call, 24h throttle (bandwidth safe).
- App bootstrap me call (App.tsx / main entry), failure silently ignore.
- `src/components/admin/analytics/InstallsSection.tsx` — naya tab content (stat cards + daily chart + recent table), lazy-loaded jaise baaki sections.
- `src/components/admin/BatchSummaryCard.tsx` — dashboard par batch-wise counts, `admin_get_batch_summary()` se.
- `ApkDownloadsCard` ko naye Installs tab me move karenge; repo constant ek jagah rakha jayega.

## Jo nahi ho sakta
GitHub Releases API se ye pata nahi chalta ki kaun person ne APK download kiya — sirf total count milta hai. Naam-wise tracking tabhi milegi jab woh app install karke kholte hain (upar wala in-app tracking).
