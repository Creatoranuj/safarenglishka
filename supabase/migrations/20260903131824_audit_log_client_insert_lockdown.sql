-- Audit trail integrity: remove client-side INSERT into audit_log.
-- All real writers (razorpay-webhook, recover-enrollment, refund webhook,
-- request-account-deletion, complete_paid_enrollment) use the service role or
-- SECURITY DEFINER, which bypasses RLS, so this does not break any code path.
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM anon;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
