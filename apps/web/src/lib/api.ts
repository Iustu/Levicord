/**
 * Centralized API configuration (Engenharia de Software — DRY principle)
 * All fetch calls should import from here, never hardcode the base URL.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export async function apiFetch<T>(
  path: string,
  _token: string | null = null,
  options: RequestInit = {}
): Promise<T> {
  const controller = options.signal ? undefined : new AbortController();
  const timeout = controller ? window.setTimeout(() => controller.abort(), 15000) : undefined;
  const activeSignal = options.signal || controller?.signal;

  const executeRequest = async (): Promise<Response> => {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const defaultHeaders: Record<string, string> = {};
    if (options.body !== undefined && options.body !== null && !isFormData) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    return fetch(`${API_BASE}${path}`, {
      ...options,
      signal: activeSignal,
      credentials: 'include',
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });
  };

  try {
    let res = await executeRequest();

    if (res.status === 401 && path !== '/api/auth/refresh') {
      if (activeSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (!isRefreshing || !refreshPromise) {
        isRefreshing = true;
        refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
          .then((r) => r.ok)
          .catch(() => false)
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });
      }

      try {
        const refreshed = await refreshPromise;
        if (refreshed && !activeSignal?.aborted) {
          res = await executeRequest();
        }
      } catch {
        // proceed to error handling
      }
    }

    if (!res.ok) {
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('auth_unauthorized'));
      }
      const error = await res.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP error ${res.status}`);
    }

    return res.json();
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

export { API_BASE };
