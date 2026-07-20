## Problem
Autoscroll FAB (floating arrow) Lesson PDF / Attachment / Smart Notes me constantly blink (pulse + bounce) karta rehta hai jab autoscroll active hota hai — reading distract hoti hai. Idle state me bhi permanently visible rehta hai jisse content overlap hota hai.

## Fix

### 1) Blink hatao
`src/components/viewer/AutoScrollFab.tsx` me:
- `animate-pulse` (button ring pulse) hatao.
- `animate-bounce` (arrow bounce) hatao.
- Active state me sirf ek subtle solid primary color + ring rakho (no motion). Optional: ek chhota static dot indicator.

### 2) Tap-to-hide + auto-hide FAB
- Naya internal `hidden` state: user single-tap se FAB ko dismiss kar sake jab autoscroll **active** ho (currently tap sirf toggle karta hai on/off).
  - Behaviour: active hote hi ek chhoti "close (×)" mini-affordance ya swipe/long-press-outside gesture — simplest: **double-tap FAB = hide while scrolling continues**; single-tap = stop (existing).
  - Alternative (recommended, simpler): jab autoscroll active ho, 2.5s ke baad FAB apne aap fade out ho jaye (opacity 0, pointer-events none). User content pe tap kare → FAB wapas fade in for 2.5s. Yeh matches reader-chrome auto-hide pattern already used in `useReaderChrome`.
- Idle (not active) state: existing `useReaderChrome` visibility maintain (already wired).

Implementation:
- `AutoScrollFab` me naya `autoHideMs = 2500` prop + internal timer.
- Jab `active === true`: timer start hote hi FAB opacity 0. Content scroll / tap event (listen on `targetRef.current` and iframe postMessage `nb-autoscroll-user-activity`) → reset timer, show FAB.
- Jab `active === false`: parent-controlled `visible` prop hi drive kare (aaj jaisa).

### 3) Content-tap dismiss (bonus)
Same target/iframe pe pointerdown listener add karo — active state me tap-on-content bhi FAB hide/show toggle kare (YouTube-style).

### 4) Verification
- Update `src/test/autoScrollFab.test.tsx`: assert `animate-pulse` / `animate-bounce` classes NAHI hain; assert active + idle timer ke baad `opacity-0` apply hota hai.
- Playwright quick check on `/lesson/:id` attachment PDF: start autoscroll → 3s wait → screenshot confirms FAB gaya; tap PDF → FAB wapas.

## Files to edit
- `src/components/viewer/AutoScrollFab.tsx` (remove animations, add auto-hide-when-active logic + activity listener)
- `src/test/autoScrollFab.test.tsx` (regression assertions)

## Report (current state)
- FAB portal + z-[68] fix pichli turn me ho gaya — visibility problem solved.
- Bacha hua issue: **visual noise** (`animate-pulse` on button + `animate-bounce` on icon) + **permanent overlay** while scrolling. Yahi is turn ka scope hai.
- Baaki Lesson PDF / DPP / Notes / Attachment / SmartNotes wiring already `alwaysShowFab + fabBottomOffset=96` par standardize hai — koi aur path touch nahi karna.
