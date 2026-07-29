# Asset Migration Scan — Result

Repo scan ho gaya. Ye rahi migratable files ki list (Supabase se alag, Cloudflare R2 CDN pe jayengi).

## ✅ Migrate karne layak (15 files, ~570 KB)

### Big wins (>50 KB)
| File | Size | Kaha use hoti hai |
|---|---|---|
| `src/assets/landing/student-girl.webp` | 101 KB | Landing hero |
| `public/branding/logo_og_image.png` | 68 KB | OG social preview |
| `public/fonts/fraunces-latin.woff2` | 67 KB | Heading font |
| `public/fonts/inter-latin.woff2` | 48 KB | Body font |
| `public/icons/icon-512x512.png` | 47 KB | PWA icon |
| `src/assets/landing/raj-sir.webp` | 47 KB | Landing |

### Medium (10-30 KB)
- `public/fonts/jetbrains-mono-latin.woff2` (31 KB)
- `src/assets/logo.webp` (27 KB)
- `src/assets/icons/library-3d.webp` (20 KB)
- `public/icons/maskable-512.png` (16 KB)
- `src/assets/icons/performance-3d.webp` (15 KB)
- `src/assets/icons/science-3d.webp` (13 KB)
- `public/icons/icon-192x192.png` (12 KB)
- `src/assets/sarthi-avatar.webp` (11 KB)
- `src/assets/branding/sadguru-mascot.webp` (11 KB)

Total repo shrink: **~570 KB** (initial JS bundle unchanged — ye already lazy-loaded hain, but git repo aur build output chhote hote hain).

## ⏭️ Skip (reason ke saath)

| File | Kyun skip |
|---|---|
| `public/pdfjs/**` (4 MB) | PDF.js sibling files ek doosre ko relative path se load karte hain — CDN pe todega |
| `public/pdfjs/web/standard_fonts/*.ttf` (575 KB) | Same — pdfjs worker inhe apne relative path se maangta hai |
| `android/app/src/main/res/**` | Native Android resources, build time pe APK me embed hote hain |
| `e2e/fixtures/test.pdf` | Test fixture, prod bundle me nahi jaata |
| `src/assets/**/*.svg` | Component ke andar import hote hain (source code) |
| Chhoti `.webp` <5 KB (social icons) | Overhead > benefit |

## 🚫 Ye rules follow karunga
- Har file upload karke `.asset.json` pointer banaunga (CLI se, hand-write nahi)
- Saare references find karke rewrite karunga (import statements, HTML `href`, CSS `url()`)
- Original binaries delete karunga sirf jab references clean ho jayen
- Last me `bun run build` chala ke verify karunga
- Agar build fail hue, same turn me fix karunga (revert tumhare haath me — chat history se poora commit revert kar sakte ho)

## ❓ Confirm karo

1. **Ye 15 files migrate kar doon?** Ya kuch exclude karna hai (jaise fonts alag rakhne hain)?
2. **PWA icons** (`public/icons/*.png`) migrate karun? Manifest me path update karna padega — kaam karega but agar tumne PWA install ki hui hai purane URL se, wo cached rahega. Nayi installs pe new URL milega.
