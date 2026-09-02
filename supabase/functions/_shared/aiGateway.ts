// Shared helper: POST to Lovable AI Gateway with a single automatic retry
// on transient key-propagation / rate-limit failures.
//
// Recurring signature this defends against:
//   403 { "type": "lovable_api_key_not_registered" }
// which happens for a few seconds after LOVABLE_API_KEY rotation while the
// new secret propagates to Edge Function env.
//
// See mem://features/ai-doubt.md for the incident playbook.

export interface GatewayCallOpts {
  apiKey: string;
  body: unknown;
  // Attempts includes the first try. Default 2 (1 retry).
  attempts?: number;
  timeoutMs?: number;
}

export async function callAiGateway(opts: GatewayCallOpts): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 2);
  const timeoutMs = Math.max(5000, opts.timeoutMs ?? 18000);
  let last: Response | null = null;

  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Lovable-API-Key": opts.apiKey,
          "X-Lovable-AIG-SDK": "edge-function",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(opts.body),
        signal: ctrl.signal,
      });
    } catch (error) {
      if (i === attempts - 1) {
        return new Response(JSON.stringify({ error: "gateway_timeout", message: (error as Error)?.message || "AI request timed out" }), {
          status: 504,
          headers: { "Content-Type": "application/json" },
        });
      }
      await new Promise((r) => setTimeout(r, 700 + Math.floor(Math.random() * 300)));
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) return res;

    // Peek at the body to decide if the failure is retryable.
    const text = await res.clone().text().catch(() => "");
    const retryable =
      res.status === 429 ||
      (res.status >= 500 && res.status < 600) ||
      ((res.status === 401 || res.status === 403) &&
        (text.includes("lovable_api_key_not_registered") ||
          text.includes("unauthorized") ||
          text.includes("registry_lookup_failed")));

    last = res;
    if (!retryable || i === attempts - 1) return res;

    // Jittered backoff: 700-1100 ms for auth, 900-1500 ms for 429/5xx.
    const base = res.status === 429 || res.status >= 500 ? 900 : 700;
    const wait = base + Math.floor(Math.random() * 400);
    await new Promise((r) => setTimeout(r, wait));
  }

  return last!;
}

/**
 * Classify a non-OK AI gateway response into a stable machine code plus
 * student-safe Hinglish copy.
 *
 * Why this exists: run after run, every gateway failure — stale key, no
 * credits, rate limit, upstream 5xx — collapsed into the single line
 * "AI abhi busy hai", so nobody could tell a 30-second blip from a key that
 * has been dead for days. Each cause now gets its own code and its own copy.
 */
export type GatewayFailureCode =
  | "key_missing"
  | "key_unregistered"
  | "no_credits"
  | "rate_limited"
  | "timeout"
  | "bad_request"
  | "upstream_error";

export interface GatewayFailure {
  code: GatewayFailureCode;
  /** true when a later retry (by the user or a scheduled run) can succeed. */
  retryable: boolean;
  /** true when only an admin/owner can unblock it. */
  needsAdmin: boolean;
  message: string;
}

export function classifyGatewayFailure(status: number, bodyText = ""): GatewayFailure {
  const text = String(bodyText || "");

  if (status === 401 || status === 403) {
    const unregistered =
      text.includes("lovable_api_key_not_registered") ||
      text.includes("registry_lookup_failed") ||
      text.includes("unauthorized");
    return {
      code: unregistered ? "key_unregistered" : "key_missing",
      retryable: false,
      needsAdmin: true,
      message:
        "🔧 AI service abhi band hai (admin ko key dobara connect karni hogi). Tab tak main FAQ aur course notes se madad kar deta hoon. 🙏",
    };
  }

  if (status === 402) {
    return {
      code: "no_credits",
      retryable: false,
      needsAdmin: true,
      message: "💳 AI credits khatam ho gaye hain. Admin ko batayein — 5 minute me wapas aa jayega. 🙏",
    };
  }

  if (status === 429) {
    return {
      code: "rate_limited",
      retryable: true,
      needsAdmin: false,
      message: "⏳ Abhi bahut requests aa rahi hain. 30 second ruk kar phir poochein. 🙏",
    };
  }

  if (status === 504 || text.includes("gateway_timeout")) {
    return {
      code: "timeout",
      retryable: true,
      needsAdmin: false,
      message: "⏳ AI response slow ho gaya. Ek baar phir try karein. 🙏",
    };
  }

  if (status === 400) {
    return {
      code: "bad_request",
      retryable: false,
      needsAdmin: true,
      message: "🔧 AI request settings galat hain (model/limit). Admin ko batayein. 🙏",
    };
  }

  return {
    code: "upstream_error",
    retryable: true,
    needsAdmin: false,
    message: "⚠️ AI se jawab nahi mila. Thodi der baad phir try karein. 🙏",
  };
}
