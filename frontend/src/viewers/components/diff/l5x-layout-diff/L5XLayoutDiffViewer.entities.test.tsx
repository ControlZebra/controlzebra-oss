import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import L5XLayoutDiffViewer, { clearL5XLayoutDiffCache } from './L5XLayoutDiffViewer';
import { clearCachedL5XDiffTabState } from './useDiffTabs';
import { loadTextSide } from '../diff-side-loaders';
import { sourceXml } from './routine-fixtures.test-support';

const state = vi.hoisted(() => ({ theme: 'light' }));
vi.mock('../../../../context/LayoutContext', () => ({ useLayout: () => ({ theme: state.theme }) }));
vi.mock('../diff-side-loaders', async importOriginal => ({ ...await importOriginal<typeof import('../diff-side-loaders')>(), loadTextSide: vi.fn() }));
const props = { repoPath: '/repo', filePath: 'Entities.L5X', fileStatus: 'modified',
  oldSide: { kind: 'ref' as const, ref: 'before', path: 'Entities.L5X' },
  newSide: { kind: 'working' as const, absolutePath: '/repo/Entities.L5X', path: 'Entities.L5X' } };
const source = (current: boolean, catalog = 'OldDevice') => sourceXml('program', '')
  .replace('<Program Name="Shared">', `<Program Name="Shared" Disabled="${current}">`)
  .replace('</Controller>', `<Modules><Module Name="Device" CatalogNumber="${catalog}" Inhibited="${current}" MajorFault="false" SafetyEnabled="false"><Ports /></Module></Modules></Controller>`);

beforeEach(() => {
  state.theme = 'light';
  clearL5XLayoutDiffCache();
  clearCachedL5XDiffTabState('/repo|Entities.L5X');
  vi.mocked(loadTextSide).mockReset().mockResolvedValueOnce(source(false)).mockResolvedValueOnce(source(true, 'NewDevice'));
});

it('navigates property-only changes, preserves active metadata through theme, reload and cached reopen, and prunes removed entries', async () => {
  const view = render(<L5XLayoutDiffViewer {...props} />);
  const program = await screen.findByRole('button', { name: 'Program Properties / Shared Program' });
  expect(program).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('row', { name: 'disabled false true' })).toBeVisible();
  const module = screen.getByRole('button', { name: 'Modules / Device Module' });
  fireEvent.click(module);
  expect(screen.getByRole('region', { name: 'Device Module comparison' })).toHaveTextContent('NewDevice');
  state.theme = 'dark';
  view.rerender(<L5XLayoutDiffViewer {...props} />);
  expect(module).toHaveAttribute('aria-pressed', 'true');
  vi.mocked(loadTextSide).mockResolvedValueOnce(source(false)).mockResolvedValueOnce(source(true, 'ReloadedDevice'));
  view.rerender(<L5XLayoutDiffViewer {...props} reloadToken={1} />);
  await screen.findByRole('row', { name: 'catalogNumber OldDevice ReloadedDevice' });
  expect(screen.getByRole('button', { name: 'Modules / Device Module' })).toHaveAttribute('aria-pressed', 'true');
  expect(loadTextSide).toHaveBeenCalledTimes(4);
  view.unmount();
  const reopened = render(<L5XLayoutDiffViewer {...props} />);
  await screen.findByRole('row', { name: 'catalogNumber OldDevice ReloadedDevice' });
  expect(loadTextSide).toHaveBeenCalledTimes(4);
  vi.mocked(loadTextSide).mockResolvedValueOnce(source(false)).mockResolvedValueOnce(source(true));
  reopened.rerender(<L5XLayoutDiffViewer {...props} reloadToken={2} />);
  await screen.findByRole('row', { name: 'inhibited false true' });
  // Remove the module change while retaining program metadata.
  vi.mocked(loadTextSide).mockResolvedValueOnce(source(false)).mockResolvedValueOnce(source(false).replace('Disabled="false"', 'Disabled="true"'));
  reopened.rerender(<L5XLayoutDiffViewer {...props} reloadToken={3} />);
  const comparison = await screen.findByRole('region', { name: 'Shared Program comparison' });
  expect(within(comparison).getByRole('row', { name: 'disabled false true' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Modules / Device Module' })).not.toBeInTheDocument();
});
