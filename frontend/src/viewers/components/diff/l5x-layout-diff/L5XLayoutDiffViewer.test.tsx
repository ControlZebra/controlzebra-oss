import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDocumentString, diffControllers } from 'ladder-visualizer';
import type { DiffSide } from '../../../registry/diff-registry';
import { loadTextSide } from '../diff-side-loaders';
import L5XLayoutDiffViewer, { clearL5XLayoutDiffCache } from './L5XLayoutDiffViewer';
import { clearCachedL5XDiffTabState } from './useDiffTabs';

vi.mock('../../../../context/LayoutContext', () => ({ useLayout: () => ({ theme: 'light' }) }));
vi.mock('../diff-side-loaders', async importOriginal => ({
  ...await importOriginal<typeof import('../diff-side-loaders')>(), loadTextSide: vi.fn(),
}));
vi.mock('ladder-visualizer', async importOriginal => {
  const actual = await importOriginal<typeof import('ladder-visualizer')>();
  return { ...actual, parseDocumentString: vi.fn(actual.parseDocumentString), diffControllers: vi.fn(actual.diffControllers) };
});
vi.mock('./RoutineDiffInspector', () => ({
  RoutineDiffInspector: ({ entity }: { entity: { newRoutine?: { rungs: Array<{ raw: string }> }; oldRoutine?: { rungs: Array<{ raw: string }> } } }) =>
    <div>{(entity.newRoutine ?? entity.oldRoutine)?.rungs[0]?.raw}</div>,
}));
vi.mock('../../shared/L5XProjectOrganizer', () => ({ default: () => <div>Changed items</div> }));

const fixture = (name: string) => readFileSync(`src/viewers/components/shared/__fixtures__/l5x/${name}.L5X`, 'utf8');
const source = fixture('controller-rll-v35');
const oldSide: DiffSide = { kind: 'ref', ref: 'before', path: 'Main.L5X' };
const newSide: DiffSide = { kind: 'working', absolutePath: '/repo/Main.L5X', path: 'Main.L5X' };
const props = { repoPath: '/repo', filePath: 'Main.L5X', oldSide, newSide, fileStatus: 'modified' };
const notices = (label: string) => screen.getByRole('region', { name: `${label} parser status` });

