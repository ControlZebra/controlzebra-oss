import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseString, TagTable } from 'ladder-visualizer';

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

function rawUdtArraySource(softwareRevision: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="${softwareRevision}" TargetName="RawUdtArray" TargetType="Controller" ContainsContext="false" ExportOptions="DecoratedData">
  <Controller Use="Target" Name="RawUdtArray">
    <DataTypes>
      <DataType Name="InnerType" Family="NoFamily" Class="User">
        <Members><Member Name="Value" DataType="DINT" Dimension="0" Radix="Decimal" Hidden="false" /></Members>
      </DataType>
      <DataType Name="SOE_Data" Family="NoFamily" Class="User">
        <Members>
          <Member Name="Events" DataType="InnerType" Dimension="2" Radix="NullType" Hidden="false" />
          <Member Name="ZZZZZZZZZZSOE_Data0" DataType="SINT" Dimension="0" Radix="Decimal" Hidden="true" />
          <Member Name="Enabled" DataType="BIT" Dimension="0" Radix="Decimal" Hidden="false" Target="ZZZZZZZZZZSOE_Data0" BitNumber="0" />
        </Members>
      </DataType>
    </DataTypes>
    <Programs><Program Name="MainProgram"><Tags>
      <Tag Name="RawEvents" TagType="Base" DataType="SOE_Data" Dimensions="2"><Data>00 00 00 00 00 00 00 00</Data></Tag>
    </Tags></Program></Programs>
  </Controller>
</RSLogix5000Content>`;
}

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

  it.each(['33.00', '34.01', '35.01'])(
    'renders raw-only UDT arrays from the declared v%s type catalog',
    (softwareRevision) => {
      const result = parseString(rawUdtArraySource(softwareRevision), 'l5x');
      const controller = result.data;
      const tag = controller?.programs[0]?.tags[0];

      expect(result).toMatchObject({ success: true, status: 'partial' });
      expect(tag).toBeDefined();
      if (!controller || !tag) return;

      render(createElement(TagTable, {
        tags: [tag],
        dataTypes: controller.dataTypeCatalog ?? controller.dataTypes,
      }));

      expect(screen.queryByText('00 00 00 00 00 00 00 00')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Expand RawEvents' }));
      expect(screen.getByText('RawEvents[0]')).toBeInTheDocument();
      expect(screen.getByText('RawEvents[1]')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Expand RawEvents[0]' }));
      expect(screen.getByText('RawEvents[0].Events')).toBeInTheDocument();
      const enabledName = screen.getByText('RawEvents[0].Enabled');
      expect(enabledName.closest('tr')).toHaveTextContent('BOOL');
      expect(screen.queryByText('RawEvents[0].ZZZZZZZZZZSOE_Data0')).not.toBeInTheDocument();
    },
  );
});
