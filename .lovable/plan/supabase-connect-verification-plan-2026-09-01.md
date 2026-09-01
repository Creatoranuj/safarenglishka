# Supabase Connect + Verification Plan

## Aapka step (UI se, main nahi kar sakta)
1. Chat ke **+ menu > Supabase > Connect project** par jayein.
2. Apna Supabase organization/project (`Creatoranuj's Project`) choose karke connect karein.
3. Connection complete hote hi `.env` me `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` auto-populate ho jayenge.

## Mera step (connection ke baad)
1. **Client config check** — `src/integrations/supabase/client.ts` me abhi hardcoded URL/key hai; verify karunga ki ye naye connected project se match karta hai, aur zaroorat ho to env vars (`import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`) par switch karunga taaki future me kabhi mismatch na ho.
2. **`has_role` permission fix** — abhi Data API par `permission denied for function has_role` (401) aa raha hai. Migration se execute grants add karunga:
   ```sql
   grant execute on function public.has_role(uuid, app_role) to anon, authenticated;
   grant execute on function public.get_user_role(uuid) to anon, authenticated;
   grant execute on function public.is_admin(uuid) to anon, authenticated;
   ```
   (Migration aapke approval ke baad hi chalegi.)
3. **Table GRANTs verify** — `courses`, `enrollments`, `payment_requests`, `lessons`, `profiles` etc. par anon/authenticated grants check karunga; jahan missing hon, wahan grant migration.
4. **End-to-end check** — preview me Supabase calls (courses list, login) 200 aane chahiye; console me 401/42501 errors zero hone chahiye.

## Note
- Agar aapka zip wala Supabase project hi `Creatoranuj's Project` hai (URL same), to sirf grants wale steps kaafi honge.
- 3 missing assets (`video/rotate.svg`, `video/settings.svg`, `success.mp3`) alag se pending hain — files bhej dein to laga dunga.
