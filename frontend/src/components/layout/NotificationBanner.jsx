/**
 * NotificationBanner - Dismissible notification banner with auto-hide timer.
 * Displays status messages (success/error/info) with a progress countdown.
 */
import { memo, useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { useRepo } from '../../context';
import { Button } from '../ui';

// Duration before auto-dismiss (in ms)
const NOTIFICATION_DURATION = 5000;

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

  // Handle progress countdown for auto-dismiss
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

  // Don't render if not visible or no message
  if (!isVisible || !statusMessage) {
    return null;
  }

  // Determine background color based on message type
  const bgColorClass = statusMessage.type === 'error' 
    ? 'bg-red-600/90' 
    : 'bg-blue-600/90'; // success and info use blue

  return (
    <div className="w-full shrink-0">
      {/* Banner content */}
      <div className={`${bgColorClass} px-4 py-1 flex items-center justify-between`}>
        <span className="text-white text-sm">{statusMessage.text}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          title="Dismiss"
          aria-label="Dismiss notification"
          className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/10"
        >
          <X style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
        </Button>
      </div>
      
      {/* Progress line showing time until auto-dismiss */}
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
