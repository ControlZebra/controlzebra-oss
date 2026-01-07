/**
 * Spinner - Simple loading indicator component.
 * Uses Lucide Loader2 icon with rotation animation.
 */
import { memo } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * @param {Object} props
 * @param {number} [props.size=14] - Size of the spinner in pixels
 * @param {string} [props.className=''] - Additional CSS classes
 */
function Spinner({ size = 14, className = '' }) {
  return (
    <Loader2 
      className={`animate-spin text-theme-secondary ${className}`}
      style={{ width: size, height: size }} 
    />
  );
}

export default memo(Spinner);
