// @bb/universal-auth | test/unit/react/components/SignInForm.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Smoke + behavior — destination → code stage transition, validation, accessible name.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { SignInForm } from '../../../../src/react/components/SignInForm.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../../src/core/event-reporter.js';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SignInForm', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResp(200, { ok: true })));
  });

  it('renders accessible form with destination input + submit', () => {
    render(
      <AuthProvider>
        <SignInForm />
      </AuthProvider>
    );
    const form = screen.getByRole('form', { name: /sign in/i });
    expect(form).toBeTruthy();
    const input = screen.getByLabelText(/phone or email/i);
    expect(input).toBeTruthy();
    expect(screen.getByRole('button', { name: /send code/i })).toBeTruthy();
  });

  it('rejects empty destination with inline error', () => {
    render(
      <AuthProvider>
        <SignInForm />
      </AuthProvider>
    );
    fireEvent.submit(screen.getByRole('form', { name: /sign in/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/enter a phone/i);
  });

  it('transitions from destination → code stage on requestCode success', async () => {
    render(
      <AuthProvider>
        <SignInForm />
      </AuthProvider>
    );
    const input = screen.getByLabelText(/phone or email/i);
    fireEvent.change(input, { target: { value: '+15555550100' } });
    fireEvent.submit(screen.getByRole('form', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('form', { name: /enter your code/i })).toBeTruthy();
    });
    expect(fetchSpy).toHaveBeenCalled();
    const reqCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/v1/code/request')
    );
    expect(reqCall).toBeDefined();
  });

  it('renders passkey CTA when both passkeyEnabled=true and onPasskeyClick provided', () => {
    render(
      <AuthProvider>
        <SignInForm passkeyEnabled onPasskeyClick={() => undefined} />
      </AuthProvider>
    );
    expect(screen.getByRole('button', { name: /sign in with passkey/i })).toBeTruthy();
  });

  it('hides passkey CTA when onPasskeyClick is omitted (no-op design)', () => {
    render(
      <AuthProvider>
        <SignInForm passkeyEnabled />
      </AuthProvider>
    );
    expect(screen.queryByRole('button', { name: /passkey/i })).toBeNull();
  });
});
