import { memo } from 'react';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { ICON_SIZES, FILE_STATUS, MOCK_CHANGED_FILES } from '../../../constants';

const iconStyle = { fontSize: ICON_SIZES.sm };
const statusIconStyle = { fontSize: ICON_SIZES.xs };

const STATUS_CONFIG = {
  [FILE_STATUS.ADDED]: { icon: AddIcon, className: 'text-green-400' },
  [FILE_STATUS.MODIFIED]: { icon: EditIcon, className: 'text-yellow-400' },
  [FILE_STATUS.DELETED]: { icon: DeleteIcon, className: 'text-red-400' },
};

function FileItem({ file }) {
  const statusConfig = STATUS_CONFIG[file.status];
  const StatusIcon = statusConfig?.icon;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700/50 cursor-pointer transition-colors">
      <InsertDriveFileIcon sx={iconStyle} className="text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-sm truncate">{file.name}</p>
        <p className="text-gray-500 text-xs truncate">{file.path}</p>
      </div>
      {StatusIcon && (
        <StatusIcon sx={statusIconStyle} className={statusConfig.className} />
      )}
    </div>
  );
}

function ChangesView() {
  if (MOCK_CHANGED_FILES.length === 0) {
    return (
      <p className="px-3 py-4 text-gray-500 text-sm text-center">
        No changes detected
      </p>
    );
  }

  return (
    <div className="py-1">
      {MOCK_CHANGED_FILES.map(file => (
        <FileItem key={file.id} file={file} />
      ))}
    </div>
  );
}

export default memo(ChangesView);
