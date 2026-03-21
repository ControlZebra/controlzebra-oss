# Merge Modal Full-Width Review Wireframes

> Status: Planning
> Created: 2026-03-21
> Scope: Explorer merge modal review experience
> Goal: Give the merge review viewer full-width priority so file inspection feels primary, not cramped.

## Why This Exists

The current merge modal is structurally sound, but the review state still behaves like a mixed dashboard instead of a focused review surface. For non-technical users, that creates two UX problems:

1. The most important content, the file diff or viewer, does not get enough space.
2. The file list, status summary, and actions compete with the viewer instead of supporting it.

These wireframes explore five ways to make the review viewer the dominant surface while keeping the merge flow understandable and safe.

## Design Constraints

- Keep the existing outcome-first model.
- Preserve sticky header and footer actions.
- Avoid nested modals.
- Keep source and destination branch context visible.
- Make review optional for clean merges, but visually strong when present.
- Work well on desktop first, with a responsive fallback for smaller screens.

## Shared Interaction Model

All five options assume the same core behavior:

- Header shows merge title, branch direction, merge type, and close action.
- Footer holds the primary action: Merge now, Cancel, Done, or Finish.
- Review state opens directly into a selected file.
- File switching never opens a second modal.
- On smaller screens, the file list can collapse behind a button or bottom sheet.

---

## Wireframe 1: Full-Width Viewer With Slim Left Rail

### Best for

Balanced review workflow with strong viewer priority and familiar navigation.

### Layout Idea

- Keep a narrow left rail for file switching.
- Give the diff viewer nearly all remaining width.
- Keep merge summary compressed into a shallow strip above the content.

### Wireframe

```text
+--------------------------------------------------------------------------------------+
| Review available                                      [Badge]                [Close] |
| feature/plc-cleanup  ->  main                         Squash merge                    |
+--------------------------------------------------------------------------------------+
| Summary: 12 files changed | No conflicts | Review if needed before merging          |
+---------------------------+----------------------------------------------------------+
| Files                     |                                                          |
| [x] PLC-code.L5X          |                    FULL-WIDTH REVIEW VIEWER              |
| [x] Tags.json             |                                                          |
| [x] Screens/Main.hmi      |   Diff or specialized viewer fills the main surface      |
| [ ] MotorConfig.csv       |   Wide canvas for L5X, PDF, image, text, or 3D review   |
| [ ] alarm-map.json        |                                                          |
|                           |                                                          |
|                           |                                                          |
+---------------------------+----------------------------------------------------------+
| Merging feature/plc-cleanup into main         [Cancel] [Merge now]                  |
+--------------------------------------------------------------------------------------+
```

### Strengths

- Strongest direct improvement over the current layout.
- Minimal learning cost.
- Keeps file navigation visible without stealing viewer width.

### Risks

- Large file lists may still feel dense.
- Summary strip must stay compact or it will eat into viewer height.

---

## Wireframe 2: Viewer-First With Collapsible Review Drawer

### Best for

Maximum content focus, especially for L5X, PDF, image, and 3D viewers.

### Layout Idea

- Make the viewer full width by default.
- Hide the file list inside a collapsible left drawer.
- Use a compact top toolbar for quick file switching and review count.

### Wireframe

```text
+--------------------------------------------------------------------------------------+
| Review available               12 files changed              [Files] [Close]         |
| feature/plc-cleanup -> main    No conflicts                 Squash merge             |
+--------------------------------------------------------------------------------------+
| Toolbar: [Previous file] [Current: PLC-code.L5X] [Next file] [Select all]           |
+--------------------------------------------------------------------------------------+
|                                                                                      |
|                               FULL-WIDTH REVIEW VIEWER                               |
|                                                                                      |
|        Viewer owns the entire canvas unless the user explicitly opens Files          |
|                                                                                      |
|                                                                                      |
|                                                                                      |
+--------------------------------------------------------------------------------------+
| Merging feature/plc-cleanup into main         [Cancel] [Merge now]                  |
+--------------------------------------------------------------------------------------+

Files drawer when opened:

+---------------------------+
| Files to review           |
| [x] PLC-code.L5X          |
| [x] Tags.json             |
| [x] Screens/Main.hmi      |
| [ ] MotorConfig.csv       |
| [ ] alarm-map.json        |
+---------------------------+
```

### Strengths

- Best pure use of width.
- Feels modern and intentional.
- Excellent for complex industrial files where horizontal space matters.

### Risks

- Hidden navigation can reduce scannability.
- Users may miss the broader list of changed files unless the Files control is obvious.

---

## Wireframe 3: Top Filmstrip + Full Viewer Canvas

### Best for

Users who want fast scanning across files without sacrificing viewer width.

### Layout Idea

- Move file navigation into a horizontal strip above the viewer.
- Use chips or tabs with status badges.
- Leave the body completely dedicated to the diff/viewer.

### Wireframe