describe('L5X document diff loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearL5XLayoutDiffCache();
    clearCachedL5XDiffTabState('/repo|Main.L5X');
    vi.mocked(loadTextSide).mockResolvedValue(source);
  });

  it('keeps each side’s diagnostics and source locations separate, and does not compare a failed side', async () => {
    vi.mocked(loadTextSide)
      .mockResolvedValueOnce(fixture('document-envelope-v35'))
      .mockResolvedValueOnce(fixture('malformed-truncated-v35'));
    const raw = vi.fn();
    render(<L5XLayoutDiffViewer {...props} onShowRaw={raw} />);
    await screen.findByText(/A structured comparison is unavailable/);
    expect(notices('Previous version')).toHaveTextContent('Some content is available only in Raw');
    expect(notices('Previous version')).not.toHaveTextContent('Cannot parse L5X file');
    expect(notices('Current version')).toHaveTextContent('Cannot parse L5X file');
    expect(notices('Current version')).toHaveTextContent(/Line \d+, column \d+/);
    expect(diffControllers).not.toHaveBeenCalled();
    fireEvent.click(within(notices('Current version')).getByRole('button', { name: 'View Raw' }));
    expect(raw).toHaveBeenCalledOnce();
  });

  it.each(['added', 'deleted'])('represents the absent side of a %s file without reading or parsing it', async status => {
    const missing: DiffSide = { kind: 'missing', path: 'Main.L5X' };
    render(<L5XLayoutDiffViewer {...props} fileStatus={status}
      oldSide={status === 'added' ? missing : oldSide} newSide={status === 'deleted' ? missing : newSide} />);
    await screen.findByText('Changed items');
    expect(notices(status === 'added' ? 'Previous version' : 'Current version')).toHaveTextContent('File absent');
    expect(loadTextSide).toHaveBeenCalledTimes(1);
    expect(parseDocumentString).toHaveBeenCalledTimes(1);
    expect(diffControllers).toHaveBeenCalledOnce();
    const [before, after] = vi.mocked(diffControllers).mock.calls[0];
    expect((status === 'added' ? before : after).programs).toEqual([]);
    expect((status === 'added' ? after : before).programs.length).toBeGreaterThan(0);
  });

  it('retains encoded targets in each cached result and avoids a misleading empty comparison', async () => {
    vi.mocked(loadTextSide).mockResolvedValue(fixture('document-encoded-v35'));
    const view = render(<L5XLayoutDiffViewer {...props} />);
    await screen.findByText(/A structured comparison is unavailable/);
    expect(notices('Previous version')).toHaveTextContent('Encoded content is preserved');
    expect(notices('Current version')).toHaveTextContent('Some content is available only in Raw');
    view.unmount();
    render(<L5XLayoutDiffViewer {...props} />);
    await screen.findByText(/A structured comparison is unavailable/);
    expect(loadTextSide).toHaveBeenCalledTimes(2);
    expect(parseDocumentString).toHaveBeenCalledTimes(2);
    expect(diffControllers).not.toHaveBeenCalled();
  });

  it('reloads both sides and preserves the active routine selection', async () => {
    const changed = source.replace('OTE(ProgramReady)', 'OTE(UpdatedOutput)');
    vi.mocked(loadTextSide).mockResolvedValueOnce(source).mockResolvedValueOnce(changed);
    const view = render(<L5XLayoutDiffViewer {...props} />);
    await screen.findByText(/OTE\(UpdatedOutput\)/);
    const revised = source.replace('OTE(ProgramReady)', 'OTE(ReloadedOutput)');
    vi.mocked(loadTextSide).mockResolvedValueOnce(source).mockResolvedValueOnce(revised);
    view.rerender(<L5XLayoutDiffViewer {...props} reloadToken={1} />);
    await screen.findByText(/OTE\(ReloadedOutput\)/);
    expect(loadTextSide).toHaveBeenCalledTimes(4);
    expect(parseDocumentString).toHaveBeenCalledTimes(4);
    expect(screen.queryByText(/OTE\(UpdatedOutput\)/)).not.toBeInTheDocument();
  });

  it('reuses the previous document across comparisons without borrowing its datatype catalog', async () => {
    vi.mocked(loadTextSide).mockResolvedValueOnce(fixture('datatype-v35')).mockResolvedValueOnce(source);
    const view = render(<L5XLayoutDiffViewer {...props} />);
    await screen.findByText('Changed items');
    view.unmount();
    vi.mocked(loadTextSide).mockResolvedValueOnce(fixture('document-envelope-v35'));
    render(<L5XLayoutDiffViewer {...props} newSide={{ kind: 'ref', ref: 'after', path: 'Main.L5X' }} />);
    await waitFor(() => expect(diffControllers).toHaveBeenCalledTimes(2));
    expect(loadTextSide).toHaveBeenCalledTimes(3);
    const [before, after] = vi.mocked(diffControllers).mock.calls[1];
    expect(before.dataTypes[0].name).not.toBe(after.dataTypes[0].name);
    expect(notices('Previous version')).not.toHaveTextContent('FixtureOwner');
    expect(notices('Current version')).toHaveTextContent('Some content is available only in Raw');
  });

  it('drops a stale pending comparison when the request changes', async () => {
    let resolveOld!: (content: string) => void;
    vi.mocked(loadTextSide).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const view = render(<L5XLayoutDiffViewer {...props} />);
    view.rerender(<L5XLayoutDiffViewer {...props} oldSide={{ ...oldSide, ref: 'different' } as DiffSide} />);
    await screen.findByText(/No changes in supported comparisons/);
    await act(async () => resolveOld(fixture('malformed-truncated-v35')));
    expect(notices('Previous version')).toHaveTextContent('Supported content loaded');
    expect(parseDocumentString).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Cannot parse L5X file')).not.toBeInTheDocument();
  });

  it('handles a backend-reported missing side without attaching the other side’s notices', async () => {
    vi.mocked(loadTextSide).mockResolvedValueOnce(null).mockResolvedValueOnce(fixture('document-envelope-v35'));
    render(<L5XLayoutDiffViewer {...props} />);
    await screen.findByText('Changed items');
    expect(notices('Previous version')).toHaveTextContent('File absent');
    expect(within(notices('Previous version')).queryByText(/parser notices/)).not.toBeInTheDocument();
    expect(notices('Current version')).toHaveTextContent('Some content is available only in Raw');
    expect(parseDocumentString).toHaveBeenCalledTimes(1);
  });

  it('shows a recovery message for read errors and retries the same comparison', async () => {
    vi.mocked(loadTextSide).mockRejectedValueOnce(new Error('fatal: raw backend failure'));
    render(<L5XLayoutDiffViewer {...props} />);
    await screen.findByText('Cannot generate L5X diff');
    expect(screen.queryByText(/raw backend failure/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText(/No changes in supported comparisons/);
    expect(loadTextSide).toHaveBeenLastCalledWith('/repo', newSide);
  });
});
