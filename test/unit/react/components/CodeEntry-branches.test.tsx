// @samjonaidi-ship-it/universal-auth | test/unit/react/components/CodeEntry-branches.test.tsx | v1.0.0 | 2026-05-08 | BB
// COV-1 (rc.5 audit) — branch-coverage tests for CodeEntry.tsx.
//
// Targeted branches (per `pnpm test:unit` rc.4: 57.89% on this file):
//   - line 70-72: invalid 6-digit input shows inline error
//   - line 79-80: AuthSdkError caught, message shown inline
//   - line 81-89 (rc.3 fixup): non-AuthSdkError caught, reportSoftError called,
//     generic banner shown
//   - line 95-103: classNames?.root vs className vs default
//   - line 109-118: classNames?.label, classNames?.input slot maps
//   - line 126-134: error rendered with classNames?.error
//   - line 137-143: classNames?.button slot

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeEntry } from '../../../../src/react/components/CodeEntry.js';
import { AuthCodeInvalid } from '../../../../src/errors.js';
import { registerOnError } from '../../../../src/core/error-hook.js';

describe('CodeEntry — branch coverage (COV-1)', () => {
  beforeEach(() => {
    registerOnError(null);
  });
  afterEach(() => {
    registerOnError(null);
  });

  describe('inline error states', () => {
    it('shows error banner when 5-digit code is submitted (regex 6-digit gate)', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<CodeEntry destination="+15555550100" onSubmit={onSubmit} />);
      const input = screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
      // Force a 5-digit value past the maxLength (would be a programmatic submit)
      fireEvent.change(input, { target: { value: '12345' } });
      // The button is disabled at 5 digits, but if we force submit via the form...
      const form = screen.getByRole('form', { name: /enter your code/i });
      fireEvent.submit(form);
      // The component validates inside handleSubmit even on form-submit events
      await waitFor(() => {
        expect(screen.queryByText(/Enter the 6-digit code/i)).toBeTruthy();
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('shows AuthSdkError.message inline when onSubmit throws AuthSdkError', async () => {
      const onSubmit = vi.fn().mockRejectedValue(
        new AuthCodeInvalid('That code does not match.'),
      );
      render(<CodeEntry destination="+15555550100" onSubmit={onSubmit} />);
      const input = screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '123456' } });
      fireEvent.submit(screen.getByRole('form', { name: /enter your code/i }));
      await waitFor(() => {
        expect(screen.queryByText(/That code does not match/i)).toBeTruthy();
      });
    });

    it('shows generic banner + reports to onError when onSubmit throws non-AuthSdkError', async () => {
      const onError = vi.fn();
      registerOnError(onError);
      const onSubmit = vi.fn().mockRejectedValue(
        new TypeError('network down'),
      );
      render(<CodeEntry destination="+15555550100" onSubmit={onSubmit} />);
      const input = screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '123456' } });
      fireEvent.submit(screen.getByRole('form', { name: /enter your code/i }));
      await waitFor(() => {
        // Generic UX banner (NOT "network down" — that's the underlying error)
        expect(screen.queryByText(/Verification failed/i)).toBeTruthy();
      });
      // The non-AuthSdkError reaches config.onError via reportSoftError
      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });
  });

  describe('classNames slot map (P1-A theming)', () => {
    it('applies classNames.root to the form when className is undefined', () => {
      render(
        <CodeEntry
          destination="+15555550100"
          onSubmit={vi.fn()}
          classNames={{ root: 'custom-root' }}
        />
      );
      const form = screen.getByRole('form', { name: /enter your code/i });
      expect(form.className).toContain('custom-root');
    });

    it('className overrides classNames.root when both supplied', () => {
      render(
        <CodeEntry
          destination="+15555550100"
          onSubmit={vi.fn()}
          className="overrides-everything"
          classNames={{ root: 'should-not-appear' }}
        />
      );
      const form = screen.getByRole('form', { name: /enter your code/i });
      expect(form.className).toContain('overrides-everything');
      expect(form.className).not.toContain('should-not-appear');
    });

    it('applies classNames.input to the input element', () => {
      render(
        <CodeEntry
          destination="+15555550100"
          onSubmit={vi.fn()}
          classNames={{ input: 'custom-input' }}
        />
      );
      const input = screen.getByLabelText(/6-digit code/i);
      expect(input.className).toContain('custom-input');
    });

    it('applies classNames.button to the submit button', () => {
      render(
        <CodeEntry
          destination="+15555550100"
          onSubmit={vi.fn()}
          classNames={{ button: 'custom-btn' }}
        />
      );
      const button = screen.getByRole('button', { name: /verify/i });
      expect(button.className).toContain('custom-btn');
    });

    it('applies classNames.error to the error banner when error is shown', async () => {
      const onSubmit = vi.fn().mockRejectedValue(
        new AuthCodeInvalid('Bad code.'),
      );
      render(
        <CodeEntry
          destination="+15555550100"
          onSubmit={onSubmit}
          classNames={{ error: 'custom-error' }}
        />
      );
      const input = screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '123456' } });
      fireEvent.submit(screen.getByRole('form', { name: /enter your code/i }));
      await waitFor(() => {
        const errBanner = screen.getByRole('alert');
        expect(errBanner.className).toContain('custom-error');
      });
    });
  });

  describe('forwardRef (P1-B)', () => {
    it('attaches ref to the underlying form element', () => {
      const ref = { current: null as HTMLFormElement | null };
      render(
        <CodeEntry
          ref={ref}
          destination="+15555550100"
          onSubmit={vi.fn()}
        />
      );
      expect(ref.current).toBeInstanceOf(HTMLFormElement);
    });
  });
});
