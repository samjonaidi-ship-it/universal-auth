// @bainbridgebuilders/universal-auth | test/unit/react/ConsentScreen.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// A3 gate #3 — ConsentScreen 9-consent atomic submit (crew hard-gate).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ConsentScreen,
  DEFAULT_REQUIRED_CONSENTS,
} from '../../../src/react/components/ConsentScreen.js';

describe('ConsentScreen — crew 9-consent hard-gate (§3.4 v1.4.0)', () => {
  it('exposes 9 required crew consents in default vocabulary', () => {
    expect(DEFAULT_REQUIRED_CONSENTS.crew).toHaveLength(9);
    // Specific items locked by Wizard §20
    expect(DEFAULT_REQUIRED_CONSENTS.crew).toEqual(
      expect.arrayContaining([
        'privacy_policy',
        'terms_of_service',
        'employee_data_processing',
        'device_geolocation',
        'device_camera',
        'device_microphone',
        'agent_buddy_crew',
        'agent_data_processing',
        'agent_memory_retention',
      ])
    );
  });

  it('renders all 9 crew consents when audience=crew', () => {
    render(<ConsentScreen audience="crew" onAccept={vi.fn()} />);
    // 9 required checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(9);
  });

  it('disables submit until ALL required consents are checked', () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    render(<ConsentScreen audience="crew" onAccept={onAccept} />);
    const submit = screen.getByRole('button', { name: /accept/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    const checkboxes = screen.getAllByRole('checkbox');
    // Check 8 of 9 — still disabled
    for (let i = 0; i < 8; i++) fireEvent.click(checkboxes[i]!);
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    // Check the 9th — now enabled
    fireEvent.click(checkboxes[8]!);
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls onAccept ATOMICALLY with all 9 consents on submit', async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    render(<ConsentScreen audience="crew" onAccept={onAccept} />);
    for (const cb of screen.getAllByRole('checkbox')) fireEvent.click(cb);
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    // Wait for async
    await new Promise((r) => setTimeout(r, 10));
    expect(onAccept).toHaveBeenCalledTimes(1);
    const consents = onAccept.mock.calls[0]![0] as Array<{ consent_type: string }>;
    expect(consents).toHaveLength(9);
    expect(consents.map((c) => c.consent_type).sort()).toEqual(
      [...DEFAULT_REQUIRED_CONSENTS.crew].sort()
    );
  });

  it('renders only 2 required consents for client audience (legal-only)', () => {
    render(<ConsentScreen audience="client" onAccept={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(2);
  });
});
