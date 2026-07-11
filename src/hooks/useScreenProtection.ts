import { useEffect } from "react";
import { loadCore } from "@/lib/native/core";

/**
 * Enables Android FLAG_SECURE while at least one component requests it.
 *
 * Ref-counted at module scope so multiple mounted instances (PDF viewer +
 * video player + secure modal) don't toggle the plugin on/off and don't
 * register duplicate native handlers.
 */

let activeCount = 0;
let pluginPromise: Promise<any | null> | null = null;
let enabled = false;

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
  try {
    if (target && !enabled) {
      await plugin.enable?.();
      enabled = true;
    } else if (!target && enabled) {
      await plugin.disable?.();
      enabled = false;
    }
  } catch {
    /* silent */
  }
}

export function useScreenProtection(active: boolean = true): void {
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
