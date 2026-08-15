import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConflictRegionDecision,
  ConflictResolutionData,
  TextConflictDraft,
} from '../../types';
import L5XConflictResolver from './L5XConflictResolver';

const classifyRegionMock = vi.fn();
const validateComposedDocumentMock = vi.fn();

vi.mock('ladder-visualizer', () => ({
  l5xConflictVisualAdapter: {
    format: 'l5x',
    classifyRegion: (...args: unknown[]) => classifyRegionMock(...args),
    validateComposedDocument: (...args: unknown[]) => validateComposedDocumentMock(...args),
  },
  VirtualizedLadderDiagram: ({ rungs }: { rungs: Array<{ number: number; comment?: string }> }) => (
    <div data-testid="rung-preview">rung-{rungs[0]?.number}{rungs[0]?.comment ? `-${rungs[0].comment}` : ''}</div>
  ),
  DARK_THEME: {},
  measureRoutineDiffRowHeight: () => 120,
}));

vi.mock('../../../../viewers/components/file/l5x/theme', () => ({
  CONTROL_ZEBRA_LADDER_THEME: {},
}));

vi.mock('../../../../context/LayoutContext', () => ({
  useLayout: () => ({ theme: 'light' }),
}));

function buildData(overrides?: Partial<ConflictResolutionData>): ConflictResolutionData {
  return {
    success: true,
    path: 'Programs/Main.L5X',
    status: 'both-modified',
    eligible: true,
    base: { present: true },
    current: { present: true },
    incoming: { present: true },
    segments: [
      { kind: 'context', text: '<Controller>\n' },
      {
        kind: 'conflict',
        conflict: {
          id: 'region-1',
          current: ['<Rung Number="0"><Text>XIC(A)OTE(B);</Text></Rung>'],
          base: [],
          incoming: ['<Rung Number="0"><Text>XIC(C)OTE(D);</Text></Rung>'],
        },
      },
      { kind: 'context', text: '</Controller>\n' },
    ],
    resolutionToken: 'token-1',
    newline: '\n',
    hasFinalNewline: true,
    ...overrides,
  };
}

function Harness({
  onApply,
  onResolveWholeFile = vi.fn(),
  resolutionData,
}: {
  onApply: (content: string) => void;
  onResolveWholeFile?: (strategy: 'mine' | 'theirs' | 'both') => void;
  resolutionData: ConflictResolutionData;
}): JSX.Element {
  const [draft, setDraft] = useState<TextConflictDraft>({
    path: resolutionData.path,
    resolutionToken: resolutionData.resolutionToken || '',
    decisions: Object.fromEntries(
      resolutionData.segments.flatMap((segment) => (
        segment.kind === 'conflict'
          ? [[segment.conflict.id, { mode: 'unresolved' } satisfies ConflictRegionDecision]]
          : []
      )),
    ),
  });

  return (
    <L5XConflictResolver
      data={resolutionData}
      draft={draft}
      disabled={false}
      onDecision={(regionId, decision) =>
        setDraft((current) => ({ ...current, decisions: { ...current.decisions, [regionId]: decision } }))
      }
      onApply={onApply}
      onResolveWholeFile={onResolveWholeFile}
    />
  );
}

describe('L5XConflictResolver', () => {
  beforeEach(() => {
    classifyRegionMock.mockReset();
    validateComposedDocumentMock.mockReset();
  });

  it('renders a rung preview for eligible regions and composes the selected side on apply', () => {
    classifyRegionMock.mockReturnValue({
      kind: 'ladder',
      current: { number: 0, comment: 'C', raw: 'raw', elements: [], instructions: [] },
      incoming: { number: 0, comment: 'I', raw: 'raw', elements: [], instructions: [] },
    });
    validateComposedDocumentMock.mockReturnValue({ valid: true });

    const onApply = vi.fn();
    render(<Harness onApply={onApply} resolutionData={buildData()} />);

    expect(screen.getAllByTestId('rung-preview')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Choose individual lines/ })).toBeNull();

    const resolveButton = screen.getByRole('button', { name: 'Resolve File' });
    expect(resolveButton).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Use Current' }));
    expect(resolveButton).toBeEnabled();

    fireEvent.click(resolveButton);
    expect(onApply).toHaveBeenCalledWith(
      '<Controller>\n<Rung Number="0"><Text>XIC(A)OTE(B);</Text></Rung>\n</Controller>\n',
    );
  });

  it('routes non-eligible regions to the text block with line-mode expansion', () => {
    classifyRegionMock.mockReturnValue({ reason: 'incomplete-unit' });
    validateComposedDocumentMock.mockReturnValue({ valid: true });

    render(<Harness onApply={vi.fn()} resolutionData={buildData()} />);

    expect(screen.queryByTestId('rung-preview')).toBeNull();
    expect(screen.getByRole('button', { name: /Choose individual lines/ })).toBeInTheDocument();
  });

  it('blocks apply when the composed document fails L5X validation', () => {
    classifyRegionMock.mockReturnValue({
      kind: 'ladder',
      current: { number: 0, raw: 'raw', elements: [], instructions: [] },
      incoming: { number: 0, raw: 'raw', elements: [], instructions: [] },
    });
    validateComposedDocumentMock.mockReturnValue({ valid: false });

    const onApply = vi.fn();
    render(<Harness onApply={onApply} resolutionData={buildData()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Use Current' }));

    const resolveButton = screen.getByRole('button', { name: 'Resolve File' });
    expect(resolveButton).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/not a valid L5X document/);

    fireEvent.click(resolveButton);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('exposes persistent Keep Current File / Keep Incoming File actions and confirms before discarding drafts', () => {
    classifyRegionMock.mockReturnValue({
      kind: 'ladder',
      current: { number: 0, raw: 'raw', elements: [], instructions: [] },
      incoming: { number: 0, raw: 'raw', elements: [], instructions: [] },
    });
    validateComposedDocumentMock.mockReturnValue({ valid: true });

    const onResolveWholeFile = vi.fn();
    render(<Harness onApply={vi.fn()} onResolveWholeFile={onResolveWholeFile} resolutionData={buildData()} />);

    const keepCurrent = screen.getByRole('button', { name: 'Keep Current File' });
    expect(keepCurrent).toBeInTheDocument();

    fireEvent.click(keepCurrent);
    expect(onResolveWholeFile).toHaveBeenCalledWith('mine');

    onResolveWholeFile.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: 'Use Current' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep Incoming File' }));

    expect(onResolveWholeFile).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Replace file' });
    fireEvent.click(confirm);
    expect(onResolveWholeFile).toHaveBeenCalledWith('theirs');
  });
});
