// Edge function keep-alive: fire-and-forget warm pings to reduce cold-start
// latency for the functions LessonView depends on (PDF resolve, video URL,
// chatbot RAG).  Calls are debounced per-session and never block the UI.
import { supabase } from "../../integrations/supabase/client";

const WARMED = new Set<string>();
const SESSION_TTL_MS = 4 * 60 * 1000; // 4 min — Supabase edge isolates idle ~5 min
const lastWarmedAt = new Map<string, number>();

function shouldWarm(name: string) {
  const last = lastWarmedAt.get(name) ?? 0;
  if (Date.now() - last < SESSION_TTL_MS) return false;
  lastWarmedAt.set(name, Date.now());
  return true;
}

async function ping(name: string) {
  if (!shouldWarm(name)) return;
  try {
    // OPTIONS preflight is cheapest — boots the isolate without invoking handler logic.
    await supabase.functions.invoke(name, {
      method: "OPTIONS" as never,
    }).catch(() => {});
    WARMED.add(name);
  } catch {
    /* silent */
  }
}

/**
 * Warm the edge functions LessonView typically triggers within ~2 s of mount.
 * Safe to call repeatedly; rate-limited internally.
 */
export function warmLessonEdgeFunctions() {
  if (typeof window === "undefined") return;
  // Defer to idle so we never compete with the first paint.
  const run = () => {
    void ping("get-lesson-url");
    void ping("pdf-proxy");
    void ping("chatbot");
  };
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 800);
  }
}
