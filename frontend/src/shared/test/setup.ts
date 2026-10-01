/**
 * Vitest test setup file.
 * Runs before each test file.
 */
import '@testing-library/jest-dom';

// jsdom has no text layout. These APIs support CodeMirror behavioral tests,
// not viewport measurements or performance evidence.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}
