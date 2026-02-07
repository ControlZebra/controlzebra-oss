# File Manager UI Plan

## Goals
- Implement virtualization to render only the current view.
- Highlight the clicked file.
- Breadcrumb: increase font size, remove the separator below.
- Finalize background color scheme (OneDrive/GDrive theme).
- Convert the file view to a table with columns:
  - Git file status (no header text)
  - Icon (folder, file, etc.)
  - Name
  - Size
  - Modified
- Right sidebar when a file is clicked for file details + action items (empty for now).
- Add a separator for each line.
- Add a context menu per file (dummy buttons for now).
- Show the following on the file manager toolbar:
  - Open in Explorer/Finder (dummy button)
  - Reload
  - Show Hidden Files
  - Copy link (dummy button)

## Implementation Steps
1. ✅ **Audit current file manager UI and data flow**
   - Review layout and file listing components to map where to add table rows, toolbar, breadcrumbs, and selection state.
   - Likely touch points:
     - frontend/src/components/common/SimpleFileBrowser.tsx (main file browser)
     - frontend/src/components/common/FileContentViewer.tsx (file content display)
     - frontend/src/components/layout/pages/explorer/ExplorerPage.tsx (container with tabs)

2. ✅ **Add virtualization for the file list (current view only)**
   - Installed @tanstack/react-virtual
   - Created VirtualizedFileTable component with useVirtualizer hook
   - Overscan of 10 items for smooth scrolling
   - Estimated row size of 36px (h-9)

3. ✅ **Convert file list to a table with required columns**
   - Columns: Git status (letter badge, no header), Type icon, Name, Size, Modified
   - Added FileTableHeader component with sticky positioning
   - Added FileTableRow component with per-row border separator
   - Updated row layout/hover/selection styles

4. ✅ **Implement selection state and highlighting**
   - Track "clicked file" in the file browser component state and apply a clear highlight style.
   - Ensure selection is preserved when re-rendering with virtualization.
   - Added blue left border for selected rows with bg-fb-selected background

5. ✅ **Add right sidebar for file details + actions (empty placeholders)**
   - When a file is selected, show a details panel with header + stub action section.
   - Layout: main file table left, details sidebar right.
   - Added FileDetailsSidebar component with file info and action buttons (Open in Finder, Copy Path, Download, Delete - all placeholder)

6. ✅ **Breadcrumb styling update**
   - Increase breadcrumb font size (text-sm → text-base).
   - Remove the separator line below the breadcrumb area.
   - Increased icon sizes for home button and chevron separators

7. ✅ **Finalize background color scheme (OneDrive/GDrive style)**
   - Define a cohesive neutral palette for background, hover, selected, and panel surfaces.
   - Apply across file table, toolbar, sidebar, and breadcrumbs.
   - Added new CSS variables: --color-fb-base, --color-fb-surface, --color-fb-hover, --color-fb-selected, --color-fb-selected-border, --color-fb-sidebar, --color-fb-toolbar, --color-fb-breadcrumb
   - Created utility classes: bg-fb-base, bg-fb-surface, bg-fb-hover, bg-fb-selected, border-fb-selected, bg-fb-sidebar, bg-fb-toolbar, bg-fb-breadcrumb

8. ✅ **Add per-file context menu (dummy actions)**
   - Created context-menu.tsx UI component based on @radix-ui/react-context-menu
   - Right-click context menu with full action set: Open, Open With, Reveal in Finder, Copy Path, Copy Name, Rename, Duplicate, Share, Get Info, Move to Trash
   - Menu properly works with virtualization (ContextMenuTrigger wraps row)
   - Added hover-visible Share button in the Name column (appears on row hover)
   - Keyboard shortcuts shown in menu items (⌘O, ⌘⇧C, ⌘D, ⌘I, ⌘⌫, etc.)

9. ✅ **Update file manager toolbar actions**
   - Added "Open in Finder" button using RevealInFinder service
   - Reload button already present and functional
   - Show Hidden Files toggle already present and functional
   - Added "Copy Link" button to copy current folder path to clipboard
   - Added visual separator between action groups

10. ✅ **QA pass and polish**
   - Verified context menu works correctly with virtualized list
   - Selection state preserved when context menu is opened
   - FileDetailsSidebar actions now use real service calls (RevealInFinder, CopyToClipboard)
   - Consistent styling across all interactive elements
   - Build passes with no TypeScript errors
