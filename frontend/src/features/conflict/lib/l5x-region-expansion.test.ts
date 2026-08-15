import { describe, expect, it } from 'vitest';

import type { ConflictRegion } from '../types';
import { expandRegionToSemanticUnit } from './l5x-region-expansion';

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

describe('expandRegionToSemanticUnit', () => {
  it('rebuilds the enclosing rung for a minimal CDATA hunk', () => {
    const expanded = expandRegionToSemanticUnit(
      region({
        id: 'region-1',
        current: ['<![CDATA[XIC(HMI_Load_HiRaw)MOV(In_Raw,Cfg_RawMaxA);]]>'],
        incoming: ['<![CDATA[XIC(HMI_Load_HiRaw)MOV(In_Raw,Cfg_RawMaxB);]]>'],
        contextBefore: '</Rung>\n<Rung Number="1" Type="N">\n<Text>\n',
        contextAfter: '</Text>\n</Rung>\n<Rung Number="2" Type="N">\n',
      }),
      '\n',
    );

    expect(expanded).toEqual({
      current: '<Rung Number="1" Type="N">\n<Text>\n'
        + '<![CDATA[XIC(HMI_Load_HiRaw)MOV(In_Raw,Cfg_RawMaxA);]]>\n'
        + '</Text>\n</Rung>',
      incoming: '<Rung Number="1" Type="N">\n<Text>\n'
        + '<![CDATA[XIC(HMI_Load_HiRaw)MOV(In_Raw,Cfg_RawMaxB);]]>\n'
        + '</Text>\n</Rung>',
    });
  });

  it('ignores angle brackets inside CDATA when locating the enclosing unit', () => {
    const expanded = expandRegionToSemanticUnit(
      region({
        id: 'region-1',
        current: ['<![CDATA[LES(a,b)OTE(c);]]>'],
        incoming: ['<![CDATA[GRT(a,b)OTE(c);]]>'],
        contextBefore: '<Rung Number="4" Type="N">\n<Comment>\n<![CDATA[a < b > c]]>\n</Comment>\n<Text>\n',
        contextAfter: '</Text>\n</Rung>\n',
      }),
      '\n',
    );

    expect(expanded?.current).toBe(
      '<Rung Number="4" Type="N">\n<Comment>\n<![CDATA[a < b > c]]>\n</Comment>\n<Text>\n'
      + '<![CDATA[LES(a,b)OTE(c);]]>\n</Text>\n</Rung>',
    );
  });

  it('expands a deleted side to the enclosing unit without the removed lines', () => {
    const expanded = expandRegionToSemanticUnit(
      region({
        id: 'region-1',
        current: ['<![CDATA[NOP();]]>'],
        incoming: [],
        contextBefore: '<Rung Number="0" Type="N">\n<Text>\n',
        contextAfter: '</Text>\n</Rung>\n',
      }),
      '\n',
    );

    expect(expanded?.incoming).toBe('<Rung Number="0" Type="N">\n<Text>\n</Text>\n</Rung>');
  });

  it('preserves CRLF line endings when rejoining region lines', () => {
    const expanded = expandRegionToSemanticUnit(
      region({
        id: 'region-1',
        current: ['<![CDATA[NOP();]]>'],
        incoming: ['<![CDATA[OTE(a);]]>'],
        contextBefore: '<Rung Number="0" Type="N">\r\n<Text>\r\n',
        contextAfter: '</Text>\r\n</Rung>\r\n',
      }),
      '\r\n',
    );

    expect(expanded?.current).toBe(
      '<Rung Number="0" Type="N">\r\n<Text>\r\n<![CDATA[NOP();]]>\r\n</Text>\r\n</Rung>',
    );
  });

  it('returns null when the region already spans whole rungs', () => {
    expect(
      expandRegionToSemanticUnit(
        region({
          id: 'region-1',
          current: ['<Rung Number="1" Type="N">', '</Rung>'],
          incoming: ['<Rung Number="1" Type="N">', '</Rung>'],
          contextBefore: '<Routine Name="Main" Type="RLL">\n<RLLContent>\n',
          contextAfter: '</RLLContent>\n</Routine>\n',
        }),
        '\n',
      ),
    ).toBeNull();
  });

  it('returns null when the trimmed context never closes the enclosing unit', () => {
    expect(
      expandRegionToSemanticUnit(
        region({
          id: 'region-1',
          current: ['<![CDATA[NOP();]]>'],
          incoming: ['<![CDATA[OTE(a);]]>'],
          contextBefore: '<Rung Number="0" Type="N">\n<Text>\n',
          contextAfter: '</Text>\n',
        }),
        '\n',
      ),
    ).toBeNull();
  });

  it('ignores close tags whose opening tag was trimmed away', () => {
    const expanded = expandRegionToSemanticUnit(
      region({
        id: 'region-1',
        current: ['<![CDATA[NOP();]]>'],
        incoming: ['<![CDATA[OTE(a);]]>'],
        contextBefore: '</Text>\n</Rung>\n<Rung Number="9" Type="N">\n<Text>\n',
        contextAfter: '</Text>\n</Rung>\n',
      }),
      '\n',
    );

    expect(expanded?.current.startsWith('<Rung Number="9"')).toBe(true);
  });
});
