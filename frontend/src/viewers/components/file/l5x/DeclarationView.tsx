import { memo, useMemo, useState } from 'react';
import type {
  AOILocalTag, AOIParameter, NormalizedController, NormalizedDecoratedTagValue,
  NormalizedProgramLocalTag, NormalizedProgramParameter, NormalizedTagComment, NormalizedTagData,
} from 'ladder-visualizer';
import { MetadataPropertyList } from './MetadataInspector';
import { formatMetadataDimensions, formatMetadataValue, type MetadataField } from './metadata-model';
import type { TabData } from './useTabs';
import OrderedItems from './OrderedItems';
import { Input } from '../../../../shared/ui/input';

type Declaration = AOIParameter | AOILocalTag | NormalizedProgramLocalTag | NormalizedProgramParameter;
type OpenView = (data: TabData, title: string) => void;
type Catalog = NormalizedController['dataTypes'];

export function declarationFields(declaration: Declaration, catalog: Catalog): MetadataField[] {
  const definitions = [
    ['name', 'Name'], ['uid', 'UID'], ['parentUid', 'Parent UID'], ['dataTypeUid', 'Data type UID'],
    ['scope', 'Scope'], ['programName', 'Program'], ['usage', 'Usage'], ['tagType', 'Tag type'],
    ['radix', 'Radix'], ['externalAccess', 'External access'], ['verified', 'Verified'],
    ['required', 'Required'], ['visible', 'Visible'], ['constant', 'Constant'], ['description', 'Description'],
  ] as const;
  return [
    { label: 'Data type', value: declaration.dataType,
      link: catalog.filter(type => type.name === declaration.dataType).length === 1
        ? { type: 'data-type', dataTypeName: declaration.dataType } : undefined },
    { label: 'Dimensions', value: formatMetadataDimensions(declaration.dimensions) },
    ...definitions.map(([key, label]) => ({ label, value: key in declaration ? declaration[key as keyof Declaration] : undefined })),
  ];
}

const DecoratedValue = memo(function DecoratedValue({ value, catalog, onOpen }: {
  value: NormalizedDecoratedTagValue; catalog: Catalog; onOpen: OpenView;
}) {
  const fields: MetadataField[] = value.kind === 'alarm'
    ? [{ label: 'Alarm type', value: value.alarmType }, { label: 'Alarm class', value: value.alarmClass },
      { label: 'HMI command', value: value.hmiCommand }]
    : [{ label: 'Name', value: value.name }, { label: 'Data type', value: value.dataType,
      link: catalog.filter(type => type.name === value.dataType).length === 1
        ? { type: 'data-type', dataTypeName: value.dataType! } : undefined },
    ...('radix' in value ? [{ label: 'Radix', value: value.radix }] : [])];
  if (value.kind === 'atomic') fields.push({ label: 'Value', value: value.value }, { label: 'Force value', value: value.forceValue });
  if (value.kind === 'array') fields.push({ label: 'Dimensions', value: formatMetadataDimensions(value.dimensions) });
  return <>
    <MetadataPropertyList fields={fields} onOpen={onOpen} />
    {value.kind === 'structure' && <DecoratedValues values={value.members} catalog={catalog} onOpen={onOpen} label="Members" />}
    {value.kind === 'array' && <OrderedItems items={value.elements} label="Array elements"
      summary={element => `[${element.index.join(',')}]${element.value !== undefined ? ` = ${formatMetadataValue(element.value)}` : ''}`}>
      {element => <>
        <MetadataPropertyList fields={[{ label: 'Value', value: element.value }, { label: 'Force value', value: element.forceValue }]} onOpen={onOpen} />
        <DecoratedValues values={element.structures} catalog={catalog} onOpen={onOpen} label="Structures" />
      </>}
    </OrderedItems>}
    {value.kind === 'alarm' && <>
      <OrderedItems items={Object.entries(value.parameters)} label="Alarm parameters" summary={([name]) => name}>
        {([name, parameter]) => <MetadataPropertyList fields={[{ label: name, value: parameter }]} onOpen={onOpen} />}
      </OrderedItems>
      <OrderedItems items={value.messages ?? []} label="Alarm messages" summary={message => formatMetadataValue(message.text)}>
        {message => <MetadataPropertyList fields={Object.entries(message).map(([label, entry]) => ({ label, value: entry }))} onOpen={onOpen} />}
      </OrderedItems>
    </>}
  </>;
});

