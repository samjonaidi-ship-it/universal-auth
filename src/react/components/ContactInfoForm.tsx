// @samjonaidi-ship-it/universal-auth | src/react/components/ContactInfoForm.tsx | v1.1.0 | 2026-05-06 | BB
// Contact-info form: display_name, email, phone (E.164 normalized), emergency_contact.
// Persona-aware: shows emergency_contact only for personas where it's required
// per §5.4.3.
//
// v1.1.0 (P1-A): + className/style/classNames slot map

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../useAuth.js';
import { useProfile } from '../useProfile.js';
import { validateEmail, validatePhone } from '../../profile/validators.js';
import type { UniversalProfile, EmergencyContact } from '../../types/profile.js';

export interface ContactInfoFormClassNames {
  root?: string;
  label?: string;
  input?: string;
  error?: string;
  button?: string;
}

export interface ContactInfoFormProps {
  /** Save handler override (defaults to useProfile().save). */
  onSubmit?: (patch: Partial<UniversalProfile>) => Promise<void>;
  heading?: string;
  submitLabel?: string;
  /** Optional class for the root <form> element (overrides default). */
  className?: string;
  /** Inline style for the root <form> element. */
  style?: CSSProperties;
  /** Per-slot class overrides. */
  classNames?: ContactInfoFormClassNames;
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
  className,
  style,
  classNames,
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

    const phoneV = await validatePhone(phone);
    if (!phoneV.ok) errs.phone = 'Enter a valid phone number.';

    let ecPhoneV: Awaited<ReturnType<typeof validatePhone>> | null = null;
    if (showEmergency) {
      if (ec.name.trim().length === 0) errs['emergency_contact.name'] = 'Required';
      ecPhoneV = await validatePhone(ec.phone_e164);
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
    if (showEmergency && ecPhoneV !== null) {
      patch.emergency_contact = {
        name: ec.name.trim(),
        phone_e164: ecPhoneV.e164!,
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
      className={className ?? classNames?.root ?? 'bb-auth-contact-info-form'}
      style={style}
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
        required
        {...errorOf(errors.display_name)}
        autoComplete="name"
        classNames={classNames}
      />

      <Field
        label="Email"
        id="bb-auth-email"
        value={email}
        onChange={setEmail}
        required
        {...errorOf(errors.email)}
        type="email"
        autoComplete="email"
        classNames={classNames}
      />

      <Field
        label="Phone"
        id="bb-auth-phone"
        value={phone}
        onChange={setPhone}
        required
        {...errorOf(errors.phone)}
        type="tel"
        autoComplete="tel"
        classNames={classNames}
      />

      {showEmergency ? (
        <fieldset className="bb-auth-fieldset">
          <legend>Emergency contact</legend>
          <Field
            label="Name"
            id="bb-auth-ec-name"
            value={ec.name}
            onChange={(v) => setEc({ ...ec, name: v })}
            required
            {...errorOf(errors['emergency_contact.name'])}
            classNames={classNames}
          />
          <Field
            label="Phone"
            id="bb-auth-ec-phone"
            value={ec.phone_e164}
            onChange={(v) => setEc({ ...ec, phone_e164: v })}
            required
            {...errorOf(errors['emergency_contact.phone_e164'])}
            type="tel"
            classNames={classNames}
          />
          <Field
            label="Relationship"
            id="bb-auth-ec-rel"
            value={ec.relationship}
            onChange={(v) => setEc({ ...ec, relationship: v })}
            required
            {...errorOf(errors['emergency_contact.relationship'])}
            classNames={classNames}
          />
        </fieldset>
      ) : null}

      {errors._form !== undefined ? (
        <div
          role="alert"
          aria-live="assertive"
          className={classNames?.error ?? 'bb-auth-error'}
        >
          {errors._form}
        </div>
      ) : null}

      <button
        type="submit"
        className={classNames?.button ?? 'bb-auth-button bb-auth-button-primary'}
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
  required?: boolean;
  error?: string;
  type?: 'text' | 'email' | 'tel';
  autoComplete?: string;
  classNames?: ContactInfoFormClassNames | undefined;
}

function Field({
  label,
  id,
  value,
  onChange,
  required,
  error,
  type = 'text',
  autoComplete,
  classNames,
}: FieldProps): ReactNode {
  return (
    <label className={classNames?.label ?? 'bb-auth-field'} htmlFor={id}>
      <span className="bb-auth-field-label">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        className={classNames?.input}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
      />
      {error !== undefined ? (
        <span
          id={`${id}-error`}
          className={classNames?.error ?? 'bb-auth-field-error'}
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </label>
  );
}
