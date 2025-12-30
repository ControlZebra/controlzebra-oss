import { memo, useState, useCallback } from 'react';
import SaveIcon from '@mui/icons-material/Save';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { ICON_SIZES, FILE_STATUS, MOCK_CHANGED_FILES } from '../../../constants';

const iconStyle = { fontSize: ICON_SIZES.sm };
const fileIconStyle = { fontSize: ICON_SIZES.sm };
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
    <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-700/50 cursor-pointer transition-colors">
      <InsertDriveFileIcon sx={fileIconStyle} className="text-gray-400 shrink-0" />
      <span className="flex-1 text-gray-200 text-xs truncate">{file.name}</span>
      {StatusIcon && (
        <StatusIcon sx={statusIconStyle} className={statusConfig.className} />
      )}
    </div>
  );
}

function CommitPanel() {
  const [message, setMessage] = useState('');

  const handleMessageChange = useCallback((e) => {
    setMessage(e.target.value);
  }, []);

  const handleSave = useCallback(() => {
    if (!message.trim()) return;
    console.log('Saving changes with message:', message);
    // TODO: Implement save
  }, [message]);

  const handleShare = useCallback(() => {
    console.log('Sharing changes');
    // TODO: Implement share/push
  }, []);

  return (
    <div className="h-full flex">
      {/* Left: Changed files list (30%) */}
      <div className="w-[30%] border-r border-gray-700 flex flex-col">
        <div className="px-2 py-1.5 border-b border-gray-800">
          <span className="text-gray-400 text-xs">{MOCK_CHANGED_FILES.length} files</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {MOCK_CHANGED_FILES.map(file => (
            <FileItem key={file.id} file={file} />
          ))}
        </div>
      </div>

      {/* Right: Commit message & buttons (70%) */}
      <div className="w-[70%] flex flex-col p-3 gap-2">
        <textarea
          value={message}
          onChange={handleMessageChange}
          placeholder="Commit message..."
          className="flex-1 px-2.5 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
        />
        
        <div className="flex items-center gap-2 justify-end">
          <button 
            onClick={handleSave}
            disabled={!message.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-gray-200 text-xs font-medium transition-colors"
          >
            <SaveIcon sx={iconStyle} />
            <span>Save</span>
          </button>
          <button 
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-white text-xs font-medium transition-colors"
          >
            <CloudUploadIcon sx={iconStyle} />
            <span>Share</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(CommitPanel);
