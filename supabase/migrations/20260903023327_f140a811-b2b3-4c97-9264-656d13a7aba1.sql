REVOKE EXECUTE ON FUNCTION public.admin_get_batch_summary() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_install_stats(timestamptz, timestamptz) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_batch_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_install_stats(timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON public.phone_otps FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.phone_otps TO service_role;