# Security

## Non-negotiables

1. Roles sirf `public.user_roles` me. `profiles` par role column = privilege
   escalation. Admin check hamesha `public.has_role(auth.uid(), 'admin')`.
2. Reserved schemas (`auth`, `storage`, `realtime`, `vault`) ko chhuna nahi.
3. Nayi public table ka order fixed: `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL
   SECURITY` → `CREATE POLICY`. GRANT bhoolna = table app se reachable hi nahi.
4. Secrets kabhi table me nahi — Supabase secrets me.
5. `SECURITY DEFINER` function me `SET search_path = public` mandatory.
6. Public read data = narrow `TO anon` SELECT policy. `supabaseAdmin` se public
   read kabhi nahi.

## Threat notes

| Vector | Guard |
| --- | --- |
| Prompt injection (chatbot) | System prompt identity rules + user content kabhi tool/SQL me direct nahi |
| Webhook replay | `webhook_events` dedupe + HMAC on raw body |
| IDOR | Har query `auth.uid()` scoped; admin path `has_role()` se |
| Artifact leak | CI artifacts me screenshots/hierarchy jaate hain — admin session kabhi CI me nahi |
| Token theft | Auth token localStorage me app-managed; role client-side kabhi trust nahi |

## Rotation

Koi bhi key chat/screenshot/log me dikh jaye → turant rotate. `RAZORPAY_KEY_SECRET`
pehle hi rotate ho chuki hai (purani 401 deti hai).
