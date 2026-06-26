
-- 1) Revoke EXECUTE from anon/authenticated on internal-only SECURITY DEFINER / trigger functions.
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'handle_new_user',
    'handle_new_user_role',
    'assign_admin_on_signup',
    'set_updated_at',
    'update_updated_at_column',
    'update_books_updated_at',
    'update_doubt_sessions_updated_at',
    'update_hero_banners_updated_at',
    'update_knowledge_base_updated_at',
    'update_student_notes_updated_at',
    'update_user_preferences_updated_at',
    'touch_lesson_pdfs_updated_at',
    'update_lesson_like_count',
    'stamp_payment_request_actor',
    'prevent_self_role_escalation',
    'prevent_enrollment_status_tampering',
    'validate_payment_request_amount',
    'audit_leads_access',
    'audit_security_policies',
    'verify_enrollment_for_attendance'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- Fallback: loop manually
  NULL;
END $$;

-- Explicit, per-function REVOKEs (covers all signatures reliably)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_user','handle_new_user_role','assign_admin_on_signup',
        'set_updated_at','update_updated_at_column','update_books_updated_at',
        'update_doubt_sessions_updated_at','update_hero_banners_updated_at',
        'update_knowledge_base_updated_at','update_student_notes_updated_at',
        'update_user_preferences_updated_at','touch_lesson_pdfs_updated_at',
        'update_lesson_like_count','stamp_payment_request_actor',
        'prevent_self_role_escalation','prevent_enrollment_status_tampering',
        'validate_payment_request_amount','audit_leads_access',
        'audit_security_policies','verify_enrollment_for_attendance'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2) Ensure app-facing helpers remain callable.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_book_clicks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profiles_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(extensions.vector, double precision, integer) TO authenticated;

-- 3) Storage: stop anonymous listing of public buckets.
-- Public URL reads (/storage/v1/object/public/...) bypass RLS and continue to work.
-- Only the LIST / signed-url flows are restricted.
DROP POLICY IF EXISTS "Public buckets listable by anon" ON storage.objects;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND cmd='SELECT'
      AND 'anon' = ANY(roles)
      AND qual ILIKE ANY (ARRAY[
        '%course-videos%','%content%','%chat-attachments%','%notices%',
        '%book-covers%','%comment-images%','%course-materials%','%lecture-pdfs%'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- Re-create authenticated-only listing for each public bucket.
CREATE POLICY "auth list course-videos"     ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'course-videos');
CREATE POLICY "auth list content"           ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'content');
CREATE POLICY "auth list chat-attachments"  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-attachments');
CREATE POLICY "auth list notices"           ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'notices');
CREATE POLICY "auth list book-covers"       ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'book-covers');
CREATE POLICY "auth list comment-images"    ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'comment-images');
CREATE POLICY "auth list course-materials"  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'course-materials');
CREATE POLICY "auth list lecture-pdfs"      ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'lecture-pdfs');
