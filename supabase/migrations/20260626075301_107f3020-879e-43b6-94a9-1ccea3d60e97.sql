-- Phase 2.5 Security Hardening
-- 1) Revoke anon Data API access from all sensitive tables.

-- Sensitive tables — strip anon entirely.
DO $$
DECLARE
  t text;
  sensitive text[] := ARRAY[
    'app_config','attendance','audit_log','automation_rules','chatbot_feedback',
    'chatbot_logs','comments','community_comments','community_posts','community_reactions',
    'crawl_history','deletion_requests','doubt_replies','doubt_sessions','doubts',
    'earning_links','error_logs','funnel_entries','funnel_stages','lecture_notes',
    'lecture_schedules','lesson_attachments','lesson_bookmarks','lesson_likes',
    'lesson_pdfs','lesson_progress','lesson_ratings','live_messages','live_participants',
    'live_sessions','marketing_campaigns','materials','messages','meta_ad_config',
    'notes','notification_reads','push_tokens','questions','quiz_attempts','quizzes',
    'rate_limits','security_alerts','security_events','smart_notes','student_notes',
    'students','syllabus','timetable','trusted_hosts','user_preferences','user_progress',
    'user_sessions','user_subscriptions','users','webhook_events'
  ];
BEGIN
  FOREACH t IN ARRAY sensitive LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- Public marketing/catalog tables — keep anon SELECT only.
DO $$
DECLARE
  t text;
  public_tables text[] := ARRAY[
    'books','chapters','chatbot_faq','chatbot_settings','courses','hero_banners',
    'knowledge_base','landing_content','leads','lessons','notices','site_settings',
    'site_stats','subscription_plans'
  ];
BEGIN
  FOREACH t IN ARRAY public_tables LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
  END LOOP;
END $$;

-- `leads` is public-INSERT (anyone can submit a lead form), but anon should
-- never read leads. Re-grant only INSERT to anon and ensure SELECT is revoked.
REVOKE SELECT ON public.leads FROM anon;
GRANT INSERT ON public.leads TO anon;

-- 2) rate_limits had RLS enabled with no policy.
-- Lock it down: only service_role (which bypasses RLS) touches it.
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;

DROP POLICY IF EXISTS "Deny all client access to rate limits" ON public.rate_limits;
CREATE POLICY "Deny all client access to rate limits"
ON public.rate_limits
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);