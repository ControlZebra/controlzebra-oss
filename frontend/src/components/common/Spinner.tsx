/**
 * Spinner - Simple loading indicator component.
 * Uses Lucide Loader2 icon with rotation animation.
 */
import { memo } from 'react';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: number;
  className?: string;
}

function Spinner({ size = 14, className = '' }: SpinnerProps) {
  return (
    <Loader2 
      className={`animate-spin text-theme-secondary ${className}`}
      style={{ width: size, height: size }} 
    />
  );
}

export default memo(Spinner);
