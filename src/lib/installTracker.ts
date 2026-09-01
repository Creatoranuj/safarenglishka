/**
 * installTracker — records one row per device in `public.app_installs`
 * so admin can see how many students actually installed / opened the app
 * (GitHub release counts are anonymous totals only).
 *
 * Bandwidth-safe: at most one RPC per device per 24h, fire-and-forget,
 * never throws into the app.
 */
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "nb_device_id";
const LAST_PING_KEY = "nb_install_ping_at";
const PING_TTL_MS = 24 * 60 * 60 * 1000;

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function appVersion(): string | null {
  try {
    const v = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? null;
    return v;
  } catch {
    return null;
  }
}

function osVersion(): string | null {
  try {
    return navigator.userAgent.slice(0, 64);
  } catch {
    return null;
  }
}

/** Call once on app boot (and again after login to link the user). */
export async function recordAppInstall(force = false): Promise<void> {
  try {
    const deviceId = getDeviceId();
    if (!deviceId) return;

    if (!force) {
      const last = Number(localStorage.getItem(LAST_PING_KEY) || 0);
      if (Date.now() - last < PING_TTL_MS) return;
    }

    const native = Capacitor.isNativePlatform();
    const platform = native ? Capacitor.getPlatform() : "web";
    const source = native ? "github_apk" : "web";

    const { error } = await supabase.rpc("record_app_install", {
      _device_id: deviceId,
      _platform: platform,
      _os_version: osVersion(),
      _app_version: appVersion(),
      _source: source,
    });
    if (!error) localStorage.setItem(LAST_PING_KEY, String(Date.now()));
  } catch {
    /* tracking must never break the app */
  }
}

/** After a successful login, link this device to the signed-in student. */
export function linkInstallToUser(): void {
  void recordAppInstall(true);
}
