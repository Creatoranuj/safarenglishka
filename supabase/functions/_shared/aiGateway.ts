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
}

export async function callAiGateway(opts: GatewayCallOpts): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 2);
  let last: Response | null = null;

  for (let i = 0; i < attempts; i++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": opts.apiKey,
        "X-Lovable-AIG-SDK": "edge-function",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(opts.body),
    });

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
