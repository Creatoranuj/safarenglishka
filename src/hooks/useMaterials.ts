import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export interface Material {
  id: string;
  courseId: number | null;
  lessonId: string | null;
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: string;
  fileSize: number | null;
  uploadedBy: string | null;
  createdAt: string;
  source: "material" | "note" | "lesson";
}

export interface MaterialWithCourse extends Material {
  course?: {
    title: string;
    grade: string | null;
  };
}

export interface MaterialInput {
  courseId?: number;
  lessonId?: string;
  title: string;
  description?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  file?: File;
}

export const useMaterials = (courseId?: number) => {
  const { user, isAdmin, isTeacher } = useAuth();
  const [materials, setMaterials] = useState<MaterialWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch from materials table
      let matQuery = supabase
        .from("materials")
        .select("*, courses:course_id (title, grade)")
        .order("created_at", { ascending: false });

      if (courseId) matQuery = matQuery.eq("course_id", courseId);

      const { data: matData, error: matError } = await matQuery;
      if (matError) throw matError;

      const fromMaterials: MaterialWithCourse[] = (matData || []).map((m: any) => ({
        id: m.id,
        courseId: m.course_id,
        lessonId: m.lesson_id,
        title: m.title,
        description: m.description,
        fileUrl: m.file_url,
        fileType: m.file_type,
        fileSize: m.file_size,
        uploadedBy: m.uploaded_by,
        createdAt: m.created_at,
        source: "material" as const,
        course: m.courses ? { title: m.courses.title, grade: m.courses.grade } : undefined,
      }));

      // 2. Fetch from notes table (PDFs)
      let notesQuery = supabase.from("notes").select("*, lessons:lesson_id (course_id, courses:course_id (title, grade))").order("created_at", { ascending: false });
      const { data: notesData } = await notesQuery;

      const fromNotes: MaterialWithCourse[] = (notesData || []).map((n: any) => ({
        id: `note-${n.id}`,
        courseId: n.lessons?.course_id || null,
        lessonId: n.lesson_id,
        title: n.title,
        description: null,
        fileUrl: n.pdf_url,
        fileType: "pdf",
        fileSize: null,
        uploadedBy: null,
        createdAt: n.created_at,
        source: "note" as const,
        course: n.lessons?.courses ? { title: n.lessons.courses.title, grade: n.lessons.courses.grade } : undefined,
      }));

      // 3. Fetch lesson PDFs/Notes/DPPs
      let lessonsQuery = supabase
        .from("lessons")
        .select("id, title, video_url, lecture_type, course_id, created_at, courses:course_id (title, grade)")
        .in("lecture_type", ["PDF", "NOTES", "DPP"])
        .order("created_at", { ascending: false });

      if (courseId) lessonsQuery = lessonsQuery.eq("course_id", courseId);

      const { data: lessonsData } = await lessonsQuery;

      const fromLessons: MaterialWithCourse[] = (lessonsData || []).map((l: any) => ({
        id: `lesson-${l.id}`,
        courseId: l.course_id,
        lessonId: l.id,
        title: l.title,
        description: null,
        fileUrl: l.video_url,
        fileType: l.lecture_type?.toLowerCase() || "pdf",
        fileSize: null,
        uploadedBy: null,
        createdAt: l.created_at,
        source: "lesson" as const,
        course: l.courses ? { title: l.courses.title, grade: l.courses.grade } : undefined,
      }));

      // Combine and deduplicate by URL
      const seen = new Set<string>();
      const combined = [...fromMaterials, ...fromNotes, ...fromLessons].filter(m => {
        if (seen.has(m.fileUrl)) return false;
        seen.add(m.fileUrl);
        return true;
      });

      setMaterials(combined);
    } catch (err: any) {
      console.error("Error fetching materials:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const uploadMaterial = useCallback(async (input: MaterialInput): Promise<boolean> => {
    if (!user || (!isAdmin && !isTeacher)) {
      toast.error("You don't have permission to upload materials");
      return false;
    }

    try {
      setUploading(true);

      let fileUrl = input.fileUrl || "";
      let fileType = input.fileType || "unknown";
      let fileSize = input.fileSize || null;

      if (input.file) {
        const filePath = `materials/${Date.now()}_${input.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("course-materials")
          .upload(filePath, input.file);

        if (uploadError) throw uploadError;

        // course-materials is a private bucket, use signed URL (1 year expiry)
        const { data: urlData, error: signError } = await supabase.storage
          .from("course-materials")
          .createSignedUrl(filePath, 60 * 60 * 24 * 365);

        if (signError || !urlData?.signedUrl) throw signError || new Error("Failed to generate file URL");
        fileUrl = urlData.signedUrl;
        fileType = input.file.type;
        fileSize = input.file.size;
      }

      const { error: dbError } = await supabase.from("materials").insert({
        course_id: input.courseId || null,
        lesson_id: input.lessonId || null,
        title: input.title,
        description: input.description || null,
        file_url: fileUrl,
        file_type: fileType,
        file_size: fileSize,
        uploaded_by: user.id,
      });

      if (dbError) throw dbError;

      toast.success("Material uploaded successfully!");
      await fetchMaterials();
      return true;
    } catch (err: any) {
      console.error("Error uploading material:", err);
      toast.error(err.message || "Failed to upload material");
      return false;
    } finally {
      setUploading(false);
    }
  }, [user, isAdmin, isTeacher, fetchMaterials]);

  const deleteMaterial = useCallback(async (id: string): Promise<boolean> => {
    // Only delete actual materials, not notes/lessons
    if (id.startsWith("note-") || id.startsWith("lesson-")) {
      toast.error("This item can only be removed from its source");
      return false;
    }
    try {
      const { error: dbError } = await supabase
        .from("materials")
        .delete()
        .eq("id", id);

      if (dbError) throw dbError;

      toast.success("Material deleted!");
      await fetchMaterials();
      return true;
    } catch (err: any) {
      console.error("Error deleting material:", err);
      toast.error(err.message || "Failed to delete material");
      return false;
    }
  }, [fetchMaterials]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  return {
    materials,
    loading,
    uploading,
    error,
    fetchMaterials,
    uploadMaterial,
    deleteMaterial,
  };
};
