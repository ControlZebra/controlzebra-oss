import { memo } from 'react';
import stripedZ from './striped-z.svg';

// Monoton is the website's Z typography. Bundle its outlined glyph with OFL
// attribution; the remaining letters retain the existing application font.
function Wordmark(): JSX.Element {
  return (
    <span
      role="img"
      aria-label="ControlZebra"
      className="inline-flex h-8 shrink-0 items-center whitespace-nowrap font-sans text-lg leading-5 font-semibold text-theme-primary"
    >
      <span aria-hidden="true" className="inline-flex h-5 items-center">Control</span>
      <span
        aria-hidden="true"
        className="mx-px inline-block h-[1em] w-[0.96em] self-center bg-current"
        style={{ maskImage: `url("${stripedZ}")`, maskSize: 'contain', maskRepeat: 'no-repeat' }}
      />
      <span aria-hidden="true" className="inline-flex h-5 items-center">ebra</span>
    </span>
  );
}

export default memo(Wordmark);
