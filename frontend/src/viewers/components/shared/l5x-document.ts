import {
  parseDocumentString,
  type NormalizedController,
  type ParseResult,
  type ParseStatus,
  type PlcDocument,
} from 'ladder-visualizer';

/** Keeps the public document, diagnostics and rendering context from one parse. */
export interface L5XDocumentResult extends ParseResult<PlcDocument> {
  status: ParseStatus;
  controller: NormalizedController | null;
}

export function parseL5XDocument(content: string): L5XDocumentResult {
  const result = parseDocumentString(content, 'l5x');
  const resource = result.data?.resources.find(item => item.kind === 'controller');
  return {
    ...result,
    status: result.success && result.data ? result.status ?? 'complete' : 'failed',
    controller: resource?.kind === 'controller' ? resource.data : null,
  };
}

/** An encoded target can have context resources without a normalized target. */
export function hasEncodedOnlyTargets(result: L5XDocumentResult): boolean {
  const document = result.data;
  return Boolean(document?.targetIds.length &&
    document.targetIds.every(id => document.encodedData.some(item => item.sourcePath === id)));
}
