import { useMemo, useState } from "react";
import { FileText, FileImage, Link as LinkIcon, FileType2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStudyMaterials, signedUrlFor, type StudyMaterial, type StudyMaterialKind } from "@/hooks/useStudyMaterials";
import EmptyState from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";
import { selectionHaptic, tapHaptic } from "@/lib/native/haptics";

type Filter = "all" | StudyMaterialKind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pdf", label: "PDF" },
  { id: "doc", label: "Docs" },
  { id: "image", label: "Images" },
  { id: "link", label: "Links" },
];

const KIND_ICON: Record<StudyMaterialKind, typeof FileText> = {
  pdf: FileText,
  doc: FileType2,
  image: FileImage,
  link: LinkIcon,
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  courseId: number;
  chapters: { id: string; title: string }[];
}

export default function StudyMaterialsList({ courseId, chapters }: Props) {
  const { data, isLoading, error } = useStudyMaterials(courseId);
  const [filter, setFilter] = useState<Filter>("all");
  const [openingId, setOpeningId] = useState<string | null>(null);

  const chapterTitleById = useMemo(
    () => new Map(chapters.map((c) => [c.id, c.title])),
    [chapters],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    return filter === "all" ? data : data.filter((m) => m.kind === filter);
  }, [data, filter]);

  const { batchWide, bySubject } = useMemo(() => {
    const bw: StudyMaterial[] = [];
    const bs = new Map<string, StudyMaterial[]>();
    for (const m of filtered) {
      if (!m.chapter_id) bw.push(m);
      else {
        const arr = bs.get(m.chapter_id) ?? [];
        arr.push(m);
        bs.set(m.chapter_id, arr);
      }
    }
    return { batchWide: bw, bySubject: bs };
  }, [filtered]);

  async function handleOpen(m: StudyMaterial) {
    void tapHaptic("light");
    setOpeningId(m.id);
    try {
      const url =
        m.kind === "link"
          ? m.external_url!
          : await signedUrlFor(m.file_url!);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Couldn't open file. Try again.");
    } finally {
      setOpeningId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        title="Couldn't load materials"
        description="Please check your connection and try again."
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No study material yet"
        description="Your teacher hasn't uploaded any notes or resources for this batch. Check back soon."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Filter chips — Lovable pill invert */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => {
                void selectionHaptic();
                setFilter(f.id);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-xs whitespace-nowrap transition-colors duration-150",
                active
                  ? "bg-foreground text-background font-medium"
                  : "border border-border/60 bg-background text-foreground/70 hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <EmptyState title="No matches" description="Try a different filter." />
      )}

      {batchWide.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2">Batch-wide</h3>
          <ul className="space-y-2">
            {batchWide.map((m) => (
              <MaterialRow key={m.id} m={m} opening={openingId === m.id} onOpen={handleOpen} />
            ))}
          </ul>
        </section>
      )}

      {[...bySubject.entries()].map(([chapId, items]) => (
        <section key={chapId}>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            {chapterTitleById.get(chapId) ?? "Chapter"}
          </h3>
          <ul className="space-y-2">
            {items.map((m) => (
              <MaterialRow key={m.id} m={m} opening={openingId === m.id} onOpen={handleOpen} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MaterialRow({
  m,
  opening,
  onOpen,
}: {
  m: StudyMaterial;
  opening: boolean;
  onOpen: (m: StudyMaterial) => void;
}) {
  const Icon = KIND_ICON[m.kind];
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(m)}
        disabled={opening}
        className="w-full flex items-start gap-3 p-3 rounded-xl border border-border bg-card text-left transition-transform duration-150 active:scale-[0.99] hover:bg-muted/40 disabled:opacity-70 min-h-[44px]"
      >
        <div className="h-9 w-9 shrink-0 rounded-lg bg-muted flex items-center justify-center">
          {opening ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Icon className="h-4 w-4 text-foreground/70" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
          {m.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-foreground/60">{m.description}</p>
          )}
          <p className="mt-1 text-[11px] text-foreground/50 uppercase tabular-nums">
            {m.kind}
            {m.file_size ? ` · ${formatSize(m.file_size)}` : ""}
          </p>
        </div>
      </button>
    </li>
  );
}
