import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { diffControllers, parseString, type NormalizedController, type NormalizedDataType, type NormalizedProgram,
  type NormalizedProgramLocalTag, type NormalizedTag } from 'ladder-visualizer';
import { buildL5XDiffLayoutViewModel } from './adapter';
import { EntityDiffInspector } from './EntityDiffInspector';
import type { L5XDiffRenderableEntity } from './types';

function controller(overrides: Partial<NormalizedController> = {}): NormalizedController {
  return { name: 'Controller', programs: [], tags: [], dataTypes: [], aois: [], modules: [], tasks: [], trends: [], quickWatchLists: [], ...overrides };
}
function program(name = 'Shared', overrides: Partial<NormalizedProgram> = {}): NormalizedProgram {
  return { name, tags: [], localTags: [], parameters: [], routines: [], ...overrides };
}
const tag = (name: string, dataType = 'BOOL'): NormalizedTag => ({ name, dataType, tagType: 'Base', scope: 'Controller' });
const local = (name: string, programName = 'Shared'): NormalizedProgramLocalTag => ({ name, programName, scope: 'Program', dataType: 'BOOL', comments: [] });
const datatype = (member: string): NormalizedDataType => ({ name: 'Record', class: 'User', members: [{ name: member, dataType: 'DINT', dimension: 0 }] });
function entities(oldController: NormalizedController, newController: NormalizedController) {
  return Object.values(buildL5XDiffLayoutViewModel({ oldController, newController, diff: diffControllers(oldController, newController) }).entitiesByTabId);
}
function show(entity: L5XDiffRenderableEntity | undefined) {
  if (!entity || entity.kind === 'routine') throw new Error('Expected an entity inspector');
  return render(<EntityDiffInspector entity={entity} />);
}
function fixture(name: string) {
  const result = parseString(readFileSync(`src/viewers/components/shared/__fixtures__/l5x/${name}.L5X`, 'utf8'), 'l5x');
  if (!result.data) throw new Error('Fixture did not parse');
  return result.data;
}

