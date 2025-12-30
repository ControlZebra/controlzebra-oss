import { memo, useEffect, useState, useCallback } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { ICON_SIZES } from '../../constants';
import { useRepo } from '../../context';

const iconStyle = { fontSize: ICON_SIZES.sm };
const NOTIFICATION_DURATION = 5000; // 5 seconds

function NotificationBanner() {
  const { statusMessage, clearStatusMessage } = useRepo();
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(false);

  // Handle showing/hiding animation
  useEffect(() => {
    if (statusMessage) {
      setIsVisible(true);
      setProgress(100);
    } else {
      setIsVisible(false);
    }
  }, [statusMessage]);

  // Handle progress countdown
  useEffect(() => {
    if (!statusMessage) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / NOTIFICATION_DURATION) * 100);
      setProgress(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [statusMessage]);

  const handleClose = useCallback(() => {
    clearStatusMessage();
  }, [clearStatusMessage]);

  if (!isVisible || !statusMessage) {
    return null;
  }

  const bgColorClass = statusMessage.type === 'error' 
    ? 'bg-red-600/90' 
    : statusMessage.type === 'success' 
      ? 'bg-blue-600/90' 
      : 'bg-blue-600/90';

  return (
    <div className="w-full shrink-0">
      {/* Banner content */}
      <div className={`${bgColorClass} px-4 py-1 flex items-center justify-between`}>
        <span className="text-white text-sm">{statusMessage.text}</span>
        <button
          onClick={handleClose}
          className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
          title="Dismiss"
          aria-label="Dismiss notification"
        >
          <CloseIcon sx={iconStyle} />
        </button>
      </div>
      
      {/* Progress line */}
      <div className="h-0.5 bg-gray-800 w-full">
        <div 
          className="h-full bg-blue-400 transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default memo(NotificationBanner);
