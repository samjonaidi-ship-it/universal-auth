// @bb/universal-auth | test/unit/profile/avatar-upload.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage push for src/profile/avatar.ts upload paths (lines 112-188 were 48%).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  uploadAvatar,
  clearAvatar,
  compressJpeg,
} from '../../../src/profile/avatar.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';

describe('profile/avatar upload + clear', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: '1.0.0-rc.1',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ avatar_url: 'https://r2/x.jpg', profile_version: 7 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('compressJpeg', () => {
    it('throws when createImageBitmap is unavailable', async () => {
      const original = (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
      Object.defineProperty(globalThis, 'createImageBitmap', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      try {
        const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
          type: 'image/png',
        });
        await expect(compressJpeg(blob)).rejects.toThrow(/createImageBitmap/);
      } finally {
        Object.defineProperty(globalThis, 'createImageBitmap', {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    });

    it('compresses via OffscreenCanvas path when available', async () => {
      // Mock createImageBitmap to return a fake bitmap shape
      const fakeBitmap = {
        width: 2048,
        height: 1024,
        close: vi.fn(),
      };
      Object.defineProperty(globalThis, 'createImageBitmap', {
        value: vi.fn(async () => fakeBitmap),
        writable: true,
        configurable: true,
      });

      // Mock OffscreenCanvas
      class FakeOffscreenCanvas {
        width: number;
        height: number;
        constructor(w: number, h: number) {
          this.width = w;
          this.height = h;
        }
        getContext(): { drawImage: () => void } | null {
          return { drawImage: () => undefined };
        }
        async convertToBlob(): Promise<Blob> {
          return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
        }
      }
      Object.defineProperty(globalThis, 'OffscreenCanvas', {
        value: FakeOffscreenCanvas,
        writable: true,
        configurable: true,
      });

      const blob = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' });
      const result = await compressJpeg(blob);
      expect(result.type).toBe('image/jpeg');
      expect(fakeBitmap.close).toHaveBeenCalled();

      Object.defineProperty(globalThis, 'OffscreenCanvas', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'createImageBitmap', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('throws when canvas getContext returns null', async () => {
      Object.defineProperty(globalThis, 'createImageBitmap', {
        value: vi.fn(async () => ({ width: 100, height: 100, close: () => undefined })),
        writable: true,
        configurable: true,
      });
      class CtxlessCanvas {
        width = 0;
        height = 0;
        getContext(): null {
          return null;
        }
        async convertToBlob(): Promise<Blob> {
          return new Blob();
        }
      }
      Object.defineProperty(globalThis, 'OffscreenCanvas', {
        value: CtxlessCanvas,
        writable: true,
        configurable: true,
      });

      const blob = new Blob([new Uint8Array([0xff])], { type: 'image/jpeg' });
      await expect(compressJpeg(blob)).rejects.toThrow(/2D canvas/);

      Object.defineProperty(globalThis, 'OffscreenCanvas', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'createImageBitmap', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('uploadAvatar', () => {
    it('compresses + posts FormData to /identity/v1/profile/avatar', async () => {
      // Mock the compression dependency chain
      Object.defineProperty(globalThis, 'createImageBitmap', {
        value: vi.fn(async () => ({ width: 500, height: 500, close: () => undefined })),
        writable: true,
        configurable: true,
      });
      class FakeCanvas {
        width = 0;
        height = 0;
        getContext(): { drawImage: () => void } {
          return { drawImage: () => undefined };
        }
        async convertToBlob(): Promise<Blob> {
          return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], {
            type: 'image/jpeg',
          });
        }
      }
      Object.defineProperty(globalThis, 'OffscreenCanvas', {
        value: FakeCanvas,
        writable: true,
        configurable: true,
      });

      const input = new Blob([new Uint8Array([0xff])], { type: 'image/jpeg' });
      const result = await uploadAvatar(input);

      expect(result.avatar_url).toBe('https://r2/x.jpg');
      expect(result.profile_version).toBe(7);

      // Verify the request shape
      expect(fetchSpy).toHaveBeenCalled();
      const call = fetchSpy.mock.calls[0];
      const url = call?.[0];
      expect(String(url)).toContain('/identity/v1/profile/avatar');
      const init = call?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      // Body should be FormData (not stringified)
      expect(init?.body).toBeInstanceOf(FormData);

      Object.defineProperty(globalThis, 'OffscreenCanvas', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'createImageBitmap', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('clearAvatar', () => {
    it('sends DELETE to /identity/v1/profile/avatar', async () => {
      await clearAvatar();
      expect(fetchSpy).toHaveBeenCalled();
      const call = fetchSpy.mock.calls[0];
      const url = call?.[0];
      expect(String(url)).toContain('/identity/v1/profile/avatar');
      const init = call?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('DELETE');
    });
  });
});
