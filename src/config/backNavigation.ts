// Single source of truth for Android back-button navigation targets.
// Used by `useAndroidBackButton`. Add new routes here, not inline in the hook.

// NOTE: `/` is intentionally NOT an exit route. Authenticated users get
// redirected away from `/` to `/dashboard` immediately, which would flip
// `latest.path` before the 2-second double-tap window can register and
// break the exit gesture. Only `/dashboard` is a stable exit anchor.
// Routes from which the hardware back button should exit/minimize the app
// (with a 2-second double-tap confirmation). Add stable home anchors here.
// `/` and `/index` are included because unauthenticated users land there
// and pressing back must minimize the app — not bounce them through
// history forever.
export const EXIT_ROUTES = ["/dashboard", "/", "/index", "/admin"] as const;
export const AUTH_ROUTES = ["/login", "/signup", "/admin/login", "/admin/register"] as const;

/**
 * Static path → parent route. Back press on key returns to value.
 */
export const STATIC_PARENT_MAP: Record<string, string> = {
  "/downloads": "/dashboard",
  "/settings": "/dashboard",
  "/profile": "/dashboard",
  "/notices": "/dashboard",
  "/materials": "/dashboard",
  "/timetable": "/dashboard",
  "/books": "/dashboard",
  "/doubts": "/dashboard",
  // NOTE: `/install` is intentionally NOT mapped — it's a PUBLIC route, so
  // sending guests to `/dashboard` triggers ProtectedRoute → /login bounce.
  // Fallback (step 6 in useAndroidBackButton) handles it correctly.
  "/help": "/dashboard",
  "/about": "/dashboard",
  "/contact": "/dashboard",
  "/courses": "/dashboard",
  "/my-courses": "/dashboard",
  "/all-classes": "/dashboard",
  "/all-tests": "/dashboard",
  "/attendance": "/dashboard",
  "/reports": "/dashboard",
  "/library": "/dashboard",
  "/community": "/dashboard",
  "/syllabus": "/dashboard",
  "/messages": "/dashboard",
  "/students": "/dashboard",
  "/subscription": "/dashboard",
};

/**
 * Prefix-match parents for dynamic routes. Evaluated in order; first match wins.
 * Each rule returns the destination path (or null to skip).
 */
export const PREFIX_PARENT_RULES: Array<{
  test: (path: string, search: URLSearchParams) => string | null;
}> = [
  {
    test: (path, search) => {
      const m = path.match(/^\/classes\/(\d+)\/lessons/);
      if (!m) return null;
      const from = search.get("from");
      if (from === "my-courses") return `/my-courses/${m[1]}`;
      if (from === "all-classes") return "/all-classes";
      if (from === "courses") return `/course/${m[1]}`;
      return `/classes/${m[1]}/chapters`;
    },
  },
  { test: (p) => { const m = p.match(/^\/classes\/(\d+)\/chapter\//); return m ? `/classes/${m[1]}/chapters` : null; } },
  { test: (p) => (p.match(/^\/classes\/(\d+)\/chapters/) ? "/all-classes" : null) },
  { test: (p) => (p.match(/^\/course\/(\d+)/) ? "/courses" : null) },
  { test: (p) => (p.match(/^\/my-courses\/(.+)/) ? "/my-courses" : null) },
  { test: (p) => (p.startsWith("/buy-course") ? "/courses" : null) },
  { test: (p) => (p.startsWith("/quiz/") && p.includes("/result/") ? "/all-tests" : null) },
];

export function resolveBackTarget(path: string, search: URLSearchParams): string | null {
  for (const rule of PREFIX_PARENT_RULES) {
    const dest = rule.test(path, search);
    if (dest) return dest;
  }
  return STATIC_PARENT_MAP[path] ?? null;
}

/**
 * Single source of truth for the root breadcrumb segment on `/classes/...`
 * and `/course/...` pages. Mirrors `PREFIX_PARENT_RULES` so the breadcrumb
 * root agrees with the hardware back-button target. Defaults to `/all-classes`
 * (matches the back-button rule for `/classes/:id/chapters`).
 */
export function resolveCourseRoot(
  fromParam: string | null | undefined,
): { label: string; href: string } {
  switch (fromParam) {
    case "courses":
      return { label: "Courses", href: "/courses" };
    case "my-courses":
      return { label: "My Courses", href: "/my-courses" };
    case "all-classes":
      return { label: "All Classes", href: "/all-classes" };
    default:
      return { label: "All Classes", href: "/all-classes" };
  }
}

/**
 * Persist the `?from=` value per courseId so that a hard refresh or popstate
 * (which can drop the query string in some browsers) still resolves the
 * correct course root. Survives within the tab/session only.
 */
const FROM_KEY = (courseId: string | number) => `nb:from:${courseId}`;

export function rememberFromParam(courseId: string | number | null | undefined, fromParam: string | null | undefined): void {
  if (!courseId || !fromParam || typeof window === "undefined") return;
  try { window.sessionStorage.setItem(FROM_KEY(courseId), fromParam); } catch {}
}

export function recallFromParam(courseId: string | number | null | undefined): string | null {
  if (!courseId || typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem(FROM_KEY(courseId)); } catch { return null; }
}

/**
 * Reads `from` from URL first, falls back to sessionStorage, then null.
 * Use in pages that need a stable root across refresh / popstate.
 */
export function resolveFromParam(
  search: URLSearchParams,
  courseId: string | number | null | undefined,
): string | null {
  const fromUrl = search.get("from");
  if (fromUrl) {
    rememberFromParam(courseId, fromUrl);
    return fromUrl;
  }
  return recallFromParam(courseId);
}
