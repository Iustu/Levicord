import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from './api';

describe('apiFetch', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('performs standard JSON GET request with credentials', async () => {
    const mockData = { id: 1, name: 'Levicord' };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const result = await apiFetch<typeof mockData>('/api/channels', null);
    expect(result).toEqual(mockData);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/channels'),
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });

  it('attempts token refresh on 401 and retries original request', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 401 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
    });

    const result = await apiFetch<{ success: boolean }>('/api/protected', null);
    expect(result).toEqual({ success: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/refresh'),
      expect.anything(),
    );
  });

  it('aborts refresh when caller signal is aborted', async () => {
    const controller = new AbortController();

    globalThis.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (url.includes('/api/auth/refresh')) {
        return new Promise((_, reject) => {
          opts.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }
      return Promise.resolve({ ok: false, status: 401 });
    });

    const fetchPromise = apiFetch('/api/protected', null, { signal: controller.signal });
    // Abort after initiating
    controller.abort();

    await expect(fetchPromise).rejects.toThrow();
  });

  it('omits Content-Type application/json when body is absent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiFetch('/api/servers/srv-1/invites', null, { method: 'POST' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/servers/srv-1/invites'),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('includes Content-Type application/json when body is present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiFetch('/api/servers/srv-1/invites', null, {
      method: 'POST',
      body: JSON.stringify({ maxUses: 5 }),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/servers/srv-1/invites'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });
});
