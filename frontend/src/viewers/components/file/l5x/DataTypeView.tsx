import { memo, useCallback, useId, useMemo, useRef, type KeyboardEvent } from 'react';
import type { NormalizedController, NormalizedDataType } from 'ladder-visualizer';
import { Button } from '../../../../shared/ui/button';
import { DataTypeTable } from './DataTypeTable';
import MetadataInspector from './MetadataInspector';
import type { DataTypeViewMode, TabData } from './useTabs';

const views: DataTypeViewMode[] = ['table', 'other'];

const DataTypeView = memo(function DataTypeView({ controller, dataTypeName, view = 'table', onViewChange, onDataTypeSelect, onOpen, onShowRaw }: {
  controller: NormalizedController;
  dataTypeName: string;
  view?: DataTypeViewMode;
  onViewChange: (view: DataTypeViewMode) => void;
  onDataTypeSelect: (dataType: NormalizedDataType) => void;
  onOpen: (data: TabData, title: string) => void;
  onShowRaw?: () => void;
}) {
  const id = useId();
  const tableTab = useRef<HTMLButtonElement>(null);
  const otherTab = useRef<HTMLButtonElement>(null);
  const dataTypes = controller.dataTypeCatalog ?? controller.dataTypes;
  const dataType = useMemo(() => dataTypes.find(type => type.name === dataTypeName), [dataTypes, dataTypeName]);
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    let next: DataTypeViewMode;
    if (event.key === 'Home') next = 'table';
    else if (event.key === 'End') next = 'other';
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = view === 'table' ? 'other' : 'table';
    else return;
    event.preventDefault();
    onViewChange(next);
    (next === 'table' ? tableTab : otherTab).current?.focus();
  }, [view, onViewChange]);

  if (!dataType) return <section className="p-4 text-sm text-theme-secondary" aria-label="Missing data type">
    <p>This data type is no longer in the file. Select another item in the Project Organizer.</p>
    {onShowRaw && <Button variant="ghost" size="sm" onClick={onShowRaw}>View Raw</Button>}
  </section>;

  return <div className="flex h-full min-h-0 min-w-0 flex-col">
    <div role="tablist" aria-label={`${dataTypeName} views`} className="flex shrink-0 border-b border-theme-default bg-theme-surface px-4">
      {views.map(name => <Button key={name} ref={name === 'table' ? tableTab : otherTab} type="button" variant="ghost" size="sm"
        role="tab" id={`${id}-${name}-tab`} aria-controls={`${id}-${name}-panel`} aria-selected={view === name}
        tabIndex={view === name ? 0 : -1} onKeyDown={handleKeyDown} onClick={() => onViewChange(name)}
        className={`h-8 rounded-none border-b-2 px-3 ${view === name ? 'border-[var(--color-accent-primary)] text-theme-primary' : 'border-transparent'}`}>
        {name}
      </Button>)}
    </div>
    <div role="tabpanel" id={`${id}-table-panel`} aria-labelledby={`${id}-table-tab`} hidden={view !== 'table'}
      tabIndex={0} className={`min-h-0 flex-1 overflow-hidden p-4 ${view !== 'table' ? 'hidden' : ''}`}>
      <DataTypeTable dataType={dataType} allDataTypes={dataTypes} onDataTypeSelect={onDataTypeSelect} />
    </div>
    <div role="tabpanel" id={`${id}-other-panel`} aria-labelledby={`${id}-other-tab`} hidden={view !== 'other'}
      tabIndex={0} className={`min-h-0 flex-1 overflow-auto ${view !== 'other' ? 'hidden' : ''}`}>
      <MetadataInspector controller={controller} target={{ kind: 'data-type', name: dataTypeName }} onOpen={onOpen} onShowRaw={onShowRaw} />
    </div>
  </div>;
});

export default DataTypeView;
