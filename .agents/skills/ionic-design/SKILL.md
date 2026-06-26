---
name: ionic-design
description: Build beautiful, native-looking mobile apps with Ionic Framework and Capacitor. Use when working with Ionic components, native-looking mobile UI, Ionic theming, mobile UI patterns, or platform-specific (iOS/Android) styling.
---

# Ionic Framework Design Guide

Build beautiful, native-looking mobile apps with Ionic Framework and Capacitor.

## When to Use This Skill

- User is using Ionic components
- User wants native-looking UI
- User asks about Ionic theming
- User needs mobile UI patterns
- User wants platform-specific styling

## What is Ionic Framework?

- 100+ mobile-optimized UI components
- Automatic iOS/Android platform styling
- Built-in dark mode + accessibility
- Works with React, Vue, Angular

## Getting Started (React)

```bash
npm install @ionic/react @ionic/react-router
```

```typescript
// main.tsx
import { setupIonicReact } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
setupIonicReact();
```

`setupIonicReact()` enables standalone overlays like `IonAlert`, `IonToast`, `IonLoading` **without** needing to wrap the whole app in `<IonApp>` — handy when retrofitting Ionic pieces into an existing React app.

## Core Components

### Page shell
```tsx
<IonPage>
  <IonHeader><IonToolbar><IonTitle>Title</IonTitle></IonToolbar></IonHeader>
  <IonContent fullscreen>...</IonContent>
</IonPage>
```

### Overlays (work standalone)
```tsx
<IonAlert
  isOpen={open}
  header="Delete Account"
  message="Are you sure?"
  buttons={[
    { text: 'Cancel', role: 'cancel' },
    { text: 'Confirm', role: 'destructive', handler: doDelete },
  ]}
  onDidDismiss={() => setOpen(false)}
/>

<IonToast isOpen={t} message="Saved" color="success" duration={3000} />
<IonLoading isOpen={loading} message="Working..." />
```

### Buttons
```tsx
<IonButton expand="block" color="danger">Delete</IonButton>
<IonButton fill="outline">Outline</IonButton>
<IonSpinner name="crescent" />
```

### Lists / Items / Forms
`IonList`, `IonItem`, `IonLabel`, `IonInput label="..." labelPlacement="floating"`, `IonTextarea`, `IonSelect`/`IonSelectOption`, `IonToggle`, `IonCheckbox`, `IonRadioGroup`/`IonRadio`.

### Cards
`IonCard`, `IonCardHeader`, `IonCardTitle`, `IonCardSubtitle`, `IonCardContent`.

### Modals & Sheets
```tsx
<IonModal isOpen={o} onDidDismiss={close}>...</IonModal>
<IonModal initialBreakpoint={0.5} breakpoints={[0,0.25,0.5,1]}>...</IonModal>
```

## Navigation
- Tabs: `IonTabs` + `IonTabBar` + `IonTabButton`
- Stack: `IonReactRouter` + `IonRouterOutlet` + `<Route>`

## Theming (`theme/variables.css`)
```css
:root {
  --ion-color-primary: #3880ff;
  --ion-color-primary-rgb: 56,128,255;
  --ion-color-primary-contrast: #fff;
  --ion-color-primary-shade: #3171e0;
  --ion-color-primary-tint: #4c8dff;
}
.ios  { --ion-toolbar-background: #f8f8f8; }
.md   { --ion-toolbar-background: #ffffff; }
@media (prefers-color-scheme: dark) {
  :root { --ion-background-color: #121212; --ion-text-color: #fff; }
}
```

Per-component overrides via CSS custom props:
```css
ion-card { --background: #fff; border-radius: 16px; }
```

## Platform-specific code
```ts
import { isPlatform } from '@ionic/react';
if (isPlatform('ios'))    { /* iOS */ }
if (isPlatform('android')){ /* Android */ }
if (isPlatform('hybrid')) { /* in Capacitor native */ }
```

## Best practices
- Long lists → `IonVirtualScroll`
- Images → `IonImg` (lazy-loads)
- Accessibility → always add `aria-label` on icon-only buttons
- Safe area → `IonContent` handles it; for custom: `env(safe-area-inset-top)`

## Resources
- Docs: https://ionicframework.com/docs
- Components: https://ionicframework.com/docs/components
- Ionicons: https://ionic.io/ionicons
