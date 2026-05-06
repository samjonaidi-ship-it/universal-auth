// @samjonaidi-ship-it/universal-auth | src/react/components/AddressInput.tsx | v1.1.0 | 2026-05-06 | BB
// Structured address input — schema.org PostalAddress fields.
// Implements PERSONA_PCP_DESIGN.md §3.2 + SDK_SPEC §5.4.1 (Address).
//
// Validates postal_code per country (US: 5 or 9 digit). Returns the full
// Address shape on every change so the caller can persist via
// useIdentity().addAddress / updateAddress.
//
// v1.1.0 (P1-A): + className/style

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import type { Address, AddressType } from '../../types/pcp.js';

export interface AddressInputProps {
  /** Existing values; partial because new addresses start empty. */
  address?: Partial<Address>;
  /** Called on every field edit with the merged Address shape. */
  onChange: (address: Address) => void;
  /** Address type — drives is_primary defaults and labelling. */
  addressType: AddressType;
  /** Read-only display (no inputs, just summary). */
  readonly?: boolean;
  /** When true, all fields are required + marked aria-required. */
  required?: boolean;
  /** Heading override. */
  heading?: string;
  /** Optional class for the root element. */
  className?: string;
  /** Inline style for the root element. */
  style?: CSSProperties;
}

/** US ZIP: 5 digits OR 5+4 ('12345' / '12345-6789'). */
const US_ZIP_RE = /^\d{5}(-\d{4})?$/;
/** Canada postal code: 'A1A 1A1' or 'A1A1A1'. */
const CA_POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

function validatePostalCode(country: string, postalCode: string): boolean {
  if (postalCode.trim().length === 0) return false;
  if (country === 'US') return US_ZIP_RE.test(postalCode);
  if (country === 'CA') return CA_POSTAL_RE.test(postalCode);
  // Other countries: accept any non-empty value (server canonicalizes).
  return postalCode.trim().length >= 3;
}

export function AddressInput({
  address,
  onChange,
  addressType,
  readonly = false,
  required = false,
  heading,
  className,
  style,
}: AddressInputProps): ReactNode {
  const baseId = useId();
  const [postalError, setPostalError] = useState<string | null>(null);

  const value: Address = {
    id: address?.id ?? '',
    address_type: addressType,
    line1: address?.line1 ?? '',
    ...(address?.line2 !== undefined ? { line2: address.line2 } : {}),
    city: address?.city ?? '',
    state_region: address?.state_region ?? '',
    postal_code: address?.postal_code ?? '',
    country: address?.country ?? 'US',
    ...(address?.lat !== undefined ? { lat: address.lat } : {}),
    ...(address?.lng !== undefined ? { lng: address.lng } : {}),
    is_primary: address?.is_primary ?? false,
    ...(address?.notes !== undefined ? { notes: address.notes } : {}),
  };

  function emit(patch: Partial<Address>): void {
    const next: Address = { ...value, ...patch };
    if (patch.postal_code !== undefined || patch.country !== undefined) {
      const ok = validatePostalCode(next.country, next.postal_code);
      setPostalError(
        ok || next.postal_code.length === 0
          ? null
          : `Invalid ${next.country} postal code`
      );
    }
    onChange(next);
  }

  if (readonly) {
    return (
      <address
        className={className ?? 'bb-auth-address-readonly'}
        style={style}
        aria-label={heading}
      >
        <div>{value.line1}</div>
        {value.line2 !== undefined && value.line2.length > 0 ? (
          <div>{value.line2}</div>
        ) : null}
        <div>
          {value.city}, {value.state_region} {value.postal_code}
        </div>
        <div>{value.country}</div>
      </address>
    );
  }

  return (
    <fieldset className={className ?? 'bb-auth-address-input'} style={style}>
      <legend>{heading ?? labelForType(addressType)}</legend>

      <Field
        id={`${baseId}-line1`}
        label="Street address"
        value={value.line1}
        onChange={(v) => emit({ line1: v })}
        required={required}
        autoComplete="address-line1"
      />
      <Field
        id={`${baseId}-line2`}
        label="Apt / Suite (optional)"
        value={value.line2 ?? ''}
        onChange={(v) => emit({ line2: v })}
        autoComplete="address-line2"
      />
      <Field
        id={`${baseId}-city`}
        label="City"
        value={value.city}
        onChange={(v) => emit({ city: v })}
        required={required}
        autoComplete="address-level2"
      />
      <Field
        id={`${baseId}-state`}
        label="State / Region"
        value={value.state_region}
        onChange={(v) => emit({ state_region: v })}
        required={required}
        autoComplete="address-level1"
      />
      <Field
        id={`${baseId}-postal`}
        label="Postal code"
        value={value.postal_code}
        onChange={(v) => emit({ postal_code: v })}
        required={required}
        autoComplete="postal-code"
        {...(postalError !== null ? { error: postalError } : {})}
        inputMode="numeric"
      />
      <Field
        id={`${baseId}-country`}
        label="Country"
        value={value.country}
        onChange={(v) => emit({ country: v.toUpperCase() })}
        required={required}
        autoComplete="country"
      />
    </fieldset>
  );
}

function labelForType(t: AddressType): string {
  switch (t) {
    case 'residence':
      return 'Residence address';
    case 'mailing':
      return 'Mailing address';
    case 'billing':
      return 'Billing address';
    case 'business':
      return 'Business address';
    case 'property':
      return 'Property address';
    case 'jobsite_pref':
      return 'Preferred jobsite area';
    default:
      return 'Address';
  }
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
  error?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  autoComplete,
  error,
  inputMode,
}: FieldProps): ReactNode {
  return (
    <label className="bb-auth-field" htmlFor={id}>
      <span className="bb-auth-field-label">
        {label}
        {required === true ? (
          <span aria-hidden="true" className="bb-auth-field-required">
            *
          </span>
        ) : null}
      </span>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-required={required}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        {...(inputMode !== undefined ? { inputMode } : {})}
      />
      {error !== undefined ? (
        <span id={`${id}-error`} className="bb-auth-field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
