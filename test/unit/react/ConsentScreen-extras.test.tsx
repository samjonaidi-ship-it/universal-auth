// @bb/universal-auth | test/unit/react/ConsentScreen-extras.test.tsx | v1.0.0-rc.1 | 2026-04-28 | BB
// Branch coverage — optional checkbox toggling, onCancel, error rendering,
// onAccept failure path.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsentScreen } from '../../../src/react/components/ConsentScreen.js';

describe('ConsentScreen — branch coverage', () => {
  it('renders Optional fieldset when optional[] is non-empty', () => {
    render(
      <ConsentScreen
        audience="crew"
        optional={[
          {
            consent_type: 'marketing_emails',
            policy_version: '1.0',
            title: 'Marketing emails',
            body_url: 'https://x/marketing',
            required: false,
          },
        ]}
        onAccept={vi.fn()}
      />
    );
    expect(screen.getByText('Optional')).toBeTruthy();
    expect(screen.getByText('Marketing emails')).toBeTruthy();
  });

  it('toggling optional checkbox flips state', () => {
    render(
      <ConsentScreen
        audience="client"
        optional={[
          {
            consent_type: 'marketing_emails',
            policy_version: '1.0',
            title: 'Marketing',
            body_url: 'https://x',
            required: false,
          },
        ]}
        onAccept={vi.fn()}
      />
    );
    const optBox = screen.getByLabelText('Marketing') as HTMLInputElement;
    expect(optBox.checked).toBe(false);
    fireEvent.click(optBox);
    expect(optBox.checked).toBe(true);
    fireEvent.click(optBox);
    expect(optBox.checked).toBe(false);
  });

  it('renders Back button when onCancel provided', () => {
    const onCancel = vi.fn();
    render(<ConsentScreen audience="client" onAccept={vi.fn()} onCancel={onCancel} />);
    const back = screen.getByRole('button', { name: /back/i });
    fireEvent.click(back);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders error alert when onAccept rejects', async () => {
    const onAccept = vi.fn().mockRejectedValue(new Error('server boom'));
    render(<ConsentScreen audience="client" onAccept={onAccept} />);
    // Check both required client consents
    for (const cb of screen.getAllByRole('checkbox')) fireEvent.click(cb);
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('server boom');
    });
  });

  it('uses custom submit label and heading', () => {
    render(
      <ConsentScreen
        audience="client"
        onAccept={vi.fn()}
        heading="Privacy first"
        submitLabel="I agree"
      />
    );
    expect(screen.getByRole('heading', { name: /privacy first/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /i agree/i })).toBeTruthy();
  });
});