describe('entity comparisons from the public diff contract', () => {
  it('shows controller and program property-only changes with exact false, zero and absent values', () => {
    const old = controller({ programs: [program('Shared', { disabled: true })] });
    const current = controller({ description: 'Updated controller', programs: [program('Shared', { disabled: false, lastScanTime: 0 })] });
    const items = entities(old, current);
    expect(items.map(item => item.kind)).toEqual(['metadata', 'metadata']);
    const view = show(items[0]);
    expect(screen.getByRole('table', { name: 'Changed fields' })).toHaveTextContent('descriptionNot suppliedUpdated controller');
    view.unmount();
    show(items[1]);
    expect(screen.getByRole('row', { name: 'disabled true false' })).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Current version' })).getByRole('row', { name: 'Last scan time 0' })).toBeVisible();
    expect(screen.queryByRole('row', { name: 'lastScanTime Not supplied 0' })).not.toBeInTheDocument();
  });

  it('keeps removed members inspectable beside added and unchanged members', () => {
    const oldType = datatype('RemovedMember');
    const newType = datatype('AddedMember');
    oldType.members.push({ name: 'StableMember', dataType: 'BOOL', dimension: 0 });
    newType.members.push({ name: 'StableMember', dataType: 'BOOL', dimension: 0 });
    show(entities(controller({ dataTypes: [oldType] }), controller({ dataTypes: [newType] }))[0]);
    const changed = within(screen.getByRole('region', { name: 'Changed members' }));
    fireEvent.click(changed.getByRole('button', { name: /RemovedMember: Removed/ }));
    expect(screen.getByRole('region', { name: 'Previous member' })).toHaveTextContent('RemovedMember');
    expect(screen.getByRole('region', { name: 'Current member' })).toHaveTextContent('Not present');
    expect(screen.getByRole('region', { name: 'Current version' })).toHaveTextContent('StableMember');
    expect(screen.getByRole('region', { name: 'Current version' })).not.toHaveTextContent('RemovedMember');
    expect(changed.getByRole('button', { name: /AddedMember: Added/ })).toBeVisible();
  });

  it.each(['added', 'removed'] as const)('shows full context for %s programs, data types, modules and AOIs', kind => {
    const populated = fixture('aoi-interface-metadata-v34');
    populated.programs = [program()];
    populated.dataTypes = [datatype('DeclaredMember')];
    populated.dataTypeCatalog = populated.dataTypes;
    populated.modules = [{ id: 1, name: 'Device', catalogNumber: '1756', inhibited: false, majorFault: false, safetyEnabled: false, ports: [], connections: [] }];
    const items = entities(kind === 'added' ? controller() : populated, kind === 'added' ? populated : controller());
    for (const target of ['program', 'data-type', 'module', 'aoi']) {
      const entity = items.find(item => item.kind === 'metadata' && item.target.kind === target);
      const view = show(entity);
      const present = within(screen.getByRole('region', { name: kind === 'added' ? 'Current version' : 'Previous version' }));
      expect(present.getAllByRole('table').length).toBeGreaterThan(0);
      expect(screen.getByRole('region', { name: kind === 'added' ? 'Previous version' : 'Current version' })).toHaveTextContent('Not present');
      view.unmount();
    }
  });

  it('shows emitted module properties and lazily inspects nested port changes', () => {
    const old = controller({ modules: [{ id: 2, name: 'Device', inhibited: true, majorFault: false, safetyEnabled: false, slot: 1, ports: [], connections: [] }] });
    const current = structuredClone(old);
    current.modules[0].inhibited = false;
    current.modules[0].slot = 0;
    current.modules[0].ports = [{ id: 1, type: 'Ethernet', upstream: false, address: '192.0.2.1' }];
    show(entities(old, current)[0]);
    expect(screen.getByRole('row', { name: 'inhibited true false' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'slot 1 0' })).toBeVisible();
    const portRow = within(screen.getByRole('row', { name: /ports Inspect value Inspect value/ }));
    fireEvent.click(portRow.getAllByRole('button', { name: 'Inspect value' })[1]);
    fireEvent.click(portRow.getByRole('button', { name: '1. Item 1' }));
    fireEvent.click(portRow.getAllByRole('button', { name: 'Inspect value' })[1]);
    fireEvent.click(portRow.getByRole('button', { name: /\d+\. address/ }));
    expect(portRow.getByText('192.0.2.1')).toBeVisible();
  });

  it('keeps same-name controller tags, program tags and locals under different owners separate', () => {
    const old = controller({ tags: [tag('Shared')], programs: [program('Shared', { tags: [tag('Shared')], localTags: [local('Shared')] }),
      program('Other', { localTags: [local('Shared', 'Other')] })] });
    const current = structuredClone(old);
    current.tags[0].value = true;
    current.programs[0].tags[0].value = false;
    current.programs[0].localTags[0].defaultValue = 0;
    current.programs[1].localTags[0].defaultValue = false;
    const items = entities(old, current);
    expect(new Set(items.map(item => item.tab.id)).size).toBe(4);
    const entity = items.find(item => item.kind === 'program-local-tags' && item.tab.title === 'Other Local Tags');
    show(entity);
    fireEvent.click(screen.getByRole('button', { name: /Shared: Modified/ }));
    expect(screen.getByRole('row', { name: 'defaultValue Not supplied false' })).toBeVisible();
    const previous = within(screen.getByRole('region', { name: 'Previous version' }));
    const currentSide = within(screen.getByRole('region', { name: 'Current version' }));
    fireEvent.click(previous.getByRole('button', { name: /Shared BOOL/ }));
    fireEvent.click(currentSide.getByRole('button', { name: /Shared BOOL/ }));
    expect(previous.getByRole('row', { name: 'Default value Not supplied' })).toBeVisible();
    expect(currentSide.getByRole('row', { name: 'Default value false' })).toBeVisible();
    expect(currentSide.getByRole('row', { name: 'Program Other' })).toBeVisible();
  });

  it('retains removed locals when new locals remain and does not invent a current declaration', () => {
    const old = controller({ programs: [program('Shared', { localTags: [local('Removed'), local('Stable')] })] });
    const current = controller({ programs: [program('Shared', { localTags: [local('Added'), local('Stable')] })] });
    show(entities(old, current)[0]);
    fireEvent.click(screen.getByRole('button', { name: /Removed: Removed/ }));
    expect(screen.getByRole('region', { name: 'Current version' })).toHaveTextContent('Not present');
    expect(screen.getByRole('region', { name: 'Previous version' })).toHaveTextContent('Removed');
    expect(screen.getByRole('button', { name: /Added: Added/ })).toBeVisible();
  });

  it('uses each side’s catalog for mixed tag removals/additions and preserves table filtering and selection', () => {
    const rawTag = { ...tag('RecordTag', 'Record'), dimensions: [1], data: [{ format: 'Raw', text: '00 00 00 00', values: [] }] };
    const old = controller({ tags: [rawTag, tag('Removed')], dataTypeCatalog: [datatype('OldField')] });
    const current = controller({ tags: [{ ...rawTag, description: 'Updated' }, tag('Added')], dataTypeCatalog: [datatype('NewField')] });
    show(entities(old, current).find(item => item.kind === 'controller-tags'));
    const previous = within(screen.getByRole('region', { name: 'Previous version' }));
    const next = within(screen.getByRole('region', { name: 'Current version' }));
    expect(previous.getAllByText('Removed')[0]).toBeVisible();
    expect(next.getAllByText('Added')[0]).toBeVisible();
    for (const side of [previous, next]) {
      fireEvent.click(side.getByRole('button', { name: 'Expand RecordTag' }));
      fireEvent.click(side.getByRole('button', { name: 'Expand RecordTag[0]' }));
    }
    expect(previous.getByText('RecordTag[0].OldField')).toBeVisible();
    expect(previous.queryByText('RecordTag[0].NewField')).not.toBeInTheDocument();
    expect(next.getByText('RecordTag[0].NewField')).toBeVisible();
    expect(next.queryByText('RecordTag[0].OldField')).not.toBeInTheDocument();
    const inspect = within(next.getByText('RecordTag').closest('tr')!).getByRole('button', { name: 'Inspect changes for RecordTag' });
    inspect.focus();
    expect(inspect).toHaveFocus();
    fireEvent.click(inspect);
    expect(screen.getByRole('region', { name: 'RecordTag changed fields' })).toHaveTextContent('descriptionNot suppliedUpdated');
    fireEvent.change(previous.getByRole('textbox'), { target: { value: 'Removed' } });
    expect(previous.queryByText('RecordTag')).not.toBeInTheDocument();
    expect(next.getByText('RecordTag')).toBeVisible();
  });

  it('shows AOI summary-only changes with full old/new defaults without claiming per-field diffs', () => {
    const old = fixture('aoi-interface-metadata-v34');
    const current = structuredClone(old);
    const parameter = current.aois[0].parameters[0];
    parameter.constant = !parameter.constant;
    const entity = entities(old, current).find(item => item.kind === 'metadata' && item.target.kind === 'aoi');
    show(entity);
    expect(screen.getByRole('region', { name: 'AOI declaration summary' })).toHaveTextContent('Parameters: 0 added, 0 removed, 1 modified');
    expect(screen.queryByRole('table', { name: 'Changed fields' })).not.toBeInTheDocument();
    for (const [label, value] of [['Previous version', old.aois[0].parameters[0].constant], ['Current version', parameter.constant]] as const) {
      const side = within(screen.getByRole('region', { name: label }));
      fireEvent.click(side.getByRole('button', { name: new RegExp(`1\\. ${parameter.name} `) }));
      expect(side.getByRole('row', { name: `Constant ${value ?? 'Not supplied'}` })).toBeVisible();
    }
  });

  it('matches unnamed modules by their emitted IDs without collapsing their tabs or side context', () => {
    const module = (id: number) => ({ id, name: '', inhibited: false, majorFault: false, safetyEnabled: false, ports: [], connections: [] });
    const old = controller({ modules: [module(1), module(2)] });
    const current = controller({ modules: [module(1), { ...module(2), inhibited: true }] });
    const item = entities(old, current)[0];
    show(item);
    expect(within(screen.getByRole('region', { name: 'Current version' })).getByRole('row', { name: 'Module ID 2' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'inhibited false true' })).toBeVisible();
    const removed = entities(old, controller());
    expect(new Set(removed.map(entity => entity.tab.id)).size).toBe(2);
  });

  it('inspects exact AOI scalar and array defaults from an older export without inventing field-level changes', () => {
    const source = readFileSync('src/viewers/components/shared/__fixtures__/l5x/aoi-defaults-v17.L5X', 'utf8');
    const old = parseString(source, 'l5x').data!;
    const current = parseString(source.replace('<![CDATA[5]]>', '<![CDATA[0]]>').replace('Index="[1]" Value="0"', 'Index="[1]" Value="42"'), 'l5x').data!;
    show(entities(old, current).find(entity => entity.kind === 'metadata' && entity.target.kind === 'aoi'));
    expect(screen.getByRole('region', { name: 'AOI declaration summary' })).toHaveTextContent('Parameters: 0 added, 0 removed, 1 modified');
    expect(screen.getByRole('region', { name: 'AOI declaration summary' })).toHaveTextContent('Local tags: 0 added, 0 removed, 1 modified');
    expect(screen.queryByRole('table', { name: 'Changed fields' })).not.toBeInTheDocument();
    for (const [label, scalar, element] of [['Previous version', '5', '0'], ['Current version', '0', '42']]) {
      const side = within(screen.getByRole('region', { name: label }));
      fireEvent.click(side.getByRole('button', { name: '1. Input DINT Input' }));
      fireEvent.click(side.getByRole('button', { name: '1. L5K' }));
      expect(side.getByRole('region', { name: 'Source default text' })).toHaveTextContent(scalar);
      fireEvent.click(side.getByRole('button', { name: '1. CurrentTS DINT' }));
      fireEvent.click(side.getByRole('button', { name: '2. Decorated' }));
      fireEvent.click(side.getByRole('button', { name: '1. DINT' }));
      expect(side.getByRole('button', { name: `2. [1] = ${element}` })).toBeVisible();
    }
  });

  it('does not traverse nested changed values until inspected, and pages their children', () => {
    const entity = entities(controller(), controller({ description: 'Changed' }))[0];
    if (entity.kind !== 'metadata') throw new Error('Expected metadata');
    const read = vi.fn(() => Array.from({ length: 123 }, (_, i) => i));
    entity.propertyChanges = [{ property: 'source', oldValue: undefined, newValue: { get values() { return read(); } } }];
    show(entity);
    expect(read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect value' }));
    fireEvent.click(screen.getByRole('button', { name: '1. values' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect value' }));
    expect(screen.queryByRole('button', { name: '51. Item 51' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: '51. Item 51' })).toBeVisible();
  });
});