```text
+--------------------------------------------------------------------------------------+
| Review available                                      [Badge]                [Close] |
| feature/plc-cleanup -> main                           12 changed files               |
+--------------------------------------------------------------------------------------+
| [PLC-code.L5X] [Tags.json] [Main.hmi] [MotorConfig.csv] [alarm-map.json] [More 7]   |
+--------------------------------------------------------------------------------------+
|                                                                                      |
|                               FULL-WIDTH REVIEW VIEWER                               |
|                                                                                      |
|                 Entire content area is reserved for the current file                 |
|                                                                                      |
|                                                                                      |
|                                                                                      |
+--------------------------------------------------------------------------------------+
| Summary: No conflicts. Review is optional.                  [Cancel] [Merge now]     |
+--------------------------------------------------------------------------------------+
```

### Strengths

- Viewer gets full width and almost full height.
- Switching files feels quick and low effort.
- Good when the number of reviewed files is moderate.

### Risks

- Scales poorly if too many files need review.
- Long file names can crowd the strip unless truncation is handled carefully.

---

## Wireframe 4: Split-Level Modal With Viewer on Top, Selection Table Below

### Best for

Review flows where file selection matters as much as viewing.

### Layout Idea

- Top two-thirds is reserved for the full-width viewer.
- Bottom section holds the selection list and status table.
- Keeps all controls visible without reducing horizontal viewer space.

### Wireframe

```text
+--------------------------------------------------------------------------------------+
| Review available                                      [Badge]                [Close] |
| feature/plc-cleanup -> main                           Squash merge                    |
+--------------------------------------------------------------------------------------+
|                                                                                      |
|                               FULL-WIDTH REVIEW VIEWER                               |
|                                                                                      |
|                                                                                      |
|                                                                                      |
+--------------------------------------------------------------------------------------+
| Files to include in this merge                                                     |
| [x] PLC-code.L5X      modified     [Reviewing]                                       |
| [x] Tags.json         modified     [Review]                                          |
| [x] Screens/Main.hmi  renamed      [Review]                                          |
| [ ] MotorConfig.csv   added        [Review]                                          |
+--------------------------------------------------------------------------------------+
| 3 selected | No conflicts                             [Cancel] [Merge now]           |
+--------------------------------------------------------------------------------------+
```

### Strengths

- Viewer gets full width while file selection remains explicit.
- Better fit if selective merge stays part of the product direction.
- Easy to understand for users who think in terms of reviewing then choosing.

### Risks

- Viewer height is reduced compared with drawer-based options.
- Bottom section can feel crowded if table actions expand.

---

## Wireframe 5: Focus Mode Viewer With Context Sidebar on Demand

### Best for

Advanced but still approachable review, where the primary task is inspecting one file deeply.

### Layout Idea

- Default to a distraction-free focus mode.
- Keep minimal merge context in the header.
- Secondary details like file list, summary, and selected count live in an on-demand right sidebar.

### Wireframe

```text
+--------------------------------------------------------------------------------------+
| Review available           PLC-code.L5X                         [Context] [Close]    |
| feature/plc-cleanup -> main                                    No conflicts          |
+--------------------------------------------------------------------------------------+
|                                                                                      |
|                               FULL-WIDTH REVIEW VIEWER                               |
|                                                                                      |
|                     Clean, immersive viewer with minimal chrome                      |
|                                                                                      |
|                                                                                      |
|                                                                                      |
+--------------------------------------------------------------------------------------+
| Review optional. Merge when ready.                      [Cancel] [Merge now]         |
+--------------------------------------------------------------------------------------+

Context sidebar when opened:

+----------------------------------+
| Merge context                    |
| 12 files changed                 |
| 3 selected                       |
| Squash merge                     |
|                                  |
| Files                            |
| [x] PLC-code.L5X                 |
| [x] Tags.json                    |
| [x] Screens/Main.hmi             |
| [ ] MotorConfig.csv              |
+----------------------------------+
```

### Strengths

- Most premium and intentional feeling option.
- Best for specialized viewers that benefit from deep focus.
- Strong separation between primary content and secondary context.

### Risks

- Less immediately discoverable than a permanently visible list.
- Requires careful onboarding through labels and affordances.

---

## Recommendation

### Recommended primary direction

Wireframe 1 is the safest next iteration.

Why:

- It fixes the core problem immediately by giving the viewer most of the width.
- It preserves constant visibility of the file list.
- It requires the least behavioral change from the current modal.
- It aligns well with the current component structure: summary header, review list, inline review pane, sticky footer.

### Recommended bolder direction

Wireframe 2 is the best longer-term UX if the team wants the review experience to feel more premium and less like a utility dialog.

Why:

- It treats review as the primary job.
- It is especially strong for wide industrial content.
- It creates a clearer visual hierarchy than a conventional split pane.

## Implementation Notes

If the team wants the fastest path from the current implementation:

1. Keep the existing modal shell and sticky footer.
2. Compress the summary card into a single shallow strip.
3. Reduce the review file rail to a narrow column or collapsible drawer.
4. Let MergeReviewPane allocate most width to the viewer surface.
5. Avoid any nested review modal or secondary overlay.

## Decision Checklist

Use this when choosing a direction:

- Pick Wireframe 1 if constant file visibility matters most.
- Pick Wireframe 2 if viewer space is the top priority.
- Pick Wireframe 3 if quick file hopping matters most.
- Pick Wireframe 4 if selection and review must stay equally visible.
- Pick Wireframe 5 if the team wants the most focused and differentiated UX.