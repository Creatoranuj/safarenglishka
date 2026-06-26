import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
const API_BASE = "/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle, Shield, Loader2, CreditCard, Zap
} from "lucide-react";
import { useAdminEnrollment } from "../hooks/useAdminEnrollment";
import { openRazorpayCheckout, type RazorpaySuccessResponse } from "../utils/razorpay";
import { openNativeRazorpayCheckout } from "../utils/razorpayNative";
import { tapMedium, notifySuccess, notifyError } from "../lib/nativeChrome";

const MERCHANT_NAME = "Safar English Ka";
const SUCCESS_SOUND_URL = "https://cdn.pixabay.com/audio/2021/08/04/audio_aad70ee296.mp3";

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
      console.error("Free enrollment error:", error);
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
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (token) {
              const res = await fetch(`${API_BASE}/functions/v1/recover-enrollment`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ course_id: Number(courseId) }),
              });
              if (res.ok) {
                playSuccessSound();
                toast.success("🎉 Enrollment recovered! You are now enrolled.");
                navigate(`/my-courses`);
                return;
              }
            }
          } catch (recoveryErr) {
            console.error("Recovery via edge function failed:", recoveryErr);
          }
        }
      } catch (err) {
        console.error("Payment recovery check error:", err);
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
            setCourse({
              id: data.id,
              title: data.title,
              description: data.description,
              grade: data.grade,
              price: data.price ?? 0,
              thumbnailUrl: data.thumbnail_url,
              imageUrl: data.image_url,
            });

            if (isFree && user) {
              await handleFreeEnrollment(Number(courseId));
            }
          }
        } catch (err) {
          console.error("Error fetching course:", err);
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
      console.error("Audio error", e);
    }
  };

  const handleRazorpayPayment = async () => {
    if (!user) {
      toast.error("Please login first");
      navigate("/login", { state: { from: location.pathname + location.search } });
      return;
    }

    setIsRazorpayLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        toast.error("Please login first");
        setIsRazorpayLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE}/functions/v1/create-razorpay-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ course_id: Number(courseId) }),
      });

      const orderData = await response.json();

      if (!response.ok) {
        throw new Error(orderData.error || 'Failed to create payment order');
      }

      setIsRazorpayLoading(false);

      // Native Capacitor (Android/iOS) → open native Razorpay SDK so UPI
      // intents launch Google Pay / PhonePe / Paytm directly without an
      // in-app browser. Web → fall back to the JS checkout.
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        try {
          void tapMedium();
          const resp = await openNativeRazorpayCheckout({
            key: orderData.key_id,
            amount: orderData.amount,
            currency: orderData.currency,
            name: MERCHANT_NAME,
            description: orderData.course_title,
            order_id: orderData.order_id,
            prefill: { name: user.fullName || '', email: user.email || '' },
            theme: { color: '#F97316' },
          });
          await verifyRazorpayPayment(resp);
        } catch (e: any) {
          void notifyError();
          if (e?.message?.includes('Payment did not complete')) {
            toast.info("Payment cancelled. No amount was charged.");
          } else {
            toast.error(e?.message || "Payment failed. Please try again.");
          }
        }
        return;
      }

      await openRazorpayCheckout({
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: MERCHANT_NAME,
        description: orderData.course_title,
        order_id: orderData.order_id,
        prefill: {
          name: user.fullName || '',
          email: user.email || '',
        },
        theme: { color: '#F97316' },
        handler: async (response: RazorpaySuccessResponse) => {
          try {
            await verifyRazorpayPayment(response);
          } catch (err) {
            console.error("Handler error:", err);
            toast.error("Something went wrong after payment. Your payment is safe — enrollment will happen automatically.");
          }
        },
        modal: {
          ondismiss: () => {
            toast.info("Payment cancelled. No amount was charged.");
          }
        }
      });

    } catch (error: any) {
      console.error("Razorpay error:", error);
      toast.error(error.message || "Failed to initiate payment. Please try again.");
      setIsRazorpayLoading(false);
    }
  };

  const verifyRazorpayPayment = async (response: RazorpaySuccessResponse) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const verifyResponse = await fetch(`${API_BASE}/functions/v1/verify-razorpay-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          course_id: Number(courseId),
        }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || 'Payment verification failed');
      }

      playSuccessSound();
      void notifySuccess();
      toast.success("🎉 Payment successful! You are now enrolled!");
      setStep("razorpay-success");
      redirectTimerRef.current = window.setTimeout(() => {
        if (isMountedRef.current) navigate('/my-courses', { replace: true });
      }, 1500);

    } catch (error: any) {
      console.error("Verification error:", error);
      void notifyError();
      toast.error(error.message || "Payment verification failed. Please contact support.");
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!course) return <div className="p-10 text-center">Course not found <Button onClick={() => navigate("/courses")}>Back</Button></div>;

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      <header className="sticky top-0 z-50 bg-card border-b px-4 py-3 flex items-center gap-3 shadow-sm">
        {step !== 'razorpay-success' && (
          <Button aria-label="Back to courses" variant="ghost" size="icon" onClick={() => navigate("/courses")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
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
