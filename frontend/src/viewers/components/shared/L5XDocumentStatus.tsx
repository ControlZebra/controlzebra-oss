import { memo, useMemo } from 'react';
import type { ParseLocation } from 'ladder-visualizer';
import { Button } from '../../../shared/ui/button';
import { findLocationRecord, type DocumentRecord } from '../file/l5x/document-model';
import type { TabData } from '../file/l5x/useTabs';
import type { L5XDocumentResult } from './l5x-document';

function locationLabel(location?: ParseLocation): string {
  if (!location) return '';
  return [location.line === undefined ? '' : `Line ${location.line}`,
    location.column === undefined ? '' : `column ${location.column}`,
    location.offset === undefined ? '' : `offset ${location.offset}`,
    location.path].filter(Boolean).join(', ');
}

const STATUS_LABELS = {
  complete: 'Supported content loaded',
  partial: 'Some content is available only in Raw',
  failed: 'Cannot parse L5X file',
};

/** Source locations are shown for inspection, never used as comparison keys. */
function L5XDocumentStatus({ result, label, onShowRaw, records, onOpen }: {
  result: L5XDocumentResult | null;
  label?: string;
  onShowRaw?: () => void;
  records?: DocumentRecord[];
  onOpen?: (data: TabData, title: string) => void;
}): JSX.Element {
  const diagnostics = useMemo(() => [
    ...(result?.errors ?? []).map(issue => ({ ...issue, severity: 'Error' })),
    ...(result?.warnings ?? []).map(issue => ({ ...issue, severity: 'Notice' })),
  ], [result]);

  return (
    <section aria-label={label ? `${label} parser status` : 'L5X parser status'}
      className="shrink-0 border-b border-shell-divider bg-theme-surface px-3 py-2 text-xs text-theme-secondary">
      <div className="flex items-center justify-between gap-2">
        <p className={result?.status === 'failed' ? 'text-theme-error' : 'text-theme-primary'}>
          {label && <span className="font-medium">{label}: </span>}
          {result ? result.status === 'partial' && onOpen ? 'Some content needs source inspection' : STATUS_LABELS[result.status] : 'File absent'}
        </p>
        {onShowRaw && <Button size="sm" variant="ghost" onClick={onShowRaw}>View Raw</Button>}
      </div>
      {result?.data && result.data.encodedData.length > 0 && (
        <p>Encoded content is preserved. {onOpen ? 'Open Document to inspect its payload and wrapper.' : 'Use Raw to inspect its source.'}</p>
      )}
      {result?.status === 'failed' && <p>Use Raw to inspect the file, or export it again from Studio 5000.</p>}
      {diagnostics.length > 0 && (
        <details open={result?.status === 'failed'}>
          <summary className="cursor-pointer py-1">{diagnostics.length} parser {diagnostics.length === 1 ? 'notice' : 'notices'}</summary>
          <ul className="max-h-48 space-y-2 overflow-auto break-words py-1">
            {diagnostics.map((issue, index) => (
              <li key={index}>
                <p>{issue.severity}: {issue.message}</p>
                {issue.location && <p className="text-theme-muted">{locationLabel(issue.location)}</p>}
                {onOpen && (() => {
                  const record = findLocationRecord(records ?? [], issue.location?.path);
                  return record && <Button size="sm" variant="ghost"
                    onClick={() => onOpen({ type: 'document', selection: record.selection }, record.title)}>Inspect source record</Button>;
                })()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default memo(L5XDocumentStatus);
