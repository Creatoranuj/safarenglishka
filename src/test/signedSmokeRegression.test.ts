import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("signed APK smoke regression guards", () => {
  const root = resolve(__dirname, "../..");

  it("keeps smoke.yaml a thin composition over the split gates", () => {
    const smoke = readFileSync(resolve(root, "maestro/smoke.yaml"), "utf8");
    // A failure must name its own class in the job log: login vs navigation.
    expect(smoke).toContain("runFlow: login.yaml");
    expect(smoke).toContain("runFlow: nav.yaml");
  });

  it("asserts profile identity without the masked email or the bare nav label", () => {
    const nav = readFileSync(resolve(root, "maestro/nav.yaml"), "utf8");
    const login = readFileSync(resolve(root, "maestro/login.yaml"), "utf8");
    // The email is a masked secret in CI, so asserting it can never match.
    expect(login).not.toContain("visible: ${MAESTRO_EMAIL}");
    expect(nav).not.toContain("visible: ${MAESTRO_EMAIL}");
    // "Profile" alone is the bottom-nav label and stays visible even when the
    // tab never opened, so the assertion must be built from page-body copy.
    expect(nav).toContain('visible: "Personal Information|Sign Out|Account Settings"');
    // Every id matcher needs a text fallback: run #61 proved the driver does
    // not expose DOM ids, so an id-only tap silently misses the tab.
    expect(nav).toContain('id: "bottom-nav-profile"');
    expect(nav).toContain('text: "^Profile$"');
    expect(nav).toContain('text: "^Settings$"');
  });

  it("fails fast when the login form was submitted empty", () => {
    const login = readFileSync(resolve(root, "maestro/login.yaml"), "utf8");
    // Runs #47/#48 typed into the <label> that shares id "email" with the
    // input, submitted a blank form, and only failed 120s later on a dashboard
    // token. index: 1 selects the real input; the guard fails in ~2s instead.
    expect(login).toContain('id: "email"');
    expect(login).toContain("index: 1");
    // a11y-tree fallback: the WebView input surfaces as an EditText whose text
    // is "<aria-label> <placeholder>" and carries no resource-id (run #61).
    expect(login).toContain('text: "Email Address you@example.com"');
    expect(login).toContain('text: "Password ••••••••"');
    expect(login).toContain('text: "Please fill in all fields"');
  });

  it("lets the post-login frame settle without polling the view hierarchy", () => {
    const login = readFileSync(resolve(root, "maestro/login.yaml"), "utf8");
    // Runs #56/#57 died with DeviceServerDiedException while polling
    // viewHierarchy against the still-rendering dashboard. waitForAnimationToEnd
    // is screenshot-based and must stay the first step after Sign In.
    expect(login).toContain("waitForAnimationToEnd");
    expect(login).not.toContain('visible: "Signing in|');
  });



  it("exposes deterministic bottom-nav ids for Maestro", () => {
    const bottomNav = readFileSync(resolve(root, "src/components/Layout/BottomNav.tsx"), "utf8");
    expect(bottomNav).toContain('id: "bottom-nav-my-courses"');
    expect(bottomNav).toContain('id: "bottom-nav-downloads"');
    expect(bottomNav).toContain('id: "bottom-nav-profile"');
  });

  it("exposes a Profile settings CTA for the Play Store policy guardrail", () => {
    const profile = readFileSync(resolve(root, "src/pages/Profile.tsx"), "utf8");
    expect(profile).toContain('id="profile-settings"');
    expect(profile).toContain('navigate("/settings")');
  });

  it("does not enable Maestro debug screenshots on the API 33 hard-gate smoke path", () => {
    const workflow = readFileSync(resolve(root, ".github/workflows/signed-apk-smoke.yml"), "utf8");
    const primarySmoke = workflow.slice(
      workflow.indexOf('maestro test \\\n                  --env MAESTRO_EMAIL'),
      workflow.indexOf('maestro/smoke.yaml || SMOKE_EXIT=$?'),
    );

    expect(primarySmoke).not.toContain("--debug-output");
    expect(primarySmoke).not.toContain("--flatten-debug-output");
    expect(primarySmoke).toContain("--format junit");
    expect(primarySmoke).toContain("--output signed-smoke.xml");
  });

  it("dumps logcat before driver-screenshot-null classification", () => {
    const workflow = readFileSync(resolve(root, ".github/workflows/signed-apk-smoke.yml"), "utf8");
    const failureBlock = workflow.slice(
      workflow.indexOf("# Dump logcat before classification"),
      workflow.indexOf('elif [ "$FAILURE_CLASS" != "driver-timeout-terminated"'),
    );

    expect(failureBlock).toContain("adb logcat -d > logcat.txt");
    expect(failureBlock.indexOf("adb logcat -d > logcat.txt")).toBeLessThan(
      failureBlock.indexOf('grep -qE "FB is protected: PERMISSION_DENIED'),
    );
  });
});
// ── Emulator stability guards (run #63/#64: qemu process death) ──
describe("maestro workflow emulator configuration", () => {
  const wf = readFileSync(".github/workflows/maestro-android.yml", "utf8");

  it("never pairs the google_atd image with -gpu guest", () => {
    // ATD images ship no guest GPU stack; -gpu guest aborts qemu the moment
    // the WebView composites ("device 'emulator-5554' not found").
    expect(wf).toContain("target: google_atd");
    expect(wf).not.toMatch(/emulator-options:.*-gpu guest/);
    expect(wf).toMatch(/emulator-options:.*-gpu swiftshader_indirect/);
  });

  it("forces the WebView onto software rendering", () => {
    expect(wf).toContain("/data/local/tmp/webview-command-line");
    expect(wf).toContain("--disable-gpu-compositing");
  });

  it("checks the device is alive before and between Maestro attempts", () => {
    expect(wf.match(/adb wait-for-device/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
