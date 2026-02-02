# Frontend Documentation

ControlZebra frontend built with **React 18**, **Vite**, and **Tailwind CSS v4**.

## Architecture Overview

```
frontend/
├── src/
│   ├── main.jsx              # Application entry point
│   ├── App.jsx               # Root component with providers
│   ├── index.css             # Tailwind CSS imports
│   │
│   ├── components/
│   │   ├── common/           # Shared UI components
│   │   │   ├── Spinner.jsx   # Loading indicator
│   │   │   └── index.js      # Barrel export
│   │   │
│   │   └── layout/           # Application layout components
│   │       ├── AppLayout.jsx       # Main layout container
│   │       ├── TopBar.jsx          # Header with repo name & sync
│   │       ├── ActivityBar.jsx     # Left navigation sidebar
│   │       ├── Sidebar.jsx         # Resizable sidebar panel
│   │       ├── MainArea.jsx        # Content area placeholder
│   │       ├── BottomPanel.jsx     # Resizable bottom panel
│   │       ├── StatusBar.jsx       # Footer with status info
│   │       ├── NotificationBanner.jsx  # Toast notifications
│   │       │
│   │       ├── views/              # Sidebar view components
│   │       │   ├── ExplorerView.jsx    # File tree browser
│   │       │   ├── ChangesView.jsx     # Git changes & commit
│   │       │   ├── HistoryView.jsx     # Commit history
│   │       │   ├── SettingsView.jsx    # App settings
│   │       │   └── ProfileView.jsx     # User profile & accounts
│   │       │
│   │       └── bottom-panels/      # Bottom panel components
│   │           ├── CommitPanel.jsx     # Commit message UI
│   │           └── TerminalPanel.jsx   # Terminal emulator
│   │
│   ├── context/              # React Context providers
│   │   ├── LayoutContext.jsx # UI state (sidebar, panels, theme)
│   │   ├── RepoContext.jsx   # Git repository state & actions
│   │   └── index.js          # Barrel export
│   │
│   └── constants/            # Shared constants
│       └── index.js          # Views, sizes, colors, status types
│
└── bindings/                 # Auto-generated Wails bindings
    └── controlzebra/services/    # Go service bindings
```

## Core Concepts

### Context Providers

The app uses two main React contexts:

#### LayoutContext
Manages UI layout state:
- `activeView` - Current sidebar view (EXPLORER, CHANGES, HISTORY, SETTINGS, PROFILE)
- `sidebarCollapsed` / `sidebarWidth` - Sidebar state
- `bottomPanelCollapsed` / `bottomPanelHeight` - Bottom panel state
- `activeBottomPanel` - Current bottom panel tab (COMMIT, TERMINAL)
- `theme` - Color theme preference (light, dark, system)

#### RepoContext
Manages Git repository state:
- `repoPath` / `repoInfo` / `repoStatus` - Repository data
- `commits` - Recent commit history
- Loading states: `isLoading`, `isSyncing`, `isCommitting`
- Actions: `openRepo`, `commitChanges`, `syncRepo`, `refreshAll`
- Status polling every 3 seconds when repo is open

### Component Hierarchy

```
App
└── RepoProvider
    └── LayoutProvider
        └── AppLayout
            ├── TopBar
            ├── NotificationBanner
            └── [flex container]
                ├── ActivityBar
                ├── Sidebar
                │   └── [active view component]
                └── [main container]
                    ├── MainArea
                    ├── BottomPanel
                    │   └── [active panel component]
                    └── StatusBar
```

## Styling

### Tailwind CSS v4
- Import via `@import "tailwindcss"` in `index.css`
- Dark theme by default with gray-800/900 backgrounds
- Blue accent color for interactive elements
- Consistent spacing using Tailwind utilities

