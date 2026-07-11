import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { Markdown } from "../Markdown";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

import { cn } from "../../lib/utils";
import { X, Send, RotateCcw, ThumbsUp, ThumbsDown, Mic, MicOff, Paperclip, ImageIcon, Lock, LogIn } from "lucide-react";
import logoIcon from "../../assets/sarthi-avatar.webp"; // Sarthi guru avatar
import nbLogo from "../../assets/branding/nb-fist-logo.webp"; // NB brand logo
import { logger } from "../../lib/logger";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  id: string;
  feedbackGiven?: "up" | "down" | null;
  queryType?: string;
  imageUrl?: string; // for image/doc preview in chat
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const QUICK_PROMPTS = [
  "📚 Recommend me a lecture",
  "📝 Quiz me on Physics",
  "🎯 Show DPP for my chapter",
  "🔥 Mera next lesson kya hai?",
];

const WELCOME_MSG = "👋 Hello! I'm **Safar English Agent** – your intelligent 24×7 English learning companion. 🤖✨\n\nI can help you with:\n- 📚 **Lessons, PDFs & practice** from your enrolled course\n- 🗣️ **Spoken English** drills, pronunciation & sentence-making\n- 📝 **Grammar** doubts, quick quizzes & error correction\n- 🎯 **CG Lecturer** exam strategy, tips & mnemonics\n- 🖼️ **Photo doubt** — upload a page and I'll explain it!\n\nWhat should we work on today?";

