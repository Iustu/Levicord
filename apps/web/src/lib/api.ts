/**
 * Centralized API configuration (Engenharia de Software — DRY principle)
 * All fetch calls should import from here, never hardcode the base URL.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export async function apiFetch<T>(
  path: string,
  _token: string | null,
  options: RequestInit = {}
): Promise<T> {
  const controller = options.signal ? undefined : new AbortController();
  const timeout = controller ? window.setTimeout(() => controller.abort(), 15000) : undefined;
  
  const executeRequest = async (): Promise<Response> => {
    return fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options.signal || controller?.signal,
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
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        }).then(r => r.ok).catch(() => false).finally(() => {
          isRefreshing = false;
        });
      }
      
      const refreshed = await refreshPromise;
      if (refreshed) {
        res = await executeRequest();
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
