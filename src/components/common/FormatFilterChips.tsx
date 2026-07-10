import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ALL_CHIP, type FormatChip } from "../../lib/formatChips";

interface Props {
  /** Pre-computed, sorted chips (highest count first). */
  chips: FormatChip[];
  /** Total item count (used for the "All" chip). */
  total: number;
  selected: string;
  onChange: (next: string) => void;
  className?: string;
}

/**
 * Horizontal scrollable chip row that lets the user filter a file list by
 * format (PDF, DOC, MD, IMAGE, VIDEO, …). Mirrors the "Enabled 5 · All 74 ·
 * Marketing 8" pattern shown in the reference screenshot.
 */
export default function FormatFilterChips({
  chips,
  total,
  selected,
  onChange,
  className,
}: Props) {
  if (total === 0) return null;

  const Chip = ({ value, label, count }: { value: string; label: string; count: number }) => {
    const active = selected === value;
    return (
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        size="sm"
        onClick={() => onChange(value)}
        className={`h-8 shrink-0 rounded-full px-3 text-xs ${
          active ? "" : "bg-card hover:bg-accent"
        }`}
        aria-pressed={active}
      >
        <span className="font-medium">{label}</span>
        <Badge
          variant="secondary"
          className={`ml-1.5 h-4 min-w-[1rem] px-1 text-[10px] tabular-nums ${
            active ? "bg-primary-foreground/20 text-primary-foreground" : ""
          }`}
        >
          {count}
        </Badge>
      </Button>
    );
  };

  return (
    <div
      className={`-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 ${className || ""}`}
      role="tablist"
      aria-label="Filter by file format"
    >
      <Chip value={ALL_CHIP} label="All" count={total} />
      {chips.map((c) => (
        <Chip key={c.type} value={c.type} label={c.type} count={c.count} />
      ))}
    </div>
  );
}
