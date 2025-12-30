import { memo } from 'react';
import CommitIcon from '@mui/icons-material/Commit';
import { ICON_SIZES, MOCK_COMMITS } from '../../../constants';

const iconStyle = { fontSize: ICON_SIZES.sm };

function CommitItem({ commit }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-gray-700/50 cursor-pointer transition-colors">
      <CommitIcon sx={iconStyle} className="text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-sm truncate">{commit.message}</p>
        <p className="text-gray-500 text-xs">
          <span className="font-mono">{commit.hash}</span>
          <span className="mx-1">•</span>
          <span>{commit.time}</span>
        </p>
      </div>
    </div>
  );
}

function HistoryView() {
  if (MOCK_COMMITS.length === 0) {
    return (
      <p className="px-3 py-4 text-gray-500 text-sm text-center">
        No commit history
      </p>
    );
  }

  return (
    <div className="py-1">
      {MOCK_COMMITS.map(commit => (
        <CommitItem key={commit.id} commit={commit} />
      ))}
    </div>
  );
}

export default memo(HistoryView);
