-- Bulk grants: authenticated + service_role on every public base table (only where missing)
DO $$
DECLARE
    tbl record;
    has_priv boolean;
BEGIN
    FOR tbl IN
        SELECT c.relname AS table_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r'
           AND n.nspname = 'public'
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.role_table_grants
             WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = tbl.table_name
               AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        ) INTO has_priv;
        IF NOT has_priv THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM information_schema.role_table_grants
             WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = tbl.table_name
               AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        ) INTO has_priv;
        IF NOT has_priv THEN
            EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
        END IF;
    END LOOP;
END;
$$;

-- Anon read access ONLY on tables whose RLS policies already allow anonymous reads
GRANT SELECT ON public.app_config TO anon;
GRANT SELECT ON public.books TO anon;
GRANT SELECT ON public.chapters TO anon;
GRANT SELECT ON public.chatbot_faq TO anon;
GRANT SELECT ON public.comments TO anon;
GRANT SELECT ON public.courses TO anon;
GRANT SELECT ON public.earning_links TO anon;
GRANT SELECT ON public.hero_banners TO anon;
GRANT SELECT ON public.knowledge_base TO anon;
GRANT SELECT ON public.landing_content TO anon;
GRANT SELECT ON public.landing_courses TO anon;
GRANT SELECT ON public.landing_testimonials TO anon;
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT ON public.site_stats TO anon;
GRANT SELECT ON public.subscription_plans TO anon;