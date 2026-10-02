import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChangedFilesTable from './ChangedFilesTable';
import type { FileStatus } from '../../../context';

const file: FileStatus = {
  path: 'C:\\projects\\line\\logic\\valve.L5X',
  name: 'valve.L5X',
  status: 'modified',
};

function setup(disabled = false) {
  const callbacks = {
    onOpenDiff: vi.fn(),
    onDiscardFile: vi.fn().mockResolvedValue(undefined),
    onDiscardAll: vi.fn(),
  };
  render(
    <ChangedFilesTable
      files={[file]}
      repoPath="C:/projects/line"
      disabled={disabled}
      {...callbacks}
    />
  );
  return callbacks;
}

describe('changed files table', () => {
  it('shows repository-relative folders and retains review/discard actions', () => {
    const callbacks = setup();
    expect(screen.getByRole('table', { name: 'Changed files' })).toBeInTheDocument();
    expect(screen.getByText('logic')).toBeInTheDocument();
    expect(screen.queryByText(/C:\\projects/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View changes: logic/valve.L5X' }));
    expect(callbacks.onOpenDiff).toHaveBeenCalledWith(file);
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes: logic/valve.L5X' }));
    expect(callbacks.onDiscardFile).toHaveBeenCalledWith(file);
    fireEvent.click(screen.getByRole('button', { name: 'Discard all changes' }));
    expect(callbacks.onDiscardAll).toHaveBeenCalledTimes(1);
  });
  it('keeps review available but disables destructive actions during operations', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'View changes: logic/valve.L5X' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard changes: logic/valve.L5X' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard all changes' })).toBeDisabled();
  });
});
