// Session tracker — wires SIGNED_IN / SIGNED_OUT / heartbeat into the
// `user_sessions` table via the `manage-session` edge function. Without this,
// the Admin → Active Sessions panel is always empty.
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "nb.session_token.v1";
const HEARTBEAT_MS = 60_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentUserId: string | null = null;
let inflightCreate: Promise<void> | null = null;

function getDeviceType(): string {
  try {
    // Lazy — avoid pulling Capacitor into initial bundle for pure web.
    const cap = (globalThis as any).Capacitor;
    if (cap?.getPlatform) return cap.getPlatform(); // "ios" | "android" | "web"
  } catch { /* noop */ }
  return "web";
}

function readToken(userId: string): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; token: string };
    return parsed.userId === userId ? parsed.token : null;
  } catch { return null; }
}

function writeToken(userId: string, token: string) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, token })); } catch { /* noop */ }
}

function clearToken() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat(token: string) {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    supabase.functions
      .invoke("manage-session", { body: { action: "heartbeat", session_token: token } })
      .catch(() => { /* silent — best-effort */ });
  }, HEARTBEAT_MS);
}

export async function startSessionTracking(userId: string): Promise<void> {
  if (currentUserId === userId && heartbeatTimer) return; // already tracked
  currentUserId = userId;

  const existing = readToken(userId);
  if (existing) { startHeartbeat(existing); return; }

  if (inflightCreate) return inflightCreate;
  inflightCreate = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-session", {
        body: {
          action: "create",
          device_type: getDeviceType(),
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });
      if (error) return;
      const token = (data as { session_token?: string } | null)?.session_token;
      if (token) { writeToken(userId, token); startHeartbeat(token); }
    } catch { /* silent */ }
    finally { inflightCreate = null; }
  })();
  return inflightCreate;
}

export async function stopSessionTracking(): Promise<void> {
  stopHeartbeat();
  const raw = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
  clearToken();
  currentUserId = null;
  if (!raw) return;
  try {
    const { token } = JSON.parse(raw) as { token: string };
    await supabase.functions.invoke("manage-session", {
      body: { action: "terminate", session_token: token },
    });
  } catch { /* silent */ }
}
