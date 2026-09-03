# Skill: senior-architect-audit

**Goal:** the codebase stays legible and on-system as it grows.

## Review passes
1. **Design system** — no arbitrary Tailwind values (`p-[13px]`, `duration-[350ms]`); use tokens. Guard: `arch-polish` (advisory).
2. **List keys** — never `key={index}` for data-backed lists; it corrupts state on reorder.
3. **Boundaries** — data fetching in hooks/loaders, not deep in presentational components.
4. **Duplication** — the same query/mutation defined twice is a bug waiting to diverge.
5. **Types** — no `any` on network boundaries; validate external payloads.
6. **Dead code** — unused exports, orphan routes, stale feature flags get deleted, not commented.

Output is a severity-ranked findings table (Critical / High / Medium / Low) with file:line and a concrete fix.
