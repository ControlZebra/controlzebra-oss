import { describe, expect, it } from 'vitest';
import {
  buildInlineDiffModel,
  diffControllers,
  measureRoutineDiffRowHeight,
  type Instruction,
  type NormalizedController,
  type NormalizedProgram,
  type NormalizedRoutine,
  type NormalizedRung,
} from 'ladder-visualizer';

import { buildL5XDiffLayoutViewModel, buildRoutineSemanticId, buildTabId } from './adapter';
import { buildRoutineDiffRenderModel } from './routine-render-model';
import type { L5XDiffRoutineEntity } from './types';

function makeController(overrides: Partial<NormalizedController> = {}): NormalizedController {
  return {
    name: 'Controller',
    dataTypes: [],
    tags: [],
    programs: [],
    aois: [],
    modules: [],
    ...overrides,
  };
}

function makeProgram(name: string, overrides: Partial<NormalizedProgram> = {}): NormalizedProgram {
  return {
    name,
    tags: [],
    routines: [],
    ...overrides,
  };
}

function makeRoutine(name: string, rungs: NormalizedRung[], overrides: Partial<NormalizedRoutine> = {}): NormalizedRoutine {
  return {
    name,
    type: 'RLL',
    rungs,
    ...overrides,
  };
}

function instruction(mnemonic: string, category: Instruction['category'], operands: string[]): Instruction {
  return {
    mnemonic,
    category,
    operands,
  };
}

function makeRung(number: number, raw: string, elements: Instruction[] = []): NormalizedRung {
  return {
    number,
    raw,
    elements,
    instructions: elements,
  };
}

function getRoutineEntity(oldController: NormalizedController, newController: NormalizedController, programName: string, routineName: string): L5XDiffRoutineEntity {
  const diff = diffControllers(oldController, newController);
  const model = buildL5XDiffLayoutViewModel({ oldController, newController, diff });
  const tabId = buildTabId(buildRoutineSemanticId(programName, routineName));
  const entity = model.entitiesByTabId[tabId];

  if (!entity || entity.kind !== 'routine') {
    throw new Error('Routine entity not found');
  }

  return entity;
}

describe('buildRoutineDiffRenderModel', () => {
  it('returns only changed rows for modified routines', () => {
    const oldController = makeController({
      programs: [makeProgram('Main', {
        routines: [makeRoutine('Motor', [
          makeRung(0, 'XIC(Start)OTE(Run)'),
          makeRung(1, 'XIC(Run)OTE(Light)'),
        ])],
      })],
    });

    const newController = makeController({
      programs: [makeProgram('Main', {
        routines: [makeRoutine('Motor', [
          makeRung(0, 'XIC(Start)OTE(Run)'),
          makeRung(1, 'XIC(Run)OTE(Horn)'),
          makeRung(2, 'XIC(Horn)OTE(Alarm)'),
        ])],
      })],
    });

    const entity = getRoutineEntity(oldController, newController, 'Main', 'Motor');
    const renderModel = buildRoutineDiffRenderModel(entity);

    expect(renderModel.rows.map((row) => [row.rungNumber, row.state])).toEqual([
      [1, 'modified'],
      [2, 'added'],
    ]);
    expect(renderModel.counts).toEqual({
      unchanged: 1,
      added: 1,
      removed: 0,
      modified: 1,
    });
  });

  it('marks every rung as added for newly added routines', () => {
    const oldController = makeController({
      programs: [makeProgram('Main')],
    });

    const newController = makeController({
      programs: [makeProgram('Main', {
        routines: [makeRoutine('Startup', [
          makeRung(0, 'XIC(A)OTE(B)'),
          makeRung(1, 'XIC(B)OTE(C)'),
        ])],
      })],
    });

    const entity = getRoutineEntity(oldController, newController, 'Main', 'Startup');
    const renderModel = buildRoutineDiffRenderModel(entity);

    expect(renderModel.rows.map((row) => row.state)).toEqual(['added', 'added']);
    expect(renderModel.counts.added).toBe(2);
  });

  it('marks every rung as removed for deleted routines', () => {
    const oldController = makeController({
      programs: [makeProgram('Main', {
        routines: [makeRoutine('Shutdown', [
          makeRung(0, 'XIC(A)OTL(B)'),
          makeRung(1, 'XIC(B)OTU(C)'),
        ])],
      })],
    });

    const newController = makeController({
      programs: [makeProgram('Main')],
    });

    const entity = getRoutineEntity(oldController, newController, 'Main', 'Shutdown');
    const renderModel = buildRoutineDiffRenderModel(entity);

    expect(renderModel.rows.map((row) => row.state)).toEqual(['removed', 'removed']);
    expect(renderModel.counts.removed).toBe(2);
  });

  it('stores measured library-owned heights for modified and non-modified rows', () => {
    const oldModifiedRung = makeRung(0, 'XIC(Start)OTE(Run)', [
      instruction('XIC', 'input', ['StartPB']),
      instruction('OTE', 'output', ['RunCommand']),
    ]);
    const newModifiedRung = makeRung(0, 'XIC(Start)OTE(Alarm)', [
      instruction('XIC', 'input', ['UpdatedStartPermissive']),
      instruction('OTE', 'output', ['RunCommand']),
    ]);
    const addedRung = makeRung(1, 'XIC(Run)OTE(Alarm)', [
      instruction('XIC', 'input', ['RunFeedback']),
      instruction('OTE', 'output', ['AlarmHorn']),
    ]);

    const oldController = makeController({
      programs: [makeProgram('Main', {
        routines: [makeRoutine('Motor', [oldModifiedRung])],
      })],
    });
    const newController = makeController({
      programs: [makeProgram('Main', {
        routines: [makeRoutine('Motor', [newModifiedRung, addedRung])],
      })],
    });

    const entity = getRoutineEntity(oldController, newController, 'Main', 'Motor');
    const renderModel = buildRoutineDiffRenderModel(entity);

    expect(renderModel.rows).toHaveLength(2);
    expect(renderModel.rows[0]?.measuredHeight).toBe(
      measureRoutineDiffRowHeight({
        state: 'modified',
        inlineDiffModel: buildInlineDiffModel({
          oldRung: oldModifiedRung,
          newRung: newModifiedRung,
          rungNumber: 0,
        }),
      }),
    );
    expect(renderModel.rows[1]?.measuredHeight).toBe(
      measureRoutineDiffRowHeight({
        state: 'added',
        rung: addedRung,
      }),
    );
  });
});