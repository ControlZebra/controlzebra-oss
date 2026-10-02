import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Textarea, type TextareaProps } from './textarea';

function AutoGrowTextarea({
  value,
  maxRows = 5,
  style,
  ...props
}: TextareaProps & { maxRows?: number }): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const field = ref.current;
    if (!field) return;
    const computed = getComputedStyle(field);
    const lineHeight = parseFloat(computed.lineHeight) || 20;
    const padding =
      (parseFloat(computed.paddingTop) || 6) + (parseFloat(computed.paddingBottom) || 6);
    const minimum = lineHeight + padding;
    const maximum = Math.max(
      minimum,
      Math.min(lineHeight * maxRows + padding, window.innerHeight * 0.18)
    );
    field.style.minHeight = `${minimum}px`;
    field.style.maxHeight = `${maximum}px`;
    field.style.height = 'auto';
    field.style.height = `${Math.max(minimum, Math.min(field.scrollHeight, maximum))}px`;
    field.style.overflowY = field.scrollHeight > maximum ? 'auto' : 'hidden';
  }, [maxRows]);
  useLayoutEffect(resize, [value, resize]);
  useEffect(() => {
    let previousWidth = -1;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width !== previousWidth) {
              previousWidth = width;
              resize();
            }
          });
    if (ref.current) observer?.observe(ref.current);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [resize]);
  return (
    <Textarea
      {...props}
      ref={ref}
      value={value}
      rows={1}
      style={style}
      className={`leading-5 py-1.5 ${props.className || ''}`}
    />
  );
}

export default memo(AutoGrowTextarea);
