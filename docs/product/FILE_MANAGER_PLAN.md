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

4. **Implement selection state and highlighting**
   - Track “clicked file” in the file browser component state and apply a clear highlight style.
   - Ensure selection is preserved when re-rendering with virtualization.

5. **Add right sidebar for file details + actions (empty placeholders)**
   - When a file is selected, show a details panel with header + stub action section.
   - Layout: main file table left, details sidebar right.

6. **Breadcrumb styling update**
   - Increase breadcrumb font size.
   - Remove the separator line below the breadcrumb area.

7. **Finalize background color scheme (OneDrive/GDrive style)**
   - Define a cohesive neutral palette for background, hover, selected, and panel surfaces.
   - Apply across file table, toolbar, sidebar, and breadcrumbs.

8. **Add per-file context menu (dummy actions)**
   - Right-click menu with placeholder items (no-op handlers).
   - Ensure it works with virtualization (menu anchored to row).

9. **Update file manager toolbar actions**
   - Add buttons: Open in Finder/Explorer (dummy), Reload, Show Hidden Files (toggle), Copy Link (dummy).
   - Wire Reload and Show Hidden Files to existing/placeholder handlers.

10. **QA pass and polish**
   - Verify selection, context menu, and virtualization interplay.
   - Ensure keyboard/mouse behavior is consistent and no layout regressions.
