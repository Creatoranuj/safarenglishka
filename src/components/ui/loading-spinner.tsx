import BrandMark from "../brand/BrandMark";
import { cn } from "../../lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  text?: string;
  fullPage?: boolean;
}

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

const sizePx = { sm: 32, md: 48, lg: 64 } as const;

export const LoadingSpinner = ({ size = "md", className, text, fullPage = false }: LoadingSpinnerProps) => {
  const spinner = (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className="relative">
        {/* Inline SVG — ships in bundle, no network flicker on lazy-route boundaries. */}
        <BrandMark size={sizePx[size]} className={cn(sizeMap[size], "mahima-loader-logo")} decorative />
        <div className={cn(sizeMap[size], "absolute inset-0 rounded-full border-2 border-primary/40 mahima-loader-ring")} />
      </div>
      {text && <p className="text-sm text-muted-foreground animate-pulse">{text}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {spinner}
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;
