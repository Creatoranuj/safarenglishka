CREATE TABLE IF NOT EXISTS public.app_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  user_id uuid,
  platform text NOT NULL DEFAULT 'web',
  os_version text,
  app_version text,
  source text NOT NULL DEFAULT 'unknown',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_installs TO authenticated;
GRANT ALL ON public.app_installs TO service_role;

ALTER TABLE public.app_installs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view installs" ON public.app_installs;
CREATE POLICY "Admins can view installs"
ON public.app_installs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_app_installs_last_seen ON public.app_installs (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_installs_first_seen ON public.app_installs (first_seen_at DESC);

CREATE OR REPLACE FUNCTION public.record_app_install(
  _device_id text,
  _platform text DEFAULT 'web',
  _os_version text DEFAULT NULL,
  _app_version text DEFAULT NULL,
  _source text DEFAULT 'unknown'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device text := substring(coalesce(_device_id, '') from 1 for 64);
BEGIN
  IF length(v_device) < 8 THEN
    RETURN;
  END IF;
  IF NOT public.check_rate_limit_text('app_install', v_device, 10, 3600) THEN
    RETURN;
  END IF;

  INSERT INTO public.app_installs AS a (device_id, user_id, platform, os_version, app_version, source)
  VALUES (
    v_device,
    auth.uid(),
    coalesce(nullif(substring(_platform from 1 for 24), ''), 'web'),
    substring(_os_version from 1 for 64),
    substring(_app_version from 1 for 32),
    coalesce(nullif(substring(_source from 1 for 32), ''), 'unknown')
  )
  ON CONFLICT (device_id) DO UPDATE
  SET last_seen_at = now(),
      user_id = coalesce(auth.uid(), a.user_id),
      platform = EXCLUDED.platform,
      os_version = coalesce(EXCLUDED.os_version, a.os_version),
      app_version = coalesce(EXCLUDED.app_version, a.app_version),
      source = EXCLUDED.source;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_app_install(text, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_install_stats(_from timestamptz DEFAULT now() - interval '30 days', _to timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.app_installs),
    'android', (SELECT count(*) FROM public.app_installs WHERE platform = 'android'),
    'ios', (SELECT count(*) FROM public.app_installs WHERE platform = 'ios'),
    'web', (SELECT count(*) FROM public.app_installs WHERE platform NOT IN ('android','ios')),
    'linked_students', (SELECT count(DISTINCT user_id) FROM public.app_installs WHERE user_id IS NOT NULL),
    'unknown_devices', (SELECT count(*) FROM public.app_installs WHERE user_id IS NULL),
    'active_7d', (SELECT count(*) FROM public.app_installs WHERE last_seen_at > now() - interval '7 days'),
    'active_30d', (SELECT count(*) FROM public.app_installs WHERE last_seen_at > now() - interval '30 days'),
    'new_in_range', (SELECT count(*) FROM public.app_installs WHERE first_seen_at BETWEEN _from AND _to),
    'daily', coalesce((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'installs', c) ORDER BY d)
      FROM (
        SELECT date_trunc('day', first_seen_at)::date AS d, count(*) AS c
        FROM public.app_installs
        WHERE first_seen_at BETWEEN _from AND _to
        GROUP BY 1
      ) x
    ), '[]'::jsonb),
    'recent', coalesce((
      SELECT jsonb_agg(r ORDER BY r->>'last_seen_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'device_id', left(i.device_id, 8),
          'platform', i.platform,
          'app_version', i.app_version,
          'os_version', i.os_version,
          'first_seen_at', i.first_seen_at,
          'last_seen_at', i.last_seen_at,
          'full_name', p.full_name,
          'email', p.email
        ) AS r
        FROM public.app_installs i
        LEFT JOIN public.profiles p ON p.id = i.user_id
        ORDER BY i.last_seen_at DESC
        LIMIT 50
      ) y
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_install_stats(timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_batch_summary()
RETURNS TABLE(course_id bigint, title text, students bigint, active_students bigint, avg_progress numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT c.id,
         c.title,
         count(e.id)::bigint,
         count(e.id) FILTER (WHERE e.status = 'active')::bigint,
         coalesce(round(avg(e.progress_percentage)::numeric, 1), 0)
  FROM public.courses c
  LEFT JOIN public.enrollments e ON e.course_id = c.id
  GROUP BY c.id, c.title
  ORDER BY count(e.id) DESC, c.id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_batch_summary() TO authenticated;