import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  GitBranch,
  Minus,
  Plus,
  RefreshCw,
  Tag,
} from 'lucide-react';

import { ICON_SIZES } from '../../../../shared/constants';

import type { DiffNavigatorModel, DiffRoutineGroup, DiffRoutineItem, DiffTagGroup, DiffTabDescriptor } from './diff-view-model';

interface DiffNavigatorProps {
  model: DiffNavigatorModel;
  activeTabId: string | null;
  onOpenItem: (descriptor: DiffTabDescriptor) => void;
}

const kindBadgeClasses = {
  added: 'text-theme-added bg-theme-added/10 border-theme-added/40',
  removed: 'text-theme-removed bg-theme-removed/10 border-theme-removed/40',
  modified: 'text-theme-modified bg-theme-modified/10 border-theme-modified/40',
};

const kindIconMap = {
  added: Plus,
  removed: Minus,
  modified: RefreshCw,
};

function CountBadge({ value }: { value: number }): JSX.Element | null {
  if (value <= 0) {
    return null;
  }

  return (
    <span className="rounded border border-theme-default bg-theme-elevated px-1.5 py-0.5 text-[11px] text-theme-muted">
      {value}
    </span>
  );
}

const UnsupportedSummary = memo(function UnsupportedSummary({ model }: { model: DiffNavigatorModel }): JSX.Element | null {
  const items = useMemo(() => {
    const nextItems: string[] = [];

    if (model.unsupported.stRoutineCount > 0) {
      nextItems.push(`${model.unsupported.stRoutineCount} ST routine` + (model.unsupported.stRoutineCount === 1 ? '' : 's'));
    }
    if (model.unsupported.otherRoutineCount > 0) {
      nextItems.push(`${model.unsupported.otherRoutineCount} other routine` + (model.unsupported.otherRoutineCount === 1 ? '' : 's'));
    }
    if (model.unsupported.dataTypeCount > 0) {
      nextItems.push(`${model.unsupported.dataTypeCount} data type` + (model.unsupported.dataTypeCount === 1 ? '' : 's'));
    }
    if (model.unsupported.aoiCount > 0) {
      nextItems.push(`${model.unsupported.aoiCount} AOI` + (model.unsupported.aoiCount === 1 ? '' : 's'));
    }
    if (model.unsupported.moduleCount > 0) {
      nextItems.push(`${model.unsupported.moduleCount} module` + (model.unsupported.moduleCount === 1 ? '' : 's'));
    }
    if (model.unsupported.controllerInfoChangeCount > 0) {
      nextItems.push(`${model.unsupported.controllerInfoChangeCount} controller info change` + (model.unsupported.controllerInfoChangeCount === 1 ? '' : 's'));
    }

    return nextItems;
  }, [model]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-theme-default px-3 py-2 text-[11px] text-theme-muted">
      Later phases will add navigator entries for {items.join(', ')}.
    </div>
  );
});

function SectionHeader({
  title,
  count,
  isExpanded,
  onToggle,
}: {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-theme-secondary hover:bg-theme-elevated/70"
    >
      {isExpanded ? <ChevronDown size={ICON_SIZES.xs} /> : <ChevronRight size={ICON_SIZES.xs} />}
      <FolderTree size={ICON_SIZES.xs} className="text-theme-muted" />
      <span className="truncate">{title}</span>
      <span className="ml-auto text-[11px] text-theme-muted">{count}</span>
    </button>
  );
}

