import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type {
  ConflictRegionDecision,
  ConflictResolutionData,
  TextConflictDraft,
} from '../../types';
import TextConflictResolver from './TextConflictResolver';

const data: ConflictResolutionData = {
  success: true,
  path: 'notes/process.txt',
  status: 'both-modified',
  eligible: true,
  base: { present: true },
  current: { present: true },
  incoming: { present: true },
  segments: [
    { kind: 'context', text: 'header\n' },
    {
      kind: 'conflict',
      conflict: {
        id: 'region-1',
        current: ['current setting'],
        base: ['old setting'],
        incoming: ['incoming setting'],
      },
    },
    { kind: 'context', text: 'footer\n' },
  ],
  resolutionToken: 'token-1',
  newline: '\n',
  hasFinalNewline: true,
};

function ResolverHarness({ onApply, applyError, resolutionData = data }: {
  onApply: (content: string) => void;
  applyError?: string;
  resolutionData?: ConflictResolutionData;
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

  const handleDecision = (regionId: string, decision: ConflictRegionDecision): void => {
    setDraft((current) => ({
      ...current,
      decisions: { ...current.decisions, [regionId]: decision },
    }));
  };

  return (
    <TextConflictResolver
      data={resolutionData}
      draft={draft}
      disabled={false}
      applyError={applyError}
      onDecision={handleDecision}
      onApply={onApply}
    />
  );
}

describe('TextConflictResolver', () => {
  it('keeps Resolve File disabled until a choice produces a complete preview', () => {
    const onApply = vi.fn();
    render(<ResolverHarness onApply={onApply} />);

    const resolveButton = screen.getByRole('button', { name: 'Resolve File' });
    expect(resolveButton).toBeDisabled();
    expect(screen.getByLabelText('Resolved file preview')).toHaveTextContent('Choose Current or Incoming');

    fireEvent.click(screen.getByRole('button', { name: /Use Current/ }));

    expect(resolveButton).toBeEnabled();
    expect(screen.getByLabelText('Resolved file preview')).toHaveTextContent('header current setting footer');

    fireEvent.click(resolveButton);
    expect(onApply).toHaveBeenCalledWith('header\ncurrent setting\nfooter\n');
  });

  it('shows an inline retry message without clearing the selected choice', () => {
    render(
      <ResolverHarness
        onApply={vi.fn()}
        applyError={"We couldn't resolve this file.\nReview your choice and select Resolve File to try again."}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Use Incoming/ }));

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't resolve this file");
    expect(screen.getByRole('button', { name: /Use Incoming/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Resolve File' })).toBeEnabled();
  });

  it('shows one conflict at a time and keeps decisions while navigating', () => {
    const resolutionData: ConflictResolutionData = {
      ...data,
      segments: [
        { kind: 'context', text: 'header\n' },
        {
          kind: 'conflict',
          conflict: {
            id: 'region-1',
            current: ['current first'],
            base: ['old first'],
            incoming: ['incoming first'],
          },
        },
        { kind: 'context', text: 'middle\n' },
        {
          kind: 'conflict',
          conflict: {
            id: 'region-2',
            current: ['current second'],
            base: ['old second'],
            incoming: ['incoming second'],
          },
        },
        { kind: 'context', text: 'footer\n' },
      ],
    };

    render(<ResolverHarness onApply={vi.fn()} resolutionData={resolutionData} />);

    expect(screen.getByText('Conflict 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('current first')).toBeInTheDocument();
    expect(screen.queryByText('current second')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Use Current/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next conflict' }));

    expect(screen.getByText('Conflict 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('current second')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use Incoming/ }));

    expect(screen.getByRole('button', { name: 'Resolve File' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous conflict' }));
    expect(screen.getByRole('button', { name: /Use Current/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('inherits a block choice in line mode and allows lines from both sides', () => {
    const resolutionData: ConflictResolutionData = {
      ...data,
      segments: [
        {
          kind: 'conflict',
          conflict: {
            id: 'region-1',
            current: ['current one', 'current two'],
            base: ['old'],
            incoming: ['incoming one', 'incoming two'],
          },
        },
      ],
      hasFinalNewline: false,
    };
    const onApply = vi.fn();

    render(<ResolverHarness onApply={onApply} resolutionData={resolutionData} />);

    fireEvent.click(screen.getByRole('button', { name: /Use Current/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose individual lines' }));

    expect(screen.getByRole('checkbox', { name: /Current line 1/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Current line 2/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Incoming line 1/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: /Current line 2/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Incoming line 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide line choices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose individual lines' }));

    expect(screen.getByRole('checkbox', { name: /Current line 2/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Incoming line 1/ })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Resolve File' }));
    expect(onApply).toHaveBeenCalledWith('current one\nincoming one');
  });

  it('requires confirmation before explicitly removing a conflict section', async () => {
    const onApply = vi.fn();
    render(<ResolverHarness onApply={onApply} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove this section' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove this section?');
    expect(screen.getByRole('button', { name: 'Resolve File' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove section' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Section removed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve File' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve File' }));
    expect(onApply).toHaveBeenCalledWith('header\nfooter\n');
  });

  it('fills every conflict from one side and confirms before replacing detailed choices', async () => {
    const resolutionData: ConflictResolutionData = {
      ...data,
      segments: [
        {
          kind: 'conflict',
          conflict: { id: 'region-1', current: ['current one'], base: [], incoming: ['incoming one'] },
        },
        { kind: 'context', text: 'middle\n' },
        {
          kind: 'conflict',
          conflict: { id: 'region-2', current: ['current two'], base: [], incoming: ['incoming two'] },
        },
      ],
      hasFinalNewline: false,
    };
    const onApply = vi.fn();

    render(<ResolverHarness onApply={onApply} resolutionData={resolutionData} />);

    fireEvent.click(screen.getByRole('button', { name: 'Use all Current' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve File' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Use all Incoming' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Replace your section choices?');
    fireEvent.click(screen.getByRole('button', { name: 'Replace choices' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve File' }));
    expect(onApply).toHaveBeenCalledWith('incoming one\nmiddle\nincoming two');
  });
});