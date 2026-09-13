/**
 * Centralized API configuration (Engenharia de Software — DRY principle)
 * All fetch calls should import from here, never hardcode the base URL.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const controller = options.signal ? undefined : new AbortController();
  const timeout = controller ? window.setTimeout(() => controller.abort(), 15000) : undefined;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options.signal || controller?.signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token && token !== '__cookie__' ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP error ${res.status}`);
    }

    return res.json();
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

export { API_BASE };
