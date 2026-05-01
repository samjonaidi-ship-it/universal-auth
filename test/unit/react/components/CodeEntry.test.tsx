// @bainbridgebuilders/universal-auth | test/unit/react/components/CodeEntry.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Smoke — autocomplete=one-time-code, 6-digit validation, single input pattern.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodeEntry } from '../../../../src/react/components/CodeEntry.js';

describe('CodeEntry', () => {
  it('uses autocomplete=one-time-code on the input', () => {
    render(
      <CodeEntry destination="+15555550100" onSubmit={vi.fn()} />
    );
    const input = screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
    expect(input.autocomplete).toBe('one-time-code');
    expect(input.inputMode).toBe('numeric');
  });

  it('strips non-digit characters', () => {
    render(
      <CodeEntry destination="+15555550100" onSubmit={vi.fn()} />
    );
    const input = screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12-3a4b' } });
    expect(input.value).toBe('1234');
  });

  it('disables submit until exactly 6 digits entered', () => {
    render(
      <CodeEntry destination="+15555550100" onSubmit={vi.fn()} />
    );
    const submit = screen.getByRole('button', { name: /verify/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const input = screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12345' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '123456' } });
    expect(submit.disabled).toBe(false);
  });

  it('calls onSubmit with the 6-digit code', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CodeEntry destination="+15555550100" onSubmit={onSubmit} />
    );
    const input = screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '987654' } });
    fireEvent.submit(screen.getByRole('form', { name: /enter your code/i }));
    await new Promise((r) => setTimeout(r, 5));
    expect(onSubmit).toHaveBeenCalledWith('987654');
  });
});
