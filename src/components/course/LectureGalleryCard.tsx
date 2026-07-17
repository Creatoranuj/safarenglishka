import { Play, FileText, Lock, ClipboardList } from "lucide-react";
import { cn } from "../../lib/utils";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { getLessonThumbnail } from "../../lib/videoUtils";
import { SmartImage } from "../common/SmartImage";
import checkmarkIcon from "../../assets/icons/checkmark-3d.webp";
import scienceIcon from "../../assets/icons/science-3d.webp";
import cubeIcon from "../../assets/icons/cube-3d.webp";

interface LectureGalleryCardProps {
  id: string;
  title: string;
  lectureType: "VIDEO" | "PDF" | "DPP" | "NOTES" | "TEST";
  isLocked?: boolean;
  isCompleted?: boolean;
  createdAt?: string | null;
  duration?: number | null;
  youtubeId?: string | null;
  videoUrl?: string | null;
  quizId?: string;
  onClick?: () => void;
}

const typeConfig: Record<string, { bg: string; icon: string; label: string }> = {
  VIDEO: { bg: "bg-blue-50 dark:bg-blue-950/30", icon: cubeIcon, label: "Lecture" },
  PDF: { bg: "bg-orange-50 dark:bg-orange-950/30", icon: scienceIcon, label: "PDF" },
  NOTES: { bg: "bg-purple-50 dark:bg-purple-950/30", icon: scienceIcon, label: "Notes" },
  DPP: { bg: "bg-green-50 dark:bg-green-950/30", icon: cubeIcon, label: "DPP" },
  TEST: { bg: "bg-red-50 dark:bg-red-950/30", icon: cubeIcon, label: "Test" },
};

const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  return `${mins} min`;
};

export const LectureGalleryCard = ({
  title, lectureType, isLocked, isCompleted, createdAt, duration, youtubeId, videoUrl, quizId, onClick,
}: LectureGalleryCardProps) => {
  const navigate = useNavigate();
  const config = typeConfig[lectureType] || typeConfig.VIDEO;
  const dateStr = createdAt ? format(new Date(createdAt), "dd MMM").toUpperCase() : "";
  const isDppOrTest = lectureType === "DPP" || lectureType === "TEST";

  return (
    <div
      className={cn(
        "nb-tap relative bg-card rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 flex flex-col",
        isLocked && "opacity-60"
      )}
    >
      {/* Thumbnail area */}
      <div
        onClick={onClick}
        className={cn("relative w-full aspect-video flex items-center justify-center", config.bg)}
      >
        {lectureType === "VIDEO" ? (
          (() => {
            const thumbSrc = getLessonThumbnail(null, youtubeId, videoUrl, lectureType);
            return thumbSrc ? (
              <div className="relative w-full h-full">
                <SmartImage
                  src={thumbSrc}
                  alt={title}
                  width={480}
                  height={270}
                  className="w-full h-full object-cover"
                />
                {isLocked && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Lock className="h-8 w-8 text-white/80" />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center">
                {isLocked ? (
                  <Lock className="h-10 w-10 text-muted-foreground/50" />
                ) : (
                  <Play className="h-10 w-10 text-primary fill-primary/20" />
                )}
              </div>
            );
          })()
        ) : (
          <img
            src={config.icon}
            alt={config.label}
            width={64}
            height={64}
            className="w-16 h-16 object-contain"
            loading="lazy"
            decoding="async"
          />
        )}
        {isCompleted && (
          <img src={checkmarkIcon} alt="Done" width={20} height={20} className="absolute top-2 right-2 w-5 h-5" loading="lazy" />
        )}
        {(duration != null && duration > 0) && (
          <span className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
            {formatDuration(duration)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex-1" onClick={onClick}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase bg-muted/60 px-1.5 py-0.5 rounded">
            {config.label}
          </span>
          {dateStr && <span className="text-[10px] text-muted-foreground">· {dateStr}</span>}
        </div>
        <h4 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">{title}</h4>
      </div>

      {/* Quiz button — only for DPP/TEST with a linked published quiz */}
      {isDppOrTest && quizId && (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${quizId}`); }}
          className="flex items-center justify-center gap-1.5 w-full py-2 bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          {lectureType === "TEST" ? "Take Test" : "Attempt DPP"}
        </button>
      )}
    </div>
  );
};
