# UI Components

> shadcn-style Radix-based primitives in `frontend/src/shared/ui/`.

## Overview

All reusable UI components live in `shared/ui/`. They follow the [shadcn/ui](https://ui.shadcn.com/) pattern: Radix UI headless primitives wrapped with Tailwind CSS styling using `cva` (class-variance-authority), `clsx`, and `tailwind-merge`.

## Available Components

### Form Controls
| Component | File | Based On |
|-----------|------|----------|
| `Button` | `button.tsx` | Custom (cva variants) |
| `ButtonGroup` | `button-group.tsx` | Custom |
| `Input` | `input.tsx` | HTML input + Tailwind |
| `Textarea` | `textarea.tsx` | HTML textarea + Tailwind |
| `Label` | `label.tsx` | Radix Label |
| `Select` | `select.tsx` | Radix Select |
| `Switch` | `switch.tsx` | Radix Switch |

### Feedback
| Component | File | Based On |
|-----------|------|----------|
| `Badge` | `badge.tsx` | Custom (cva variants) |
| `Progress` | `progress.tsx` | Radix Progress |
| `ProgressModal` | `progress-modal.tsx` | Custom (Radix Dialog + Progress) |
| `Spinner` | `Spinner.tsx` | Custom SVG animation |
| `Toaster` | `sonner.tsx` | sonner library |
| `Tooltip` | `tooltip.tsx` | Radix Tooltip |

### Layout
| Component | File | Based On |
|-----------|------|----------|
| `Card` | `card.tsx` | Custom (Tailwind) |
| `Table` | `table.tsx` | HTML table + Tailwind |

### Overlays
| Component | File | Based On |
|-----------|------|----------|
| `AlertDialog` | `alert-dialog.tsx` | Radix AlertDialog |
| `ContextMenu` | `context-menu.tsx` | Radix ContextMenu |
| `DropdownMenu` | `dropdown-menu.tsx` | Radix DropdownMenu |
| `Popover` | `popover.tsx` | Radix Popover |

### State Displays
| Component | File | Purpose |
|-----------|------|---------|
| `EmptyState` | `EmptyState.tsx` | Empty list/page placeholder |
| `LoadingState` | `LoadingState.tsx` | Loading indicator with message |
| `RecoveryBanner` | `RecoveryBanner.tsx` | Stuck state recovery UI |
| `UndoLastSaveDialog` | `UndoLastSaveDialog.tsx` | Rewind confirmation |

## Usage Pattern

```tsx
import { Button } from '../shared/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../shared/ui/card';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent } from '../shared/ui/alert-dialog';

<Card>
    <CardHeader>
        <CardTitle>Project Settings</CardTitle>
    </CardHeader>
    <CardContent>
        <Button variant="default" size="sm">
            Save Changes
        </Button>
    </CardContent>
</Card>
```

## Button Variants

```tsx
<Button variant="default">Primary Action</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Subtle</Button>
<Button variant="link">Link Style</Button>

<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon">Icon Only</Button>
```

## Icon Usage

All icons from `lucide-react` (v0.562):

```tsx
import { FolderOpen, GitBranch, Settings } from 'lucide-react';
import { ICON_SIZES } from '../shared/constants';

<FolderOpen size={ICON_SIZES.xs} />  // 14px — status indicators
<FolderOpen size={ICON_SIZES.sm} />  // 16px — default
<FolderOpen size={ICON_SIZES.md} />  // 20px — activity bar
<FolderOpen size={ICON_SIZES.lg} />  // 28px — profile avatars
```

**Rules:**
- Use `lucide-react` exclusively — no other icon libraries
- Always use `ICON_SIZES` constant — never hardcode pixel values
- Match icon size to context (see table above)

## Theme Integration

Components use theme-aware CSS custom properties:

```css
/* Light mode */
.light { --color-theme-base: #ffffff; --color-theme-primary: #1a1a1a; }

/* Dark mode (default) */
:root { --color-theme-base: #0a0a0a; --color-theme-primary: #e0e0e0; }
```

Components reference these via Tailwind classes:
```tsx
className="bg-theme-base text-theme-primary border-theme-muted"
```

---

**Related:** [[Frontend Architecture]] | [[Layout System]]