function RoutineItem({
  item,
  isActive,
  onOpen,
}: {
  item: DiffRoutineItem;
  isActive: boolean;
  onOpen: (descriptor: DiffTabDescriptor) => void;
}): JSX.Element {
  const KindIcon = kindIconMap[item.kind];
  const changedRungs = item.rungSummary.added + item.rungSummary.removed + item.rungSummary.modified;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={[
        'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors',
        isActive ? 'bg-theme-elevated text-theme-primary' : 'text-theme-secondary hover:bg-theme-elevated/60 hover:text-theme-primary',
      ].join(' ')}
    >
      <GitBranch size={ICON_SIZES.xs} className="mt-0.5 shrink-0 text-theme-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{item.title}</div>
        <div className="truncate text-[11px] text-theme-muted">
          {changedRungs > 0 ? `${changedRungs} changed rung${changedRungs === 1 ? '' : 's'}` : `${item.changeCount} change${item.changeCount === 1 ? '' : 's'}`}
        </div>
      </div>
      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${kindBadgeClasses[item.kind]}`}>
        <KindIcon size={10} />
        {item.kind}
      </span>
    </button>
  );
}

function RoutineGroupSection({
  group,
  isExpanded,
  onToggle,
  activeTabId,
  onOpen,
}: {
  group: DiffRoutineGroup;
  isExpanded: boolean;
  onToggle: () => void;
  activeTabId: string | null;
  onOpen: (descriptor: DiffTabDescriptor) => void;
}): JSX.Element {
  return (
    <div className="px-2 pb-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-theme-secondary hover:bg-theme-elevated/60"
      >
        {isExpanded ? <ChevronDown size={ICON_SIZES.xs} /> : <ChevronRight size={ICON_SIZES.xs} />}
        <span className="truncate font-medium text-theme-primary">{group.title}</span>
        <CountBadge value={group.routineCount} />
      </button>

      {isExpanded && (
        <div className="ml-4 space-y-0.5 border-l border-theme-default pl-2">
          {group.routines.map((item) => (
            <RoutineItem
              key={item.id}
              item={item}
              isActive={item.id === activeTabId}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TagGroupItem({
  item,
  isActive,
  onOpen,
}: {
  item: DiffTagGroup;
  isActive: boolean;
  onOpen: (descriptor: DiffTabDescriptor) => void;
}): JSX.Element {
  const KindIcon = kindIconMap[item.kind];
  const summaryParts = [
    item.counts.modified > 0 ? `~${item.counts.modified}` : null,
    item.counts.added > 0 ? `+${item.counts.added}` : null,
    item.counts.removed > 0 ? `-${item.counts.removed}` : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={[
        'mx-2 flex w-[calc(100%-1rem)] items-start gap-2 rounded px-2 py-1.5 text-left transition-colors',
        isActive ? 'bg-theme-elevated text-theme-primary' : 'text-theme-secondary hover:bg-theme-elevated/60 hover:text-theme-primary',
      ].join(' ')}
    >
      <Tag size={ICON_SIZES.xs} className="mt-0.5 shrink-0 text-theme-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{item.title}</div>
        <div className="truncate text-[11px] text-theme-muted">
          {summaryParts.length > 0 ? summaryParts.join('  ') : `${item.changeCount} change${item.changeCount === 1 ? '' : 's'}`}
        </div>
      </div>
      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${kindBadgeClasses[item.kind]}`}>
        <KindIcon size={10} />
        {item.kind}
      </span>
    </button>
  );
}

function DiffNavigator({ model, activeTabId, onOpenItem }: DiffNavigatorProps): JSX.Element {
  const [expandedSections, setExpandedSections] = useState({
    routines: true,
    tags: true,
  });
  const [expandedPrograms, setExpandedPrograms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedPrograms((previousState) => {
      const nextState = { ...previousState };
      let changed = false;

      for (const group of model.routineGroups) {
        if (nextState[group.id] === undefined) {
          nextState[group.id] = true;
          changed = true;
        }
      }

      return changed ? nextState : previousState;
    });
  }, [model.routineGroups]);

  const toggleSection = useCallback((key: 'routines' | 'tags') => {
    setExpandedSections((previousState) => ({
      ...previousState,
      [key]: !previousState[key],
    }));
  }, []);

  const toggleProgram = useCallback((groupId: string) => {
    setExpandedPrograms((previousState) => ({
      ...previousState,
      [groupId]: !previousState[groupId],
    }));
  }, []);

  if (model.totalItems === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 px-4 py-6 text-center text-sm text-theme-muted">
          No changed routines or tags are available in this diff yet.
        </div>
        <UnsupportedSummary model={model} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-theme-surface">
      <div className="flex-1 overflow-auto py-2">
        <SectionHeader
          title="Changed Routines"
          count={model.routineGroups.reduce((sum, group) => sum + group.routineCount, 0)}
          isExpanded={expandedSections.routines}
          onToggle={() => toggleSection('routines')}
        />

        {expandedSections.routines && (
          <div className="space-y-1 pb-2">
            {model.routineGroups.length > 0 ? (
              model.routineGroups.map((group) => (
                <RoutineGroupSection
                  key={group.id}
                  group={group}
                  isExpanded={expandedPrograms[group.id] ?? true}
                  onToggle={() => toggleProgram(group.id)}
                  activeTabId={activeTabId}
                  onOpen={onOpenItem}
                />
              ))
            ) : (
              <div className="px-4 py-2 text-xs text-theme-muted">No supported routine changes in this diff.</div>
            )}
          </div>
        )}

        <SectionHeader
          title="Changed Tags"
          count={model.tagGroups.length}
          isExpanded={expandedSections.tags}
          onToggle={() => toggleSection('tags')}
        />

        {expandedSections.tags && (
          <div className="space-y-1 pb-2">
            {model.tagGroups.length > 0 ? (
              model.tagGroups.map((item) => (
                <TagGroupItem
                  key={item.id}
                  item={item}
                  isActive={item.id === activeTabId}
                  onOpen={onOpenItem}
                />
              ))
            ) : (
              <div className="px-4 py-2 text-xs text-theme-muted">No tag changes in this diff.</div>
            )}
          </div>
        )}
      </div>

      <UnsupportedSummary model={model} />
    </div>
  );
}

export default memo(DiffNavigator);