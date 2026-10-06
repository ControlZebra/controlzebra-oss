import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseString, type NormalizedController } from 'ladder-visualizer';
import MetadataInspector from './MetadataInspector';
import { buildMetadataModel, formatMetadataDimensions, formatMetadataValue, metadataTargetId, type MetadataTarget } from './metadata-model';
import L5XEntityNavigator from '../../shared/L5XEntityNavigator';
import type { TabData } from './useTabs';
import { generateTabId } from './useTabs';

function controllerFixture(name = 'controller-rll-v35'): NormalizedController {
  const source = readFileSync(resolve('src/viewers/components/shared/__fixtures__/l5x', `${name}.L5X`), 'utf8');
  const result = parseString(source, 'l5x');
  if (!result.data) throw new Error('Expected usable fixture controller');
  return result.data;
}

function richController(): NormalizedController {
  const controller = controllerFixture();
  controller.programs = [{ name: 'Main', uid: '18446744073709551615', parentUid: '18446744073709551614',
    tags: [], localTags: [], parameters: [], routines: [{ name: 'Logic', type: 'RLL', rungs: [] }],
    mainRoutineName: 'Logic', executingTaskName: 'Cycle', verified: false, lastScanTime: 0,
    description: 'Program description', recipePhaseNames: 'PhaseA,PhaseB' },
    { name: 'Parent', uid: '18446744073709551614', tags: [], localTags: [], parameters: [], routines: [] }];
  controller.tasks = [{ name: 'Cycle', type: 'Periodic', rate: 0, watchdog: 0, inhibited: false,
    event: { timeoutEnabled: false }, scheduledProgramNames: ['Parent', 'Main', 'Missing'] }];
  controller.aois = [{ name: 'Motor', class: 'Standard', executePrescan: false, executePostscan: false,
    executeEnableInFalse: false, parameters: [], localTags: [], routines: [{ name: 'Logic', type: 'ST', rungs: [] }],
    createdDate: new Date('2026-10-03T10:00:00Z'), revisionNote: 'Line one\nLine two', helpText: 'Help '.repeat(100) }];
  controller.dataTypeCatalog = [{ name: 'Outer', class: 'User', resolution: 'Conflict', provenance: ['/one', '/two'],
    members: [{ name: 'Child', dataType: 'DINT', dimension: 0, dimensions: [2, 3], hidden: false,
      required: false, visible: false, defaultValue: 0 }] },
    { name: 'DINT', class: 'BuiltIn', resolution: 'Atomic', members: [] }];
  controller.modules = [{ name: 'Rack', id: 0, inhibited: false, majorFault: false, safetyEnabled: false,
    ports: [], connections: [] }, { name: 'Card', id: 1, parentId: 0, parentModuleName: 'Rack',
    inhibited: false, majorFault: false, safetyEnabled: false, comments: ['first', 'second'],
    ports: [{ id: 0, type: 'Backplane', upstream: false, address: '0' }],
    connections: [{ name: 'Input', inputDataType: 'DINT', rpiMicroseconds: 0, unicast: false }] }];
  return controller;
}

