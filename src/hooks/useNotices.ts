import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

type AppRole = 'admin' | 'teacher' | 'student';

export interface Notice {
  id: string;
  title: string;
  content: string;
  authorId: string | null;
  isPinned: boolean;
  targetRole: AppRole | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface NoticeInput {
  title: string;
  content: string;
  isPinned?: boolean;
  targetRole?: AppRole | null;
  expiresAt?: string;
}

export const useNotices = () => {
  const { user, isAdmin, isTeacher } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from("notices")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      const now = new Date();
      const activeNotices: Notice[] = (data || [])
        .filter((n: any) => {
          if (!n.expires_at) return true;
          return new Date(n.expires_at) > now;
        })
        .map((n: any) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          authorId: n.author_id ?? null,
          isPinned: n.is_pinned ?? false,
          targetRole: n.target_role as AppRole | null,
          expiresAt: n.expires_at ?? null,
          createdAt: n.created_at ?? "",
        }));

      setNotices(activeNotices);
    } catch (err: any) {
      console.error("Error fetching notices:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadPdf = useCallback(async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `pdfs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('notices')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('notices')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err: any) {
      console.error("Error uploading PDF:", err);
      toast.error(err.message || "Failed to upload PDF");
      return null;
    }
  }, []);

  const createNotice = useCallback(async (input: NoticeInput & { pdfUrl?: string | null }): Promise<boolean> => {
    if (!user || (!isAdmin && !isTeacher)) {
      toast.error("You don't have permission to create notices");
      return false;
    }

    try {
      const { error: dbError } = await supabase.from("notices").insert({
        title: input.title,
        content: input.content,
        is_pinned: input.isPinned || false,
        target_role: input.targetRole || null,
        expires_at: input.expiresAt || null,
        author_id: user.id,
        pdf_url: input.pdfUrl || null,
      });

      if (dbError) throw dbError;

      toast.success("Notice created successfully!");
      await fetchNotices();
      return true;
    } catch (err: any) {
      console.error("Error creating notice:", err);
      toast.error(err.message || "Failed to create notice");
      return false;
    }
  }, [user, isAdmin, isTeacher, fetchNotices]);

  const updateNotice = useCallback(async (id: string, input: Partial<NoticeInput>): Promise<boolean> => {
    try {
      const updateData: any = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.isPinned !== undefined) updateData.is_pinned = input.isPinned;
      if (input.targetRole !== undefined) updateData.target_role = input.targetRole;
      if (input.expiresAt !== undefined) updateData.expires_at = input.expiresAt;

      const { error: dbError } = await supabase
        .from("notices")
        .update(updateData)
        .eq("id", id);

      if (dbError) throw dbError;

      toast.success("Notice updated successfully!");
      await fetchNotices();
      return true;
    } catch (err: any) {
      console.error("Error updating notice:", err);
      toast.error(err.message || "Failed to update notice");
      return false;
    }
  }, [fetchNotices]);

  const deleteNotice = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error: dbError } = await supabase
        .from("notices")
        .delete()
        .eq("id", id);

      if (dbError) throw dbError;

      toast.success("Notice deleted successfully!");
      await fetchNotices();
      return true;
    } catch (err: any) {
      console.error("Error deleting notice:", err);
      toast.error(err.message || "Failed to delete notice");
      return false;
    }
  }, [fetchNotices]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  return {
    notices,
    loading,
    error,
    fetchNotices,
    createNotice,
    updateNotice,
    deleteNotice,
    uploadPdf,
  };
};
