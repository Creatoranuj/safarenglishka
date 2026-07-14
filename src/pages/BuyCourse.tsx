import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";
import {
  CheckCircle, Shield, Loader2, CreditCard, Zap
} from "lucide-react";
import { useAdminEnrollment } from "../hooks/useAdminEnrollment";
import { openRazorpayCheckout, formatRazorpayError, type RazorpaySuccessResponse } from "../utils/razorpay";
import { openNativeRazorpayCheckout, RazorpayCancelledError, RazorpayNativeError } from "../utils/razorpayNative";
import { invokePaymentFunction } from "../utils/paymentApi";
import { tapMedium, notifySuccess, notifyError } from "../lib/nativeChrome";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { resolveContentUrl } from "../lib/resolveContentUrl";
import { safeGet, safeSet, safeRemove } from "../lib/storage";
import { logger } from "@/lib/logger";
import successSound from "@/assets/success.mp3.asset.json";


const MERCHANT_NAME = "Safar English";
// Self-hosted via Lovable CDN — no third-party dependency, works offline
// with cached CDN response, and satisfies the app-wide "no unlisted external
// host" invariant (was pixabay.com which is not in network_security_config).
const SUCCESS_SOUND_URL = successSound.url;

const BuyCourse = () => {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("id");
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { adminEnroll, isAdmin, isEnrolling } = useAdminEnrollment();

  const [step, setStep] = useState<"details" | "razorpay-success">("details");
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [adminAutoEnrolled, setAdminAutoEnrolled] = useState(false);

  // Mount guard for navigate()-after-await. Without this, the 1500ms delayed
  // redirect after Razorpay verification fires on an unmounted component if
  // the user dismisses/closes mid-flow — produces a spurious navigation
  // and a setState-on-unmounted warning.
  const isMountedRef = useRef(true);
  const redirectTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);


  const handleFreeEnrollment = async (courseIdNum: number) => {
    if (!user) return;
    try {
      const { data: existing } = await supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseIdNum)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        toast.info("You're already enrolled in this course!");
        navigate(`/my-courses`);
        return;
      }

      const { error } = await supabase
        .from("enrollments")
        .upsert(
          { user_id: user.id, course_id: courseIdNum, status: "active" },
          { onConflict: "user_id,course_id", ignoreDuplicates: true }
        );

      if (error) throw error;

      playSuccessSound();
      toast.success("Free enrollment successful! Starting your course...");
      navigate(`/my-courses`);
    } catch (error: any) {
      logger.error("Free enrollment error:", error);
      toast.error("Failed to enroll. Please try again.");
    }
  };

  // Payment recovery: check for completed payments without enrollment
  useEffect(() => {
    const recoverPayment = async () => {
      if (!user || !courseId) return;
      try {
        // Check if already enrolled
        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("id")
          .eq("user_id", user.id)
          .eq("course_id", Number(courseId))
          .eq("status", "active")
          .maybeSingle();

        if (enrollment) {
          toast.info("You're already enrolled in this course!");
          navigate(`/my-courses`);
          return;
        }

        // Check for completed payment without enrollment
        const { data: completedPayment } = await supabase
          .from("razorpay_payments")
          .select("id, razorpay_order_id")
          .eq("user_id", user.id)
          .eq("course_id", Number(courseId))
          .eq("status", "completed")
          .maybeSingle();

        if (completedPayment) {
          // Payment was completed but enrollment missing — recover via dedicated function
          toast.info("Recovering your enrollment from a previous payment...");
          try {
            const ok = await invokePaymentFunction<{ ok?: boolean }>(
              "recover-enrollment",
              { course_id: Number(courseId) }
            ).then(() => true).catch(() => false);
            if (ok) {
              playSuccessSound();
              toast.success("🎉 Enrollment recovered! You are now enrolled.");
              navigate(`/my-courses`);
              return;
            }
          } catch (recoveryErr) {
            logger.error("Recovery via edge function failed:", recoveryErr);
          }
        }
      } catch (err) {
        logger.error("Payment recovery check error:", err);
      }
    };

    recoverPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, courseId]);

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      if (courseId) {
        try {
          const { data, error } = await supabase
            .from("courses")
            .select("*")
            .eq("id", Number(courseId))
            .single();

          if (!error && data) {
            const isFree = !data.price || data.price === 0;
            const [resolvedThumb, resolvedImage] = await Promise.all([
              resolveContentUrl(data.thumbnail_url),
              resolveContentUrl(data.image_url),
            ]);
            setCourse({
              id: data.id,
              title: data.title,
              description: data.description,
              grade: data.grade,
              price: data.price ?? 0,
              thumbnailUrl: resolvedThumb ?? data.thumbnail_url,
              imageUrl: resolvedImage ?? data.image_url,
            });


            if (isFree && user) {
              await handleFreeEnrollment(Number(courseId));
            }
          }
        } catch (err) {
          logger.error("Error fetching course:", err);
        }
      }
      setLoading(false);
    };
    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, user?.id]);

  useEffect(() => {
    const handleAdminAutoEnroll = async () => {
      if (isAdmin && course && course.price > 0 && courseId && !adminAutoEnrolled) {
        setAdminAutoEnrolled(true);
        await adminEnroll(Number(courseId));
      }
    };
    if (!loading && course) {
      handleAdminAutoEnroll();
    }
  }, [isAdmin, course, courseId, loading, adminAutoEnrolled, adminEnroll]);

  const playSuccessSound = () => {
    try {
      const audio = new Audio(SUCCESS_SOUND_URL);
      audio.volume = 0.5;
      audio.play().catch((err) => console.log("Audio autoplay blocked:", err));
    } catch (e) {
      logger.error("Audio error", e);
    }
  };

  // Stable per-(user,course,attempt-window) idempotency key. We persist it
  // so re-tries within the same checkout session reuse the same Razorpay
  // order instead of creating duplicates. A fresh key is minted only when
  // the user finishes or explicitly leaves and comes back hours later.
  const idemKeyFor = (uid: string, cid: string): string => {
    const k = `nb:idem:${uid}:${cid}`;
    let v = safeGet(k);
    if (!v) {
      v = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      safeSet(k, v);
    }
    return v;
  };
  const clearIdemKey = (uid: string, cid: string) => {
    safeRemove(`nb:idem:${uid}:${cid}`);
    safeRemove(`nb:pendingOrder:${uid}:${cid}`);
  };

  /** Last-resort reconciliation: ask the server if a payment landed even
   *  though our client lost the response (timeout, app killed, etc). */
  const attemptReconcile = async (cid: number): Promise<boolean> => {
    try {
      await invokePaymentFunction("recover-enrollment", { course_id: cid });
      return true;
    } catch {
      return false;
    }
  };

  const handleRazorpayPayment = async () => {
    if (!user) {
      toast.error("Please login first");
      navigate("/login", { state: { from: location.pathname + location.search } });
      return;
    }

    setIsRazorpayLoading(true);
    const idempotency_key = idemKeyFor(user.id, String(courseId));
    let orderData: any;
    try {
      orderData = await invokePaymentFunction<any>("create-razorpay-order", {
        course_id: Number(courseId),
        idempotency_key,
      });
      // Persist so a killed app / cold start can recover later.
      safeSet(
        `nb:pendingOrder:${user.id}:${courseId}`,
        JSON.stringify({ order_id: orderData.order_id, ts: Date.now() })
      );
    } catch (error: any) {
      logger.error("Razorpay create-order error:", error);
      // On timeout, the order may still have been created server-side.
      if (error?.code === "TIMEOUT") {
        toast.info("Network slow — checking if your order went through...");
        if (await attemptReconcile(Number(courseId))) {
          playSuccessSound();
          toast.success("🎉 Enrollment recovered!");
          clearIdemKey(user.id, String(courseId));
          navigate("/my-courses", { replace: true });
          setIsRazorpayLoading(false);
          return;
        }
      }
      toast.error(error?.message || "Failed to initiate payment. Please try again.");
      setIsRazorpayLoading(false);
      return;
    }
    setIsRazorpayLoading(false);

    // Razorpay theme.color expects a hex string. Read the live --primary token
    // and convert HSL → hex so brand recolors flow through without a code edit.
    const primaryHex = (() => {
      try {
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim();
        const [h, s, l] = raw.split(/\s+/).map((p) => parseFloat(p));
        if (!isFinite(h) || !isFinite(s) || !isFinite(l)) return "#F97316";
        const sN = s / 100, lN = l / 100;
        const c = (1 - Math.abs(2 * lN - 1)) * sN;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = lN - c / 2;
        const [r, g, b] = h < 60 ? [c, x, 0]
          : h < 120 ? [x, c, 0]
          : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c]
          : h < 300 ? [x, 0, c]
          : [c, 0, x];
        const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      } catch {
        return "#F97316";
      }
    })();

    const sharedOpts = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      name: MERCHANT_NAME,
      description: orderData.course_title,
      order_id: orderData.order_id,
      prefill: { name: user.fullName || "", email: user.email || "" },
      theme: { color: primaryHex },
    };

    // Native Capacitor (Android/iOS) → open native Razorpay SDK so UPI
    // intents launch Google Pay / PhonePe / Paytm directly without an
    // in-app browser. Web → fall back to the JS checkout.
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      try {
        void tapMedium();
        const resp = await openNativeRazorpayCheckout(sharedOpts);
        await verifyRazorpayPayment(resp);
      } catch (e: any) {
        if (e instanceof RazorpayCancelledError) {
          toast.info("Payment cancelled. No amount was charged.");
        } else if (e instanceof RazorpayNativeError) {
          // Structured Razorpay failure — pass fields straight through so the
          // formatter renders the actionable message for payment_authentication
          // / BAD_REQUEST_ERROR / bank-side rejections.
          void notifyError();
          toast.error(formatRazorpayError({
            code: e.code, description: e.description, source: e.source,
            step: e.step, reason: e.reason, metadata: e.metadata,
          }) + " If your money was deducted, enrollment will happen automatically.");
        } else {
          void notifyError();
          toast.error(formatRazorpayError({ description: e?.message })
            + " If your money was deducted, enrollment will happen automatically.");
        }
      } finally {
        // Defense-in-depth: never leave the CTA stuck in "Processing…" if any
        // branch above threw synchronously after we cleared the initial spinner.
        if (isMountedRef.current) setIsRazorpayLoading(false);
      }
      return;
    }

    try {
      await openRazorpayCheckout({
        ...sharedOpts,
        handler: async (response: RazorpaySuccessResponse) => {
          try {
            await verifyRazorpayPayment(response);
          } catch (err) {
            logger.error("Handler error:", err);
            toast.error("Something went wrong after payment. Your payment is safe — enrollment will happen automatically.");
          }
        },
        onFailure: (err) => {
          // Surface Razorpay's real reason instead of the generic
          // "Payment failed" toast that hid the underlying bank/OTP error.
          void notifyError();
          toast.error(formatRazorpayError(err));
        },
        modal: {
          ondismiss: () => {
            toast.info("Payment cancelled. No amount was charged.");
          },
        },
      });
    } catch (error: any) {
      logger.error("Razorpay open error:", error);
      toast.error(error?.message || "Failed to open checkout. Please try again.");
    }
  };

  const verifyRazorpayPayment = async (response: RazorpaySuccessResponse) => {
    try {
      await invokePaymentFunction("verify-razorpay-payment", {
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
        course_id: Number(courseId),
      });

      playSuccessSound();
      void notifySuccess();
      toast.success("🎉 Payment successful! You are now enrolled!");
      setStep("razorpay-success");
      if (user && courseId) clearIdemKey(user.id, String(courseId));
      redirectTimerRef.current = window.setTimeout(() => {
        if (isMountedRef.current) navigate('/my-courses', { replace: true });
      }, 1500);

    } catch (error: any) {
      logger.error("Verification error:", error);
      // Verification timed out / 5xx but Razorpay says paid — try reconcile.
      if (error?.code === "TIMEOUT" || (error?.status && error.status >= 500)) {
        toast.info("Confirming with server...");
        if (await attemptReconcile(Number(courseId))) {
          playSuccessSound();
          void notifySuccess();
          toast.success("🎉 Payment confirmed! You are now enrolled.");
          if (user && courseId) clearIdemKey(user.id, String(courseId));
          navigate("/my-courses", { replace: true });
          return;
        }
      }
      void notifyError();
      toast.error(error.message || "Payment verification failed. Please contact support.");
    }
  };


  if (loading) return <LoadingSpinner fullPage text="Loading course…" />;
  if (!course) return <div className="p-10 text-center">Course not found <Button onClick={() => navigate("/courses")}>Back</Button></div>;

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      <header
        className="sticky top-0 z-50 bg-card border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3 shadow-sm"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >

        {step !== 'razorpay-success' && (
          <BackButton fallback="/courses" />
        )}
        <h1 className="font-semibold text-lg">Secure Checkout</h1>
      </header>

      <main className="max-w-xl mx-auto p-4 mt-4">

        {/* ── STEP: Details ── */}
        {step === "details" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{course.price === 0 ? "Free Enrollment" : "Payment Summary"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 items-center bg-muted/50 p-3 rounded-lg border">
                  {course.imageUrl && <img src={course.imageUrl} alt="Course" className="w-16 h-16 rounded object-cover" />}
                  <div>
                    <h2 className="font-bold text-sm">{course.title}</h2>
                    <p className="font-bold text-primary">
                      {course.price === 0 ? (
                        <span className="text-[hsl(142,72%,29%)] dark:text-[hsl(142,72%,55%)]">FREE</span>
                      ) : (
                        `₹${course.price}`
                      )}
                    </p>
                  </div>
                </div>

                {course.price === 0 ? (
                  <Button
                    className="w-full h-12 text-lg mt-4 bg-green-600 hover:bg-green-700"
                    onClick={async () => {
                      if (!user) {
                        toast.error("Please login first");
                        navigate("/login", { state: { from: location.pathname + location.search } });
                        return;
                      }
                      await handleFreeEnrollment(Number(courseId));
                    }}
                    disabled={loading}
                  >
                    <CheckCircle className="mr-2 h-5 w-5" />
                    Enroll for Free
                  </Button>
                ) : (
                  <div className="space-y-3 pt-2">
                    <button
                      onClick={handleRazorpayPayment}
                      disabled={isRazorpayLoading}
                      className="w-full relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-all group disabled:opacity-60"
                    >
                      <div className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Zap className="h-2.5 w-2.5" /> SECURE
                      </div>
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        {isRazorpayLoading ? (
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        ) : (
                          <CreditCard className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-base">Pay with Razorpay</p>
                        <p className="text-xs text-muted-foreground">Cards · UPI · Netbanking · Wallet</p>
                      </div>
                      <div className="w-full bg-primary text-primary-foreground rounded-lg py-3 text-sm font-bold text-center group-hover:bg-primary/90">
                        {isRazorpayLoading ? "Processing..." : `Pay ₹${course.price}`}
                      </div>
                      <p className="text-[10px] text-green-600 font-medium">✓ Instant enrollment after payment</p>
                    </button>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center pt-1">
                      <Shield className="h-3 w-3" />
                      <span>256-bit SSL encrypted · PCI DSS compliant</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Razorpay Success ── */}
        {step === "razorpay-success" && (
          <Card className="text-center py-16 animate-in fade-in duration-500">
            <CardContent>
              <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-16 h-16" />
              </div>

              <h2 className="text-3xl font-bold mb-2 text-green-700">Payment Successful!</h2>
              <p className="text-muted-foreground mb-4">You are now enrolled in <strong>{course.title}</strong></p>

              <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800 max-w-xs mx-auto my-6">
                <p className="text-sm text-green-700 dark:text-green-400">Amount Paid</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">₹{course.price}</p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1 flex items-center justify-center gap-1">
                  <Zap className="h-3 w-3" /> Instant enrollment activated
                </p>
              </div>

              <p className="text-muted-foreground text-sm mb-6">Redirecting you to your course...</p>

              <Button onClick={() => navigate('/my-courses')} className="w-full max-w-xs bg-green-600 hover:bg-green-700">
                Go to My Courses 🎉
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default BuyCourse;
