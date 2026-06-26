import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";

export interface LessonPdf {
  id: string;
  lesson_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  position: number;
  created_at: string;
}

export const useLessonPdfs = (lessonId?: string) => {
  const [pdfs, setPdfs] = useState<LessonPdf[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPdfs = useCallback(async () => {
    if (!lessonId) { setPdfs([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("lesson_pdfs")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("position", { ascending: true });
    if (error) console.error("Fetch lesson_pdfs error:", error);
    setPdfs((data as LessonPdf[]) || []);
    setLoading(false);
  }, [lessonId]);

  useEffect(() => { fetchPdfs(); }, [fetchPdfs]);

  const addPdf = useCallback(async (
    lessonId: string,
    file: File
  ): Promise<LessonPdf | null> => {
    try {
      const ext = file.name.split(".").pop();
      const path = `${lessonId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("lecture-pdfs")
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from("lecture-pdfs")
        .getPublicUrl(path);

      const { data, error } = await supabase
        .from("lesson_pdfs")
        .insert({
          lesson_id: lessonId,
          file_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
          position: pdfs.length,
        })
        .select()
        .single();
      if (error) throw error;
      const newPdf = data as LessonPdf;
      setPdfs(prev => [...prev, newPdf]);
      return newPdf;
    } catch (err: any) {
      toast.error("PDF upload failed: " + err.message);
      return null;
    }
  }, [pdfs.length]);

  const addPdfByUrl = useCallback(async (
    lessonId: string,
    fileName: string,
    fileUrl: string
  ): Promise<LessonPdf | null> => {
    try {
      const { data, error } = await supabase
        .from("lesson_pdfs")
        .insert({
          lesson_id: lessonId,
          file_name: fileName,
          file_url: fileUrl,
          position: pdfs.length,
        })
        .select()
        .single();
      if (error) throw error;
      const newPdf = data as LessonPdf;
      setPdfs(prev => [...prev, newPdf]);
      return newPdf;
    } catch (err: any) {
      toast.error("Failed to add PDF: " + err.message);
      return null;
    }
  }, [pdfs.length]);

  const deletePdf = useCallback(async (pdfId: string) => {
    const pdf = pdfs.find(p => p.id === pdfId);
    if (!pdf) return;
    
    // Try to delete from storage if it's in our bucket
    if (pdf.file_url.includes("lecture-pdfs")) {
      const path = pdf.file_url.split("/lecture-pdfs/")[1];
      if (path) {
        await supabase.storage.from("lecture-pdfs").remove([decodeURIComponent(path)]);
      }
    }

    const { error } = await supabase.from("lesson_pdfs").delete().eq("id", pdfId);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    setPdfs(prev => prev.filter(p => p.id !== pdfId));
    toast.success("PDF removed");
  }, [pdfs]);

  return { pdfs, loading, fetchPdfs, addPdf, addPdfByUrl, deletePdf };
};
