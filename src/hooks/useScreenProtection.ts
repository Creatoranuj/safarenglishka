import { useEffect } from "react";
import { loadCore } from "@/lib/native/core";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Enables Android FLAG_SECURE while at least one component requests it.
 *
 * Ref-counted at module scope so multiple mounted instances (PDF viewer +
 * video player + secure modal) don't toggle the plugin on/off and don't
 * register duplicate native handlers.
 *
 * ADMIN BYPASS: Users with the `admin` role (verified server-side via
 * `user_roles` + `has_role()` — NOT by email) are exempt so they can
 * screen-record lessons to explain to students. Everyone else stays blocked.
 * Role source is `AuthContext.isAdmin`, which is derived from the secure
 * `has_role(auth.uid(), 'admin')` RPC — cannot be spoofed client-side.
 */

let activeCount = 0;
let pluginPromise: Promise<any | null> | null = null;
let enabled = false;
let adminBypass = false;

function loadPlugin(): Promise<any | null> {
  if (pluginPromise) return pluginPromise;
  pluginPromise = (async () => {
    try {
      const { Capacitor } = await loadCore();
      if (!Capacitor.isNativePlatform()) return null;
      const mod: any = await import(
        /* @vite-ignore */ "@capacitor-community/privacy-screen"
      ).catch(() => null);
      return mod?.PrivacyScreen ?? null;
    } catch {
      return null;
    }
  })();
  return pluginPromise;
}

async function applyEnabled(target: boolean) {
  const plugin = await loadPlugin();
  if (!plugin) return;
  const desired = target && !adminBypass;
  try {
    if (desired && !enabled) {
      await plugin.enable?.();
      enabled = true;
    } else if (!desired && enabled) {
      await plugin.disable?.();
      enabled = false;
    }
  } catch {
    /* silent */
  }
}

/**
 * Called by the AuthContext bridge (see useScreenProtectionAdminBridge)
 * whenever the admin flag changes. Re-evaluates plugin state immediately
 * so admins can toggle recording without a route change.
 */
function setAdminBypass(next: boolean) {
  if (adminBypass === next) return;
  adminBypass = next;
  void applyEnabled(activeCount > 0);
}

export function useScreenProtection(active: boolean = true): void {
  const { isAdmin } = useAuth();

  // Keep the module-level bypass in sync with the current session's role.
  useEffect(() => {
    setAdminBypass(!!isAdmin);
  }, [isAdmin]);

  useEffect(() => {
    if (!active) return;
    activeCount += 1;
    void applyEnabled(true);
    return () => {
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0) {
        void applyEnabled(false);
      }
    };
  }, [active]);
}

