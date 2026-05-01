// @bainbridgebuilders/universal-auth | src/react/components/PersonaFieldsForm.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Renders persona-specific fields from the server-driven registry per §5.4.6.
// Reads the registry via getPersonaFieldsRegistry (1h cache).

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useProfile } from '../useProfile.js';
import {
  getPersonaRoster,
  type FieldDefinition,
  type PersonaFieldRosterFromServer,
} from '../../profile/persona-fields.js';
import type { UniversalProfile } from '../../types/profile.js';

export interface PersonaFieldsFormProps {
  persona: string;
  heading?: string;
  submitLabel?: string;
  /** When true, only render required + recommended fields. */
  hideOptional?: boolean;
}

export function PersonaFieldsForm({
  persona,
  heading,
  submitLabel = 'Save',
  hideOptional = false,
}: PersonaFieldsFormProps): ReactNode {
  const { profile, save } = useProfile();
  const [roster, setRoster] = useState<PersonaFieldRosterFromServer | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPersonaRoster(persona).then((r) => {
      if (cancelled) return;
      setRoster(r);
      // Seed values from current profile
      if (profile !== null && r !== null) {
        const seed: Record<string, string> = {};
        for (const path of [...r.required, ...r.recommended, ...r.optional]) {
          const v = readPath(profile, path);
          if (typeof v === 'string') seed[path] = v;
        }
        setValues(seed);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [persona, profile]);

  if (roster === null) return null;

  const requiredKeys = roster.required.filter((k) => roster.fields[k] !== undefined);
  const recommendedKeys = roster.recommended.filter((k) => roster.fields[k] !== undefined);
  const optionalKeys = hideOptional
    ? []
    : roster.optional.filter((k) => roster.fields[k] !== undefined);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const patch = buildPatch(values);
      await save(patch as Partial<UniversalProfile>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="bb-auth-persona-fields-form"
      aria-label={heading ?? `${persona} details`}
      onSubmit={handleSubmit}
      noValidate
    >
      {heading !== undefined ? <h3 className="bb-auth-heading">{heading}</h3> : null}

      <RenderGroup
        title="Required"
        keys={requiredKeys}
        roster={roster}
        values={values}
        onChange={(k, v) => setValues({ ...values, [k]: v })}
        required
      />
      <RenderGroup
        title="Recommended"
        keys={recommendedKeys}
        roster={roster}
        values={values}
        onChange={(k, v) => setValues({ ...values, [k]: v })}
      />
      {optionalKeys.length > 0 ? (
        <RenderGroup
          title="Optional"
          keys={optionalKeys}
          roster={roster}
          values={values}
          onChange={(k, v) => setValues({ ...values, [k]: v })}
        />
      ) : null}

      {error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {error}
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

function RenderGroup({
  title,
  keys,
  roster,
  values,
  onChange,
  required = false,
}: {
  title: string;
  keys: readonly string[];
  roster: PersonaFieldRosterFromServer;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  required?: boolean;
}): ReactNode {
  if (keys.length === 0) return null;
  return (
    <fieldset className="bb-auth-fieldset">
      <legend>{title}</legend>
      {keys.map((key) => {
        const def = roster.fields[key];
        if (def === undefined) return null;
        const id = `bb-auth-${key.replace(/\./g, '-')}`;
        return (
          <label key={key} className="bb-auth-field" htmlFor={id}>
            <span className="bb-auth-field-label">{def.label ?? humanize(key)}</span>
            {renderInput(id, def, values[key] ?? '', (v) => onChange(key, v), required)}
            {def.hint !== undefined ? (
              <span className="bb-auth-field-hint">{def.hint}</span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}

function renderInput(
  id: string,
  def: FieldDefinition,
  value: string,
  onChange: (v: string) => void,
  required: boolean
): ReactNode {
  switch (def.type) {
    case 'select':
    case 'multiselect':
      return (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        >
          <option value="">—</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'textarea':
      return (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      );
    default:
      return (
        <input
          id={id}
          type={def.type === 'phone' ? 'tel' : def.type === 'email' ? 'email' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function humanize(key: string): string {
  const tail = key.split('.').pop() ?? key;
  return tail.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function readPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function buildPatch(values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(values)) {
    if (value === '') continue;
    setPath(out, path, value);
  }
  return out;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}
