const TOKEN_KEY = 'team-task-manager-token';

const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearStoredToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const sendJson = typeof init.body === 'string' && init.body.length > 0;

  const url = path.startsWith('http') ? path : `${apiBase}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      ...(sendJson ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      if (!response.ok) {
        throw new ApiError(text.trim().slice(0, 240) || 'Request failed', response.status);
      }
      throw new ApiError('Server returned non-JSON response', response.status);
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : 'Request failed';
    throw new ApiError(message, response.status);
  }

  return payload as T;
}
