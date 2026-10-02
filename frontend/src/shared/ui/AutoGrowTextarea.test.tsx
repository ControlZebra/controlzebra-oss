import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AutoGrowTextarea from './AutoGrowTextarea';

function Form() {
  const [message, setMessage] = useState('');
  return (
    <AutoGrowTextarea
      aria-label="Message"
      value={message}
      onChange={(event) => setMessage(event.target.value)}
    />
  );
}

describe('AutoGrowTextarea', () => {
  it('grows for wrapped/pasted text, caps and scrolls long messages, then shrinks after deletion', () => {
    render(<Form />);
    const field = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    // jsdom does not lay out text; supply content measurements to verify bounds.
    Object.defineProperty(field, 'scrollHeight', {
      get: () => (field.value.length > 100 ? 240 : field.value.length > 20 ? 72 : 32),
    });
    expect(field.rows).toBe(1);
    expect(field.style.height).toBe('32px');
    fireEvent.change(field, { target: { value: 'A message that wraps onto several lines' } });
    expect(field.style.height).toBe('72px');
    fireEvent.change(field, { target: { value: 'Very long message\n'.repeat(100) } });
    expect(field.style.height).toBe('112px');
    expect(field.style.overflowY).toBe('auto');
    fireEvent.change(field, { target: { value: '' } });
    expect(field.style.height).toBe('32px');
    expect(field.style.overflowY).toBe('hidden');
  });
});
