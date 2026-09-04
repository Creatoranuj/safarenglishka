-- Admin-only introspection helper backing scripts/check-anon-grants.mjs.
-- Reports any public table where the logged-out `anon` role still holds
-- INSERT/UPDATE/DELETE/TRUNCATE. Executable by service_role only.
CREATE OR REPLACE FUNCTION public.anon_write_grants()
RETURNS TABLE (table_name text, privileges text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.table_name::text,
         string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)::text
  FROM information_schema.role_table_grants g
  WHERE g.grantee = 'anon'
    AND g.table_schema = 'public'
    AND g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  GROUP BY g.table_name
  ORDER BY g.table_name
$$;

REVOKE ALL ON FUNCTION public.anon_write_grants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anon_write_grants() TO service_role;
