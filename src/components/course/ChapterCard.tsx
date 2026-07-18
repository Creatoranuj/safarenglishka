import { memo } from "react";
import { ChevronRight, BookOpen } from "lucide-react";
import { cn } from "../../lib/utils";
import { SmartImage } from "../common/SmartImage";

export interface ChapterCardProps {
  code: string;
  title: string;
  lectureCount: number;
  completedLectures: number;
  dppCount?: number;
  completedDpp?: number;
  thumbnailUrl?: string | null;
  onClick?: () => void;
}

const formatCode = (code: string) => {
  const num = parseInt(code, 10);
  if (!isNaN(num) && num < 10) return `0${num}`;
  return code;
};

const ChapterCardImpl = ({
  code,
  title,
  lectureCount,
  completedLectures,
  dppCount = 0,
  completedDpp = 0,
  thumbnailUrl,
  onClick,
}: ChapterCardProps) => {
  const isAll = code === "ALL";

  const formattedCode = formatCode(code);
  const cleanTitle = title.replace(/^ch\s*\d+\s*[:\-–]\s*/i, "").trim();
  const displayTitle = isAll ? title : `Ch ${formattedCode} : ${cleanTitle}`;

  return (
    <div
      onClick={onClick}
      className={cn(
        "nb-tap flex items-center gap-3 p-4 bg-card border border-border/60 rounded-2xl cursor-pointer transition-all duration-200 w-full min-w-0",
        "hover:shadow-md hover:border-primary/30 active:scale-[0.98]"
      )}
    >
      {thumbnailUrl ? (
        <div className="relative w-12 h-12 aspect-square rounded-lg overflow-hidden shrink-0 bg-muted">
          <SmartImage src={thumbnailUrl} alt={title} width={96} height={96} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      ) : isAll ? (
        <div className="w-12 h-12 aspect-square rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
      ) : null}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {!isAll && (
          <span className="inline-block text-[11px] font-semibold text-primary bg-primary/10 rounded px-2 py-0.5 mb-1.5 tracking-wide">
            CH - {formattedCode}
          </span>
        )}
        <h3 className="font-bold text-foreground line-clamp-2 text-[16px] leading-snug">{displayTitle}</h3>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
          Lectures : {completedLectures}/{lectureCount}
          {dppCount > 0 && ` · DPP : ${completedDpp}/${dppCount}`}
        </p>
      </div>

      <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
    </div>
  );
};

// Memoized — MyCourseDetail re-renders the chapter list on every state
// tick (completion, subject switch, search). Stable props → skip.
export const ChapterCard = memo(ChapterCardImpl);
ChapterCard.displayName = "ChapterCard";

export default ChapterCard;
