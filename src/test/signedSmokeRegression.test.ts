import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("signed APK smoke regression guards", () => {
  const root = resolve(__dirname, "../..");

  it("asserts profile identity without the masked email or the bare nav label", () => {
    const smoke = readFileSync(resolve(root, "maestro/smoke.yaml"), "utf8");
    // The email is a masked secret in CI, so asserting it can never match.
    expect(smoke).not.toContain("visible: ${MAESTRO_EMAIL}");
    // "Profile" alone is the bottom-nav label and stays visible even when the
    // tab never opened, so the assertion must be built from page-body copy.
    expect(smoke).toContain('visible: "Personal Information|Sign Out|Account Settings"');
  });

  it("lets the post-login frame settle without polling the view hierarchy", () => {
    const smoke = readFileSync(resolve(root, "maestro/smoke.yaml"), "utf8");
    // Runs #56/#57 died with DeviceServerDiedException while polling
    // viewHierarchy against the still-rendering dashboard. waitForAnimationToEnd
    // is screenshot-based and must stay the first step after Sign In.
    expect(smoke).toContain("waitForAnimationToEnd");
    expect(smoke).not.toContain('visible: "Signing in|');
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