const DecoratedValues = memo(function DecoratedValues({ values, catalog, onOpen, label }: {
  values: NormalizedDecoratedTagValue[]; catalog: Catalog; onOpen: OpenView; label: string;
}) {
  return <OrderedItems items={values} label={label} summary={value => value.kind === 'alarm' ? `${value.alarmType} alarm`
    : `${value.name ?? value.dataType ?? value.kind}${value.kind === 'atomic' ? ` = ${formatMetadataValue(value.value)}` : ''}`}>
    {value => <DecoratedValue value={value} catalog={catalog} onOpen={onOpen} />}
  </OrderedItems>;
});

const DeclarationComments = memo(function DeclarationComments({ comments, onOpen }: { comments?: NormalizedTagComment[]; onOpen: OpenView }) {
  if (comments === undefined) return <p className="text-xs text-theme-secondary">Comments: Not supplied</p>;
  return <OrderedItems items={comments} label="Operand comments" summary={comment => `Operand: ${formatMetadataValue(comment.operand)}`}>
    {comment => <>
      <MetadataPropertyList fields={[{ label: 'Operand', value: comment.operand }, { label: 'Unused', value: comment.unused }]} onOpen={onOpen} />
      <OrderedItems items={comment.values} label="Comment values" summary={text => formatMetadataValue(text)}>
        {text => <p className="whitespace-pre-wrap break-words text-xs">{formatMetadataValue(text)}</p>}
      </OrderedItems>
      <OrderedItems items={comment.localizedTexts} label="Localized comments" summary={text => formatMetadataValue(text.language)}>
        {text => <MetadataPropertyList fields={[{ label: 'Language', value: text.language }, { label: 'Text', value: text.text }]} onOpen={onOpen} />}
      </OrderedItems>
    </>}
  </OrderedItems>;
});

const DeclarationDetails = memo(function DeclarationDetails({ declaration, catalog, onOpen }: {
  declaration: Declaration; catalog: Catalog; onOpen: OpenView;
}) {
  const fields = useMemo(() => declarationFields(declaration, catalog), [declaration, catalog]);
  const defaults: NormalizedTagData[] | undefined = useMemo(() => declaration.defaultData === undefined ? undefined
    : Array.isArray(declaration.defaultData) ? declaration.defaultData : [declaration.defaultData], [declaration]);
  return <>
    <MetadataPropertyList fields={fields} onOpen={onOpen} />
    <h3 className="text-xs font-semibold">Comments</h3>
    <DeclarationComments comments={declaration.comments} onOpen={onOpen} />
    <h3 className="text-xs font-semibold">Defaults</h3>
    {defaults === undefined ? <MetadataPropertyList fields={[{ label: 'Default value', value: 'defaultValue' in declaration ? declaration.defaultValue : undefined }]} onOpen={onOpen} />
      : <OrderedItems items={defaults} label="Default representations" summary={data => formatMetadataValue(data.format)}>
        {data => <>
          <MetadataPropertyList fields={[{ label: 'Format', value: data.format }, { label: 'Length', value: data.length }]} onOpen={onOpen} />
          {data.text !== undefined && <section aria-label="Source default text">
            <h4 className="mb-2 text-xs font-medium">Source text</h4>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-theme-elevated p-3 text-xs [overflow-wrap:anywhere]">{formatMetadataValue(data.text)}</pre>
          </section>}
          <DecoratedValues values={data.values} catalog={catalog} onOpen={onOpen} label="Decorated values" />
        </>}
      </OrderedItems>}
  </>;
});

function DeclarationView({ declarations, catalog, onOpen }: {
  declarations: readonly Declaration[]; catalog: Catalog; onOpen: OpenView;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? declarations.filter(declaration => [declaration.name, declaration.dataType,
      'usage' in declaration ? declaration.usage : ''].some(value => value.toLowerCase().includes(query))) : declarations;
  }, [declarations, search]);
  return <div className="space-y-3">
    <Input aria-label="Filter declarations" placeholder="Filter by name, type, or usage" className="h-8 text-xs"
      value={search} onChange={event => setSearch(event.target.value)} />
    {filtered.length === 0 && search && <p className="text-xs text-theme-secondary">No matching declarations. Try another name, type, or usage.</p>}
    <OrderedItems items={filtered} label="Declarations" summary={declaration => <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
    <span className="font-mono font-medium">{declaration.name}</span>{' '}
    <span className="text-theme-secondary">{declaration.dataType}</span>
    {'usage' in declaration && <>{' '}<span className="text-theme-secondary">{declaration.usage}</span></>}
  </span>}>
    {declaration => <DeclarationDetails declaration={declaration} catalog={catalog} onOpen={onOpen} />}
  </OrderedItems></div>;
}

export default memo(DeclarationView);