describe('metadata values and relationships', () => {
  it('preserves absence, zero, false, strings, dates, and dimension order without guessing units', () => {
    expect([undefined, null, 0, false, '', '18446744073709551615'].map(formatMetadataValue))
      .toEqual(['Not supplied', 'Not supplied', '0', 'false', 'Empty string', '18446744073709551615']);
    expect(formatMetadataValue(new Date('2026-10-03T10:00:00Z'))).toBe('2026-10-03T10:00:00.000Z');
    expect(formatMetadataValue(new Date('invalid'))).toBe('Invalid date');
    expect(formatMetadataDimensions([3, 2])).toBe('[3][2]');
    expect(formatMetadataDimensions([], 0)).toBe('Scalar');
    expect(formatMetadataDimensions(undefined)).toBe('Not supplied');
  });

  it.each(['controller-rll-v35', 'program-rll-v35', 'aoi-v35', 'datatype-v35', 'module-v35',
    'document-envelope-v33', 'document-envelope-v34', 'document-envelope-v35'])
    ('inspects normalized metadata from the sanitized %s fixture', fixture => {
      const controller = controllerFixture(fixture);
      const targets: MetadataTarget[] = [{ kind: 'controller' },
        ...controller.programs.map(program => ({ kind: 'program' as const, name: program.name, uid: program.uid })),
        ...controller.aois.map(aoi => ({ kind: 'aoi' as const, name: aoi.name })),
        ...(controller.dataTypeCatalog ?? controller.dataTypes).map(type => ({ kind: 'data-type' as const, name: type.name })),
        ...controller.modules.map(module => ({ kind: 'module' as const, name: module.name }))];
      for (const target of targets) {
        const model = buildMetadataModel(controller, target);
        expect(model).not.toBeNull();
        expect(model!.groups.flatMap(group => group.fields).some(field => field.label === 'Name')).toBe(true);
      }
    });

  it('shows only scalar vendor metadata in a stable order', () => {
    const controller = richController();
    controller.vendorMetadata = { z: false, a: '35.01', b: 0, fragment: { x: 'hidden' }, absent: undefined };
    expect(buildMetadataModel(controller, { kind: 'controller' })!.groups[2].fields)
      .toEqual([{ label: 'a', value: '35.01' }, { label: 'b', value: 0 }, { label: 'z', value: false }]);
  });

  it('retains unsigned-long program IDs through the real public parser and inspector', () => {
    const parsed = parseString(`<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="35.01" TargetType="Controller" TargetName="ExactIds">
      <Controller Name="ExactIds"><Programs><Program Name="Exact" UId="18446744073709551615" ParentUId="18446744073709551614" Verified="false" LastScanTime="0" /></Programs></Controller>
    </RSLogix5000Content>`, 'l5x');
    expect(parsed.data?.programs[0].uid).toBe('18446744073709551615');
    render(<MetadataInspector controller={parsed.data!} target={{ kind: 'program', name: 'Exact', uid: '18446744073709551615' }} onOpen={vi.fn()} />);
    expect(screen.getByRole('row', { name: 'UID 18446744073709551615' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Parent UID 18446744073709551614' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Verified false' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Last scan time 0' })).toBeInTheDocument();
  });

  it('uses a program UID after rename/reorder and never redirects a removed UID to a reused name', () => {
    const controller = richController();
    const target: MetadataTarget = { kind: 'program', name: 'Main', uid: '18446744073709551615' };
    const originalId = metadataTargetId(target);
    controller.programs.reverse();
    controller.programs[1].name = 'Renamed';
    expect(buildMetadataModel(controller, target)?.title).toBe('Renamed Metadata');
    expect(metadataTargetId({ ...target, name: 'Renamed' })).toBe(originalId);
    controller.programs[1].uid = '1';
    controller.programs[1].name = 'Main';
    expect(buildMetadataModel(controller, target)).toBeNull();
  });

  it('keeps duplicate-UID programs separate in a real partial document and leaves ambiguous parents unresolved', () => {
    const source = readFileSync(resolve('src/viewers/components/shared/__fixtures__/l5x/program-hierarchy-invalid-v35.L5X'), 'utf8');
    const parsed = parseString(source, 'l5x');
    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe('partial');
    const controller = parsed.data!;
    const onSelect = vi.fn();
    render(<L5XEntityNavigator controller={controller} onOpen={onSelect} />);
    for (const name of ['DuplicateA', 'DuplicateB']) {
      fireEvent.click(screen.getByRole('button', { name }));
      const target = (onSelect.mock.lastCall![0] as Extract<TabData, { type: 'metadata' }>).target;
      expect(buildMetadataModel(controller, target)?.title).toBe(`${name} Metadata`);
    }
    const first = (onSelect.mock.calls[0][0] as Extract<TabData, { type: 'metadata' }>).target;
    const second = (onSelect.mock.calls[1][0] as Extract<TabData, { type: 'metadata' }>).target;
    expect(metadataTargetId(first)).not.toBe(metadataTargetId(second));
    expect(buildMetadataModel(controller, { kind: 'program', name: 'DuplicateB', uid: '10' })?.title).toBe('DuplicateB Metadata');
    controller.programs[2].parentUid = '10';
    const parent = buildMetadataModel(controller, { kind: 'program', name: 'MissingParent', uid: '11' })!
      .groups[0].fields.find(field => field.label === 'Parent UID');
    expect(parent).toMatchObject({ value: '10' });
    expect(parent?.link).toBeUndefined();
    controller.programs.reverse();
    expect(buildMetadataModel(controller, second)?.title).toBe('DuplicateB Metadata');
    controller.programs = controller.programs.filter(program => program.name !== 'DuplicateB');
    expect(buildMetadataModel(controller, second)).toBeNull();
  });

  it('disambiguates duplicate-UID routine and tag links by program name', () => {
    const controller = controllerFixture('program-hierarchy-invalid-v35');
    for (const program of controller.programs.slice(0, 2)) {
      program.mainRoutineName = 'Logic';
      program.routines = [{ name: 'Logic', type: 'RLL', rungs: [] }];
    }
    const first = buildMetadataModel(controller, { kind: 'program', name: 'DuplicateA', uid: '10' })!;
    const second = buildMetadataModel(controller, { kind: 'program', name: 'DuplicateB', uid: '10' })!;
    const linkedViews = (model: typeof first) => model.groups.flatMap(group => group.fields)
      .filter(field => field.link?.type === 'routine' || field.link?.type === 'program-tags').map(field => field.link!);
    expect(linkedViews(second).map(link => link.type)).toEqual(['routine', 'program-tags']);
    expect(linkedViews(second)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'routine', programName: 'DuplicateB' }),
      expect.objectContaining({ type: 'program-tags', programName: 'DuplicateB' }),
    ]));
    expect(linkedViews(first).map(generateTabId)).not.toEqual(linkedViews(second).map(generateTabId));
  });
});

