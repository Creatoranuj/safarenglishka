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

export const ChapterCard = ({
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

  return (
    <div
      onClick={onClick}
      className={cn(
        "nb-tap flex items-center gap-3 p-4 bg-card border border-border/60 rounded-2xl cursor-pointer transition-all duration-200 w-full min-w-0",
        "hover:shadow-md hover:border-primary/30 active:scale-[0.98]"
      )}
    >
      {/* Icon / Thumbnail */}
      {thumbnailUrl ? (
        <div className="relative w-12 h-12 aspect-square rounded-lg overflow-hidden shrink-0 bg-muted">
          <SmartImage src={thumbnailUrl} alt={title} width={96} height={96} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      ) : !isAll ? (
        <div className="w-12 h-12 aspect-square rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">{formatCode(code)}</span>
        </div>
      ) : (
        <div className="w-12 h-12 aspect-square rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground line-clamp-1 text-[15px] mt-0.5">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
          Lectures : {completedLectures}/{lectureCount}
          {dppCount > 0 && ` · DPP : ${completedDpp}/${dppCount}`}
        </p>
      </div>

      <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
    </div>
  );
};

export default ChapterCard;
