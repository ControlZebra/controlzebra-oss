import { parseString, type NormalizedController, type NormalizedRoutineType } from 'ladder-visualizer';
import type { RoutineOwnerKind } from './types';

export function routineXml(type: NormalizedRoutineType, version: 'old' | 'new' = 'old'): string {
  const body = type === 'RLL' ? `<RLLContent><Rung Number="0" Type="N"><Text><![CDATA[XIC(Start)OTE(${version}Output);]]></Text></Rung></RLLContent>`
    : type === 'ST' ? `<STContent><Line Number="0"><![CDATA[Output := ${version === 'old' ? '1' : '2'};]]></Line></STContent>`
      : `<FBDContent SheetSize="A4" SheetOrientation="Landscape"><Sheet Number="1"><IRef ID="1" X="20" Y="20" Operand="${version}Input" /><ORef ID="2" X="300" Y="20" Operand="Output" /><Wire FromID="1" ToID="2" /></Sheet><Sheet Number="2"><IRef ID="3" X="20" Y="20" Operand="Context" /></Sheet></FBDContent>`;
  return `<Routine Name="Logic" Type="${type}">${body}</Routine>`;
}

export function sourceXml(ownerKind: RoutineOwnerKind, routines: string, name = 'Shared'): string {
  const owner = ownerKind === 'program' ? `<Programs><Program Name="${name}"><Routines>${routines}</Routines></Program></Programs>`
    : `<AddOnInstructionDefinitions><AddOnInstructionDefinition Name="${name}" Class="Standard" Revision="1.0" ExecutePrescan="false" ExecutePostscan="false" ExecuteEnableInFalse="false"><Parameters /><LocalTags /><Routines>${routines}</Routines></AddOnInstructionDefinition></AddOnInstructionDefinitions>`;
  return `<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="35.01" TargetName="Controller" TargetType="Controller" ContainsContext="false"><Controller Use="Target" Name="Controller">${owner}</Controller></RSLogix5000Content>`;
}

export function controller(ownerKind: RoutineOwnerKind, routines: string, name = 'Shared'): NormalizedController {
  const result = parseString(sourceXml(ownerKind, routines, name), 'l5x');
  if (!result.data) throw new Error('Fixture did not parse');
  return result.data;
}
