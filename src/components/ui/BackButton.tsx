import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "./button";
import { cn } from "../../lib/utils";
import { useNavigationHistory } from "../../contexts/NavigationHistoryContext";

interface BackButtonProps {
  /** Fallback route when history stack is empty (cold launch / deep link). */
  fallback?: string;
  className?: string;
  label?: string;
  variant?: "ghost" | "outline" | "default";
}

/**
 * Unified back button used across pages. Pops the real navigation stack first,
 * falls back to the provided route (default `/dashboard`) on cold launch.
 */
export const BackButton = ({
  fallback = "/dashboard",
  className,
  label,
  variant = "ghost",
}: BackButtonProps) => {
  const navigate = useNavigate();
  const { peekPrevious } = useNavigationHistory();

  const handleClick = () => {
    const prev = peekPrevious();
    if (prev) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={label ? "sm" : "icon"}
      onClick={handleClick}
      className={cn("shrink-0", className)}
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
      {label && <span className="ml-1.5">{label}</span>}
    </Button>
  );
};

export default BackButton;