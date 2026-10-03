import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasEncodedOnlyTargets, parseL5XDocument } from './l5x-document';

// Sanitized upstream fixtures adapted from merged commit 8afb87074df26c6617966b080df70220d18f66ed.
const fixture = (name: string) => readFileSync(`src/viewers/components/shared/__fixtures__/l5x/${name}.L5X`, 'utf8');

describe('shared L5X document adapter', () => {
  it.each([
    ['controller-rll-v35', 'Controller', 'controller'],
    ['program-rll-v35', 'Program', 'program'],
    ['routine-rll-v35', 'Routine', 'routine'],
    ['rung-rll-v35', 'Rung', 'rung'],
    ['tags-v35', 'Tag', 'tag'],
    ['datatype-v35', 'DataType', 'dataType'],
    ['aoi-v35', 'AddOnInstructionDefinition', 'aoi'],
    ['module-v35', 'Module', 'module'],
  ])('retains the declared %s target and resource roles', (name, targetType, kind) => {
    const result = parseL5XDocument(fixture(name));
    expect(result.success).toBe(true);
    expect(result.data?.source).toMatchObject({ targetType, softwareRevision: '35.01' });
    const targets = result.data!.resources.filter(item => result.data!.targetIds.includes(item.id));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every(item => item.kind === kind && item.role === 'target')).toBe(true);
    expect(result.controller).toBe(result.data?.resources.find(item => item.kind === 'controller')?.data);
    expect(hasEncodedOnlyTargets(result)).toBe(false);
  });

  it('retains a complete controller result and the instruction context', () => {
    const result = parseL5XDocument(fixture('controller-rll-v35'));
    expect(result.status).toBe('complete');
    expect(result.controller?.programs[0].routines[0].rungs.length).toBeGreaterThan(0);
    expect(result.context).toBeDefined();
    expect(result.parseTimeMs).toEqual(expect.any(Number));
  });

  it.each([33, 34, 35])('retains usable partial v%i content, source metadata, fragments and mappings', version => {
    const result = parseL5XDocument(fixture(`document-envelope-v${version}`));
    expect(result.status).toBe('partial');
    expect(result.controller?.programs[0].routines[0].rungs).toHaveLength(2);
    expect(result.data?.source.targetType).toBe('Routine');
    expect(result.data?.resources.filter(item => item.kind === 'dataType').map(item => item.role)).toEqual(['context', 'reference']);
    expect(result.data?.fragments).toContainEqual(expect.objectContaining({ value: 'FixtureOwner' }));
    expect(result.data?.mappings.length).toBeGreaterThan(0);
    expect(result.warnings?.length).toBeGreaterThan(0);
  });

  it.each(['document-encoded-v33', 'document-encoded-v34', 'document-encoded-v35', 'encoded-aoi-v35'])
  ('keeps encoded-only %s targets without inventing Routine or AOI resources', name => {
    const result = parseL5XDocument(fixture(name));
    expect(result.status).toBe('partial');
    expect(hasEncodedOnlyTargets(result)).toBe(true);
    const document = result.data!;
    expect(document.encodedData.length).toBeGreaterThan(0);
    expect(document.targetIds.every(id => document.encodedData.some(item => item.sourcePath === id))).toBe(true);
    expect(document.resources.some(item => item.kind === 'routine' || item.kind === 'aoi')).toBe(false);
    expect(result.controller?.aois).toEqual([]);
  });

  it('retains malformed input diagnostics and their source locations as a failed result', () => {
    const result = parseL5XDocument(fixture('malformed-truncated-v35'));
    expect(result.status).toBe('failed');
    expect(result.success).toBe(false);
    expect(result.controller).toBeNull();
    expect(result.data).toBeUndefined();
    expect(result.errors?.[0]).toMatchObject({ code: 'INVALID_XML', location: { line: expect.any(Number), column: expect.any(Number) } });
  });
});
