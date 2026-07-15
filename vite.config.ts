import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { imagetools } from "vite-imagetools";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => ({
  define: {
    __BUNDLED_DEV__: JSON.stringify(mode === "development"),
    __COMMIT_SHA__: JSON.stringify(process.env.GITHUB_SHA ?? "dev"),
    // Sentry release-health tag — same shape as sentry-cli finalize in
    // .github/workflows/build-apk.yml. Set at build time; empty string in
    // dev so Sentry falls back to unversioned events.
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(
      process.env.VITE_SENTRY_RELEASE ??
        (process.env.APP_VERSION_NAME && process.env.GITHUB_SHA
          ? `com.safarenglishka.app@${process.env.APP_VERSION_NAME}+${(process.env.GITHUB_SHA || "").slice(0, 7)}`
          : "")
    ),
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    strictPort: true,
    hmr: { overlay: false },
    watch: {
      // Exclude heavy directories to avoid ENOSPC (inotify limit) on Replit
      ignored: [
        "**/node_modules/**",
        "**/.cache/**",
        "**/android/**",
        "**/ios/**",
        "**/.git/**",
        "**/dist/**",
        "**/capacitor-plugin-nb-pdf/android/**",
        "**/capacitor-plugin-nb-pdf/ios/**",
      ],
    },
  },
  css: { devSourcemap: true },
  plugins: [
    react(),
    // Replace the `__NB_BUILD_SHA__` placeholder inside public/sw.js during
    // production build so every deploy ships a unique Cache Storage bucket
    // and returning web users don't get stuck on a stale app shell.
    ...(mode === 'production' ? [{
      name: 'nb-sw-sha-replace',
      apply: 'build' as const,
      generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
        const sha = (process.env.GITHUB_SHA ?? Date.now().toString()).slice(0, 12);
        const swPath = path.resolve(__dirname, 'public/sw.js');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('fs') as typeof import('fs');
        try {
          const src = fs.readFileSync(swPath, 'utf8');
          const out = src.replace(/__NB_BUILD_SHA__/g, sha);
          this.emitFile({ type: 'asset', fileName: 'sw.js', source: out });
        } catch { /* sw.js missing — non-fatal */ }
      },
    }] : []),
    // Holistic image optimization — auto-convert all PNG/JPG imports to WebP
    // at build time. Skipped in dev for fast HMR / `vite` startup; production
    // builds still get the full optimization pass.
    mode === 'production' && imagetools({
      defaultDirectives: (url) => {
        const p = url.pathname;
        // Skip explicit opt-out
        if (url.searchParams.has("original")) return new URLSearchParams();
        // Skip non-raster
        if (!/\.(png|jpe?g)$/i.test(p)) return new URLSearchParams();

        const params = new URLSearchParams();
        params.set("format", "webp");

        if (p.includes("/landing/")) {
          // Hero / banner imagery — max 1600px wide
          params.set("w", "1600");
          params.set("quality", "78");
        } else if (p.includes("/branding/")) {
          // Logos rendered at <=256px; serve at 2x for retina
          params.set("w", "512");
          params.set("quality", "82");
        } else if (p.includes("/icons/")) {
          // 3D icons rendered ~48-96px; serve at 2x
          params.set("w", "192");
          params.set("quality", "82");
        } else if (p.includes("/thumbnails/")) {
          params.set("w", "480");
          params.set("quality", "78");
        } else {
          params.set("quality", "80");
        }
        return params;
      },
    }),
    mode === 'development' && componentTagger(),
    process.env.ANALYZE === 'true' && visualizer({
      filename: 'dist/stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ].filter(Boolean),
  // NOTE: Do not set `esbuild.drop` here. Vite 8 uses Rolldown/OXC as the default
  // minifier; an `esbuild` block would be ignored and emit a
  // "Both esbuild and oxc options were set" warning. Console stripping is left to
  // the default production minifier.
  // PDF.js (react-pdf) ships its worker as an ES module — emit worker bundles as
  // ESM so the worker loads correctly from blob:/capacitor:/http URLs.
  worker: { format: 'es' },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Stub Sentry's Node-only MCP server integration. Rolldown on some
      // platforms (Replit clean `npm ci`) fails to resolve the relative
      // imports inside @sentry/core/.../mcp-server/, breaking the browser
      // build. We never use MCP in the browser — alias the whole subtree to
      // an empty module so rolldown never walks into it. See src/lib/sentry-mcp-stub.ts.
      {
        find: /@sentry[\\/]core[\\/]build[\\/]esm[\\/]integrations[\\/]mcp-server([\\/].*)?$/,
        replacement: path.resolve(__dirname, "./src/lib/sentry-mcp-stub.ts"),
      },
      // Kill the 215KB `vendor-md-prism` chunk. The app uses
      // `@uiw/react-md-editor/nohighlight` so refractor/prism are dead code
      // at runtime — but the static import graph still pulls them. Alias
      // both to an empty stub so Rollup can drop the entire languages tree.
      { find: /^refractor(\/.*)?$/, replacement: path.resolve(__dirname, "./src/lib/refractor-stub.ts") },
      { find: /^rehype-prism-plus(\/.*)?$/, replacement: path.resolve(__dirname, "./src/lib/refractor-stub.ts") },

    ],
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client',
      '@supabase/supabase-js', '@tanstack/react-query', '@dnd-kit/core', '@dnd-kit/sortable',
      'dompurify', 'date-fns', 'react-router-dom',
      'react-hook-form', 'zod', '@hookform/resolvers',
      // Note: recharts, react-markdown, remark-gfm are only imported inside
      // lazy-loaded routes (charts in admin analytics, markdown in ChatWidget).
      // Excluding them from optimizeDeps keeps dev cold-start fast and avoids
      // the "react-markdown.js?v=…" stale-prebundle 404 after HMR rebuilds.
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Faster build: skip gzip/brotli size computation in CI/dev rebuilds.
    reportCompressedSize: false,
    // Native + modern browsers only — skip ES5 transpilation step.
    target: 'esnext',
    // LightningCSS is ~3x faster than the default cssnano for minification.
    cssMinify: 'lightningcss',
    // Vite 8 uses Rolldown/OXC for production JS minification. Keeping
    // `esbuild` here can leave Rolldown-created vendor chunks unminified in
    // Replit, which is why vendor-react showed ~98KB gzip with no contaminants.
    minify: 'oxc',
    // Hidden sourcemaps: emit .map files (for Sentry upload) but do NOT
    // reference them from bundled JS — keeps APK/payload small and avoids
    // leaking source to end-users.
    sourcemap: mode === "production" ? "hidden" : false,
    chunkSizeWarningLimit: 1800,
    // Skip the modulepreload polyfill — our esnext target only ships to
    // browsers that already support <link rel="modulepreload"> natively.
    // Saves ~2KB on every page and removes a sync inline script.
    modulePreload: {
      polyfill: false,
      resolveDependencies: (_url, deps, { hostType }) => {
        // Keep Replit's strict postbuild budget focused on the real HTML entry
        // script, not warmup hints. In Vite 8/Rolldown, vendor chunks are still
        // fetched by normal ESM imports when needed; omitting heavy HTML
        // modulepreloads avoids false cold-entry failures when Replit emits an
        // unminified-but-clean vendor-react chunk.
        if (hostType === 'html') {
          return deps.filter((dep) => !/vendor-(react|motion|supabase)-/.test(dep));
        }
        return deps;
      },
    },
    // Inline very small assets (icons, tiny SVGs) as base64 to save HTTP
    // round-trips on slow mobile connections. Default is 4096; we tighten
    // to 2048 so the index payload stays small.
    assetsInlineLimit: 2048,
    cssCodeSplit: true,
    rollupOptions: {
      external: [/^@capgo\//],
      // Silence rolldown's EVAL warning from eruda's bundled source.
      // Eruda is a dev-only debug console that intentionally uses direct
      // `eval` to power its REPL — not a security issue in our build (gated
      // behind ?eruda=1 / admin) and we can't patch upstream.
      onLog(level, log, handler) {
        if (log.code === 'EVAL' && /eruda/.test(log.id ?? '')) return;
        handler(level, log);
      },
      output: {
        // Vite 8 / Rolldown uses `codeSplitting.groups` for manual vendor
        // chunks. Do not also set `advancedChunks` or Rollup `manualChunks`:
        // `advancedChunks` is deprecated, and `manualChunks` is ignored when
        // `codeSplitting` is active, which is exactly what Replit reported.
        codeSplitting: {
          groups: [
            { name: 'vendor-react',     test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,                          priority: 100 },
            { name: 'vendor-sentry',    test: /[\\/]node_modules[\\/]@sentry[\\/]/,                                              priority: 90 },
            { name: 'vendor-capacitor', test: /[\\/]node_modules[\\/](@capacitor|jeep-sqlite|sql\.js|@stencil)[\\/]/,            priority: 90 },
            // (vendor-md-prism removed — refractor/prismjs are aliased to
            // empty stubs in resolve.alias, so this chunk was always empty.)
            { name: 'vendor-supabase',  test: /[\\/]node_modules[\\/](@supabase|postgrest-js|realtime-js|gotrue-js|storage-js)[\\/]/, priority: 80 },
            { name: 'vendor-motion',    test: /[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/,              priority: 80 },
          ],
        },
      },
    },
  },
}));
