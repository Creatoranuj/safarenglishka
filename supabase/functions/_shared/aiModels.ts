// Single source of truth for the AI model that answers student questions.
//
// Why this file exists: `chatbot` and `resolve-doubt` each hardcoded
// "google/gemini-3.7-flash" while `ai-health` probed
// "google/gemini-3.5-flash". So the health check was testing a model that
// production never calls — if the production model were retired or renamed,
// ai-health would keep returning {"ok":true} while every student's doubt
// silently failed. Nobody would find out until someone complained.
//
// Rule: never hardcode a doubt/chat model id in a function again. Import
// DOUBT_MODEL. If it needs to change, change it here and redeploy the three
// functions together.
export const DOUBT_MODEL = "google/gemini-3.7-flash";

/**
 * Model ids that were valid at some point and are still sitting in
 * admin-editable settings rows (chatbot_settings.model). Any match is
 * coerced back to DOUBT_MODEL so a stale database value can't take the
 * chatbot down.
 */
export const RETIRED_MODEL_PATTERN =
  /preview|gemini-3-flash|gemini-2\.5-flash|gemini-3\.5-flash/i;
