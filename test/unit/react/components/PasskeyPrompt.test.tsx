// @bainbridgebuilders/universal-auth | test/unit/react/components/PasskeyPrompt.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Smoke — invokes onAuthenticate, shows error on failure.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PasskeyPrompt } from '../../../../src/react/components/PasskeyPrompt.js';

describe('PasskeyPrompt', () => {
  it('renders a button with the default label', () => {
    render(<PasskeyPrompt onAuthenticate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /sign in with passkey/i })).toBeTruthy();
  });

  it('calls onAuthenticate on click', async () => {
    const onAuthenticate = vi.fn().mockResolvedValue(undefined);
    render(<PasskeyPrompt onAuthenticate={onAuthenticate} />);
    fireEvent.click(screen.getByRole('button', { name: /passkey/i }));
    await waitFor(() => {
      expect(onAuthenticate).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces errors thrown from onAuthenticate', async () => {
    const onAuthenticate = vi.fn().mockRejectedValue(new Error('Cancelled'));
    render(<PasskeyPrompt onAuthenticate={onAuthenticate} />);
    fireEvent.click(screen.getByRole('button', { name: /passkey/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/cancelled/i);
    });
  });
});
