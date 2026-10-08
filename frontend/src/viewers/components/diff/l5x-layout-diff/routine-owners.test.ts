import { describe, expect, it } from 'vitest';
import { diffControllers, type NormalizedRoutineType } from 'ladder-visualizer';
import { buildL5XDiffLayoutViewModel, buildRoutineSemanticId, buildTabId } from './adapter';
import { controller, routineXml } from './routine-fixtures.test-support';
import type { RoutineOwnerKind } from './types';

const owners: RoutineOwnerKind[] = ['program', 'aoi'];
const types: NormalizedRoutineType[] = ['RLL', 'ST', 'FBD'];

for (const owner of owners) describe(`${owner} routine entities`, () => {
  for (const type of types) it.each(['added', 'removed', 'modified'] as const)(`${type} %s retains its actual source sides and owner`, kind => {
    const oldController = controller(owner, kind === 'added' ? '' : routineXml(type));
    const newController = controller(owner, kind === 'removed' ? '' : routineXml(type, 'new'));
    const model = buildL5XDiffLayoutViewModel({ oldController, newController, diff: diffControllers(oldController, newController) });
    expect(model.tabs).toHaveLength(1);
    const entity = model.entitiesByTabId[buildTabId(buildRoutineSemanticId('Shared', 'Logic', owner))];
    expect(entity).toMatchObject({ kind: 'routine', ownerKind: owner, ownerName: 'Shared', changeKind: kind, routineType: type });
    if (entity.kind !== 'routine') throw new Error('Expected routine');
    expect(entity.oldRoutine?.type).toBe(kind === 'added' ? undefined : type);
    expect(entity.newRoutine?.type).toBe(kind === 'removed' ? undefined : type);
    expect(entity.oldOwner?.name).toBe('Shared');
    expect(entity.newOwner?.name).toBe('Shared');
    expect(model.navigatorSections[0]).toMatchObject({ itemCount: 1, items: [{ changedCount: 1, changeKind: kind }] });
    if (type === 'FBD') expect(entity.routineDiff.fbdDiff?.sheets.length).toBeGreaterThan(1);
  });

  for (const oldType of types) for (const newType of types.filter(type => type !== oldType)) it(`${oldType} to ${newType} keeps both source types`, () => {
    const oldController = controller(owner, routineXml(oldType));
    const newController = controller(owner, routineXml(newType, 'new'));
    const model = buildL5XDiffLayoutViewModel({ oldController, newController, diff: diffControllers(oldController, newController) });
    const entity = Object.values(model.entitiesByTabId)[0];
    expect(entity).toMatchObject({ kind: 'routine', changeKind: 'modified', oldRoutine: { type: oldType }, newRoutine: { type: newType } });
    expect(model.navigatorSections[0].items[0].badge).toBe(`${oldType} → ${newType}`);
    expect(model.navigatorSections[0].itemCount).toBe(1);
  });

  it.each(['added', 'removed'] as const)('%s owners retain the existing owner and leave the absent side empty', kind => {
    const full = controller(owner, routineXml('RLL'));
    const empty = { ...full, programs: [], aois: [] };
    const oldController = kind === 'added' ? empty : full;
    const newController = kind === 'removed' ? empty : full;
    const model = buildL5XDiffLayoutViewModel({ oldController, newController, diff: diffControllers(oldController, newController) });
    expect(Object.values(model.entitiesByTabId)[0]).toMatchObject(kind === 'added'
      ? { oldOwner: undefined, newOwner: { name: 'Shared' }, oldRoutine: undefined }
      : { oldOwner: { name: 'Shared' }, newOwner: undefined, newRoutine: undefined });
  });
});

it('keeps identical routine and owner names distinct between programs, AOIs and escaped segments', () => {
  const program = controller('program', routineXml('ST'));
  const aoi = controller('aoi', routineXml('ST'));
  const oldController = { ...program, aois: aoi.aois };
  const newer = controller('program', routineXml('ST', 'new'));
  const newController = { ...newer, aois: controller('aoi', routineXml('ST', 'new')).aois };
  const model = buildL5XDiffLayoutViewModel({ oldController, newController, diff: diffControllers(oldController, newController) });
  expect(new Set(model.tabs.map(tab => tab.id)).size).toBe(2);
  expect(model.tabs.map(tab => tab.subtitle)).toEqual(['Program Shared', 'AOI Shared']);
  expect(buildRoutineSemanticId('a:b', 'c')).not.toBe(buildRoutineSemanticId('a', 'b:c'));
  expect(model.navigatorSections.map(section => section.itemCount)).toEqual([1, 1]);
});
