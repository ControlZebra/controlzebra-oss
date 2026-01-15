/**
 * GitLabIcon - Custom GitLab logo icon.
 * Used across Profile and Settings pages.
 */
import { CSSProperties } from 'react';

interface GitLabIconProps {
  className?: string;
  style?: CSSProperties;
}

function GitLabIcon({ className, style }: GitLabIconProps) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
      style={style}
    >
      <path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 00-.867 0L16.418 9.45H7.582L4.919 1.263a.455.455 0 00-.867 0L1.386 9.452.044 13.587a.924.924 0 00.331 1.023L12 23.054l11.625-8.443a.92.92 0 00.33-1.024" />
    </svg>
  );
}

export default GitLabIcon;
