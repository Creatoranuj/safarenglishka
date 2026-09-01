import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { reportError } from "../lib/sentry";

export const useLessonLikes = (lessonId?: string) => {
  const { user } = useAuth();
  const userId = user?.id;
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  // Bandwidth: the count read + realtime channel depend only on the lesson.
  // Previously this effect also depended on the whole `user` object, whose
  // identity changes on every auth refresh — that re-ran the `like_count`
  // read and re-subscribed the channel each time (the duplicate poll seen in
  // slow_queries). Split into two effects keyed on primitives.
  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;

    void (async () => {
      const { data: lesson } = await supabase
        .from("lessons")
        .select("like_count")
        .eq("id", lessonId)
        .maybeSingle();
      if (!cancelled && lesson) setLikeCount(lesson.like_count ?? 0);
    })();

    const channel = supabase
      .channel(`lesson-likes-${lessonId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lessons", filter: `id=eq.${lessonId}` },
        (payload) => {
          const next = (payload.new as { like_count?: number | null } | null)?.like_count;
          if (typeof next === "number") setLikeCount(next);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [lessonId]);

  // "Did I like this?" — one row, only when both lesson and user are known.
  useEffect(() => {
    if (!lessonId || !userId) {
      setHasLiked(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: like } = await supabase
        .from("lesson_likes")
        .select("id")
        .eq("lesson_id", lessonId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled) setHasLiked(!!like);
    })();
    return () => { cancelled = true; };
  }, [lessonId, userId]);


  const toggleLike = useCallback(async () => {
    if (!lessonId || !user || loading) return;

    setLoading(true);
    try {
      if (hasLiked) {
        // Unlike
        await supabase
          .from("lesson_likes")
          .delete()
          .eq("lesson_id", lessonId)
          .eq("user_id", user.id);
        setHasLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        // Like
        await supabase
          .from("lesson_likes")
          .insert({ lesson_id: lessonId, user_id: user.id });
        setHasLiked(true);
        setLikeCount((c) => c + 1);
      }
    } catch (err) {
      reportError(err, { surface: "useLessonLikes.toggle" });
    } finally {
      setLoading(false);
    }
  }, [lessonId, user, hasLiked, loading]);

  return { likeCount, hasLiked, toggleLike, loading };
};
