## Problem
Landscape mode me portal-rendered Safar logo mask viewport ke bottom-left par fix hai, lekin CSS-rotation (rotation=90) me YouTube ka "More videos" infinity chip actually viewport ke **top-left** corner me appear ho raha hai (video ka bottom-left → phone ka top-left). Isliye:
- Logo galat corner par baith raha hai (infinity ab bhi khula dikh raha hai top-left par).
- Logo ki orientation bhi galat hai — body pe render hota hai isliye rotate nahi hota, tirchha lagta hai.

Bottom-right "logo + Bharat" brand mask (line ~1156) alag hai aur user ke request ke mutabik untouched rahega.

## Fix scope — sirf `src/components/video/MahimaGhostPlayer.tsx`

Sirf `landscapeSafarMaskStyle` (line 964) ko rotation-aware banao. Portal JSX block (line ~1708) unchanged rahega — bas style object switch karega.

### Rotation → corner + logo rotation

| Case | Anchor (viewport-fixed) | `transform` |
|---|---|---|
| `rotation === 90` (CSS-rotated CW) | `top + left` | `rotate(90deg)` |
| `rotation === 270` (CSS-rotated CCW) | `bottom + right` | `rotate(-90deg)` |
| Native fullscreen / else | `bottom + left` | none |

Har case me chip ke thik upar aane ke liye offset `calc(env(safe-area-inset-*, 0px) + 14px)` rahega. `pointer-events: none` aur `zIndex: 2147483647` same.

### Guardrails
- Portrait rendering, gestures, seek bar, controls, aur `bottom-right brand mask` (logo + Bharat) — **bilkul untouched**.
- In-player logo (line 1130) already hidden in landscape via `shouldUseLandscapePortalMask` — as-is.
- Sirf ek object (`landscapeSafarMaskStyle`) ki definition badlegi + JSX me ek chhota `<img>` `transform` addition. No new imports.

## Technical details

```ts
// replace landscapeSafarMaskStyle (line 964) with a function
const getLandscapeSafarMaskStyle = (): React.CSSProperties => {
  const base: React.CSSProperties = {
    position: 'fixed',
    width: 52, height: 52,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.96)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2147483647,
    pointerEvents: 'none',
  };
  if (rotation === 90) {
    return { ...base,
      top:  'calc(env(safe-area-inset-top, 0px) + 14px)',
      left: 'calc(env(safe-area-inset-left, 0px) + 14px)' };
  }
  if (rotation === 270) {
    return { ...base,
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
      right:  'calc(env(safe-area-inset-right, 0px) + 14px)' };
  }
  // native fullscreen / other
  return { ...base,
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
    left:   'calc(env(safe-area-inset-left, 0px) + 14px)' };
};

const landscapeSafarMaskStyle = getLandscapeSafarMaskStyle();
const safarLogoRotationDeg = rotation === 90 ? 90 : rotation === 270 ? -90 : 0;
```

JSX (line ~1710) — sirf logo pe transform add:
```tsx
<img src={birdLogo} alt="" width={40} height={40}
     style={{ borderRadius: '50%', transform: `rotate(${safarLogoRotationDeg}deg)` }} />
```

Bas itna hi — koi aur file/logic touch nahi.
