import { memo } from 'react';
import { ProgramNavigator, type ProgramNavigatorProps } from 'ladder-visualizer';
import { cn } from '../../../shared/utils/misc';
import L5XMetadataNavigator from './L5XMetadataNavigator';
import type { MetadataTarget } from '../file/l5x/metadata-model';

interface L5XProjectOrganizerProps extends ProgramNavigatorProps {
  onMetadataSelect?: (target: MetadataTarget, title: string) => void;
  selectedMetadataId?: string;
}

/** App heading for the library's navigation tree, shared by file and diff viewers. */
function L5XProjectOrganizer({ className, onMetadataSelect, selectedMetadataId, ...props }: L5XProjectOrganizerProps): JSX.Element {
  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden bg-theme-surface', className)}>
      <h2 className="shrink-0 border-b border-shell-divider px-3 py-2 text-sm font-semibold text-theme-primary">
        Project Organizer
      </h2>
      <ProgramNavigator {...props} className="l5x-project-organizer-tree min-h-0 flex-1" />
      {props.controller && onMetadataSelect && <L5XMetadataNavigator controller={props.controller}
        onSelect={onMetadataSelect} selectedId={selectedMetadataId} />}
    </div>
  );
}

export default memo(L5XProjectOrganizer);
