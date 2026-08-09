import type {
  ConflictBlob as GeneratedConflictBlob,
  ConflictRegion as GeneratedConflictRegion,
  ConflictResolutionData as GeneratedConflictResolutionData,
  ConflictSegment as GeneratedConflictSegment,
} from '../../../bindings/controlzebra/services/models';

export type ConflictFileStatus =
  | 'both-modified'
  | 'both-added'
  | 'both-deleted'
  | 'deleted-by-us'
  | 'deleted-by-them';

export type ConflictIneligibleReason =
  | ''
  | 'unsafe-file-type'
  | 'missing-side'
  | 'file-too-large'
  | 'binary-content'
  | 'unsupported-encoding'
  | 'unsupported-content'
  | 'line-ending-mismatch'
  | 'conflict-generation-failed'
  | 'output-too-large';

export interface ConflictBlob {
  present: boolean;
  oid?: string;
  mode?: string;
  content?: string;
}

export interface ConflictRegion {
  id: string;
  current: string[];
  base: string[];
  incoming: string[];
}

export type ConflictSegment =
  | { kind: 'context'; text: string }
  | { kind: 'conflict'; conflict: ConflictRegion };

export type ConflictSide = 'current' | 'incoming';

export interface ConflictLineChoice {
  current: boolean[];
  incoming: boolean[];
}

export type ConflictRegionDecision =
  | { mode: 'unresolved' }
  | { mode: 'block'; side: ConflictSide }
  | { mode: 'lines'; lines: ConflictLineChoice }
  | { mode: 'remove' };

export interface TextConflictDraft {
  path: string;
  resolutionToken: string;
  decisions: Record<string, ConflictRegionDecision>;
}

export interface ConflictResolutionData {
  success: boolean;
  path: string;
  status: ConflictFileStatus;
  eligible: boolean;
  ineligibleReason?: ConflictIneligibleReason;
  base: ConflictBlob;
  current: ConflictBlob;
  incoming: ConflictBlob;
  segments: ConflictSegment[];
  resolutionToken?: string;
  newline?: string;
  hasFinalNewline: boolean;
  error?: string;
}

const mapConflictBlob = (blob: GeneratedConflictBlob): ConflictBlob => ({
  present: blob.present,
  oid: blob.oid,
  mode: blob.mode,
  content: blob.content,
});

const mapConflictRegion = (region: GeneratedConflictRegion): ConflictRegion => ({
  id: region.id,
  current: [...region.current],
  base: [...(region.base ?? [])],
  incoming: [...region.incoming],
});

const mapConflictSegment = (segment: GeneratedConflictSegment): ConflictSegment => {
  if (segment.kind === 'conflict' && segment.conflict) {
    return {
      kind: 'conflict',
      conflict: mapConflictRegion(segment.conflict),
    };
  }

  return {
    kind: 'context',
    text: segment.text ?? '',
  };
};

export const mapConflictResolutionData = (
  data: GeneratedConflictResolutionData,
): ConflictResolutionData => ({
  success: data.success,
  path: data.path,
  status: data.status as ConflictFileStatus,
  eligible: data.eligible,
  ineligibleReason: data.ineligibleReason as ConflictIneligibleReason | undefined,
  base: mapConflictBlob(data.base),
  current: mapConflictBlob(data.current),
  incoming: mapConflictBlob(data.incoming),
  segments: (data.segments ?? []).map(mapConflictSegment),
  resolutionToken: data.resolutionToken,
  newline: data.newline,
  hasFinalNewline: data.hasFinalNewline,
  error: data.error,
});