# Rewind Logic v2 Frontend UX Implementation Plan

## Overview
This document outlines the step-by-step UX implementation plan for the v2 frontend, based on the completed backend and product requirements. It covers protected branch warnings, conflict resolution, LFS integration, stash recovery, and more.

---

## Critical UX Decisions (Summary)

1. **Protected Branch Warning:** Persistent banner below TopBar with "Start New Task" action.
2. **Move Changes to New Branch:** Auto-detect uncommitted changes; prompt user in BranchModal and on branch switch.
3. **LFS Settings:** Flat list of tracked patterns with category badges in Settings.
4. **LFS Indicators:** Only show lock indicator in StatusBar when there are locks; file tooltips for LFS status.
5. **Conflict Resolution:** Full modal takeover (ConflictPage) when merge conflicts detected.
6. **Conflict Actions:** Use "Keep My Changes" terminology for resolution options.
7. **Stash Recovery:** Show stashes in BranchModal as "Saved Work" section.
8. **LFS Install CTA:** Show instructions and benefits if LFS is not installed.

---

## Implementation Phases & Steps

### Phase 1: Foundation — Context & Bindings
- Add new Wails bindings imports for all backend methods.
- Extend RepoContext state for protected branch, merge/conflict, LFS, and stash.
- Add context actions for protected branch check, merge state, LFS status, and stash list.
- Update `refreshAll` to include new checks.

### Phase 2: Protected Branch Warning
- Create `ProtectedBranchBanner` component.
- Integrate banner into layout between TopBar and MainArea.

### Phase 3: Conflict Resolution (Full Takeover)
- Create `ConflictPage` component for merge conflict UI.
- Add context actions for resolving conflicts, aborting merge, and completing merge.
- Update MainArea to conditionally render ConflictPage when conflicts are present.

### Phase 4: Branch Modal Enhancements
- Add "Move Changes" toggle in BranchModal (create mode).
- Auto-detect changes on branch switch and prompt user.
- Add "Saved Work" (stash list) section to BranchModal.

### Phase 5: LFS Settings Panel
- Add LFS category to Settings.
- Create `LFSSettingsPanel` component for tracked patterns, presets, and install CTA.
- Display presets as flat list with category badges.

### Phase 6: LFS Indicators
- Add StatusBar lock indicator (only when locks exist).
- Add file tooltips in ChangesView for LFS status and locks.

### Phase 7: Integration & Polish
- Update sync flow to handle conflicts and show ConflictPage.
- Add LFS lock check before branch switch with warning.

---

## Implementation Order
| Step | Task | Est. Time | Dependencies |
|------|------|-----------|--------------|
| 1 | Phase 1: Context foundation | 2-3 hrs | None |
| 2 | Phase 3: ConflictPage + takeover logic | 3-4 hrs | Phase 1 |
| 3 | Phase 2: ProtectedBranchBanner | 1-2 hrs | Phase 1 |
| 4 | Phase 4: BranchModal enhancements | 2-3 hrs | Phase 1 |
| 5 | Phase 5: LFSSettingsPanel | 2-3 hrs | Phase 1 |
| 6 | Phase 6: LFS indicators | 1 hr | Phase 5 |
| 7 | Phase 7: Integration & polish | 2 hrs | All above |

**Total estimate:** ~14-18 hours

---

## File Checklist

### New Files to Create
- `frontend/src/components/common/ProtectedBranchBanner.jsx`
- `frontend/src/components/layout/pages/ConflictPage.jsx`
- `frontend/src/components/layout/pages/settings/LFSSettingsPanel.jsx`

### Files to Modify
- `frontend/src/context/RepoContext.jsx`
- `frontend/src/constants/index.js`
- `frontend/src/components/layout/MainArea.jsx`
- `frontend/src/components/layout/AppLayout.jsx`
- `frontend/src/components/layout/BranchModal.jsx`
- `frontend/src/components/layout/StatusBar.jsx`
- `frontend/src/components/layout/views/ChangesView.jsx`
- `frontend/src/components/layout/pages/settings/index.js`

---

## Notes
- All UX choices are tailored for non-technical industrial automation users.
- Error states and empty states are handled with clear CTAs and explanations.
- The plan is modular and can be executed incrementally.

---

Ready to execute. Begin with Phase 1 (Context foundation) for best results.
