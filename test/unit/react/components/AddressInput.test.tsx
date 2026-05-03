// @samjonaidi-ship-it/universal-auth | test/unit/react/components/AddressInput.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddressInput } from '../../../../src/react/components/AddressInput.js';
import type { Address } from '../../../../src/types/pcp.js';

const SEED: Partial<Address> = {
  id: 'a1',
  line1: '123 Main',
  city: 'Bainbridge',
  state_region: 'WA',
  postal_code: '98110',
  country: 'US',
  is_primary: true,
};

describe('AddressInput', () => {
  it('renders all required fields with required+autocomplete', () => {
    render(
      <AddressInput
        addressType="residence"
        onChange={vi.fn()}
        required
      />
    );
    const street = screen.getByLabelText(/Street address/);
    expect(street.getAttribute('aria-required')).toBe('true');
    expect(street.getAttribute('autocomplete')).toBe('address-line1');
  });

  it('emits merged Address on every edit', () => {
    const onChange = vi.fn();
    render(
      <AddressInput
        addressType="residence"
        address={SEED}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText(/City/), { target: { value: 'Seattle' } });
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as Address;
    expect(last.city).toBe('Seattle');
    expect(last.line1).toBe('123 Main'); // preserved
    expect(last.address_type).toBe('residence');
  });

  it('flags invalid US zip', () => {
    const onChange = vi.fn();
    render(
      <AddressInput
        addressType="residence"
        address={SEED}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText(/Postal code/), {
      target: { value: 'abc' },
    });
    expect(screen.getByRole('alert').textContent).toMatch(/Invalid US/i);
  });

  it('accepts valid US zip+4', () => {
    const onChange = vi.fn();
    render(
      <AddressInput
        addressType="residence"
        address={SEED}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText(/Postal code/), {
      target: { value: '98110-1234' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders readonly summary without inputs', () => {
    render(
      <AddressInput
        addressType="property"
        address={SEED}
        onChange={vi.fn()}
        readonly
      />
    );
    expect(document.querySelectorAll('input').length).toBe(0);
    expect(screen.getByText('123 Main')).toBeTruthy();
  });

  it('uppercases country code on edit', () => {
    const onChange = vi.fn();
    render(
      <AddressInput
        addressType="residence"
        address={SEED}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText(/Country/), { target: { value: 'ca' } });
    const last = onChange.mock.calls.at(-1)?.[0] as Address;
    expect(last.country).toBe('CA');
  });
});
