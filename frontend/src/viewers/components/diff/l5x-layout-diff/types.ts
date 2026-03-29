import type {
  ChangeKind,
  L5XDiff,
  NormalizedController,
  NormalizedProgram,
  NormalizedRoutine,
  NormalizedRoutineType,
  NormalizedTag,
  ProgramDiff,
  RoutineDiff,
  TagDiff,
} from 'ladder-visualizer';

export type L5XDiffNavigatorSectionKind = 'routines' | 'controller-tags' | 'program-tags';
export type L5XDiffTabKind = 'routine' | 'controller-tags' | 'program-tags';
export type L5XDiffAggregateChangeKind = ChangeKind | 'mixed';

export interface L5XDiffNavigatorItem {
  id: string;
  semanticId: string;
  tabId: string;
  kind: L5XDiffTabKind;
  title: string;
  description?: string;
  badge?: string;
  changeKind: L5XDiffAggregateChangeKind;
  changedCount: number;
  totalCount?: number;
}

export interface L5XDiffNavigatorSection {
  id: string;
  kind: L5XDiffNavigatorSectionKind;
  title: string;
  itemCount: number;
  items: L5XDiffNavigatorItem[];
}

export interface L5XDiffTabDescriptor {
  id: string;
  semanticId: string;
  kind: L5XDiffTabKind;
  title: string;
  subtitle?: string;
}

interface L5XDiffEntityBase {
  kind: L5XDiffTabKind;
  semanticId: string;
  navigatorItemId: string;
  tab: L5XDiffTabDescriptor;
}

export interface L5XDiffRoutineEntity extends L5XDiffEntityBase {
  kind: 'routine';
  changeKind: ChangeKind;
  programName: string;
  routineName: string;
  routineType: NormalizedRoutineType;
  oldProgram?: NormalizedProgram;
  newProgram?: NormalizedProgram;
  oldRoutine?: NormalizedRoutine;
  newRoutine?: NormalizedRoutine;
  routineDiff: RoutineDiff;
  programDiff: ProgramDiff;
  changedRungNumbers: number[];
}

export interface L5XDiffControllerTagsEntity extends L5XDiffEntityBase {
  kind: 'controller-tags';
  changeKind: L5XDiffAggregateChangeKind;
  title: string;
  fullContextTags: NormalizedTag[];
  changedTagDiffs: TagDiff[];
}

export interface L5XDiffProgramTagsEntity extends L5XDiffEntityBase {
  kind: 'program-tags';
  changeKind: L5XDiffAggregateChangeKind;
  title: string;
  programName: string;
  oldProgram?: NormalizedProgram;
  newProgram?: NormalizedProgram;
  fullContextTags: NormalizedTag[];
  changedTagDiffs: TagDiff[];
}

export type L5XDiffRenderableEntity =
  | L5XDiffRoutineEntity
  | L5XDiffControllerTagsEntity
  | L5XDiffProgramTagsEntity;

export interface L5XDiffUnsupportedChanges {
  stRoutineCount: number;
  otherRoutineCount: number;
}

export interface L5XDiffLayoutViewModel {
  diff: L5XDiff;
  oldController: NormalizedController;
  newController: NormalizedController;
  navigatorSections: L5XDiffNavigatorSection[];
  tabs: L5XDiffTabDescriptor[];
  entitiesByTabId: Record<string, L5XDiffRenderableEntity>;
  initialTabId: string | null;
  unsupportedChanges: L5XDiffUnsupportedChanges;
}

export interface BuildL5XDiffLayoutViewModelInput {
  oldController: NormalizedController;
  newController: NormalizedController;
  diff: L5XDiff;
}