### Icon System
Using **Heroicons** ([@heroicons/react](https://heroicons.com/)):

```jsx
import { FolderIcon } from '@heroicons/react/24/outline';
import { BookmarkIcon } from '@heroicons/react/24/solid';

<FolderIcon style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} />
```

Standard icon sizes defined in `constants/index.js`:
- `xs`: 14px - Status indicators
- `sm`: 16px - Default icons
- `md`: 20px - Activity bar
- `lg`: 24px - Profile avatars

### Custom Brand Icons
GitHub and GitLab icons are custom SVG components in `ProfileView.jsx` since Heroicons doesn't include brand logos.

## Key Patterns

### Memoization
All components use `memo()` to prevent unnecessary re-renders:

```jsx
const FileItem = memo(function FileItem({ file, onSelect }) {
  // component code
});

export default memo(ChangesView);
```

### Callback Hooks
Event handlers are wrapped in `useCallback`:

```jsx
const handleSave = useCallback(async () => {
  if (!message.trim()) return;
  await commitChanges(message);
}, [message, commitChanges]);
```

### Derived State with useMemo
Computed values use `useMemo` for efficiency:

```jsx
const syncStatus = useMemo(
  () => getSyncStatus(isSyncing, ahead, behind),
  [isSyncing, ahead, behind]
);
```

### Resizable Panels
Sidebar and BottomPanel support drag-to-resize:

```jsx
const handleMouseDown = useCallback((e) => {
  isResizing.current = true;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}, []);
```

## File Status Colors

Git file status types with associated colors:

| Status | Color Class | Visual |
|--------|-------------|--------|
| ADDED | `text-green-400` | Green |
| MODIFIED | `text-yellow-400` | Yellow |
| DELETED | `text-red-400` | Red |
| RENAMED | `text-blue-400` | Blue |
| UNTRACKED | `text-gray-400` | Gray |

## Wails Bindings

Go services are exposed via auto-generated bindings in `frontend/bindings/`:

```jsx
import { Status, CommitAll, Sync } from '../../bindings/controlzebra/services/gitservice';
import { GetAppSettings, SaveAppSettings } from '../../bindings/controlzebra/services/settingsservice';
import { ListDirectory, OpenFile } from '../../bindings/controlzebra/services/filesystemservice';
```

**Important**: Never edit binding files manually. Regenerate with:
```bash
task common:generate:bindings
```

## Development

### Commands
```bash
# Development with hot reload
task dev

# Build frontend only
cd frontend && npm run build

# Check for vulnerabilities
npm audit
```

### Dependencies
```
├── @heroicons/react@2.2.0    # Icon library
├── @wailsio/runtime          # Wails JS runtime
├── react@18.3.1              # UI library
├── react-dom@18.3.1          # React DOM
├── tailwindcss@4.1.18        # CSS framework
└── vite@6.4.1                # Build tool
```

### Bundle Size
Production build: ~215KB JS, ~15KB CSS (gzipped: ~65KB JS, ~4KB CSS)

## Adding New Views

1. Create component in `components/layout/views/MyView.jsx`
2. Add view ID to `VIEWS` constant in `constants/index.js`
3. Export from `views/index.js`
4. Add to `VIEW_CONFIG` in `Sidebar.jsx`
5. Add nav item in `ActivityBar.jsx`

## Adding New Bottom Panels

1. Create component in `components/layout/bottom-panels/MyPanel.jsx`
2. Add panel ID to `BOTTOM_PANELS` constant
3. Export from `bottom-panels/index.js`
4. Add to `PANEL_CONFIG` in `BottomPanel.jsx`
5. Add tab in `StatusBar.jsx` `PANEL_TABS` array

## Performance Considerations

1. **Polling**: Status updates poll every 3 seconds - consider WebSocket for production
2. **Tree Views**: ExplorerView uses lazy-loading for subdirectories
3. **Memoization**: All list items use `memo()` to prevent re-renders
4. **Bundle Size**: Removed MUI (was ~500KB) in favor of Heroicons (~50KB)
