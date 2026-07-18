import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type ChatMsg = { role: "user" | "assistant"; content: string; ts: number; error?: boolean };

const ASK_TEACHERS = ["Raj VIP Sir", "English Sarthi", "Sahayak"];

const pickTeacher = () => ASK_TEACHERS[Math.floor(Math.random() * ASK_TEACHERS.length)];

const extractYouTubeId = (url: string): string => {
  const m = (url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([^&\n?#]+)/);
  return m ? m[1] : "";
};

interface LessonCtx {
  id: string;
  title: string;
  video_url: string;
  description?: string | null;
  overview?: string | null;
  chapter_id?: string | null;
  transcript_md?: string | null;
}

interface ChapterCtx {
  id: string;
  title: string;
  chapter_id?: string | null;
}

/**
 * Ask-Doubt AI chat state + actions for a lesson.
 * Extracted from LessonView Phase 2 split — self-contained, resets on lesson change.
 */
export function useLessonChat(
  currentLesson: LessonCtx | null,
  chapters: ChapterCtx[],
  courseTitle?: string | null,
) {
  const [chatInput, setChatInput] = useState<string>("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [askingName, setAskingName] = useState<string>(ASK_TEACHERS[0]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Reset chat when switching lessons
  useEffect(() => {
    setChatMessages([]);
    setChatInput("");
  }, [currentLesson?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatBusy]);

  const invokeAI = useCallback(
    async (message: string, history: { role: string; content: string }[]) => {
      if (!currentLesson) throw new Error("No lesson context");
      const chapterNow = chapters.find((c) => c.id === currentLesson.chapter_id) || null;
      const { data, error: fnErr } = await supabase.functions.invoke("resolve-doubt", {
        body: {
          message,
          history,
          lesson: {
            title: currentLesson.title,
            videoUrl: currentLesson.video_url,
            youtubeId: extractYouTubeId(currentLesson.video_url || ""),
            description: currentLesson.description || undefined,
            overview: currentLesson.overview || undefined,
            transcript: currentLesson.transcript_md || undefined,
            course: courseTitle || undefined,
            chapter: chapterNow?.title || undefined,
          },
        },
      });
      if (fnErr) {
        const status = (fnErr as { context?: { status?: number } })?.context?.status;
        if (status === 429) throw new Error("Bahut requests aa gayi — thodi der baad try karo.");
        if (status === 402) throw new Error("AI credits khatam ho gaye. Admin ko batayein.");
        throw new Error(fnErr.message || "AI error");
      }
      const apiErr = (data as { error?: string; reply?: string } | null)?.error;
      if (apiErr) throw new Error(apiErr);
      return (data as { reply?: string })?.reply || "Is topic ka exact context chahiye.";
    },
    [currentLesson, chapters, courseTitle],
  );

  const sendChat = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? chatInput).trim();
    if (!text || chatBusy || !currentLesson) return;
    const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
    setChatMessages((prev) => [...prev, { role: "user", content: text, ts: Date.now() }]);
    setChatInput("");
    setAskingName(pickTeacher());
    setChatBusy(true);
    try {
      const reply = await invokeAI(text, history);
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply, ts: Date.now() }]);
    } catch (e: any) {
      const msg = e?.message || "AI could not answer right now";
      toast.error(msg);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Answer generate nahi ho paaya.\n\n_${msg}_`, ts: Date.now(), error: true },
      ]);
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, chatBusy, chatMessages, currentLesson, invokeAI]);

  const regenerateLast = useCallback(async () => {
    if (chatBusy || !currentLesson) return;
    let lastUserIdx = -1;
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === "user") { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) return;
    const lastUser = chatMessages[lastUserIdx];
    const trimmed = chatMessages.slice(0, lastUserIdx + 1);
    const history = chatMessages.slice(0, lastUserIdx).map((m) => ({ role: m.role, content: m.content }));
    setChatMessages(trimmed);
    setAskingName(pickTeacher());
    setChatBusy(true);
    try {
      const reply = await invokeAI(lastUser.content, history);
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply, ts: Date.now() }]);
    } catch (e: any) {
      const msg = e?.message || "AI could not answer right now";
      toast.error(msg);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Answer generate nahi ho paaya.\n\n_${msg}_`, ts: Date.now(), error: true },
      ]);
    } finally {
      setChatBusy(false);
    }
  }, [chatBusy, chatMessages, currentLesson, invokeAI]);

  const copyChatText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  }, []);

  return {
    chatInput,
    setChatInput,
    chatBusy,
    chatMessages,
    askingName,
    chatScrollRef,
    sendChat,
    regenerateLast,
    copyChatText,
  };
}
