import { memo, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Undo2 } from 'lucide-react';
import type { FileStatus } from '../../../context';
import { FILE_STATUS } from '../../../shared/constants';
import { Button, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../shared/ui';
import { ICON_STYLES, STATUS_CONFIG } from '../../../shared/utils/gitHelpers';
import { supportsDiff } from '../../../shared/constants/file-utils';

interface Props {
  files: FileStatus[];
  repoPath?: string;
  onOpenDiff: (file: FileStatus) => void;
  onDiscardFile: (file: FileStatus) => Promise<void>;
  onDiscardAll: () => void;
  disabled: boolean;
}

function relativeFilePath(path: string, repoPath?: string): string {
  const normalized = path.replace(/\\/g, '/');
  const root = repoPath?.replace(/\\/g, '/').replace(/\/$/, '');
  if (root && normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`))
    return normalized.slice(root.length + 1);
  if (/^(\/|[A-Za-z]:\/)/.test(normalized)) return normalized.split('/').pop() || '';
  return normalized;
}

const ChangedFileRow = memo(function ChangedFileRow({
  file,
  repoPath,
  onOpenDiff,
  onDiscardFile,
  disabled,
  index,
}: Pick<Props, 'repoPath' | 'onOpenDiff' | 'onDiscardFile' | 'disabled'> & {
  file: FileStatus;
  index: number;
}): JSX.Element {
  const config = STATUS_CONFIG[file.status] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const relativePath = relativeFilePath(file.path, repoPath);
  const slash = relativePath.lastIndexOf('/');
  const folder = slash < 0 ? '.\\' : `.\\${relativePath.slice(0, slash).replace(/\//g, '\\')}\\`;
  const name = relativePath.slice(slash + 1) || file.name;
  const open = useCallback(() => onOpenDiff(file), [file, onOpenDiff]);
  const discard = useCallback(() => {
    void onDiscardFile(file);
  }, [file, onDiscardFile]);
  return (
    <TableRow className="group h-12 border-0" aria-rowindex={index + 2}>
      <TableCell className="min-w-0 p-0">
        <Button
          variant="ghost"
          disabled={!supportsDiff(file.path)}
          onClick={open}
          title={`View changes: ${relativePath}`}
          aria-label={`View changes: ${relativePath}`}
          className="h-12 w-full min-w-0 justify-start px-2 text-left font-normal"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm text-theme-primary">{name}</span>
            <span className="block truncate text-xs text-theme-muted" title={folder}>
              {folder}
            </span>
          </span>
        </Button>
      </TableCell>
      <TableCell
        data-status={file.status}
        className="px-1 py-0 text-xs text-theme-muted data-[status=added]:text-theme-added data-[status=deleted]:text-theme-removed data-[status=modified]:text-theme-modified data-[status=renamed]:text-theme-modified"
      >
        <span title={config.label}>{config.label}</span>
      </TableCell>
      <TableCell className="p-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-500/10 hover:text-theme-error disabled:opacity-40"
          onClick={discard}
          disabled={disabled}
          aria-label={`Discard changes: ${relativePath}`}
          title={`Discard changes: ${relativePath}`}
        >
          <Undo2 style={ICON_STYLES.xs} />
        </Button>
      </TableCell>
    </TableRow>
  );
});

function ChangedFilesTable({
  files,
  repoPath,
  onOpenDiff,
  onDiscardFile,
  onDiscardAll,
  disabled,
}: Props): JSX.Element {
  const scroll = useRef<HTMLDivElement>(null);
  const virtual = files.length > 50;
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 48,
    overscan: 8,
    enabled: virtual,
    scrollMargin: 28,
  });
  const items = virtualizer.getVirtualItems();
  const visible = useMemo(
    () =>
      virtual
        ? items.map((item) => ({ file: files[item.index], index: item.index }))
        : files.map((file, index) => ({ file, index })),
    [files, items, virtual]
  );
  const paddingTop = virtual && items.length ? Math.max(0, items[0].start - 28) : 0;
  const paddingBottom = virtual
    ? Math.max(0, virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 28) + 28)
    : 0;
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Changed files">
      <header className="flex shrink-0 items-center justify-between px-3 py-1">
        <span className="text-xs text-theme-muted">Changed files ({files.length})</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onDiscardAll}
          disabled={disabled}
          title="Discard all changes"
          aria-label="Discard all changes"
        >
          <Undo2 style={ICON_STYLES.xs} />
        </Button>
      </header>
      <div
        ref={scroll}
        className="min-h-0 flex-1 overflow-y-auto px-1"
        data-testid="changed-files-scroll"
      >
        <table
          className="w-full table-fixed text-sm"
          aria-label="Changed files"
          aria-rowcount={files.length + 1}
        >
          <colgroup>
            <col />
            <col style={{ width: 68 }} />
            <col style={{ width: 32 }} />
          </colgroup>
          <TableHeader className="sticky top-0 z-10 bg-theme-surface">
            <TableRow className="border-0">
              <TableHead className="h-7 px-2 text-xs">File</TableHead>
              <TableHead className="h-7 px-1 text-xs">Change</TableHead>
              <TableHead className="h-7 p-0">
                <span className="sr-only">Discard</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paddingTop > 0 && (
              <tr aria-hidden="true">
                <td colSpan={3} style={{ height: paddingTop, padding: 0 }} />
              </tr>
            )}
            {visible.map(({ file, index }) => (
              <ChangedFileRow
                key={file.path}
                file={file}
                index={index}
                repoPath={repoPath}
                onOpenDiff={onOpenDiff}
                onDiscardFile={onDiscardFile}
                disabled={disabled}
              />
            ))}
            {paddingBottom > 0 && (
              <tr aria-hidden="true">
                <td colSpan={3} style={{ height: paddingBottom, padding: 0 }} />
              </tr>
            )}
          </TableBody>
        </table>
      </div>
    </section>
  );
}

export default memo(ChangedFilesTable);
