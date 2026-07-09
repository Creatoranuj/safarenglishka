import { Skeleton } from "../ui/skeleton";
import type { ViewMode } from "./ContentViewSwitcher";

export const ViewSkeletons = ({ view }: { view: ViewMode }) => {
  if (view === "gallery") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-2xl overflow-hidden bg-card shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
            <Skeleton className="aspect-video w-full" />
            <div className="p-3.5 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (view === "table") {
    return (
      <div className="bg-card rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4 py-3 border-b border-border/50 flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  // List view skeleton (default)
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-card rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] p-4 flex gap-4">
          <Skeleton className="min-w-[100px] h-[75px] rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
};
