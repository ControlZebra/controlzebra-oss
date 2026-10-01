import { Annotation, ChangeSet, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap, lineNumbers, type KeyBinding } from '@codemirror/view';
import { standardKeymap } from '@codemirror/commands';
import { getSearchQuery, search } from '@codemirror/search';

const fileRefresh = Annotation.define<boolean>();

// CSS variables follow the app theme without rebuilding the editor or its document.
const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'monospace', fontSize: '14px' },
  '.cm-content': { padding: '4px 0' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': { backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)', borderColor: 'var(--color-border-default)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px' },
  '.cm-cursor': { borderLeftColor: 'var(--color-text-primary)' },
  '&.cm-focused': { outline: '2px solid var(--color-accent-border)', outlineOffset: '-2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--color-interactive-active)' },
  '.cm-searchMatch': { backgroundColor: 'var(--color-warning-bg)', outline: '1px solid var(--color-warning-border)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--color-accent-bg)', outline: '1px solid var(--color-accent-primary)' },
});

export function createReadOnlyEditor(
  parent: HTMLElement,
  shortcuts: readonly KeyBinding[],
  onSearchResult: (hasMatch: boolean) => void,
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.contentAttributes.of({ tabindex: '0', role: 'textbox', 'aria-label': 'File content', 'aria-readonly': 'true', 'aria-multiline': 'true' }),
        // Preserve CRLF and mixed line endings in selection/copy as well as reads.
        EditorState.lineSeparator.of('\n'),
        EditorState.transactionFilter.of(transaction => transaction.docChanged && !transaction.annotation(fileRefresh) ? [] : transaction),
        lineNumbers(),
        drawSelection(),
        theme,
        search(),
        keymap.of([
          ...shortcuts,
          // Keep CodeMirror's platform navigation and full-document selection only.
          ...standardKeymap.filter(binding => binding.key === 'Mod-a' ||
            /(?:Arrow(?:Left|Right|Up|Down)|Page(?:Up|Down)|Home|End)$/.test(binding.key ?? binding.mac ?? '')),
        ]),
        EditorView.updateListener.of(update => {
          const query = getSearchQuery(update.state);
          if (update.docChanged || query !== getSearchQuery(update.startState)) {
            onSearchResult(query.valid && !query.getCursor(update.state.doc).next().done);
          }
        }),
      ],
    }),
  });
}

/** Update in place, retaining selection offsets and the viewport anchor where valid. */
export function updateReadOnlyDocument(view: EditorView, content: string): void {
  const previous = view.state.sliceDoc();
  if (previous === content) return;
  let from = 0;
  while (from < previous.length && from < content.length && previous[from] === content[from]) from++;
  let oldEnd = previous.length;
  let newEnd = content.length;
  while (oldEnd > from && newEnd > from && previous[oldEnd - 1] === content[newEnd - 1]) { oldEnd--; newEnd--; }
  const changes = view.state.changes({ from, to: oldEnd, insert: content.slice(from, newEnd) });
  const selection = EditorSelection.create(view.state.selection.ranges.map(range => EditorSelection.range(
    Math.min(range.anchor, content.length), Math.min(range.head, content.length),
  )), view.state.selection.mainIndex);
  // Map only the length difference: retain the old scroll offset even if all
  // surrounding text changed, and clamp anchors removed by a shorter document.
  const sizeChange = ChangeSet.of({
    from: Math.min(previous.length, content.length), to: previous.length,
    insert: content.length > previous.length ? content.slice(previous.length) : '',
  }, previous.length, '\n');
  const snapshot = previous.length ? view.scrollSnapshot().map(sizeChange) : undefined;
  view.dispatch({ changes, selection, effects: snapshot ? [snapshot] : [], annotations: fileRefresh.of(true) });
}
