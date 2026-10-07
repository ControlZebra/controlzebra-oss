import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffControllers, type NormalizedController, type NormalizedRoutineType } from 'ladder-visualizer';
import { buildL5XDiffLayoutViewModel } from './adapter';
import { RoutineDiffInspector } from './RoutineDiffInspector';
import { controller, routineXml } from './routine-fixtures.test-support';
import type { L5XDiffRoutineEntity, RoutineOwnerKind } from './types';

function entity(before: NormalizedController, after: NormalizedController): L5XDiffRoutineEntity {
  const model = buildL5XDiffLayoutViewModel({ oldController: before, newController: after, diff: diffControllers(before, after) });
  const routine = Object.values(model.entitiesByTabId).find(item => item.kind === 'routine');
  if (!routine || routine.kind !== 'routine') throw new Error('Expected routine diff');
  return routine;
}

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());

for (const owner of ['program', 'aoi'] as RoutineOwnerKind[]) describe(`${owner} routine presentation`, () => {
  it('displays supplied ST text read-only without loading routine excerpts', () => {
    const routine = entity(controller(owner, routineXml('ST')), controller(owner, routineXml('ST', 'new')));
    routine.routineDiff.stDiff = { oldText: 'Supplied := OldValue;', newText: 'Supplied := NewValue;' };
    render(<RoutineDiffInspector entity={routine} isDarkMode={false} />);
    const old = screen.getByRole('region', { name: 'Previous version' });
    const newer = screen.getByRole('region', { name: 'Current version' });
    expect(old).toHaveTextContent('Supplied := OldValue;');
    expect(newer).toHaveTextContent('Supplied := NewValue;');
    expect(old.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false');
    expect(newer.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false');
    expect(screen.queryByText('Output := 1;')).not.toBeInTheDocument();
  });

  it.each(['added', 'removed'] as const)('distinguishes an absent %s ST side from an empty routine', kind => {
    const old = controller(owner, kind === 'added' ? '' : routineXml('ST'));
    const newer = controller(owner, kind === 'removed' ? '' : routineXml('ST', 'new'));
    render(<RoutineDiffInspector entity={entity(old, newer)} isDarkMode={false} />);
    expect(within(screen.getByRole('region', { name: kind === 'added' ? 'Previous version' : 'Current version' }))
      .getByText('Routine absent in this version.')).toBeInTheDocument();
    expect(screen.getByText(kind === 'added' ? 'Output := 2;' : 'Output := 1;')).toBeInTheDocument();
  });

  it('renders FBD logic changes and preserves full multi-sheet context with both view modes', () => {
    const routine = entity(controller(owner, routineXml('FBD')), controller(owner, routineXml('FBD', 'new')));
    const view = render(<RoutineDiffInspector entity={routine} isDarkMode={false} />);
    expect(screen.getByText('Logic changes')).toBeInTheDocument();
    const sheets = screen.getByRole('combobox', { name: 'FBD comparison' });
    expect(within(sheets).getAllByRole('option')).toHaveLength(2);
    fireEvent.change(sheets, { target: { value: within(sheets).getAllByRole('option')[1].getAttribute('value') } });
    const selected = (sheets as HTMLSelectElement).value;
    fireEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    expect(screen.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Older version')).toBeInTheDocument();
    expect(screen.getByLabelText('Newer version')).toBeInTheDocument();
    view.rerender(<RoutineDiffInspector entity={routine} isDarkMode />);
    expect(sheets).toHaveValue(selected);
    expect(screen.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true');
    expect(view.container.querySelector('.fbd-diff')).toHaveStyle({ '--fbd-background': 'var(--lv-bg-primary)' });
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }));
    expect(screen.getByLabelText('FBD overlay')).toBeInTheDocument();
  });

  it.each(['added', 'removed'] as const)('renders the available %s FBD version and its sheet context', kind => {
    const old = controller(owner, kind === 'added' ? '' : routineXml('FBD'));
    const newer = controller(owner, kind === 'removed' ? '' : routineXml('FBD', 'new'));
    render(<RoutineDiffInspector entity={entity(old, newer)} isDarkMode={false} />);
    expect(screen.getByRole('button', { name: 'Overlay' })).toBeInTheDocument();
    expect(within(screen.getByRole('combobox', { name: 'FBD comparison' })).getAllByRole('option')).toHaveLength(2);
  });

  it.each([['ST', 'FBD'], ['FBD', 'ST'], ['ST', 'RLL'], ['RLL', 'ST'], ['RLL', 'FBD'], ['FBD', 'RLL']] as const)
   ('shows both source types for %s to %s transitions', (oldType: NormalizedRoutineType, newType: NormalizedRoutineType) => {
      render(<RoutineDiffInspector entity={entity(controller(owner, routineXml(oldType)), controller(owner, routineXml(newType, 'new')))} isDarkMode={false} />);
      expect(within(screen.getByRole('region', { name: 'Previous version' })).getByText(`Previous version (${oldType})`)).toBeInTheDocument();
      expect(within(screen.getByRole('region', { name: 'Current version' })).getByText(`Current version (${newType})`)).toBeInTheDocument();
      expect(screen.queryByText(/No changed rung lines/)).not.toBeInTheDocument();
    });
});

it('reports presentation-only FBD changes from the supplied comparison', () => {
  const old = controller('program', routineXml('FBD'));
  const newer = structuredClone(old);
  newer.programs[0].routines[0].fbd!.sheets[0].elements[0].position!.x = '80';
  render(<RoutineDiffInspector entity={entity(old, newer)} isDarkMode={false} />);
  expect(screen.getByText('Presentation changes')).toBeInTheDocument();
});

it.each(['missing', 'duplicate'] as const)('keeps %s FBD source identities unpaired and exposes incomplete/unknown diagnostics', identity => {
  const old = controller('aoi', routineXml('FBD'));
  const newer = structuredClone(old);
  for (const side of [old, newer]) {
    const sheet = side.aois[0].routines[0].fbd!.sheets[0];
    if (identity === 'missing') delete sheet.elements[0].id;
    else sheet.elements.push(structuredClone(sheet.elements[0]));
  }
  const routine = entity(old, newer);
  expect(routine.routineDiff.fbdDiff?.complete).toBe(false);
  render(<RoutineDiffInspector entity={routine} isDarkMode={false} />);
  expect(screen.getByText(/Comparison incomplete. Unpaired items do not establish additions or removals/)).toBeInTheDocument();
  expect(screen.getByText(/Unknown changes/)).toBeInTheDocument();
  expect(screen.getAllByText(/ambiguous|missing/i).length).toBeGreaterThan(0);
});

it('surfaces selected-sheet layout diagnostics without replacing the FBD comparison', () => {
  const old = controller('program', routineXml('FBD'));
  const newer = controller('program', routineXml('FBD', 'new'));
  newer.programs[0].routines[0].fbd!.sheets[0].connections[0].to.elementId = 'missing';
  render(<RoutineDiffInspector entity={entity(old, newer)} isDarkMode={false} />);
  expect(screen.getAllByText(/missing/i).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Overlay' })).toBeInTheDocument();
});
