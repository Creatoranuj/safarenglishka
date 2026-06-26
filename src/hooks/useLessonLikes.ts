import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";

export const useLessonLikes = (lessonId?: string) => {
  const { user } = useAuth();
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch like count and user's like status
  useEffect(() => {
    if (!lessonId) return;

    const fetchLikes = async () => {
      // Get like count from lessons table
      const { data: lesson } = await supabase
        .from("lessons")
        .select("like_count")
        .eq("id", lessonId)
        .single();

      if (lesson) setLikeCount(lesson.like_count ?? 0);

      // Check if current user has liked
      if (user) {
        const { data: like } = await supabase
          .from("lesson_likes")
          .select("id")
          .eq("lesson_id", lessonId)
          .eq("user_id", user.id)
          .maybeSingle();

        setHasLiked(!!like);
      }
    };

    fetchLikes();
  }, [lessonId, user]);

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
      console.error("Like toggle failed:", err);
    } finally {
      setLoading(false);
    }
  }, [lessonId, user, hasLiked, loading]);

  return { likeCount, hasLiked, toggleLike, loading };
};
