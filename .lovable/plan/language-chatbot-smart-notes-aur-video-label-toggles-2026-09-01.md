# Language, Chatbot, Smart Notes aur Video Label Toggles

Sab kaam mojooda features par upgrade hai — koi naya parallel system nahi.

## 1. Sidebar language row ki jagah badalna

Abhi "भाषा" row sidebar ke fixed footer me hai, isliye footer bhaari lagta hai.

- Language picker ko scrollable nav ke andar, "चैटबॉट सेटिंग्स" ke theek neeche move kiya jayega (ek halki separator line ke saath).
- Footer me sirf user identity + logout rahega → view compact, aur scroll karne par hi language row dikhega.
- Picker ka behaviour (Hindi / Bhojpuri / English, haptics, persistence) waisa hi rahega.

## 2. Bottom navigation Hindi/Bhojpuri me

Bottom nav ke labels (Home, Courses, My Courses, Downloads, Admin, Profile) abhi hardcoded English hain.

- Inhe pehle se maujood `nav.*` translation keys se render kiya jayega, taki language badalte hi bottom bar bhi badle.
- `aria-label` bhi translated hoga; Maestro ke liye `id` attributes jaise ke waise rahenge.
- Bhojpuri/Hindi dictionaries me missing labels (Downloads, Admin, Profile) add honge.

## 3. Chatbot ka reply beech me ruk jana

- Reply length cap abhi 900 tokens par lock hai (admin ki setting bhi isi se kat jaati hai). Ise badha kar ~4000 kiya jayega, aur admin panel ka slider bhi usi range tak khulega.
- Model id `google/gemini-3.5-flash` ab catalog me nahi hai; ise supported `google/gemini-3.7-flash` par le jaya jayega (behtar reasoning + lambi replies).
- Gateway timeout 12s se badha kar ~30s, warna lamba jawab beech me kat jayega.
- Math/LaTeX jaisa `$[M^{-1}...]$` output plain text me na tootey, iske liye prompt me instruction ki formulas plain readable text me likhe jayein.

## 4. Chatbot header ka reset arrow → play icon

- Safar Agent header ka ↺ (RotateCcw) icon `Play` icon se replace hoga; functionality (naya chat shuru karna) same rahegi, tooltip/aria-label update hoga.

## 5. Ask Doubt — doubt-teacher personality + timestamp hataana

- Ask Doubt ka system prompt naya hoga: ek patient "doubt teacher" jo har sawaal ka jawab de (sirf English lecture tak limit nahi), Hinglish/Hindi me student ki bhasha me, step-by-step, aur "Main sirf academic doubts ka answer deta hoon" wala refusal hata diya jayega.
- Reply length cap set hoga taki jawab poora aaye.
- Message bhejte waqt jo `00:00 - ` timestamp prefix apne aap lagta hai, wo hata diya jayega (input, display aur parsing dono jagah se).

## 6. Admin "Smart Notes" page (naya admin route, purana data)

Smart Notes ka source lesson ka `transcript_md` hai — wahi student ko dikhta hai. Abhi ise sirf LessonView ke andar admin edit kar sakta hai.

- Naya admin page `/admin/smart-notes` (Admin dashboard par card + sidebar link ke saath):
  - Course/chapter filter + search se lesson list.
  - Har lesson par: **upload** (.md/.txt file ya link import — wahi importer jo LessonView me hai), **edit** (markdown editor + preview), **rename** (notes ka title), **delete**.
  - Kis lesson me notes hain/nahi — clear badge.
- Rename ke liye `lessons` table me ek nullable `notes_title` column add hoga (default lesson title use hoga). Student side reader bhi yehi title dikhayega.

## 7. Video overlay toggles (infinity logo + white YouTube label)

Player me do overlays hain: bottom-left bird logo (YouTube ∞ chip ko dhakta hai) aur bottom-right "BHARAT" label (YouTube white watermark ko dhakta hai).

- Admin panel me do switch: **Infinity logo overlay** aur **YouTube label overlay**.
- Values `site_settings` me (`player_infinity_overlay`, `player_youtube_label_overlay`) — sabhi videos par global.
- On = overlay bilkul apni current position/size par dikhega (positioning code ko chhua nahi jayega). Off = overlay render hi nahi hoga.
- Settings ek chhote cached hook se aayengi (long staleTime) taki har video par extra request na ho; default = on.

## 8. Deep scan aur verification

- Poora typecheck + lint + build.
- Language switch ke baad sidebar/bottom nav ka live check.
- Chatbot aur Ask Doubt edge functions ko deploy karke real request se test — reply poora aa raha hai ya nahi.
- Admin Smart Notes page ka create/rename/edit/delete flow live DB par verify.
- Toggle off/on karke player overlays check.

## Technical notes

- Files: `src/components/Layout/Sidebar.tsx`, `BottomNav.tsx`, `src/i18n/{en,hi,bho}.ts`, `src/components/chat/ChatWidget.tsx`, `src/components/lesson/AskDoubtSheet.tsx`, `src/pages/LessonView.tsx`, `src/pages/AdminChatbotSettings.tsx`, naya `src/pages/AdminSmartNotes.tsx`, `src/components/video/MahimaGhostPlayer.tsx`, naya `src/hooks/usePlayerOverlaySettings.ts`, `supabase/functions/chatbot/index.ts`, `supabase/functions/resolve-doubt/index.ts`, `src/App.tsx`.
- Migration: `lessons.notes_title` column + `site_settings` ke do keys ka seed (grants already in place).
- 515 ESLint warnings (`any` types) project policy ke mutabik warn-only hain — is kaam me touch nahi honge.
