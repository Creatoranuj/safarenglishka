/**
 * Device-integrity check. Warns (does not block) when running on a rooted
 * Android device or jailbroken iOS device.
 *
 * We intentionally do NOT hard-block:
 *  - Premium video is already protected by short-lived signed Bunny tokens.
 *  - Hard blocks frustrate legitimate power users on rooted dev devices.
 *
 * Detection is best-effort using @capacitor/device + common indicators.
 * For stronger guarantees, swap in @capgo/capacitor-is-root or Play Integrity.
 */
import { toast } from "sonner";

let checked = false;

export async function checkDeviceIntegrity(): Promise<void> {
  if (checked) return;
  checked = true;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { Device } = await import("@capacitor/device");
    const info = await Device.getInfo();

    // Heuristic: emulator + custom OS strings often correlate with rooted
    // test devices. This is intentionally permissive — we only WARN.
    const suspicious =
      info.isVirtual ||
      /test-keys/i.test(info.osVersion ?? "") ||
      /lineage|magisk|microg|supersu/i.test(info.model ?? "") ||
      /lineage|magisk|microg|supersu/i.test(info.manufacturer ?? "");

    if (suspicious) {
      console.warn("[security] suspicious device:", info);
      try {
        const { reportError } = await import("@/lib/sentry");
        reportError(new Error("device_integrity_suspicious"), {
          surface: "native.security",
          extra: { model: info.model, osVersion: info.osVersion, isVirtual: info.isVirtual },
        });
      } catch {}
      // Quiet warning — non-blocking, dismissible.
      toast.warning("Device integrity check", {
        description: "This device may be rooted or modified. Some content may be restricted.",
        duration: 6000,
      });
    }
  } catch {
    // best-effort
  }
}
