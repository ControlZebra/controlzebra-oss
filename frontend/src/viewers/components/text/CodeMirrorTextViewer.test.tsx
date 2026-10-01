import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { deleteCharForward, insertNewline, selectAll } from '@codemirror/commands';
import CodeMirrorTextViewer from './CodeMirrorTextViewer';

function currentView(container: HTMLElement): EditorView {
  return EditorView.findFromDOM(container.querySelector('.cm-content') as HTMLElement)!;
}
afterEach(() => vi.restoreAllMocks());

describe('CodeMirror text surface', () => {
  it('blocks edits, paste, cut and drop while copying the complete offscreen selection verbatim', () => {
    const content = 'first\r\n' + 'middle\n'.repeat(10000) + 'last\r\n';
    const { container } = render(<CodeMirrorTextViewer content={content} />);
    const view = currentView(container);
    expect(view.state.readOnly).toBe(true);
    expect(view.contentDOM).toHaveAttribute('contenteditable', 'false');
    expect(view.contentDOM).toHaveAttribute('tabindex', '0');
    expect(view.state.sliceDoc()).toBe(content);
    act(() => {
      view.focus();
      view.dispatch({ changes: { from: 0, insert: 'blocked' } });
      insertNewline(view);
      deleteCharForward(view);
    });
    fireEvent.keyDown(view.contentDOM, { key: 'a', ctrlKey: true });
    expect(view.state.selection.main.to).toBe(content.length);
    const setData = vi.fn();
    fireEvent.copy(view.contentDOM, { clipboardData: { clearData: vi.fn(), setData } });
    expect(setData).toHaveBeenCalledWith('text/plain', content);
    fireEvent.cut(view.contentDOM, { clipboardData: { clearData: vi.fn(), setData } });
    fireEvent.paste(view.contentDOM, { clipboardData: { getData: () => 'blocked' } });
    fireEvent.drop(view.contentDOM, { dataTransfer: { getData: () => 'blocked', files: [] } });
    fireEvent.keyDown(view.contentDOM, { key: 'x' });
    expect(view.state.sliceDoc()).toBe(content);
    // Structural regression guard only; jsdom cannot establish actual layout/timing.
    expect(container.querySelectorAll('.cm-line').length).toBeLessThan(1000);
  });

  it('finds offscreen matches, navigates in both directions and announces no results without Replace', () => {
    const content = 'needle\n' + 'other\n'.repeat(10000) + 'needle';
    const { container } = render(<CodeMirrorTextViewer content={content} />);
    const view = currentView(container);
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    const input = screen.getByRole('textbox', { name: 'Find in file' });
    fireEvent.change(input, { target: { value: 'needle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(view.state.selection.main.from).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(view.state.selection.main.from).toBe(content.length - 6);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(view.state.selection.main.from).toBe(0);
    fireEvent.change(input, { target: { value: 'absent' } });
    expect(screen.getByRole('status')).toHaveTextContent('No results');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText(/replace/i)).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Find in file' })).not.toBeInTheDocument();
    expect(view.contentDOM).toHaveFocus();
  });

  it('validates one-based Go to Line and reaches a distant line with the keyboard', () => {
    const { container } = render(<CodeMirrorTextViewer content={'line\n'.repeat(10000)} />);
    const view = currentView(container);
    act(() => view.focus());
    fireEvent.keyDown(view.contentDOM, { key: 'g', ctrlKey: true, altKey: true });
    const input = screen.getByRole('textbox', { name: 'Line number' });
    expect(input).toHaveFocus();
    for (const value of ['0', '-1', '10002', '1.5', 'abc', '']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.submit(input.closest('form')!);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('status')).toHaveTextContent('Enter a line number from 1 to 10001.');
      expect(view.state.selection.main.head).toBe(0);
    }
    fireEvent.change(input, { target: { value: '9999' } });
    fireEvent.submit(input.closest('form')!);
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(9999);
    expect(screen.queryByRole('textbox', { name: 'Line number' })).not.toBeInTheDocument();
    expect(view.contentDOM).toHaveFocus();
  });

  it('scopes shortcuts to the viewer and closes navigation with Escape', () => {
    const outside = vi.fn();
    const { container } = render(<div onKeyDown={outside}><input aria-label="Outside" /><CodeMirrorTextViewer content="one\ntwo" /></div>);
    const view = currentView(container);
    fireEvent.keyDown(screen.getByLabelText('Outside'), { key: 'f', ctrlKey: true });
    expect(screen.queryByLabelText('Find in file')).not.toBeInTheDocument();
    outside.mockClear();
    fireEvent.keyDown(view.contentDOM, { key: 'f', ctrlKey: true });
    expect(screen.getByLabelText('Find in file')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Line' }));
    expect(screen.queryByLabelText('Find in file')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('Line number'), { key: 'Escape' });
    expect(screen.queryByLabelText('Line number')).not.toBeInTheDocument();
    expect(outside).not.toHaveBeenCalled();
  });

  it('updates in place, clamps selection after shrink, updates search results and destroys on unmount', () => {
    const { container, rerender, unmount } = render(<CodeMirrorTextViewer content="first\nsecond\nlast" />);
    const view = currentView(container);
    const destroy = vi.spyOn(view, 'destroy');
    act(() => view.dispatch({ selection: { anchor: 7, head: 15 } }));
    rerender(<CodeMirrorTextViewer content="first\nsecond\nlast" />);
    expect(currentView(container)).toBe(view);
    expect(view.state.selection.main.anchor).toBe(7);
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    fireEvent.change(screen.getByLabelText('Find in file'), { target: { value: 'second' } });
    rerender(<CodeMirrorTextViewer content="tiny" />);
    expect(currentView(container)).toBe(view);
    expect(view.state.selection.main.anchor).toBe(4);
    expect(view.state.selection.main.head).toBe(4);
    expect(screen.getByRole('status')).toHaveTextContent('No results');
    unmount();
    expect(destroy).toHaveBeenCalledOnce();
    expect(container.querySelector('.cm-editor')).toBeNull();
  });

  it('keeps an empty file selectable and handles a long unwrapped line', () => {
    const { container, rerender } = render(<CodeMirrorTextViewer content="" />);
    expect(screen.getByText('This file is empty.')).toBeInTheDocument();
    const content = 'long line '.repeat(20000);
    rerender(<CodeMirrorTextViewer content={content} />);
    const view = currentView(container);
    expect(view.state.doc.lines).toBe(1);
    expect(view.lineWrapping).toBe(false);
    act(() => selectAll(view));
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(content);
  });
});
