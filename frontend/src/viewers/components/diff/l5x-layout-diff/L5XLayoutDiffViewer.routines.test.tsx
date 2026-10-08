import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import L5XLayoutDiffViewer, { clearL5XLayoutDiffCache } from './L5XLayoutDiffViewer';
import { clearCachedL5XDiffTabState } from './useDiffTabs';
import { loadTextSide } from '../diff-side-loaders';
import { routineXml, sourceXml } from './routine-fixtures.test-support';

const state = vi.hoisted(() => ({ theme: 'light' }));
vi.mock('../../../../context/LayoutContext', () => ({ useLayout: () => ({ theme: state.theme }) }));
vi.mock('../diff-side-loaders', async importOriginal => ({ ...await importOriginal<typeof import('../diff-side-loaders')>(), loadTextSide: vi.fn() }));
const props = { repoPath: '/repo', filePath: 'Routines.L5X', fileStatus: 'modified',
  oldSide: { kind: 'ref' as const, ref: 'before', path: 'Routines.L5X' },
  newSide: { kind: 'ref' as const, ref: 'after', path: 'Routines.L5X' } };
const source = (version: 'old' | 'new') => sourceXml('program', routineXml('ST', version))
  .replace('</Controller>', sourceXml('aoi', routineXml('FBD', version)).match(/<AddOnInstructionDefinitions>[\s\S]*<\/AddOnInstructionDefinitions>/)![0] + '</Controller>');

beforeEach(() => {
  state.theme = 'light';
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  clearL5XLayoutDiffCache();
  clearCachedL5XDiffTabState('/repo|Routines.L5X');
  vi.mocked(loadTextSide).mockReset().mockResolvedValueOnce(source('old')).mockResolvedValueOnce(source('new'));
});
afterEach(() => vi.unstubAllGlobals());

it('navigates same-name program/AOI routines, preserves FBD sheet and mode across tabs/theme changes, and reads each file side only once', async () => {
  const view = render(<L5XLayoutDiffViewer {...props} />);
  const program = await screen.findByRole('button', { name: 'Program Shared / Logic' });
  const aoi = screen.getByRole('button', { name: 'AOI Shared / Logic' });
  expect(program).toHaveAttribute('aria-pressed', 'true');
  expect(aoi).toHaveTextContent('FBDModified');
  fireEvent.click(aoi);
  const sheets = screen.getByRole('combobox', { name: 'FBD comparison' });
  fireEvent.change(sheets, { target: { value: within(sheets).getAllByRole('option')[1].getAttribute('value') } });
  const selectedSheet = (sheets as HTMLSelectElement).value;
  fireEvent.click(screen.getByRole('button', { name: 'Side by side' }));
  fireEvent.click(program);
  expect(screen.getByRole('region', { name: 'Program Shared / Logic comparison' })).toHaveTextContent('Output := 2;');
  fireEvent.click(aoi);
  expect(screen.getByRole('combobox', { name: 'FBD comparison' })).toHaveValue(selectedSheet);
  expect(screen.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true');
  state.theme = 'dark';
  view.rerender(<L5XLayoutDiffViewer {...props} />);
  expect(screen.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getAllByText('1 changed')).toHaveLength(2);
  expect(loadTextSide).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByRole('textbox', { name: 'Find changed entry' }), { target: { value: 'AOI' } });
  expect(screen.queryByRole('button', { name: 'Program Shared / Logic' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'AOI Shared / Logic' })).toBeInTheDocument();
});

it('retains added and deleted owner context in the organizer with one routine count per owner', async () => {
  vi.mocked(loadTextSide).mockReset()
    .mockResolvedValueOnce(sourceXml('program', routineXml('ST'), 'DeletedOwner'))
    .mockResolvedValueOnce(sourceXml('aoi', routineXml('FBD'), 'AddedOwner'));
  render(<L5XLayoutDiffViewer {...props} />);
  const removed = await screen.findByRole('button', { name: 'Program DeletedOwner / Logic' });
  const added = screen.getByRole('button', { name: 'AOI AddedOwner / Logic' });
  expect(removed).toHaveTextContent('Removed');
  expect(added).toHaveTextContent('Added');
  expect(within(screen.getByRole('button', { name: /Program DeletedOwner.*1 changed/ })).getByText('1 changed')).toBeVisible();
  expect(within(screen.getByRole('button', { name: /AOI AddedOwner.*1 changed/ })).getByText('1 changed')).toBeVisible();
  fireEvent.click(added);
  expect(screen.getByRole('region', { name: 'AOI AddedOwner / Logic comparison' })).toHaveTextContent('Added');
  expect(loadTextSide).toHaveBeenCalledTimes(2);
});
