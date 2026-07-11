import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StudyMaterialKind = "pdf" | "doc" | "image" | "link";

export interface StudyMaterial {
  id: string;
  course_id: number;
  chapter_id: string | null;
  title: string;
  description: string | null;
  kind: StudyMaterialKind;
  file_url: string | null;
  external_url: string | null;
  file_size: number | null;
  mime_type: string | null;
  sort_order: number;
  created_at: string;
}

export function useStudyMaterials(courseId: number | null | undefined) {
  return useQuery({
    queryKey: ["study-materials", courseId],
    enabled: !!courseId,
    staleTime: 60_000,
    queryFn: async (): Promise<StudyMaterial[]> => {
      const { data, error } = await supabase
        .from("study_materials")
        .select(
          "id, course_id, chapter_id, title, description, kind, file_url, external_url, file_size, mime_type, sort_order, created_at",
        )
        .eq("course_id", courseId!)
        .order("chapter_id", { ascending: true, nullsFirst: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StudyMaterial[];
    },
  });
}

/**
 * Turn a storage `file_url` (stored as "bucket/path" or a full https URL) into
 * a short-lived signed URL. Public https URLs pass through unchanged.
 */
export async function signedUrlFor(fileUrl: string, ttlSeconds = 300): Promise<string> {
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const [bucket, ...rest] = fileUrl.split("/");
  const path = rest.join("/");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) throw error ?? new Error("Failed to sign URL");
  return data.signedUrl;
}
