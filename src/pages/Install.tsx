import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import {
  Smartphone,
  Monitor,
  Apple,
  Download,
  Share2,
  MoreVertical,
  Plus,
  ArrowLeft,
  CheckCircle2,
  Copy,
  MessageCircle,
  QrCode,
  Zap,
  Globe,
  Package,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import nbLogo from "../assets/branding/logo_icon_web.webp"; 
import mascot from "../assets/branding/sadguru-mascot.webp";
import { toast } from "sonner";
import { openResource } from "../lib/openResource";

// ─── LATEST GITHUB APK LINK ──────────────────────────────────────────────────
const APK_DOWNLOAD_URL = "https://github.com/MrAnujBabu/Naveen-Bharat-Install/releases/download/v1.0.0/SafarEnglish.apk";
// ─────────────────────────────────────────────────────────────────────────────

type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

// Step card component
function StepCard({
  number,
  icon: Icon,
  title,
  description,
}: {
  number: number;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary-foreground">{number}</span>
        </div>
      </div>
      <div>
        <p className="font-semibold text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

const Install = () => {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [promptUsed, setPromptUsed] = useState(false);
  const [copiedApk, setCopiedApk] = useState(false);
  const navigate = useNavigate();
  const appUrl = window.location.origin;

  // ─── YAHAN QR API UPDATE KI GAYI HAI TAARI IMAGE SHOW HO SAKE ─────────────
  const apkQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(APK_DOWNLOAD_URL)}`;
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setPromptUsed(false);
      toast.success("App installed successfully! 🎉");
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleInstallPrompt = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setPromptUsed(true);
      setDeferredPrompt(null);
    }
  };

  const copyApkLink = () => {
    navigator.clipboard.writeText(APK_DOWNLOAD_URL);
    setCopiedApk(true);
    toast.success("APK link copied!");
    setTimeout(() => setCopiedApk(false), 2000);
  };

  const shareWhatsApp = () => {
    void openResource({
      url: `https://wa.me/?text=${encodeURIComponent(
        `📚 Install Safar English app!\n\n📦 Download APK (Android): ${APK_DOWNLOAD_URL}\n\n🌐 Or install via browser: ${appUrl}/install`
      )}`,
      kind: "link",
    });
  };

  const platformTabs =[
    { key: "android" as Platform, icon: Smartphone, label: "Android", color: "text-green-500" },
    { key: "ios" as Platform, icon: Apple, label: "iPhone / iPad", color: "text-foreground" },
    { key: "desktop" as Platform, icon: Monitor, label: "Desktop", color: "text-blue-500" },
  ];

  return (
    <div className="min-h-dvh bg-background">
      {/* Header bar */}
      <div
        className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm pt-[env(safe-area-inset-top)]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="container mx-auto px-4 py-3 flex items-center gap-3 max-w-2xl">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={nbLogo} alt="Safar English" className="h-7 w-7 rounded-lg" />
          <span className="font-semibold text-foreground">Install App</span>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-2xl pb-16">

        {/* Hero gradient section */}
        <div className="relative overflow-hidden rounded-2xl mt-5 mb-6 bg-gradient-to-br from-primary/20 via-primary/10 to-background border border-primary/20 px-6 pt-8 pb-6 text-center">
          <img
            src={mascot}
            alt="Safar English Mascot"
            className="mx-auto h-28 w-28 object-contain drop-shadow-lg mb-3"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <h1 className="text-2xl font-bold text-foreground">Install Safar English App</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Get the full learning experience on your device — works offline too!
          </p>

          {/* One-tap install if PWA prompt available */}
          {deferredPrompt && !promptUsed && (
            <Button
              size="lg"
              className="mt-5 gap-2 w-full max-w-xs shadow-lg"
              onClick={handleInstallPrompt}
            >
              <Zap className="h-4 w-4" />
              Install App Now — One Tap!
            </Button>
          )}
        </div>

        {/* Already installed banner */}
        {installed && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30 mb-5">
            <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-600 dark:text-green-400 text-sm">
                You're already using the Safar English app! 🎉
              </p>
              <p className="text-xs text-muted-foreground">
                This app is installed and running in standalone mode.
              </p>
            </div>
          </div>
        )}

        {/* Platform tabs */}
        <div className="flex gap-2 mb-5">
          {platformTabs.map(({ key, icon: Icon, label, color }) => (
            <button
              key={key}
              onClick={() => setPlatform(key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-xs font-medium transition-all ${
                platform === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              <Icon className={`h-5 w-5 ${platform === key ? "text-primary" : color}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* ── APK Direct Download QR Code card (always visible) ── */}
        <div className="mb-5 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 bg-green-500/10 border-b border-green-500/20">
            <QrCode className="h-5 w-5 text-green-600" />
            <p className="font-bold text-sm text-foreground">📦 Scan QR to Download APK</p>
            <span className="ml-auto text-[10px] font-bold bg-green-500/20 text-green-600 px-2 py-0.5 rounded-full">ANDROID</span>
          </div>
          <div className="p-5">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* APK QR code */}
              <div className="flex-shrink-0 flex flex-col items-center gap-2">
                <div className="p-3 bg-white rounded-xl border border-border shadow-md">
                  <img
                    src={apkQrUrl}
                    alt="QR Code — scan to download APK"
                    className="w-[180px] h-[180px]"
                    onError={(e) => {
                      (e.target as HTMLImageElement).parentElement!.innerHTML =
                        '<div class="w-[180px] h-[180px] flex items-center justify-center text-xs text-gray-400 text-center p-4">QR unavailable<br/>Use link below</div>';
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Scan with phone camera<br />to download APK directly
                </p>
              </div>

              {/* Right: info + buttons */}
              <div className="flex-1 space-y-3 w-full sm:w-auto">
                <p className="text-sm font-medium text-foreground">Direct APK Download</p>
                <p className="text-xs text-muted-foreground">
                  Point your Android camera at this QR code — it downloads the APK straight to your phone without opening GitHub.
                </p>
                <div className="flex flex-col gap-2">
                  <a href={APK_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
                      <Download className="h-4 w-4" />
                      Download APK Directly
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    className="w-full gap-2 justify-start"
                    onClick={copyApkLink}
                  >
                    {copiedApk ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copiedApk ? "APK Link Copied!" : "Copy APK Link"}
                  </Button>
                  <Button
                    className="w-full gap-2 justify-start bg-green-600 hover:bg-green-700 text-white"
                    onClick={shareWhatsApp}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Share APK on WhatsApp
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ANDROID ── */}
        {platform === "android" && (
          <div className="space-y-4">
            {/* Option A: APK */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 bg-green-500/10 border-b border-green-500/20">
                <Package className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-bold text-sm text-foreground">Option A — Download APK</p>
                  <p className="text-xs text-muted-foreground">Recommended · Works like a native app</p>
                </div>
                <span className="ml-auto text-[10px] font-bold bg-green-500/20 text-green-600 px-2 py-0.5 rounded-full">
                  RECOMMENDED
                </span>
              </div>
              <div className="p-5 space-y-4">
                <a href={APK_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
                    <Download className="h-4 w-4" />
                    Download APK
                  </Button>
                </a>
                <p className="text-[11px] text-muted-foreground text-center">
                  Android 7.0+ · ~23 MB
                </p>

                <div className="space-y-2">
                  {[
                    { n: 1, title: "Download the APK file", desc: "Tap the button above to start" },
                    {
                      n: 2,
                      title: "Allow unknown sources",
                      desc: 'Open Settings → Security → Enable "Install unknown apps"',
                    },
                    { n: 3, title: "Open the downloaded file", desc: "Tap the APK in your notifications" },
                    { n: 4, title: "Tap Install & Open", desc: "App icon will appear on your home screen" },
                  ].map((s) => (
                    <div key={s.n} className="flex gap-3 items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                        <span className="text-[10px] font-bold text-green-600">{s.n}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Option B: PWA */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 bg-blue-500/10 border-b border-blue-500/20">
                <Globe className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-bold text-sm text-foreground">Option B — Install from Chrome</p>
                  <p className="text-xs text-muted-foreground">No download needed · Instant install</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {deferredPrompt ? (
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    onClick={handleInstallPrompt}
                  >
                    <Zap className="h-4 w-4 text-primary" />
                    One-Tap Install via Browser
                  </Button>
                ) : null}
                <StepCard
                  number={1}
                  icon={Globe}
                  title="Open in Chrome"
                  description="Make sure you're using Chrome browser on Android"
                />
                <StepCard
                  number={2}
                  icon={MoreVertical}
                  title='Tap the "⋮" menu'
                  description="Top-right corner of Chrome browser"
                />
                <StepCard
                  number={3}
                  icon={Plus}
                  title='Tap "Add to Home screen"'
                  description='Or "Install app" — then confirm with "Add"'
                />
              </div>
            </div>
          </div>
        )}

        {/* ── iOS ── */}
        {platform === "ios" && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-foreground/5 border-b border-border">
              <Apple className="h-5 w-5 text-foreground" />
              <div>
                <p className="font-bold text-sm text-foreground">Install on iPhone / iPad</p>
                <p className="text-xs text-muted-foreground">Requires Safari browser</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex gap-2">
                <span className="text-base">⚠️</span>
                <span>Must use <strong>Safari</strong> — Chrome on iPhone does not support Add to Home Screen.</span>
              </div>
              <StepCard
                number={1}
                icon={Globe}
                title="Open this page in Safari"
                description="Copy the URL and paste into Safari if needed"
              />
              <StepCard
                number={2}
                icon={Share2}
                title='Tap the Share button'
                description='The box-with-arrow icon at the bottom of Safari'
              />
              <StepCard
                number={3}
                icon={Plus}
                title='"Add to Home Screen"'
                description="Scroll down in the share sheet and tap this option"
              />
              <StepCard
                number={4}
                icon={CheckCircle2}
                title='Tap "Add" to confirm'
                description="The Safar English app icon will appear on your home screen!"
              />
              <p className="text-xs text-muted-foreground text-center pt-1">
                Works offline · Feels like a native app · No App Store needed
              </p>
            </div>
          </div>
        )}

        {/* ── DESKTOP ── */}
        {platform === "desktop" && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-blue-500/10 border-b border-blue-500/20">
              <Monitor className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-bold text-sm text-foreground">Install on Desktop</p>
                <p className="text-xs text-muted-foreground">Chrome, Edge, or Brave</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {deferredPrompt && (
                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={handleInstallPrompt}
                >
                  <Download className="h-4 w-4" />
                  Install Desktop App — One Click
                </Button>
              )}
              <div className="space-y-3">
                <StepCard
                  number={1}
                  icon={Globe}
                  title="Open in Chrome / Edge / Brave"
                  description="Other browsers may not support PWA installation"
                />
                <StepCard
                  number={2}
                  icon={Plus}
                  title="Look for the install icon"
                  description='Click the ⊕ icon in the address bar (right side)'
                />
                <StepCard
                  number={3}
                  icon={CheckCircle2}
                  title='Click "Install"'
                  description='The app will open in its own window!'
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Install;
