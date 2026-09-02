# AI Chatbot — operate & debug

## Architecture

```text
ChatWidget.tsx ──▶ supabase.functions.invoke("chatbot")
                        │
                        ├─ FAQ + knowledge base (RAG) + course rows  (Postgres)
                        └─ callAiGateway()  ──▶ ai.gateway.lovable.dev
useLessonChat.ts ─▶ "resolve-doubt"   (lesson-scoped doubts)
                    "summarize-video" / "deep-search-lecture"
ai-health (public) ─▶ 30s cached probe of the gateway
```

## Failure codes (naya contract)

`chatbot` ab har failure ke saath ek machine-readable `code` bhejta hai.

| `code` | Matlab | Kaun theek karega |
| --- | --- | --- |
| `key_missing` | `LOVABLE_API_KEY` set hi nahi hai | Admin |
| `key_unregistered` | Key purani/unregistered hai (401/403) | Admin — rotate + redeploy |
| `no_credits` | Workspace AI credits khatam (402) | Admin — credits add |
| `rate_limited` | 429 | Apne aap — 30s baad |
| `timeout` | Upstream slow (504) | Apne aap — retry |
| `bad_request` | Model/limit galat (400) | Admin — chatbot settings |
| `upstream_error` | 5xx | Apne aap — retry |

Pehle ye sab ek hi line "AI abhi busy hai" me collapse ho jaate the, isliye stale
key aur 30-second blip me farq karna namumkin tha.

## Graceful degradation

Gateway down ho to bhi `buildDegradedAnswer()` FAQ → knowledge base → course
catalogue se jawab banata hai. Student ko honest header + real content milta hai,
khali refusal nahi. `needsAdmin: true` par ChatWidget ek persistent banner dikhata
hai.

## Health probe

```bash
curl -s -X POST https://wegamscqtvqhxowlskfm.supabase.co/functions/v1/ai-health \
  -H "apikey: <anon key>" -H "Content-Type: application/json"
```

`{"ok":false,"code":"gateway_unauthorized"}` = key invalid.

## Fix: key rotate

1. Lovable project (safarenglishka) → Cloud / AI settings → rotate `LOVABLE_API_KEY`.
2. Edge functions redeploy (secret propagate hone me ~30s lagte hain — helper
   ek automatic retry karta hai isi wajah se).
3. `ai-health` phir chalayein → `{"ok":true}`.

## Model

`CHATBOT_AI_MODEL = google/gemini-3.7-flash`. Admin DB setting drift kare to
`resolveChatbotModel()` safe default par wapas le aata hai. Preview-only ya
retired model ids automatically reject hote hain.
