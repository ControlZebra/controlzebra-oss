# Adding a New View

> Step-by-step guide for adding a new sidebar view and main area page.

## Prerequisites

- Understanding of [[Layout System]] and [[Frontend Architecture]]
- Familiarity with [[Context Providers#LayoutContext|LayoutContext]]

## Steps

### 1. Define View ID

Add to `frontend/src/shared/constants/index.ts`:

```tsx
export const VIEWS = {
    // ... existing views
    MY_VIEW: 'my-view',
} as const;
```

### 2. Create Sidebar View Component

Create `frontend/src/features/my-feature/components/MyFeatureView.tsx`:

```tsx
import { memo } from 'react';

function MyFeatureView() {
    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-theme-primary">My Feature</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {/* Sidebar content */}
            </div>
        </div>
    );
}

export default memo(MyFeatureView);
```

### 3. Create Main Area Page Component

Create `frontend/src/features/my-feature/pages/MyFeaturePage.tsx`:

```tsx
import { memo } from 'react';

function MyFeaturePage() {
    return (
        <div className="flex flex-col h-full p-6">
            <h1 className="text-xl font-bold text-theme-primary mb-4">My Feature</h1>
            {/* Main content */}
        </div>
    );
}

export default memo(MyFeaturePage);
```

### 4. Create Page Index

Create `frontend/src/features/my-feature/pages/index.ts`:

```tsx
export { default as MyFeaturePage } from './MyFeaturePage';
```

### 5. Register in View Registry

Edit `frontend/src/widgets/layout/view-registry.ts`:

```tsx
import { MyFeaturePage } from '../../features/my-feature/pages';

export const VIEW_REGISTRY: Partial<Record<ViewType, ComponentType>> = {
    // ... existing views
    [VIEWS.MY_VIEW]: MyFeaturePage,
};
```

### 6. Register Sidebar View in Sidebar

Edit `frontend/src/widgets/layout/Sidebar.tsx` to render `MyFeatureView` when `activeView === VIEWS.MY_VIEW`.

### 7. Add ActivityBar Icon

Edit `frontend/src/widgets/layout/ActivityBar.tsx`:

```tsx
import { Wrench } from 'lucide-react';

// In the nav items array:
{
    id: VIEWS.MY_VIEW,
    icon: Wrench,
    label: 'My Feature',
}
```

### 8. (Optional) Add Feature Directory Structure

Following conventions:

```
features/my-feature/
├── README.md
├── components/
│   ├── MyFeatureView.tsx
│   └── README.md
├── hooks/
│   └── README.md
└── pages/
    ├── MyFeaturePage.tsx
    ├── index.ts
    └── README.md
```

## Checklist

- [ ] View ID defined in constants
- [ ] Sidebar view component created
- [ ] Main area page component created
- [ ] Page index file created
- [ ] Registered in view registry
- [ ] Sidebar dispatches to new view
- [ ] ActivityBar icon added
- [ ] Feature uses `memo()` for performance
- [ ] Follows existing styling patterns (Tailwind, theme classes)

---

**Related:** [[Layout System]] | [[Frontend Architecture]] | [[UI Components]]
