import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// v2 – force Vite re-resolve
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, errorInfo);
    // Auto-recovery: one silent reload per session if the crash looks like a
    // transient chunk-load / WebView-context issue. Guarded by sessionStorage
    // so we NEVER enter an infinite reload loop.
    try {
      const KEY = "nb_eb_auto_reload_at";
      const last = Number(sessionStorage.getItem(KEY) || "0");
      const msg = String(error?.message || "");
      const transient = /Loading chunk|dynamically imported module|ChunkLoadError|NetworkError|Failed to fetch/i.test(msg);
      if (transient && Date.now() - last > 60_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        setTimeout(() => window.location.reload(), 400);
      }
    } catch { /* noop */ }
  }


  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                {this.props.fallbackTitle || "Something went wrong"}
              </h2>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Please try refreshing the page.
              </p>
              {this.state.error && import.meta.env.DEV && (
                <p className="text-xs text-muted-foreground/70 bg-muted p-2 rounded-lg mt-2 font-mono break-all">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  // Audit fix: history.back() on a cold deep-link (length=1)
                  // navigates the WebView to about:blank → white screen on
                  // Android. Fall back to home when there's no real history.
                  if (window.history.length > 1) window.history.back();
                  else window.location.href = "/";
                }}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
              <Button
                onClick={() => {
                  // Clear ALL reload-cooldown guards so the user is never
                  // permanently locked out of recovery when they manually
                  // tap Refresh after a crash.
                  try {
                    sessionStorage.removeItem("nb_crash_reload_at");
                    sessionStorage.removeItem("nb_eb_auto_reload_at");
                    sessionStorage.removeItem("lovable:resume-reload");
                  } catch { /* noop */ }
                  window.location.reload();
                }}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
