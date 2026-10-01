/**
 * Centralized API configuration (Engenharia de Software — DRY principle)
 * All fetch calls should import from here, never hardcode the base URL.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
let refreshAbortController: AbortController | null = null;
let refreshSubscribers = 0;

export async function apiFetch<T>(
  path: string,
  _token: string | null = null,
  options: RequestInit = {}
): Promise<T> {
  const controller = options.signal ? undefined : new AbortController();
  const timeout = controller ? window.setTimeout(() => controller.abort(), 15000) : undefined;
  const activeSignal = options.signal || controller?.signal;

  const executeRequest = async (): Promise<Response> => {
    return fetch(`${API_BASE}${path}`, {
      ...options,
      signal: activeSignal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
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

      if (!isRefreshing) {
        isRefreshing = true;
        refreshAbortController = new AbortController();
        refreshSubscribers = 0;

        refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          signal: refreshAbortController.signal,
        })
          .then((r) => r.ok)
          .catch((err) => {
            if (err?.name === 'AbortError') return false;
            return false;
          })
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
            refreshAbortController = null;
            refreshSubscribers = 0;
          });
      }

      // Track subscriber to cancel in-flight refresh if all waiting callers abort
      refreshSubscribers++;
      const onAbort = () => {
        refreshSubscribers--;
        if (refreshSubscribers <= 0 && refreshAbortController) {
          refreshAbortController.abort();
        }
      };

      if (activeSignal) {
        activeSignal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        const refreshed = await refreshPromise;
        if (refreshed && !activeSignal?.aborted) {
          res = await executeRequest();
        }
      } finally {
        if (activeSignal) {
          activeSignal.removeEventListener('abort', onAbort);
        }
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
