/**
 * Sanitize user-supplied text before it enters an LLM system/user prompt.
 * Strips angle brackets and neutralizes common prompt-injection phrases.
 * Always wrap sanitized content inside <lesson_context ...> tags labelled as
 * UNTRUSTED so the model treats it as data, not instructions.
 */
export function sanitizeAiField(v: unknown, max = 1500): string {
  return String(v ?? "")
    .replace(/[<>]/g, "")
    .replace(/ignore\s+(all|any|previous|prior)\s+(instructions?|prompts?|rules?)/gi, "[filtered]")
    .replace(/system\s*[:\-]/gi, "[filtered]")
    .replace(/you\s+are\s+now\s+/gi, "[filtered]")
    .slice(0, max);
}
