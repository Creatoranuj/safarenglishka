/**
 * Human-readable display name for a PDF.
 *
 * Admin-uploaded lesson PDFs often carry a raw storage id as `file_name`
 * (e.g. `6a7eb202ce63b65a22dd7742.pdf`), which used to leak into the reader
 * overlay as "Opening 6a7eb202ce63b65a22dd7742.pdf". Students should see the
 * chapter name instead.
 *
 * Pure / side-effect free — covered by `src/test/pdfDisplayName.test.ts`.
 */

/** Strips path, query and extension, then decodes + tidies separators. */
export function humanizeFileName(raw?: string | null): string {
  if (!raw) return "";
  let name = String(raw).trim();
  try {
    name = decodeURIComponent(name);
  } catch {
    /* keep the raw value when it isn't valid percent-encoding */
  }
  // Drop query/hash and any directory prefix.
  name = name.split(/[?#]/)[0];
  name = name.split("/").pop() ?? name;
  // Drop a trailing file extension (2-5 chars).
  name = name.replace(/\.[a-z0-9]{2,5}$/i, "");
  // Separators → spaces, collapse whitespace.
  name = name.replace(/[_+]+/g, " ").replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").trim();
  return name;
}

/**
 * True when the humanized name still looks machine generated (storage hash,
 * uuid, timestamp blob) and therefore must not be shown to a student.
 */
export function looksLikeMachineName(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  const compact = n.replace(/[\s-]/g, "");
  // Pure hex / base-ish blob with no vowel-bearing words.
  if (/^[0-9a-f]{12,}$/i.test(compact)) return true;
  if (/^[0-9]{6,}$/.test(compact)) return true;
  // uuid
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(n)) return true;
  // Long single token with no vowels at all (e.g. "xkfjdlqmzptr").
  if (!/\s/.test(compact) && compact.length >= 12 && !/[aeiou]/i.test(compact)) return true;
  return false;
}

/**
 * Resolves the title shown while a PDF opens.
 * Order: readable filename → explicit item title → lesson title → generic.
 */
export function pdfDisplayName(
  fileName?: string | null,
  fallbacks: (string | null | undefined)[] = []
): string {
  const humanized = humanizeFileName(fileName);
  if (humanized && !looksLikeMachineName(humanized)) return humanized;
  for (const f of fallbacks) {
    const candidate = (f ?? "").trim();
    if (candidate && !looksLikeMachineName(humanizeFileName(candidate))) {
      return humanizeFileName(candidate) || candidate;
    }
  }
  return "PDF Document";
}
