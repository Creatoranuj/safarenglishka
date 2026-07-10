---
name: senior-architect-audit
description: Run a senior-level architect/developer audit on a feature, file, or PR. Use when the user asks for "find loop-holes", "rate this", "senior architect review", or wants a structured critique with severity, rationale, and fixes. Produces a rated report and applies low-risk fixes.
---

# Senior Architect Audit

Apply a senior staff-engineer review lens to any code surface. Output a structured, opinionated report — not a vague "looks good".

## When to Use

- "Find loop-holes / bugs / edge cases in this"
- "Rate this feature out of 5"
- "Senior architect review of X"
- "Production-readiness check"
- After a large feature lands, before release
- Before promoting a prototype to a main flow

## Review Lens — 10 Loop-Hole Categories

For every surface, scan for issues in each category and tag findings with the category code.

| Code | Category | Examples |
| --- | --- | --- |
| SEC | Security | Missing RLS, exposed secrets, unvalidated input, IDOR, XSS, deserialization |
| AUTHZ | Authorization | Role checks on client only, missing tenant scoping, privilege escalation |
| DATA | Data integrity | Missing constraints, race conditions, missing unique index, FK gaps, no upsert |
| PERF | Performance | N+1 queries, missing indexes, bundle bloat, sync in render, no memoization |
| RELY | Reliability | No retry, no idempotency, no timeout, no offline fallback, no error boundary |
| UX | User experience | Lost state on navigation, no loading/empty/error states, no optimistic UI |
| A11Y | Accessibility | Missing aria, color-only signals, no keyboard nav, no focus trap |
| OBS | Observability | No structured logs, swallowed errors, no error reporting |
| MAINT | Maintainability | God components, duplicated logic, magic numbers, dead code, missing types |
| CONFIG | Config / DX | Hardcoded prod URLs, debug flags shipped, missing env validation |

## Severity & Rating

**Severity** per finding: `CRITICAL` (data loss, security), `HIGH` (broken UX, common-path bug), `MEDIUM` (edge case, perf), `LOW` (polish, nit).

**Rating** for the whole surface, 1–5:

| Score | Meaning |
| --- | --- |
| 5 | Production-grade. No CRITICAL/HIGH. ≤2 MEDIUM. |
| 4 | Solid. No CRITICAL. ≤1 HIGH. |
| 3 | Functional but has 1 HIGH or 3+ MEDIUM. |
| 2 | Has CRITICAL or 2+ HIGH. Ship blocker. |
| 1 | Fundamentally broken. Rewrite. |

## Output Format

```markdown
# Audit: <feature/file>

**Rating: X/5** — one-sentence verdict.

## Findings

### [CRITICAL] [SEC] Title
**Where:** `path/to/file.ts:42`
**Why it matters:** one-paragraph impact.
**Fix:** concrete change (code snippet if short).

### [HIGH] [DATA] ...
...

## Wins (what's done right)
- bullet
- bullet

## Fix Plan
1. <CRITICAL/HIGH items — apply now>
2. <MEDIUM — apply in this PR>
3. <LOW — backlog>

## Open Questions for the team
- ...
```

## Workflow

1. **Inventory** — list every file/route/table/edge-function in scope. Don't audit blind; build the map first.
2. **Scan top-down per category** — go through the 10 lenses in order. Don't skip categories; if N/A, write "N/A — reason".
3. **Reproduce** when possible — for HIGH/CRITICAL, prove the issue (query, network log, repro steps).
4. **Apply low-risk fixes immediately** — typos, missing GRANTs, missing indexes, console.log cleanup, missing error boundaries. Surface high-risk fixes for approval.
5. **Write the report** in the exact format above. Keep it scannable; senior engineers skim.
6. **Mention the skill** in the closing reply: "Used the senior-architect-audit skill."

## Anti-patterns to Flag Loudly

- Storing roles on `profiles` instead of `user_roles` → privilege escalation
- Using `auth.uid()` in RLS but no GRANTs → silent permission errors
- `// eslint-disable-next-line` on `any` casts of Supabase queries → masking type drift
- `setState` in render without conditional → infinite renders
- `useEffect(() => { fetch... }, [])` with no cleanup / no abort → memory leaks + race conditions
- Hardcoded URLs / API keys / `localhost` in committed config
- `localStorage` for auth tokens or roles → XSS-stealable
- Promise chains without `.catch` → unhandled rejection
- `key={index}` on reordered lists → wrong state binding

## Capacitor-Specific Lens

When auditing a Capacitor app, also check:

- `webContentsDebuggingEnabled` defaults to `false` in production builds (CAP001)
- `cleartext: true` only when env is dev (NET001/NET003)
- Plugins lazy-imported and wrapped in try/catch for web fallback
- Safe-area insets on every `fixed`/`sticky` element
- Back-button handler mounted once (see `capacitor-back-button` skill)
- Splash screen has a JS-side safety timeout

## Done When

- Report written with rating
- Every finding has file:line, category, severity, fix
- CRITICAL/HIGH fixes applied or surfaced
- Closing reply names the skill
