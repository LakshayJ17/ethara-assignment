const TOKEN_KEY = 'team-task-manager-token';
const ROLE_KEY = 'team-task-manager-role';

const defaultProductionApiBase = 'https://backend-production-20c3.up.railway.app';
const configuredApiBase = import.meta.env.VITE_API_URL?.trim();
const apiBase = (configuredApiBase || defaultProductionApiBase).replace(/\/$/, '');

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearStoredToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
};

export type StoredRole = 'Admin' | 'Member';

export const getStoredRole = (): StoredRole | null => {
  const value = localStorage.getItem(ROLE_KEY);
  return value === 'Admin' || value === 'Member' ? value : null;
};

export const setStoredRole = (role: StoredRole) => localStorage.setItem(ROLE_KEY, role);

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
        const hint =
          text.includes('Cannot POST') || text.includes('Cannot GET')
            ? ' API did not reach the backend. If this is the hosted site, set VITE_API_URL to your Railway API URL or redeploy with the current default backend URL.'
            : '';
        throw new ApiError((text.trim().slice(0, 240) || 'Request failed') + hint, response.status);
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
