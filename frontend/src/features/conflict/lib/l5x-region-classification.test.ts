import { describe, expect, it } from 'vitest';

import type { ConflictRegion } from '../types';
import { classifyL5XRegion } from './l5x-region-classification';

function region(partial: Partial<ConflictRegion> & { id: string }): ConflictRegion {
  return {
    current: [],
    base: [],
    incoming: [],
    contextBefore: '',
    contextAfter: '',
    ...partial,
  };
}

describe('classifyL5XRegion with the real visual adapter', () => {
  it('expands bare rung CDATA from context into a ladder preview', () => {
    const result = classifyL5XRegion(
      region({
        id: 'rung-cdata',
        current: ['<![CDATA[NOP();]]>'],
        incoming: ['<![CDATA[XIC(Start)OTE(Motor);]]>'],
        contextBefore: '<Rung Number="7" Type="N">\n<Text>\n',
        contextAfter: '</Text>\n</Rung>\n',
      }),
      '\n',
    );

    expect(result).toMatchObject({
      kind: 'ladder',
      current: { number: 7, raw: 'NOP();' },
      incoming: { number: 7, raw: 'XIC(Start)OTE(Motor);' },
    });
  });

  it('falls back for bare description CDATA outside a supported semantic unit', () => {
    const result = classifyL5XRegion(
      region({
        id: 'description-cdata',
        current: ['<![CDATA[Pump description]]>'],
        incoming: ['<![CDATA[Updated pump description]]>'],
        contextBefore: '<DataType Name="Pump"><Members><Member Name="State"><Description>\n',
        contextAfter: '</Description></Member></Members></DataType>\n',
      }),
      '\n',
    );

    expect(result).toEqual({ reason: 'incomplete-unit' });
  });

  it('falls back when context does not reach the enclosing rung close tag', () => {
    const result = classifyL5XRegion(
      region({
        id: 'truncated-context',
        current: ['<![CDATA[NOP();]]>'],
        incoming: ['<![CDATA[OTE(Motor);]]>'],
        contextBefore: '<Rung Number="8" Type="N">\n<Text>\n',
        contextAfter: '</Text>\n',
      }),
      '\n',
    );

    expect(result).toEqual({ reason: 'incomplete-unit' });
  });

  it.each([
    [
      'Text',
      '<Text><![CDATA[XIC(Start)OTE(Motor);]]></Text>',
      '<Text><![CDATA[XIC(Ready)OTE(Motor);]]></Text>',
    ],
    [
      'Comment',
      '<Comment><![CDATA[Current comment]]></Comment>',
      '<Comment><![CDATA[Incoming comment]]></Comment>',
    ],
  ])('keeps explicit %s fragments eligible for ladder previews', (_element, current, incoming) => {
    const result = classifyL5XRegion(
      region({
        id: `explicit-${_element}`,
        current: [current],
        incoming: [incoming],
      }),
      '\n',
    );

    expect(result).toHaveProperty('kind', 'ladder');
  });
});
