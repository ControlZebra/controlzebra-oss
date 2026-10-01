import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { EditorView, runScopeHandlers, type KeyBinding } from '@codemirror/view';
import { SearchQuery, findNext, findPrevious, getSearchQuery, setSearchQuery } from '@codemirror/search';
import { Button } from '../../../shared/ui/button';
import { Input } from '../../../shared/ui/input';
import { createReadOnlyEditor, updateReadOnlyDocument } from './read-only-editor';

type Panel = 'find' | 'line' | null;

/** Reusable text surface. File reads, caching and watcher subscriptions belong to its caller. */
function CodeMirrorTextViewer({ content }: { content: string }): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const activePanel = useRef<Panel>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [line, setLine] = useState('1');
  const [lineError, setLineError] = useState('');
  const [hasMatch, setHasMatch] = useState(false);
  const inputId = useId();
  const statusId = useId();

  const openPanel = useCallback((next: Panel) => {
    activePanel.current = next;
    setPanel(next);
    setLineError('');
    if (next === 'line' && editor.current) {
      setLine(String(editor.current.state.doc.lineAt(editor.current.state.selection.main.head).number));
    }
    // Repeated keyboard shortcuts should focus an already open field, too.
    if (next) field.current?.focus();
    return true;
  }, []);
  const openFind = useCallback(() => openPanel('find'), [openPanel]);
  const openLine = useCallback(() => openPanel('line'), [openPanel]);
  const closePanel = useCallback(() => {
    if (!activePanel.current) return false;
    openPanel(null);
    editor.current?.focus();
    return true;
  }, [openPanel]);
  const navigate = useCallback((previous: boolean) => {
    const view = editor.current;
    if (!view || !getSearchQuery(view.state).valid) return openFind();
    (previous ? findPrevious : findNext)(view);
    return true;
  }, [openFind]);
  const nextMatch = useCallback(() => navigate(false), [navigate]);
  const previousMatch = useCallback(() => navigate(true), [navigate]);

  useLayoutEffect(() => {
    if (!host.current) return;
    const shortcuts: KeyBinding[] = [
      { key: 'Mod-f', run: openFind },
      { key: 'Mod-g', run: nextMatch, shift: previousMatch },
      { key: 'F3', run: nextMatch, shift: previousMatch },
      { key: 'Mod-Alt-g', run: openLine },
      { key: 'Escape', run: closePanel },
    ].map(binding => ({ ...binding, scope: 'editor text-viewer', preventDefault: true, stopPropagation: true }));
    const view = createReadOnlyEditor(host.current, shortcuts, setHasMatch);
    editor.current = view;
    return () => { editor.current = null; view.destroy(); };
  }, [openFind, openLine, closePanel, nextMatch, previousMatch]);

  useLayoutEffect(() => {
    if (editor.current) updateReadOnlyDocument(editor.current, content);
  }, [content]);
  useEffect(() => { if (panel) { field.current?.focus(); field.current?.select(); } }, [panel]);

  const changeQuery = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    editor.current?.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: value, literal: true })) });
  }, []);
  const changeLine = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setLine(event.target.value);
    setLineError('');
  }, []);
  const submit = useCallback((event: FormEvent) => {
    event.preventDefault();
    if (panel === 'find') { nextMatch(); return; }
    const view = editor.current;
    if (!view) return;
    const number = Number(line.trim());
    if (!/^\d+$/.test(line.trim()) || !Number.isSafeInteger(number) || number < 1 || number > view.state.doc.lines) {
      setLineError(`Enter a line number from 1 to ${view.state.doc.lines}.`);
      return;
    }
    const anchor = view.state.doc.line(number).from;
    view.dispatch({ selection: { anchor }, effects: EditorView.scrollIntoView(anchor, { y: 'center' }) });
    closePanel();
  }, [panel, nextMatch, line, closePanel]);
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const view = editor.current;
    if (!view) return;
    if (!event.defaultPrevented && runScopeHandlers(view, event.nativeEvent, 'text-viewer')) event.preventDefault();
    if (panel === 'find' && event.key === 'Enter' && event.shiftKey) { event.preventDefault(); previousMatch(); }
    // Keep viewer keystrokes out of file-browser/global navigation handlers.
    event.stopPropagation();
  }, [panel, previousMatch]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-theme-surface" onKeyDown={handleKeyDown}>
      <div className="flex shrink-0 items-center gap-1 border-b border-theme-default px-2 py-1">
        <Button variant="ghost" size="sm" onClick={openFind} title="Find (Ctrl+F / ⌘F)">Find</Button>
        <Button variant="ghost" size="sm" onClick={openLine} title="Go to Line (Ctrl+Alt+G / ⌘⌥G)">Go to Line</Button>
        {content.length === 0 && <span className="ml-2 text-xs text-theme-muted">This file is empty.</span>}
      </div>
      {panel && (
        <form onSubmit={submit} className="flex shrink-0 flex-wrap items-center gap-2 border-b border-theme-default p-2">
          <label htmlFor={inputId} className="text-xs text-theme-secondary">{panel === 'find' ? 'Find in file' : 'Line number'}</label>
          <Input id={inputId} ref={field} className="h-7 w-48" value={panel === 'find' ? query : line}
            onChange={panel === 'find' ? changeQuery : changeLine} inputMode={panel === 'line' ? 'numeric' : 'text'}
            aria-invalid={panel === 'line' && !!lineError} aria-describedby={statusId} autoComplete="off" />
          {panel === 'find' ? <>
            <Button type="button" variant="secondary" size="sm" onClick={previousMatch} disabled={!hasMatch}>Previous</Button>
            <Button type="submit" variant="secondary" size="sm" disabled={!hasMatch}>Next</Button>
          </> : <Button type="submit" variant="secondary" size="sm">Go</Button>}
          <Button type="button" variant="ghost" size="sm" onClick={closePanel}>Close</Button>
          <span id={statusId} role="status" className="text-xs text-theme-secondary">
            {panel === 'find' ? (query && !hasMatch ? 'No results' : '') : lineError}
          </span>
        </form>
      )}
      <div ref={host} className="min-h-0 min-w-0 flex-1 overflow-hidden" />
    </div>
  );
}

export default memo(CodeMirrorTextViewer);
