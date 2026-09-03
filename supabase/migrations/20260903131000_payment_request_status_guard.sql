-- Security fix (v1.4.7): payment_requests INSERT could carry a client-supplied
-- status. The RLS INSERT policy only checked `auth.uid() = user_id`, so a signed-in
-- student could insert a row already marked 'approved'/'completed' (and even stamp
-- approved_by / approved_at), bypassing the manual payment verification workflow.
-- A BEFORE INSERT trigger now forces non-admin inserts back to 'pending' and clears
-- the approval/rejection audit columns. Admin inserts are untouched.

CREATE OR REPLACE FUNCTION public.force_pending_payment_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.rejected_by := NULL;
    NEW.rejected_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.force_pending_payment_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_force_pending_payment_request ON public.payment_requests;
CREATE TRIGGER trg_force_pending_payment_request
BEFORE INSERT ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.force_pending_payment_request();
