-- Fix course enrollment RLS + harden sensitive grants.

-- 1) Tighten broad Data API grants left over from the old schema copy.
REVOKE ALL ON TABLE public.enrollments FROM anon;
REVOKE ALL ON TABLE public.payment_requests FROM anon;
REVOKE ALL ON TABLE public.razorpay_payments FROM anon;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.user_roles FROM anon;

-- Courses are public-readable only; mutations still require authenticated admin RLS.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.courses FROM anon;
GRANT SELECT ON TABLE public.courses TO anon;

-- Keep app/backend access explicit for authenticated users and edge functions.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.enrollments TO authenticated;
GRANT ALL ON TABLE public.enrollments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_requests TO authenticated;
GRANT ALL ON TABLE public.payment_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.razorpay_payments TO authenticated;
GRANT ALL ON TABLE public.razorpay_payments TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

-- 2) Replace the paid-only self-enrollment policy with free-or-paid verified logic.
DROP POLICY IF EXISTS "Users can self-enroll only with verified payment" ON public.enrollments;
DROP POLICY IF EXISTS "Users can self-enroll free courses or verified paid courses" ON public.enrollments;

CREATE POLICY "Users can self-enroll free courses or verified paid courses"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND COALESCE(status, 'active') = 'active'
  AND (
    EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = enrollments.course_id
        AND COALESCE(c.price, 0) <= 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.razorpay_payments rp
      WHERE rp.user_id = auth.uid()
        AND rp.course_id = enrollments.course_id
        AND rp.status = 'completed'
    )
  )
);

-- 3) Make student enrollment updates safe. Students may update progress fields,
-- but cannot mutate identity/payment/status fields. Admins and service_role bypass.
CREATE OR REPLACE FUNCTION public.prevent_enrollment_status_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Changing enrollment status is not permitted'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
  OR NEW.course_id IS DISTINCT FROM OLD.course_id
  OR NEW.purchased_at IS DISTINCT FROM OLD.purchased_at THEN
    RAISE EXCEPTION 'Changing enrollment ownership, course, or purchase time is not permitted'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_enrollment_status_tampering ON public.enrollments;
CREATE TRIGGER trg_prevent_enrollment_status_tampering
BEFORE UPDATE ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_enrollment_status_tampering();

-- 4) Keep progress data sane without breaking existing rows.
ALTER TABLE public.enrollments
DROP CONSTRAINT IF EXISTS enrollments_progress_percentage_range;

ALTER TABLE public.enrollments
ADD CONSTRAINT enrollments_progress_percentage_range
CHECK (progress_percentage IS NULL OR (progress_percentage >= 0 AND progress_percentage <= 100))
NOT VALID;

ALTER TABLE public.enrollments
VALIDATE CONSTRAINT enrollments_progress_percentage_range;

-- 5) Remove duplicate uniqueness constraint; one canonical user/course constraint remains.
ALTER TABLE public.enrollments
DROP CONSTRAINT IF EXISTS unique_user_course;