# Supabase operations

Project: `wegamscqtvqhxowlskfm`

## Edge functions

| Function | Auth | Kaam |
| --- | --- | --- |
| `chatbot` | user | Main AI agent + FAQ/RAG fallback |
| `resolve-doubt` | user | Lesson-scoped doubt |
| `summarize-video` / `deep-search-lecture` | user | Lecture AI tools |
| `ai-health` | public | 30s cached gateway probe |
| razorpay order/webhook | mixed | Payments |

Deploy ke baad hamesha `ai-health` hit karein.

## Migration template

```sql
create table public.example (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.example to authenticated;
grant all on public.example to service_role;
-- grant select on public.example to anon;  -- sirf tab jab anon policy ho

alter table public.example enable row level security;

create policy "owner reads" on public.example
for select to authenticated using (auth.uid() = user_id);
```

## Audit queries

- RLS-disabled public tables
- Policies jinka `qual = 'true'`
- SECURITY DEFINER functions bina `search_path`
- Tables bina `authenticated` GRANT

Inhe run karne se pehle Supabase linter chalayein — 80% findings wahin mil jaate hain.
