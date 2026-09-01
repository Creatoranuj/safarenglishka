# Language system fixes + full codebase audit

Teen fixes (aapke chune hue) + poore codebase ka audit with rating.

## 1. Translation adhoori hai — poora app cover karo

Abhi sirf 5 files translated hain (`Sidebar`, `BottomNav`, `Settings`, `Index`, picker) aur dictionary me sirf ~45 keys hain. Baaki har page English hi rehta hai.

Kya hoga:
- Dictionary ko expand karke saare student-facing surfaces cover karenge — Dashboard, Courses, My Courses, Course/Chapter/Lesson pages, Library/Downloads, Books, Notices, Community, Doubt Sessions, Profile, Settings, Quiz, Live, auth pages, aur common empty/loading/error strings.
- Hindi aur Bhojpuri dono dictionaries bharenge — teacher jaisi natural Hinglish/Hindi copy, translate-tool wali robotic language nahi.
- Bottom nav ke baaki tabs (Downloads, Profile, Admin) aur har page ka header/title bhi key-driven honge.
- Missing key par English fallback pehle se hai — wahi rahega, blank label kabhi nahi.
- Admin panel English hi rahega (admin surface hai, students ke liye nahi).

## 2. Language sheet ka behaviour

Do asli bug mile:
- **Z-index conflict:** sidebar `z-[90]` par hai, sheet `z-50` par — sidebar ke andar se kholne par sheet sidebar ke *neeche* aa jati hai. Sheet ko sidebar ke upar layer karenge.
- **Scroll lock ka double owner:** sidebar khud `body.style.overflow = hidden` set karta hai aur Radix dialog bhi apna lock lagata hai. Sheet band hone par Radix apna lock hata deta hai par sidebar ka lock stale reh sakta hai → page "freeze" jaisa lagta hai. Ek hi jagah lock manage hoga, unmount par hamesha release.

Saath me: language chunne ke baad sheet band ho aur sidebar bhi band ho jaye (do-do overlay khule na rahein), plus ek chhota "Bhasha badal gayi" confirm.

## 3. Sidebar scroll / layout

- Scroll area ke top-bottom par subtle fade taki upar kata hua item clearly "scroll karo" signal de.
- `overscroll-contain` + safe-area padding, taki sidebar scroll page ko na kheenche aur pehla/aakhri item kabhi kate nahi.
- Language row abhi scrollable nav ke andar hi rahega (jaisa aapne pehle kaha tha), bas spacing/divider theek honge.

## 4. Full codebase audit (senior-architect-audit, 12 lens)

Poore codebase par engineering + visual/design dono lens: security, RLS/grants, data integrity, perf (bundle, PDF reader, queries), reliability, UX, a11y, observability, maintainability, config, visual craft, motion — plus Capacitor lens (safe-area, back button, FLAG_SECURE, plugins) aur Supabase linter/slow-query pass.

Deliverable: `docs/audit/2026-09-01-full-audit.md` — har finding par file:line, severity, fix; end me **overall rating X/5**. Low-risk fixes usi pass me apply, high-risk fixes alag se aapki approval ke liye list.

## Technical notes

- `src/i18n/en.ts` (key surface expand), `hi.ts`, `bho.ts`; `TranslationKey` type se compile-time safety milti rahegi.
- `src/components/Layout/LanguagePicker.tsx` — sheet ko `overlayClassName`/`className` se `z-[110]` par, close par sidebar bhi band.
- `src/components/Layout/Sidebar.tsx` — scroll-lock ownership + nav fade/overscroll.
- Har translated page me `useT()` — koi naya provider/library nahi, entry chunk flat rahega.
- Preview me ek runtime error bhi dikh raha hai (`useAuth must be used within an AuthProvider`) — uska root cause bhi isi pass me fix karenge.
- Verify: `bun run build`, `tsgo --noEmit`, vitest suite, aur Playwright se teeno bhasha me sidebar + sheet + bottom nav ka live check.
