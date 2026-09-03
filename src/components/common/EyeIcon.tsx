/**
 * EyeIcon — code-generated "view" glyph for PDF / Smart Note rows.
 *
 * Pure SVG (no raster asset) so it stays crisp at every density and inherits
 * `currentColor`. Tapping it opens the document in the FULL-PAGE reader;
 * tapping the row title keeps the existing inline-below-the-player reader.
 */
export interface EyeIconProps {
  className?: string;
  strokeWidth?: number;
  title?: string;
}

export default function EyeIcon({ className, strokeWidth = 1.9, title }: EyeIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {/* Almond outline */}
      <path d="M2.2 12S5.9 5.4 12 5.4 21.8 12 21.8 12 18.1 18.6 12 18.6 2.2 12 2.2 12Z" />
      {/* Iris */}
      <circle cx="12" cy="12" r="3.3" />
      {/* Pupil */}
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
