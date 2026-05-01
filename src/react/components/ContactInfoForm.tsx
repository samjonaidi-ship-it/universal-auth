// @bainbridgebuilders/universal-auth | src/react/components/ContactInfoForm.tsx | v1.0.1 | 2026-05-01 | BB
// Contact-info form: display_name, email, phone (E.164 normalized), emergency_contact.
// Persona-aware: shows emergency_contact only for personas where it's required
// per §5.4.3.

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../useAuth.js';
import { useProfile } from '../useProfile.js';
import { validateEmail, validatePhone } from '../../profile/validators.js';
import type { UniversalProfile, EmergencyContact } from '../../types/profile.js';

export interface ContactInfoFormProps {
  /** Save handler override (defaults to useProfile().save). */
  onSubmit?: (patch: Partial<UniversalProfile>) => Promise<void>;
  heading?: string;
  submitLabel?: string;
}

const PERSONAS_REQUIRING_EMERGENCY_CONTACT: ReadonlySet<string> = new Set([
  'crew',
  'subcontractor',
  'architect',
]);

export function ContactInfoForm({
  onSubmit,
  heading = 'Contact info',
  submitLabel = 'Save',
}: ContactInfoFormProps): ReactNode {
  const { activePersona } = useAuth();
  const { profile, save } = useProfile();

  // Initial state is empty so first render doesn't capture a stale `profile`
  // value (profile may arrive asynchronously). The useEffect below syncs from
  // profile once it loads — and only seeds untouched fields, so user input
  // that's already been typed in isn't clobbered by a late hydration.
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ec, setEc] = useState<EmergencyContact>({
    name: '',
    phone_e164: '',
    relationship: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Sync from profile arrival. Runs once when profile transitions from null
  // → loaded; subsequent profile mutations don't clobber in-progress edits.
  useEffect(() => {
    if (profile === null || seeded) return;
    setDisplayName(profile.display_name ?? '');
    setEmail(profile.email ?? '');
    setPhone(profile.phone_e164 ?? '');
    if (profile.emergency_contact !== undefined) {
      setEc(profile.emergency_contact);
    }
    setSeeded(true);
  }, [profile, seeded]);

  const showEmergency =
    activePersona !== null &&
    PERSONAS_REQUIRING_EMERGENCY_CONTACT.has(activePersona.persona_type);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const errs: Record<string, string> = {};

    if (displayName.trim().length === 0) errs.display_name = 'Display name is required.';

    const emailV = validateEmail(email);
    if (!emailV.ok) errs.email = 'Enter a valid email address.';

    const phoneV = validatePhone(phone);
    if (!phoneV.ok) errs.phone = 'Enter a valid phone number.';

    if (showEmergency) {
      if (ec.name.trim().length === 0) errs['emergency_contact.name'] = 'Required';
      const ecPhoneV = validatePhone(ec.phone_e164);
      if (!ecPhoneV.ok) errs['emergency_contact.phone_e164'] = 'Enter a valid phone';
      if (ec.relationship.trim().length === 0) errs['emergency_contact.relationship'] = 'Required';
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const patch: Partial<UniversalProfile> = {
      display_name: displayName.trim(),
      email: emailV.email!,
      phone_e164: phoneV.e164!,
    };
    if (showEmergency) {
      patch.emergency_contact = {
        name: ec.name.trim(),
        phone_e164: validatePhone(ec.phone_e164).e164!,
        relationship: ec.relationship.trim(),
      };
    }

    setSubmitting(true);
    try {
      if (onSubmit !== undefined) {
        await onSubmit(patch);
      } else {
        await save(patch);
      }
    } catch (err) {
      setErrors({ _form: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="bb-auth-contact-info-form"
      aria-label={heading}
      onSubmit={handleSubmit}
      noValidate
    >
      <h3 className="bb-auth-heading">{heading}</h3>

      <Field
        label="Display name"
        id="bb-auth-display-name"
        value={displayName}
        onChange={setDisplayName}
        {...errorOf(errors.display_name)}
        autoComplete="name"
      />

      <Field
        label="Email"
        id="bb-auth-email"
        value={email}
        onChange={setEmail}
        {...errorOf(errors.email)}
        type="email"
        autoComplete="email"
      />

      <Field
        label="Phone"
        id="bb-auth-phone"
        value={phone}
        onChange={setPhone}
        {...errorOf(errors.phone)}
        type="tel"
        autoComplete="tel"
      />

      {showEmergency ? (
        <fieldset className="bb-auth-fieldset">
          <legend>Emergency contact</legend>
          <Field
            label="Name"
            id="bb-auth-ec-name"
            value={ec.name}
            onChange={(v) => setEc({ ...ec, name: v })}
            {...errorOf(errors['emergency_contact.name'])}
          />
          <Field
            label="Phone"
            id="bb-auth-ec-phone"
            value={ec.phone_e164}
            onChange={(v) => setEc({ ...ec, phone_e164: v })}
            {...errorOf(errors['emergency_contact.phone_e164'])}
            type="tel"
          />
          <Field
            label="Relationship"
            id="bb-auth-ec-rel"
            value={ec.relationship}
            onChange={(v) => setEc({ ...ec, relationship: v })}
            {...errorOf(errors['emergency_contact.relationship'])}
          />
        </fieldset>
      ) : null}

      {errors._form !== undefined ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {errors._form}
        </div>
      ) : null}

      <button
        type="submit"
        className="bb-auth-button bb-auth-button-primary"
        disabled={submitting}
      >
        {submitting ? '…' : submitLabel}
      </button>
    </form>
  );
}

/** Helper that omits the `error` key entirely when undefined (exactOptionalPropertyTypes-safe). */
function errorOf(value: string | undefined): { error?: string } {
  return value !== undefined ? { error: value } : {};
}

interface FieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: 'text' | 'email' | 'tel';
  autoComplete?: string;
}

function Field({
  label,
  id,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
}: FieldProps): ReactNode {
  return (
    <label className="bb-auth-field" htmlFor={id}>
      <span className="bb-auth-field-label">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
      />
      {error !== undefined ? (
        <span id={`${id}-error`} className="bb-auth-field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
