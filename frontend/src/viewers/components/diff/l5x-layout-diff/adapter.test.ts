import { describe, expect, it } from 'vitest';
import {
  diffControllers,
  type NormalizedController,
  type NormalizedProgram,
  type NormalizedRoutine,
  type NormalizedRung,
  type NormalizedTag,
} from 'ladder-visualizer';

import {
  buildControllerTagsSemanticId,
  buildL5XDiffLayoutViewModel,
  buildProgramTagsSemanticId,
  buildRoutineSemanticId,
  buildTabId,
} from './adapter';

function makeController(overrides: Partial<NormalizedController> = {}): NormalizedController {
  return {
    name: 'TestController',
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

function makeRoutine(name: string, overrides: Partial<NormalizedRoutine> = {}): NormalizedRoutine {
  return {
    name,
    type: 'RLL',
    rungs: [],
    ...overrides,
  };
}

function makeRung(number: number, raw: string): NormalizedRung {
  return {
    number,
    raw,
    elements: [],
    instructions: [],
  };
}

function makeTag(name: string, overrides: Partial<NormalizedTag> = {}): NormalizedTag {
  return {
    name,
    tagType: 'Base',
    dataType: 'BOOL',
    scope: 'Controller',
    ...overrides,
  };
}

describe('buildL5XDiffLayoutViewModel', () => {
  it('maps changed routines and tag groups to deterministic semantic ids', () => {
    const oldController = makeController({
      tags: [makeTag('ControllerExisting')],
      programs: [makeProgram('Main', {
        tags: [makeTag('ProgramExisting', { scope: 'Program', programName: 'Main' })],
        routines: [makeRoutine('MotorStart', {
          rungs: [makeRung(0, 'XIC(Start)OTE(Run)')],
        })],
      })],
    });

    const newController = makeController({
      tags: [
        makeTag('ControllerExisting', { description: 'Changed' }),
        makeTag('ControllerAdded'),
      ],
      programs: [makeProgram('Main', {
        tags: [
          makeTag('ProgramExisting', { scope: 'Program', programName: 'Main', description: 'Changed' }),
          makeTag('ProgramAdded', { scope: 'Program', programName: 'Main' }),
        ],
        routines: [makeRoutine('MotorStart', {
          rungs: [
            makeRung(0, 'XIC(Start)OTE(Run_Command)'),
            makeRung(1, 'XIC(Run_Command)OTE(Lamp)'),
          ],
        })],
      })],
    });

    const diff = diffControllers(oldController, newController);
    const model = buildL5XDiffLayoutViewModel({ oldController, newController, diff });

    expect(model.tabs.map((tab) => tab.id)).toEqual([
      buildTabId(buildRoutineSemanticId('Main', 'MotorStart')),
      buildTabId(buildControllerTagsSemanticId()),
      buildTabId(buildProgramTagsSemanticId('Main')),
    ]);

    expect(model.initialTabId).toBe(buildTabId(buildRoutineSemanticId('Main', 'MotorStart')));
    expect(model.navigatorSections.map((section) => section.kind)).toEqual([
      'routines',
      'controller-tags',
      'program-tags',
    ]);

    const routineEntity = model.entitiesByTabId[buildTabId(buildRoutineSemanticId('Main', 'MotorStart'))];
    expect(routineEntity.kind).toBe('routine');
    if (routineEntity.kind === 'routine') {
      expect(routineEntity.changedRungNumbers).toEqual([0, 1]);
      expect(routineEntity.newRoutine?.rungs).toHaveLength(2);
    }
  });

  it('uses full tag context from the preferred side while only navigating changed groups', () => {
    const oldController = makeController({
      tags: [
        makeTag('ControllerChanged'),
        makeTag('ControllerStable'),
      ],
      programs: [makeProgram('Mixing', {
        tags: [
          makeTag('ProgramChanged', { scope: 'Program', programName: 'Mixing' }),
          makeTag('ProgramStable', { scope: 'Program', programName: 'Mixing' }),
        ],
      })],
    });

    const newController = makeController({
      tags: [
        makeTag('ControllerChanged', { description: 'Updated' }),
        makeTag('ControllerStable'),
      ],
      programs: [makeProgram('Mixing', {
        tags: [
          makeTag('ProgramChanged', { scope: 'Program', programName: 'Mixing', description: 'Updated' }),
          makeTag('ProgramStable', { scope: 'Program', programName: 'Mixing' }),
        ],
      })],
    });

    const diff = diffControllers(oldController, newController);
    const model = buildL5XDiffLayoutViewModel({ oldController, newController, diff });

    const controllerTags = model.entitiesByTabId[buildTabId(buildControllerTagsSemanticId())];
    expect(controllerTags.kind).toBe('controller-tags');
    if (controllerTags.kind === 'controller-tags') {
      expect(controllerTags.changedTagDiffs).toHaveLength(1);
      expect(controllerTags.fullContextTags.map((tag) => tag.name)).toEqual([
        'ControllerChanged',
        'ControllerStable',
      ]);
    }

    const programTags = model.entitiesByTabId[buildTabId(buildProgramTagsSemanticId('Mixing'))];
    expect(programTags.kind).toBe('program-tags');
    if (programTags.kind === 'program-tags') {
      expect(programTags.changedTagDiffs).toHaveLength(1);
      expect(programTags.fullContextTags.map((tag) => tag.name)).toEqual([
        'ProgramChanged',
        'ProgramStable',
      ]);
    }
  });

  it('filters unsupported routine types and reports them separately', () => {
    const oldController = makeController({
      programs: [makeProgram('Main', {
        routines: [makeRoutine('StructuredLogic', { type: 'ST', stContent: [{ number: 0, text: 'x := 1;' }] })],
      })],
    });

    const newController = makeController({
      programs: [makeProgram('Main', {
        routines: [makeRoutine('StructuredLogic', { type: 'ST', stContent: [{ number: 0, text: 'x := 2;' }] })],
      })],
    });

    const diff = diffControllers(oldController, newController);
    const model = buildL5XDiffLayoutViewModel({ oldController, newController, diff });

    expect(model.tabs).toHaveLength(0);
    expect(model.navigatorSections).toHaveLength(0);
    expect(model.unsupportedChanges).toEqual({
      stRoutineCount: 1,
      otherRoutineCount: 0,
    });
  });

  it('produces stable tab ids across repeated loads of the same diff', () => {
    const oldController = makeController({
      programs: [makeProgram('Pasteurizer', {
        routines: [makeRoutine('Batch', { rungs: [makeRung(0, 'XIC(A)OTE(B)')] })],
      })],
    });
    const newController = makeController({
      programs: [makeProgram('Pasteurizer', {
        routines: [makeRoutine('Batch', { rungs: [makeRung(0, 'XIC(A)OTE(C)')] })],
      })],
    });

    const diff = diffControllers(oldController, newController);

    const first = buildL5XDiffLayoutViewModel({ oldController, newController, diff });
    const second = buildL5XDiffLayoutViewModel({
      oldController: structuredClone(oldController),
      newController: structuredClone(newController),
      diff: structuredClone(diff),
    });

    expect(first.tabs.map((tab) => tab.id)).toEqual(second.tabs.map((tab) => tab.id));
    expect(first.navigatorSections.flatMap((section) => section.items.map((item) => item.id))).toEqual(
      second.navigatorSections.flatMap((section) => section.items.map((item) => item.id)),
    );
  });
});
