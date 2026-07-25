## Goal
In the video player's landscape mode, move the Safar/bird logo slightly **down** from its current shifted position and make it **slightly smaller**. Portrait and fake-fullscreen modes stay unchanged.

## Where
`src/components/video/MahimaGhostPlayer.tsx` — the Safar bird logo overlay container around lines 1111–1143.

## Current state
Landscape branch currently uses:
```
transform: 'translateY(-12px) translateX(18px) scale(0.85)'
transformOrigin: 'center center'
```
This shifted the logo 12 px up, 18 px right, and shrunk it to 85 %.

## Proposed change
Only for `shouldUseLandscapePortalMask` (landscape mode):
- Change vertical shift from `translateY(-12px)` to `translateY(-6px)` — moves the logo 6 px **down** from where it is now (net 6 px up from the un-shifted anchor).
- Keep horizontal shift `translateX(18px)` unchanged.
- Change scale from `scale(0.85)` to `scale(0.80)` — makes the logo slightly smaller.
- Keep `transformOrigin: 'center center'` so it scales in place.

New landscape transform:
```
transform: 'translateY(-6px) translateX(18px) scale(0.80)'
```

## What stays untouched
- Landscape width (`5.8%`), aspect ratio, `left`, and `bottom` values.
- Portrait branch: `{ bottom: '18px', left: '44px' }` with 34 px logo.
- Fake-fullscreen branch: `{ bottom: '22px', left: '52px' }`.

## Verification
- Run `bun run build` and confirm a clean build.
- Optionally preview the player in landscape to confirm the logo is slightly lower and a bit smaller.

## Note
If the new position/size feels slightly off after preview, we can tweak `translateY` and `scale` in one line.