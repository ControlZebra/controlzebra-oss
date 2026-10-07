import { memo } from 'react';
import type { NormalizedController, NormalizedTrend, NormalizedTrendPen } from 'ladder-visualizer';
import { MetadataPropertyList } from './MetadataInspector';
import { formatMetadataValue } from './metadata-model';
import type { TabData } from './useTabs';
import OrderedItems from './OrderedItems';

const trendFields: Array<[keyof NormalizedTrend, string]> = [
  ['name', 'Name'], ['uid', 'UID'], ['description', 'Description'], ['samplePeriod', 'Sample period'],
  ['numberOfCaptures', 'Number of captures'], ['captureSizeType', 'Capture size type'], ['captureSize', 'Capture size'],
  ['startTriggerType', 'Start trigger type'], ['startTriggerTag1', 'Start trigger tag 1'],
  ['startTriggerOperation1', 'Start trigger operation 1'], ['startTriggerTargetType1', 'Start trigger target type 1'],
  ['startTriggerTargetValue1', 'Start trigger target value 1'], ['startTriggerTargetTag1', 'Start trigger target tag 1'],
  ['startTriggerLogicalOperation', 'Start trigger logical operation'], ['startTriggerTag2', 'Start trigger tag 2'],
  ['startTriggerOperation2', 'Start trigger operation 2'], ['startTriggerTargetType2', 'Start trigger target type 2'],
  ['startTriggerTargetValue2', 'Start trigger target value 2'], ['startTriggerTargetTag2', 'Start trigger target tag 2'],
  ['preSampleType', 'Pre-sample type'], ['preSamples', 'Pre-samples'],
  ['stopTriggerType', 'Stop trigger type'], ['stopTriggerTag1', 'Stop trigger tag 1'],
  ['stopTriggerOperation1', 'Stop trigger operation 1'], ['stopTriggerTargetType1', 'Stop trigger target type 1'],
  ['stopTriggerTargetValue1', 'Stop trigger target value 1'], ['stopTriggerTargetTag1', 'Stop trigger target tag 1'],
  ['stopTriggerLogicalOperation', 'Stop trigger logical operation'], ['stopTriggerTag2', 'Stop trigger tag 2'],
  ['stopTriggerOperation2', 'Stop trigger operation 2'], ['stopTriggerTargetType2', 'Stop trigger target type 2'],
  ['stopTriggerTargetValue2', 'Stop trigger target value 2'], ['stopTriggerTargetTag2', 'Stop trigger target tag 2'],
  ['postSampleType', 'Post-sample type'], ['postSamples', 'Post-samples'], ['trendxVersion', 'TrendX version'],
];
const penFields: Array<[keyof NormalizedTrendPen, string]> = [
  ['name', 'Name'], ['description', 'Description'], ['color', 'Color'], ['visible', 'Visible'],
  ['width', 'Width'], ['type', 'Type'], ['style', 'Style'], ['marker', 'Marker'],
  ['min', 'Minimum'], ['max', 'Maximum'], ['engineeringUnits', 'Engineering units'],
];

function ControllerCollections({ controller, type, onOpen }: {
  controller: NormalizedController; type: 'trends' | 'watch-lists';
  onOpen: (data: TabData, title: string) => void;
}) {
  return type === 'trends' ? <OrderedItems items={controller.trends ?? []} label="Trends"
    summary={trend => formatMetadataValue(trend.name)}>
    {trend => <>
      <MetadataPropertyList fields={trendFields.map(([key, label]) => ({ label, value: trend[key] }))} onOpen={onOpen} />
      <h3 className="text-xs font-semibold">Pens</h3>
      <OrderedItems items={trend.pens} label="Pens" summary={pen => formatMetadataValue(pen.name)}>
        {pen => <MetadataPropertyList fields={penFields.map(([key, label]) => ({ label, value: pen[key] }))} onOpen={onOpen} />}
      </OrderedItems>
    </>}
  </OrderedItems> : <OrderedItems items={controller.quickWatchLists ?? []} label="Quick Watch Lists"
    summary={list => formatMetadataValue(list.name)}>
    {list => <>
      <MetadataPropertyList fields={[{ label: 'Name', value: list.name }]} onOpen={onOpen} />
      <h3 className="text-xs font-semibold">Watch tags</h3>
      <OrderedItems items={list.watchTags} label="Watch tags" summary={tag => formatMetadataValue(tag.specifier)}>
        {tag => <MetadataPropertyList fields={[{ label: 'Tag', value: tag.specifier }, { label: 'Source scope', value: tag.scope }]} onOpen={onOpen} />}
      </OrderedItems>
    </>}
  </OrderedItems>;
}

export default memo(ControllerCollections);
