import { describe, expect, it } from 'vitest';
import { parseString } from 'ladder-visualizer';

const FBD_WITH_DECORATED_BLOCK_DATA = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="35.01" TargetName="GenericBlocks" TargetType="Program" ContainsContext="true" ExportOptions="References NoRawData L5KData DecoratedData Context">
  <Controller Use="Context" Name="FixtureController" ProcessorType="1756-L85E">
    <Programs>
      <Program Name="GenericBlocks">
        <Tags>
          <Tag Name="BLOCK_01" TagType="Base" DataType="FBD_TEST">
            <Data Format="Decorated">
              <Structure DataType="FBD_TEST">
                <DataValueMember Name="EnableIn" DataType="BOOL" Value="1" />
                <DataValueMember Name="InA" DataType="REAL" Value="0" />
                <DataValueMember Name="EnableOut" DataType="BOOL" Value="0" />
                <DataValueMember Name="OutA" DataType="REAL" Value="0" />
              </Structure>
            </Data>
          </Tag>
        </Tags>
        <Routines>
          <Routine Name="Logic" Type="FBD">
            <FBDContent SheetSize="Tabloid - 11 x 17 in" SheetOrientation="Landscape">
              <Sheet Number="1">
                <Block Type="TEST" ID="1" X="20" Y="20" Operand="BLOCK_01" VisiblePins="InA OutA" />
              </Sheet>
            </FBDContent>
          </Routine>
        </Routines>
      </Program>
    </Programs>
  </Controller>
</RSLogix5000Content>`;

describe('pinned ladder-visualizer package', () => {
  it('infers FBD Block ports from decorated program data', () => {
    const result = parseString(FBD_WITH_DECORATED_BLOCK_DATA, 'l5x');
    const block = result.data?.programs[0]?.routines[0]?.fbd?.sheets[0]?.elements.find(
      (element) => element.kind === 'block',
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('complete');
    expect(block?.kind).toBe('block');
    if (block?.kind !== 'block') return;

    expect(block.ports.map(({ id, dataType, direction, visible }) => ({
      id,
      dataType,
      direction,
      visible,
    }))).toEqual([
      { id: 'InA', dataType: 'REAL', direction: 'input', visible: true },
      { id: 'OutA', dataType: 'REAL', direction: 'output', visible: true },
    ]);
  });
});
