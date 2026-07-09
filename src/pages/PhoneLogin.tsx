import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Phone, ShieldCheck, ArrowLeft } from "lucide-react";
import logo from "@/assets/branding/nb-fist-logo.webp";

type Step = "phone" | "code";

const PhoneLogin = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-phone-otp", {
        body: { phone: digits },
      });
      if (error || (data && (data as { error?: string }).error)) {
        throw new Error(error?.message || (data as { error?: string }).error || "Failed");
      }
      toast.success("OTP sent to +91 " + digits);
      setStep("code");
      setResendIn(30);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-phone-otp", {
        body: { phone: phone.replace(/\D/g, ""), code },
      });
      const payload = data as {
        success?: boolean;
        token_hash?: string;
        email?: string;
        error?: string;
        attempts_left?: number;
      } | null;
      if (error || !payload?.success || !payload.token_hash || !payload.email) {
        const msg = payload?.error || error?.message || "Verification failed";
        throw new Error(
          payload?.attempts_left != null
            ? `${msg}. ${payload.attempts_left} attempts left.`
            : msg,
        );
      }

      // Exchange the magic-link token for a real session.
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: payload.token_hash,
      });
      if (verifyErr) throw verifyErr;

      toast.success("Welcome!");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not verify OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="Naveen Bharat" className="h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-bold text-foreground">
            {step === "phone" ? "Sign in with phone" : "Enter OTP"}
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            {step === "phone"
              ? "We'll send a 6-digit code by SMS"
              : `Code sent to +91 ${phone}`}
          </p>
        </div>

        {step === "phone" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <div className="flex items-center gap-2">
                <span className="px-3 py-2 rounded-md bg-muted text-sm font-medium">+91</span>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="9876543210"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  disabled={loading}
                />
              </div>
            </div>
            <Button onClick={sendOtp} disabled={loading || phone.length !== 10} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Phone className="h-4 w-4 mr-2" />}
              Send OTP
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={loading}
                className="text-center text-2xl tracking-widest"
              />
            </div>
            <Button onClick={verifyOtp} disabled={loading || code.length !== 6} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Verify & Sign in
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" /> Change number
              </button>
              <button
                type="button"
                onClick={sendOtp}
                disabled={resendIn > 0 || loading}
                className="text-primary disabled:text-muted-foreground"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
              </button>
            </div>
          </div>
        )}

        <div className="text-center text-sm text-muted-foreground">
          Prefer email?{" "}
          <Link to="/login" className="text-primary font-medium">Sign in with email</Link>
        </div>
      </div>
    </div>
  );
};

export default PhoneLogin;
