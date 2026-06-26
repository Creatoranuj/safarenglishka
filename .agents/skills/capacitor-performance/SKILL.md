---
name: capacitor-performance
description: Performance optimization guide for Capacitor apps covering bundle size, rendering, memory, native bridge, and profiling. Use this skill when users need to optimize their app performance, report slowness, jank, large bundles, memory leaks, or want profiling guidance.
---

# Performance Optimization for Capacitor

Make your Capacitor apps fast and responsive.

> Project context: Naveen Bharat is a Vite + React 18 + Capacitor app with the
> Capgo live-update plugin. Apply the patterns below to `src/`, `vite.config.ts`,
> and any `@capacitor/*` or `@capgo/*` plugin usage.

## When to Use This Skill

- User has slow app
- User wants to optimize
- User has memory issues
- User needs profiling
- User has janky animations
- User reports large APK / bundle / slow startup

## Quick Wins

### 1. Lazy Load Plugins

```typescript
// BAD - All plugins loaded at startup
import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';

// GOOD - Load when needed
async function takePhoto() {
  const { Camera } = await import('@capacitor/camera');
  return Camera.getPhoto({ quality: 90 });
}
```

### 2. Reduce Bundle Size

```bash
# Analyze bundle
npx vite-bundle-visualizer

# Tree-shake imports
import { specific } from 'large-library';  // Good
import * as everything from 'large-library'; // Bad
```

In Vite, prefer `React.lazy` + `Suspense` for route-level code splitting and
configure `build.rollupOptions.output.manualChunks` for vendor splits.

### 3. Optimize Images

```typescript
// Use appropriate quality
const photo = await Camera.getPhoto({
  quality: 80,        // Not 100
  width: 1024,        // Limit size
  resultType: CameraResultType.Uri,  // Not Base64
});

// Lazy load images
<img loading="lazy" src={url} />
```

### 4. Minimize Bridge Calls

```typescript
// BAD - Multiple bridge calls
for (const item of items) {
  await Storage.set({ key: item.id, value: item.data });
}

// GOOD - Single call with batch
await Storage.set({
  key: 'items',
  value: JSON.stringify(items),
});
```

## Rendering Performance

### Use CSS Transforms

```css
/* GPU accelerated */
.animated {
  transform: translateX(100px);
  will-change: transform;
}

/* Avoid - triggers layout */
.animated {
  left: 100px;
}
```

### Virtual Scrolling

Use `@tanstack/react-virtual` for long lists in React:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60,
  overscan: 8,
});
```

### Debounce Events

Tiny native debounce — no need to ship lodash:

```typescript
function debounce<T extends (...a: any[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const handleScroll = debounce((e) => { /* ... */ }, 16); // ~60fps
```

## Memory Management

### Cleanup Listeners

```typescript
import { App } from '@capacitor/app';

useEffect(() => {
  let handle: { remove: () => void } | null = null;
  (async () => {
    handle = await App.addListener('appStateChange', callback);
  })();
  return () => handle?.remove();
}, []);
```

### Avoid Memory Leaks

```typescript
// Clear large data when done
let largeData = await fetchLargeData();
processData(largeData);
largeData = null; // Allow GC
```

## Profiling

### Chrome DevTools

1. Connect via chrome://inspect
2. Performance tab > Record
3. Analyze flame chart

### Xcode Instruments

1. Product > Profile
2. Choose Time Profiler
3. Analyze hot paths

### Android Profiler

1. View > Tool Windows > Profiler
2. Select CPU/Memory/Network
3. Record and analyze

## Metrics to Track

| Metric | Target |
|--------|--------|
| First Paint | < 1s |
| Time to Interactive | < 3s |
| Frame Rate | 60fps |
| Memory | Stable, no growth |
| Bundle Size | < 500KB gzipped |

## Resources

- Chrome DevTools: https://developer.chrome.com/docs/devtools
- Xcode Instruments: https://developer.apple.com/instruments