// Allowed image/doc types
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Web Speech API type declarations
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const MarkdownMessage = ({ content }: { content: string }) => (
  <Markdown
    components={{
      h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-2 text-foreground">{children}</h1>,
      h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1.5 text-foreground">{children}</h2>,
      h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-foreground">{children}</h3>,
      p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
      li: ({ children }) => <li className="text-sm leading-relaxed pl-0.5">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      a: ({ href, children }) => <a href={href} className="underline text-primary" target="_blank" rel="noopener noreferrer">{children}</a>,
      table: ({ children }) => (
        <div className="overflow-x-auto my-2 rounded-lg border border-border shadow-sm">
          <table className="text-xs w-full min-w-[280px] border-collapse">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-primary/10 sticky top-0">{children}</thead>,
      th: ({ children }) => <th className="px-3 py-2 text-left font-semibold border-b border-border text-foreground whitespace-nowrap">{children}</th>,
      td: ({ children }) => <td className="px-3 py-2 border-b border-border/40 text-foreground">{children}</td>,
      tr: ({ children }) => <tr className="even:bg-muted/20 hover:bg-muted/40 transition-colors">{children}</tr>,
      blockquote: ({ children }) => <blockquote className="border-l-[3px] border-primary/50 pl-3 italic text-muted-foreground my-2 bg-muted/10 py-1 rounded-r">{children}</blockquote>,
      code: ({ children, className }) => {
        const isBlock = className?.includes('language-');
        if (isBlock) {
          return <code className="block bg-muted/80 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2 border border-border/30">{children}</code>;
        }
        return <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
      },
      pre: ({ children }) => <pre className="overflow-x-auto my-2">{children}</pre>,
      hr: () => <hr className="my-3 border-border/50" />,
    }}
  >
    {content}
  </Markdown>
);

// Show ChatWidget ONLY on landing page and dashboard
const ALLOWED_ROUTES = ["/", "/dashboard", "/courses", "/my-courses", "/all-classes", "/all-tests", "/materials", "/notices", "/books", "/doubts", "/profile", "/timetable", "/syllabus"];

const ChatWidget = forwardRef<HTMLDivElement>(() => {
  const { user } = useAuth();
  const location = useLocation();

  // Only render on explicitly allowed routes
  const isHiddenRoute = !ALLOWED_ROUTES.includes(location.pathname);
  const [isOpen, setIsOpen] = useState(false);
  const [showLoginTip, setShowLoginTip] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: WELCOME_MSG, timestamp: new Date(), id: "welcome", feedbackGiven: null },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Image/doc upload state
  const [uploadedFile, setUploadedFile] = useState<{ file: File; previewUrl: string; type: "image" | "pdf" } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Check voice support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognition);
  }, []);

  // Hide BottomNav when chat is open on mobile + Android hardware-back sentinel.
  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove('chat-fullscreen-open');
      return;
    }
    document.body.classList.add('chat-fullscreen-open');
    try { window.history.pushState({ overlay: true }, ""); } catch {}
    const onPop = () => setIsOpen(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.body.classList.remove('chat-fullscreen-open');
      // Pop our sentinel if the user closed via the X button (not via back).
      if (window.history.state?.overlay) {
        try { window.history.back(); } catch {}
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);


  // Voice input handler
  const toggleVoice = () => {
    if (!voiceSupported) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = "hi-IN"; // Hindi + English support
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // File upload handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("❌ Only images (JPG, PNG, GIF, WebP) and PDF files allowed!");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert("❌ File size must be under 5MB!");
      return;
    }

    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : "";

    setUploadedFile({ file, previewUrl, type: isImage ? "image" : "pdf" });

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeUploadedFile = () => {
    if (uploadedFile?.previewUrl) URL.revokeObjectURL(uploadedFile.previewUrl);
    setUploadedFile(null);
  };

  // Upload file to Supabase storage and get URL
  const uploadFileToStorage = async (file: File): Promise<string | null> => {
    try {
      const ext = file.name.split(".").pop();
      const path = `chat-doubts/${user?.id || "anon"}/${Date.now()}.${ext}`;

      const { supabase } = await import("../../integrations/supabase/client");
      const { data, error } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (err) {
      logger.error("ChatWidget upload error", err);
      return null;
    }
  };

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if ((!msg && !uploadedFile) || isLoading) return;
    setInput("");

    let filePublicUrl: string | null = null;
    let fileType: "image" | "pdf" | null = null;
    const fileToSend = uploadedFile;
    setUploadedFile(null);

    if (fileToSend) {
      setIsUploading(true);
      filePublicUrl = await uploadFileToStorage(fileToSend.file);
      fileType = fileToSend.type;
      setIsUploading(false);
      if (fileToSend.previewUrl) URL.revokeObjectURL(fileToSend.previewUrl);
    }

    const displayMsg = msg || (fileType === "image" ? "🖼️ [Image doubt]" : "📄 [Document]");
    const userMsgId = crypto.randomUUID();
    const userMsg: Message = {
      role: "user",
      content: displayMsg,
      timestamp: new Date(),
      id: userMsgId,
      imageUrl: fileType === "image" && filePublicUrl ? filePublicUrl : undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

      // Build message with image context if file uploaded
      let fullMsg = msg;
      if (filePublicUrl && fileType === "image") {
        fullMsg = `${msg ? msg + "\n\n" : ""}[Student ne ek image/doubt upload ki hai: ${filePublicUrl}]\nIs image mein jo bhi question ya concept hai usse explain karein step by step.`;
      } else if (filePublicUrl && fileType === "pdf") {
        fullMsg = `${msg ? msg + "\n\n" : ""}[Student ne ek PDF document upload kiya hai: ${filePublicUrl}]\nIs document ke baare mein help karein.`;
      }

      const { supabase } = await import("../../integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Sign in required");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/chatbot`, { 
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": ANON_KEY,
        },
        body: JSON.stringify({ message: fullMsg, history, userId: user?.id, sessionId }),
      });

      const raw = await response.text();
      let data: any = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { /* non-JSON */ }
      if (!response.ok) {
        const reason = data?.error || raw?.slice(0, 200) || `HTTP ${response.status}`;
        throw new Error(reason);
      }
      const botReply = data?.response || "माफ़ करें, कुछ गड़बड़ हो गई। फिर try करें। 🙏";

      setMessages(prev => [...prev, {
        role: "assistant",
        content: botReply,
        timestamp: new Date(),
        id: crypto.randomUUID(),
        feedbackGiven: null,
        queryType: data?.queryType,
      }]);
    } catch (err) {
      const reason = (err as Error)?.message || "Network error";
      logger.error("[ChatWidget] chatbot call failed", reason);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `🔧 Connection में problem है। थोड़ी देर बाद try करें। 🙏\n\n_${reason}_`,
        timestamp: new Date(),
        id: crypto.randomUUID(),
        feedbackGiven: null,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = useCallback(async (msgId: string, rating: "up" | "down") => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg || msg.feedbackGiven) return;

    const msgIndex = messages.findIndex(m => m.id === msgId);
    const userMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, feedbackGiven: rating } : m));

    try {
      const { supabase } = await import("../../integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) return;
      await fetch(`${SUPABASE_URL}/functions/v1/chatbot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": ANON_KEY,
        },
        body: JSON.stringify({
          message: "_feedback_",
          feedback: {
            messageContent: userMsg?.content || "",
            responseContent: msg.content,
            rating,
          },
          userId: user?.id,
          sessionId,
        }),
      });
    } catch {
      // Silently fail on feedback errors
    }
  }, [messages, user, sessionId]);

  // Hide on video/lesson pages to avoid obstructing the player
  if (isHiddenRoute) return null;

  const resetChat = () => {
    removeUploadedFile();
    setMessages([{
      role: "assistant",
      content: "👋 Hello! I'm **Safar English Agent** – let's start a fresh conversation. How can I help you today? 🤖🎓",
      timestamp: new Date(),
      id: "welcome-reset",
      feedbackGiven: null,
    }]);
  };

  // ─── LOGIN GATE: unauthenticated users see a locked button ───
  if (!user) {
    return (
      <div
        data-chat-widget="true"
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
        className="fixed right-4 z-50 md:!bottom-6 md:right-6 flex flex-col items-end gap-2"
      >
        {/* Login tooltip */}
        {showLoginTip && (
          <div
            className={cn(
              "bg-card border border-border rounded-2xl shadow-xl px-4 py-4 text-right",
              "max-w-[230px] animate-in slide-in-from-bottom-3 fade-in duration-200"
            )}
          >
            {/* Header row */}
            <div className="flex items-center justify-end gap-2 mb-2">
              <p className="font-semibold text-sm text-foreground">Safar English Agent 🤖</p>
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <img src={logoIcon} className="w-3.5 h-3.5 object-contain" alt="" />
              </div>
            </div>
            {/* Body */}
            <p className="text-muted-foreground text-xs leading-relaxed mb-3">
              <strong className="text-foreground">Login</strong> to chat with your 24×7 English learning agent.
            </p>
            {/* CTA */}
            <Link
              to="/login"
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-semibold",
                "bg-primary text-primary-foreground px-3 py-1.5 rounded-full",
                "hover:opacity-90 transition-opacity"
              )}
            >
              <LogIn className="h-3 w-3" />
              Login →
            </Link>
          </div>
        )}

        {/* Locked floating button */}
        <button
          onClick={() => setShowLoginTip(prev => !prev)}
          className={cn(
            "w-14 h-14 rounded-full shadow-md flex items-center justify-center",
            "bg-white dark:bg-card border border-border/50 transition-all duration-200",
            "hover:shadow-lg relative",
            showLoginTip && "shadow-lg ring-1 ring-border"
          )}
          aria-label="Login to chat with Safar English Agent"
        >
          <img src={logoIcon} className="w-8 h-8 object-contain" alt="Safar English Agent" />
          {/* Lock badge */}
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-card rounded-full border-2 border-border flex items-center justify-center shadow-sm">
            <Lock className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div data-chat-widget="true" className="contents">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
        className={cn(
          "fixed right-4 z-50 md:!bottom-6 md:right-6",
          "w-14 h-14 rounded-full shadow-md flex items-center justify-center",
          "bg-white dark:bg-card border border-border/50 transition-all duration-200",
          "hover:shadow-lg",
          isOpen && "scale-0 opacity-0 pointer-events-none"
        )}
        aria-label="Open Safar English Agent"
      >
        <img src={logoIcon} className="w-8 h-8 object-contain" alt="Safar English Agent" />
      </button>

      {/* Full-page chat overlay */}
      {isOpen && (
        <div className={cn(
          "fixed inset-0 z-50",
          "bg-background flex flex-col",
          "animate-in fade-in duration-200",
          "md:left-auto md:w-[640px] lg:w-[780px] md:shadow-2xl md:border-l md:border md:rounded-l-2xl"
        )}>
          {/* Header — minimal, ChatGPT/Gemini-style */}
          <div className="safe-area-top bg-background border-b border-border shrink-0">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full overflow-hidden ring-1 ring-border bg-muted shrink-0 flex items-center justify-center">
                <img src={nbLogo} className="w-7 h-7 object-contain" alt="Safar English" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base text-foreground leading-tight truncate">Safar English Agent</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Online · English Learning Companion
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground" onClick={resetChat} aria-label="Reset chat" title="Reset chat">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setIsOpen(false)} aria-label="Close" title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5" ref={scrollRef}>
            <div className="space-y-4 pb-2">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <img src={logoIcon} className="w-5 h-5 object-contain" alt="Sarthi" />
                    </div>
                  )}
                  <div className="flex flex-col gap-1 max-w-[92%]">
                    {/* Image preview in user message */}
                    {msg.imageUrl && (
                      <div className="rounded-xl overflow-hidden border border-border">
                        <img
                          src={msg.imageUrl}
                          alt="Uploaded doubt"
                          className="max-w-full max-h-48 object-contain bg-muted"
                        />
                      </div>
                    )}
                    <div className={cn(
                      "rounded-2xl px-4 py-3 text-sm leading-[1.75]",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "rounded-bl-sm border border-orange-100/60"
                    )}
                    style={msg.role === "assistant" ? { background: 'linear-gradient(135deg, #fff8f0, #fff3e6)' } : undefined}
                    >
                      {msg.role === "assistant" ? <MarkdownMessage content={msg.content} /> : msg.content}
                    </div>
                    {/* Timestamp */}
                    <span className={cn(
                      "text-[10px] text-muted-foreground/60 px-1",
                      msg.role === "user" ? "text-right" : "text-left"
                    )}>
                      {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                    {/* Feedback buttons for assistant messages (not welcome) */}
                    {msg.role === "assistant" && msg.id !== "welcome" && msg.id !== "welcome-reset" && (
                      <div className="flex gap-1 pl-1">
                        <button
                          onClick={() => handleFeedback(msg.id, "up")}
                          disabled={!!msg.feedbackGiven}
                          className={cn(
                            "p-1 rounded-md transition-colors text-xs flex items-center gap-0.5",
                            msg.feedbackGiven === "up"
                              ? "text-primary bg-primary/15"
                              : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                          )}
                          title="Helpful"
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleFeedback(msg.id, "down")}
                          disabled={!!msg.feedbackGiven}
                          className={cn(
                            "p-1 rounded-md transition-colors text-xs flex items-center gap-0.5",
                            msg.feedbackGiven === "down"
                              ? "text-destructive bg-destructive/15"
                              : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          )}
                          title="Not helpful"
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                        {msg.feedbackGiven && (
                          <span className="text-xs text-muted-foreground self-center ml-1">
                            {msg.feedbackGiven === "up" ? "शुक्रिया! 😊" : "समझ गया, बेहतर करेंगे 🙏"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Animated typing indicator */}
              {(isLoading || isUploading) && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <img src={logoIcon} className="w-5 h-5 object-contain" alt="Sarthi" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                    {isUploading ? (
                      <span className="text-xs text-muted-foreground">Uploading...</span>
                    ) : (
                      [0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick prompts — full-width cards for better mobile UX */}
          {messages.length <= 1 && (
            <div className="px-4 pb-3 flex flex-col gap-2 shrink-0">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="w-full text-left text-sm font-medium rounded-xl px-4 py-3 transition-all duration-200 hover:shadow-md border border-border/50 bg-card hover:bg-accent/50 text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* File preview strip */}
          {uploadedFile && (
            <div className="px-3 pb-1 shrink-0">
              <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
                {uploadedFile.type === "image" ? (
                  <>
                    <img src={uploadedFile.previewUrl} alt="preview" className="w-8 h-8 rounded object-cover" />
                    <span className="text-xs text-foreground flex-1 truncate">{uploadedFile.file.name}</span>
                  </>
                ) : (
                  <>
                    <Paperclip className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs text-foreground flex-1 truncate">{uploadedFile.file.name}</span>
                  </>
                )}
                <button onClick={removeUploadedFile} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Voice listening indicator */}
          {isListening && (
            <div className="px-4 pb-1 shrink-0">
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-full px-3 py-1.5">
                <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                <span className="text-xs text-destructive font-medium">सुन रहा हूँ... बोलिए 🎤</span>
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-border/60 bg-background/95 px-3 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 shrink-0" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>
            <div className="flex items-center gap-1.5 rounded-2xl bg-background overflow-hidden px-2 py-1.5 shadow-[0_0_0_1px_hsl(var(--border)),0_1px_1px_rgba(0,0,0,0.04)]">
            {/* Attach file button — ghost tool */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-lg text-foreground/70 hover:bg-muted/60 hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              title="Image/PDF doubt upload karein"
              aria-label="Attach file"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>

            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder={isListening ? "बोल रहे हैं..." : "Ask AI Agent..."}
              className="h-9 flex-1 border-0 bg-transparent px-2 text-base sm:text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-foreground/40"
              disabled={isLoading}
            />

            {/* Voice button — ghost tool */}
            {voiceSupported && (
              <Button
                variant={isListening ? "destructive" : "ghost"}
                size="icon"
                className={cn(
                  "h-8 w-8 shrink-0 rounded-lg transition-all",
                  !isListening && "text-foreground/70 hover:bg-muted/60 hover:text-foreground",
                  isListening && "animate-pulse rounded-lg"
                )}
                onClick={toggleVoice}
                disabled={isLoading}
                title={isListening ? "Voice रोकें" : "Voice से बोलें"}
                aria-label={isListening ? "Stop voice" : "Start voice"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}

            {/* Send button — single filled primary intent */}
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
              onClick={() => sendMessage()}
              disabled={(!input.trim() && !uploadedFile) || isLoading}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

ChatWidget.displayName = "ChatWidget";

export default ChatWidget;