describe('metadata inspector presentation', () => {
  it.each<MetadataTarget>([{ kind: 'controller' }, { kind: 'program', name: 'Main' }, { kind: 'task', name: 'Cycle' },
    { kind: 'aoi', name: 'Motor' }, { kind: 'data-type', name: 'Outer' }, { kind: 'module', name: 'Card' }])
    ('renders accessible fields for $kind', target => {
      render(<MetadataInspector controller={richController()} target={target} onOpen={vi.fn()} />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Metadata');
      expect(screen.getAllByRole('table', { name: 'Metadata fields' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('row').some(row => row.textContent?.includes('Not supplied'))).toBe(true);
    });

  it('keeps exact IDs, sparse fields, zero, and false readable and opens the right routine and parent', () => {
    const onOpen = vi.fn();
    render(<MetadataInspector controller={richController()} target={{ kind: 'program', name: 'Main' }} onOpen={onOpen} />);
    expect(screen.getByText('18446744073709551615')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Verified false' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Last scan time 0' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Disabled Not supplied' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Main routine: Logic' }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'routine', programName: 'Main',
      programUid: '18446744073709551615', routineName: 'Logic' }), 'Logic');
    fireEvent.click(screen.getByRole('button', { name: 'Open Parent UID: 18446744073709551614' }));
    expect(onOpen).toHaveBeenLastCalledWith({ type: 'metadata', target: { kind: 'program', name: 'Parent', uid: '18446744073709551614' } }, 'Parent Metadata');
  });

  it('preserves task schedule order and leaves unresolved references as text', () => {
    render(<MetadataInspector controller={richController()} target={{ kind: 'task', name: 'Cycle' }} onOpen={vi.fn()} />);
    const schedule = screen.getByRole('heading', { name: 'Program schedule' }).parentElement!;
    expect(within(schedule).getAllByRole('row').map(row => row.textContent)).toEqual(['Program 1Parent', 'Program 2Main', 'Program 3Missing']);
    expect(within(schedule).queryByRole('button', { name: /Missing/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Rate 0' })).toBeInTheDocument();
  });

  it('keeps nested type links, conflicts, provenance and member declarations visible', () => {
    const onOpen = vi.fn();
    render(<MetadataInspector controller={richController()} target={{ kind: 'data-type', name: 'Outer' }} onOpen={onOpen} />);
    expect(screen.getByRole('row', { name: 'Resolution Conflict' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Dimensions [2][3]' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Default value 0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Data type: DINT' }));
    expect(onOpen).toHaveBeenCalledWith({ type: 'data-type', dataTypeName: 'DINT' }, 'DINT');
  });

  it('opens module parents and configuration without depending on array indexes', () => {
    const controller = richController();
    controller.modules.reverse();
    controller.modules[0].id = 17;
    const onOpen = vi.fn();
    render(<MetadataInspector controller={controller} target={{ kind: 'module', name: 'Card' }} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Parent ID: 0' }));
    expect(onOpen).toHaveBeenLastCalledWith({ type: 'metadata', target: { kind: 'module', name: 'Rack' } }, 'Rack Metadata');
    fireEvent.click(screen.getByRole('button', { name: 'Open Module configuration: Card' }));
    expect(onOpen).toHaveBeenLastCalledWith({ type: 'module', moduleName: 'Card', moduleId: 17 }, 'Card');
  });

  it('paginates long declarations in source order and clamps the page after refresh', () => {
    const controller = richController();
    controller.dataTypeCatalog![0].members = Array.from({ length: 10 }, (_, index) =>
      ({ name: `M${index}`, dataType: 'DINT', dimension: 0 }));
    const view = render(<MetadataInspector controller={controller} target={{ kind: 'data-type', name: 'Outer' }} onOpen={vi.fn()} />);
    expect(screen.getAllByRole('row')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Next fields' }));
    expect(screen.getByText(/Page 2 of/)).toBeInTheDocument();
    const updated = { ...controller, dataTypeCatalog: [{ ...controller.dataTypeCatalog![0], members: [] }] };
    view.rerender(<MetadataInspector controller={updated} target={{ kind: 'data-type', name: 'Outer' }} onOpen={vi.fn()} />);
    expect(screen.getByRole('row', { name: 'Member structure 0' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Metadata pages' })).not.toBeInTheDocument();
  });

  it('offers source inspection when a selected entity disappears', () => {
    const raw = vi.fn();
    render(<MetadataInspector controller={richController()} target={{ kind: 'task', name: 'Removed' }} onOpen={vi.fn()} onShowRaw={raw} />);
    expect(screen.getByText(/Select another item/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Raw' }));
    expect(raw).toHaveBeenCalledOnce();
  });
});
