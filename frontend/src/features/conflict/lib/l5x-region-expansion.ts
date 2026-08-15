import type { ConflictRegion } from '../types';

/**
 * Git minimises conflict hunks to the lines that actually differ, so an L5X
 * conflict region is almost never a complete `<Rung>`/`<Tag>`/`<Line>` element -
 * it is usually the bare `<![CDATA[...]]>` payload with the element wrapper
 * sitting in the surrounding context. The visual adapter can only classify a
 * complete element, so without this expansion nearly every real conflict falls
 * back to the plain text view.
 *
 * We rebuild the innermost enclosing unit from the trimmed context the backend
 * already ships with each region. This affects presentation only: decisions and
 * composition still operate on the raw region lines.
 */

const EXPANDABLE_UNITS = new Set(['Rung', 'Tag', 'Line']);

interface TagToken {
  name: string;
  kind: 'open' | 'close' | 'self';
  start: number;
  end: number;
}

/**
 * Collects element tags while skipping constructs that can legally contain
 * angle brackets (CDATA payloads carry ladder logic such as `LES(a,b)`).
 */
function scanTags(source: string): TagToken[] {
  const tokens: TagToken[] = [];
  let index = 0;

  while (index < source.length) {
    const next = source.indexOf('<', index);
    if (next === -1) {
      break;
    }

    if (source.startsWith('<![CDATA[', next)) {
      const close = source.indexOf(']]>', next);
      index = close === -1 ? source.length : close + 3;
      continue;
    }

    if (source.startsWith('<!--', next)) {
      const close = source.indexOf('-->', next);
      index = close === -1 ? source.length : close + 3;
      continue;
    }

    if (source.startsWith('<?', next)) {
      const close = source.indexOf('?>', next);
      index = close === -1 ? source.length : close + 2;
      continue;
    }

    if (source.startsWith('<!', next)) {
      const close = source.indexOf('>', next);
      index = close === -1 ? source.length : close + 1;
      continue;
    }

    const close = source.indexOf('>', next);
    if (close === -1) {
      break;
    }

    const body = source.slice(next + 1, close);
    const isClose = body.startsWith('/');
    const isSelf = body.endsWith('/');
    const name = (isClose ? body.slice(1) : body).trim().split(/[\s/>]/, 1)[0] ?? '';

    if (name && /^[A-Za-z_][\w.:-]*$/.test(name)) {
      tokens.push({
        name,
        kind: isClose ? 'close' : isSelf ? 'self' : 'open',
        start: next,
        end: close + 1,
      });
    }

    index = close + 1;
  }

  return tokens;
}

interface EnclosingUnit {
  name: string;
  start: number;
  /** How many elements are still open between the unit and the region. */
  openDescendants: number;
}

/**
 * Finds the nearest expandable element still open at the end of `contextBefore`.
 * A hunk usually sits inside `<Text>` or `<Comment>`, so the unit we want is
 * further up the stack than the innermost open element. Close tags without a
 * matching open belong to elements that started before the trimmed window and
 * are ignored.
 */
function enclosingUnit(contextBefore: string): EnclosingUnit | null {
  const stack: Array<{ name: string; start: number }> = [];

  for (const token of scanTags(contextBefore)) {
    if (token.kind === 'open') {
      stack.push({ name: token.name, start: token.start });
    } else if (token.kind === 'close') {
      stack.pop();
    }
  }

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (EXPANDABLE_UNITS.has(stack[index].name)) {
      return {
        name: stack[index].name,
        start: stack[index].start,
        openDescendants: stack.length - 1 - index,
      };
    }
  }

  return null;
}

/**
 * Returns the offset just past the tag in `contextAfter` that closes the
 * enclosing element, or null when the trimmed context does not reach it.
 */
function enclosingCloseOffset(contextAfter: string, unit: EnclosingUnit): number | null {
  let depth = unit.openDescendants;

  for (const token of scanTags(contextAfter)) {
    if (token.kind === 'open') {
      depth += 1;
    } else if (token.kind === 'close') {
      if (depth === 0) {
        return token.name === unit.name ? token.end : null;
      }
      depth -= 1;
    }
  }

  return null;
}

function joinRegionLines(lines: readonly string[], newline: string): string {
  return lines.map((line) => `${line}${newline}`).join('');
}

export interface ExpandedRegionSources {
  current: string;
  incoming: string;
}

/**
 * Rebuilds each side of the region as a complete L5X element when the region is
 * a fragment of one. Returns null when no expansion applies, in which case the
 * caller should classify the raw region lines.
 */
export function expandRegionToSemanticUnit(
  region: ConflictRegion,
  newline: string,
): ExpandedRegionSources | null {
  const enclosing = enclosingUnit(region.contextBefore);
  if (!enclosing) {
    return null;
  }

  const closeOffset = enclosingCloseOffset(region.contextAfter, enclosing);
  if (closeOffset === null) {
    return null;
  }

  const prefix = region.contextBefore.slice(enclosing.start);
  const suffix = region.contextAfter.slice(0, closeOffset);

  return {
    current: `${prefix}${joinRegionLines(region.current, newline)}${suffix}`,
    incoming: `${prefix}${joinRegionLines(region.incoming, newline)}${suffix}`,
  };
}
