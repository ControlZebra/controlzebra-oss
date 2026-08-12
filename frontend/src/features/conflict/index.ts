export { default as ConflictQueue } from './components/modal/ConflictQueue';
export {
  composeConflictResolution,
  validateConflictDecisions,
} from './lib/conflict-composer';
export {
  mapConflictResolutionData,
  type ConflictBlob,
  type ConflictFileStatus,
  type ConflictIneligibleReason,
  type ConflictLineChoice,
  type ConflictRegion,
  type ConflictRegionDecision,
  type ConflictResolutionData,
  type ConflictSegment,
  type ConflictSide,
  type TextConflictDraft,
} from './types';