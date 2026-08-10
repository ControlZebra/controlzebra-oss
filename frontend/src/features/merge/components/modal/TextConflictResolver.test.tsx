import { fireEvent, render, screen } from '@testing-library/react';
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

function ResolverHarness({ onApply, applyError }: {
  onApply: (content: string) => void;
  applyError?: string;
}): JSX.Element {
  const [draft, setDraft] = useState<TextConflictDraft>({
    path: data.path,
    resolutionToken: 'token-1',
    decisions: { 'region-1': { mode: 'unresolved' } },
  });

  const handleDecision = (regionId: string, decision: ConflictRegionDecision): void => {
    setDraft((current) => ({
      ...current,
      decisions: { ...current.decisions, [regionId]: decision },
    }));
  };

  return (
    <TextConflictResolver
      data={data}
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
});