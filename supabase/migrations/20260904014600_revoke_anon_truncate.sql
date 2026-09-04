-- v1.5.0 audit follow-up: the INSERT/UPDATE/DELETE revoke left TRUNCATE
-- behind on 14 public tables. No feature uses it; read access is unchanged.
REVOKE TRUNCATE ON public.app_installs FROM anon;
REVOKE TRUNCATE ON public.content_reports FROM anon;
REVOKE TRUNCATE ON public.dependency_scan_reports FROM anon;
REVOKE TRUNCATE ON public.document_progress FROM anon;
REVOKE TRUNCATE ON public.landing_courses FROM anon;
REVOKE TRUNCATE ON public.landing_testimonials FROM anon;
REVOKE TRUNCATE ON public.lesson_chapters FROM anon;
REVOKE TRUNCATE ON public.lesson_quiz_markers FROM anon;
REVOKE TRUNCATE ON public.lesson_video_meta FROM anon;
REVOKE TRUNCATE ON public.live_reminders FROM anon;
REVOKE TRUNCATE ON public.payment_events FROM anon;
REVOKE TRUNCATE ON public.pdf_proxy_metrics FROM anon;
REVOKE TRUNCATE ON public.profiles_public FROM anon;
REVOKE TRUNCATE ON public.study_materials FROM anon;
