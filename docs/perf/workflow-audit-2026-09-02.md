# Workflow audit — 2026-09-02

Scope: all 14 GitHub Actions workflows on `Creatoranuj/safarenglishka`, plus the
post-login render path that both the emulator and real devices have to survive.

## Status per workflow

| Workflow | Last state | Useful? | Verdict |
| --- | --- | --- | --- |
| Safar English (build APK + release) | ✅ #77, 3m 38s | Yes | The release gate. Green after the shell-continuation fix. |
| Code Guards | ✅ | Yes | Cheap, catches committed mistakes. Keep. |
| Playwright E2E | ✅ | Yes | Chromium-only, fast, real coverage. Keep. |
| Enrollment Bypass Regression | ✅ | Yes — highest value | Proves a paid course cannot be self-enrolled. Keep. |
| PDF + Notion Edge Keepalive | ✅ | Yes | Stops the edge functions cold-starting. Keep. |
| Dependency Security Audit | ❌ 6 real findings | Yes | Failing for a correct reason — see below. |
| Maestro Android E2E | ❌ #60 | Partly | Infrastructure-limited. See the investigation below. |
| Razorpay Smoke (test mode) | ❌ HTTP 401 | Yes, once fixed | `RAZORPAY_KEY_SECRET` in repo secrets is rotated/invalid. Only you can replace it. |
| Lighthouse CI | ❌ stale | No | Auto-trigger disabled since 2026-07-19. Noise. |
| Signed APK Smoke | ❌ stale | No | Same — disabled, duplicates the Maestro path. |

### Dependency audit — the 6 findings are real

`node scripts/verify-osv-findings.mjs` reports 6 real / 0 phantom:
`body-parser` GHSA-v422-hmwv-36x6, `dompurify` GHSA-c2j3-45gr-mqc4 and
GHSA-55q2-fjhq-7xh7, `react-router` GHSA-wrjc-x8rr-h8h6, GHSA-h8fp-f39c-q6mh,
GHSA-337j-9hxr-rhxg. The job should stay red until these are upgraded — do not
silence it.

## Maestro Android E2E — what actually kills it

Four runs, each one narrowing the cause. This is the useful part of the audit.

| Run | Change | Survival | Failure |
| --- | --- | --- | --- |
| #56 | baseline | 92s | `DeviceServerDiedException` during `viewHierarchy` |
| #57 | one retry added | 92s | identical |
| #58 | settle step + `-no-snapshot-save` | 109s | `device 'emulator-5554' not found` |
| #59 | host instrumentation | ~95s | same, **host proven healthy** |
| #60 | `-gpu guest` | **272s** | same, but 3× further |

The decisive measurement is run #59. The suspicion was that the runner was
OOM-killing qemu. It is not:

- available memory never fell below **10.2 GB of 16 GB** across the whole flow,
- `dmesg` listed **no** `oom-kill` / `killed process` entries,
- and qemu still disappeared — `device 'emulator-5554' not found`, then
  `could not connect to TCP port 5554: Connection refused`.

A healthy host plus a vanished emulator process means the fault is inside the
emulator, not around it. Swapping `-gpu swiftshader_indirect` for `-gpu guest`
(rasterise in the guest instead of translating guest GL inside the host qemu
process) took survival from 92s to 272s — same failure, three times later.
That confirms the renderer is the pressure point but does not remove it.

Conclusion: **this is an emulator limitation, not a product regression.** The
flow reaches and passes the Sign In tap every time
(`step-019-tapOnElement-Sign_In.json` is in every artifact). Chasing it further
on a shared runner has diminishing returns; the next real step is a physical
device farm (Firebase Test Lab) rather than more emulator flags. Until then
Playwright E2E and the enrollment regression are the trustworthy gates.

## Product fixes that came out of this

The emulator dying during the post-login render pointed at a genuine
client-side problem, which is now fixed:

`src/pages/Dashboard.tsx` mounted `HeroCarousel`, `UpcomingLiveSessions` and
`UpcomingSchedule` — three components with their own queries and animations —
in the same frame as the rest of the dashboard. They are now behind
`lazy()` + `Suspense` with skeleton fallbacks, so the first post-login frame is
the header plus the active-course card. This is the same hitch low-end Android
devices feel on login, so the win is not CI-only.

`maestro/smoke.yaml` now settles that frame with `waitForAnimationToEnd`
(screenshot-based) instead of `extendedWaitUntil` (hierarchy-based), so the
driver is not asking a busy WebView for a view tree during first paint.

## Build pipeline

The "AAB not produced" line on run #77 is a **notice, not a failure**.
`:app:bundleRelease` only runs when `PLAY_SERVICE_ACCOUNT_JSON` is set; it is
not, so the AAB step is skipped and roughly 60-90s is saved per build. The APK
is built, signed and attached to the release. Add that secret when you are
ready to publish to the Play Store and the warning disappears by itself.

## Test account recommendation

Do not put an admin account in `MAESTRO_EMAIL` / `MAESTRO_PASSWORD`. Repository
secrets are visible to every workflow, and the E2E job uploads screenshots and
view-hierarchy JSON as artifacts — an admin session would publish admin data
into those artifacts. Use a dedicated student account with no row in
`public.user_roles` and one paid-course enrollment.
