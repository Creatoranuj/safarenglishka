import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, FileText, Loader2, Pencil, Save, Search, Trash2, Upload, Link as LinkIcon, X,
} from "lucide-react";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import SmartNotesLinkDialog from "../components/notes/SmartNotesLinkDialog";
import { reportError } from "@/lib/sentry";

interface LessonNoteRow {
  id: string;
  title: string;
  course_id: number | null;
  notes_title: string | null;
  transcript_md: string | null;
}

const AdminSmartNotes = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ["admin", "smart-notes", "lessons"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id, title, course_id, notes_title, transcript_md")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LessonNoteRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter((l) =>
      `${l.title} ${l.notes_title ?? ""}`.toLowerCase().includes(q));
  }, [lessons, search]);

  const active = lessons.find((l) => l.id === activeId) ?? null;

  const openLesson = (row: LessonNoteRow) => {
    setActiveId(row.id);
    setDraftTitle(row.notes_title ?? "");
    setDraftBody(row.transcript_md ?? "");
  };

  const save = async () => {
    if (!activeId) return;
    setSaving(true);
    const { error } = await supabase
      .from("lessons")
      .update({
        notes_title: draftTitle.trim() || null,
        transcript_md: draftBody.trim() || null,
      })
      .eq("id", activeId);
    setSaving(false);
    if (error) {
      reportError(error, { surface: "AdminSmartNotes.save" });
      toast.error("Save failed: " + error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["admin", "smart-notes", "lessons"] });
    toast.success("Smart Note saved");
  };

  const removeNote = async () => {
    if (!activeId) return;
    if (!window.confirm("Is lesson ke Smart Notes delete kar dein?")) return;
    setSaving(true);
    const { error } = await supabase
      .from("lessons")
      .update({ transcript_md: null, notes_title: null })
      .eq("id", activeId);
    setSaving(false);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    setDraftBody("");
    setDraftTitle("");
    await queryClient.invalidateQueries({ queryKey: ["admin", "smart-notes", "lessons"] });
    toast.success("Smart Note deleted");
  };

  const importFile = useCallback(async (file: File) => {
    const lower = (file.name || "").toLowerCase();
    try {
      if (file.type.startsWith("text/") || /\.(md|markdown|txt)$/.test(lower)) {
        const text = await file.text();
        setDraftBody((p) => (p ? p + "\n\n" : "") + text);
        toast.success("File imported");
        return;
      }
      if (/\.pdf$/.test(lower) || file.type === "application/pdf") {
        const pdfjs = await import("pdfjs-dist");
        try {
          const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
          pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        } catch { /* worker configured elsewhere */ }
        const buf = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        let out = `# ${file.name}`;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          const txt = (tc.items as any[]).map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
          if (txt) out += `\n\n## Page ${i}\n\n${txt}`;
        }
        setDraftBody((p) => (p ? p + "\n\n" : "") + out);
        toast.success("PDF imported");
        return;
      }
      toast.error("Sirf .txt, .md ya .pdf support hai");
    } catch (err: any) {
      toast.error(err?.message || "Import failed");
    }
  }, []);

  const importLink = useCallback(async (url: string) => {
    setDraftBody((p) => (p ? p + "\n\n" : "") + `[${url}](${url})`);
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} aria-label="Back to admin">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" /> Smart Notes Manager
            </h1>
            <p className="text-sm text-muted-foreground">Lesson ke Smart Notes upload, edit, rename aur delete karein.</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[320px_1fr]">
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lessons</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search lesson…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-[60vh] overflow-y-auto space-y-1 p-2">
              {isLoading ? (
                <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : filtered.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Koi lesson nahi mila.</p>
              ) : (
                filtered.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openLesson(row)}
                    className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                      row.id === activeId ? "bg-primary/10 text-primary" : "hover:bg-muted"
                    }`}
                  >
                    <span className="line-clamp-2">{row.notes_title || row.title}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <Badge variant={row.transcript_md ? "secondary" : "outline"} className="text-[10px]">
                        {row.transcript_md ? "Notes" : "Empty"}
                      </Badge>
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                {active ? active.title : "Select a lesson"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!active ? (
                <p className="text-sm text-muted-foreground">Left list se koi lesson chunein.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="notes-title">Notes title (rename)</Label>
                    <Input
                      id="notes-title"
                      value={draftTitle}
                      placeholder={active.title}
                      onChange={(e) => setDraftTitle(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes-body">Smart Notes (markdown)</Label>
                    <Textarea
                      id="notes-body"
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      rows={16}
                      className="font-mono text-sm"
                      placeholder="Notes yahan likhein ya file / link se import karein…"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void save()} disabled={saving} className="gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
                      <Upload className="h-4 w-4" /> Upload file
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => setLinkOpen(true)}>
                      <LinkIcon className="h-4 w-4" /> Import link
                    </Button>
                    <Button
                      variant="ghost"
                      className="gap-2"
                      onClick={() => { setDraftTitle(active.notes_title ?? ""); setDraftBody(active.transcript_md ?? ""); }}
                    >
                      <X className="h-4 w-4" /> Reset
                    </Button>
                    <Button variant="destructive" className="gap-2 ml-auto" onClick={() => void removeNote()} disabled={saving}>
                      <Trash2 className="h-4 w-4" /> Delete notes
                    </Button>
                  </div>

                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.markdown,.pdf,text/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void importFile(f);
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SmartNotesLinkDialog open={linkOpen} onOpenChange={setLinkOpen} onImport={importLink} />
    </div>
  );
};

export default AdminSmartNotes;
