import type { Dashboard, Role, Task, TaskStatus, User } from './types';
import { ApiError, request } from './api';

export type AuthResponse = {
  token: string;
  user: User;
};

const legacyStatusMap: Record<string, TaskStatus> = {
  TODO: 'Todo',
  IN_PROGRESS: 'InProgress',
  DONE: 'Done',
  Todo: 'Todo',
  InProgress: 'InProgress',
  Done: 'Done'
};

export function normalizeUser(raw: { id: string; name: string; email: string; role?: string | null }): User {
  let role: Role = 'Member';
  if (raw.role === 'Admin' || raw.role === 'ADMIN') role = 'Admin';
  if (raw.role === 'Member' || raw.role === 'MEMBER') role = 'Member';
  return { id: raw.id, name: raw.name, email: raw.email, role };
}

function mapLegacyTask(raw: Record<string, unknown>): Task {
  const statusKey = String(raw.status ?? 'Todo');
  const status = legacyStatusMap[statusKey] ?? 'Todo';
  const priorityNum = typeof raw.priority === 'number' ? raw.priority : 0;

  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    description: (raw.description as string | null) ?? null,
    status,
    priority: priorityNum >= 2 ? 'High' : priorityNum === 1 ? 'Medium' : 'Low',
    dueDate: raw.dueDate ? String(raw.dueDate) : null,
    projectId: String(raw.projectId ?? ''),
    creatorId: String(raw.createdById ?? raw.creatorId ?? ''),
    assigneeId: raw.assigneeId ? String(raw.assigneeId) : null,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    completedAt: status === 'Done' ? String(raw.updatedAt ?? null) : null,
    assignee: null,
    creator: {
      id: String(raw.createdById ?? raw.creatorId ?? 'unknown'),
      name: 'Member',
      email: '',
      role: 'Member'
    }
  };
}

function mapLegacyDashboard(legacy: {
  summary: {
    totalTasks: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number;
    dueSoon: number;
  };
  myTasks: Record<string, unknown>[];
}): Dashboard {
  const { summary } = legacy;
  const recentTasks = legacy.myTasks.map(mapLegacyTask);

  return {
    projects: 0,
    tasks: summary.totalTasks,
    overdue: summary.overdue,
    dueSoon: summary.dueSoon,
    completionRate: summary.totalTasks ? Math.round((summary.done / summary.totalTasks) * 100) : 0,
    statusCounts: {
      Todo: summary.todo,
      InProgress: summary.inProgress,
      Done: summary.done
    },
    recentTasks,
    projectsSummary: []
  };
}

/** Signup: new API uses /signup; older Railway deploys only expose /register. */
export async function signupUser(body: Record<string, unknown>): Promise<AuthResponse> {
  try {
    return await request<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      const legacy = await request<{ token: string; user: { id: string; name: string; email: string; role?: string } }>(
        '/api/auth/register',
        { method: 'POST', body: JSON.stringify(body) }
      );
      return { token: legacy.token, user: normalizeUser(legacy.user) };
    }
    throw error;
  }
}

export async function fetchSessionUser(token: string): Promise<User> {
  const me = await request<{ user: { id: string; name: string; email: string; role?: string } }>('/api/auth/me', {}, token);
  return normalizeUser(me.user);
}

export async function fetchDashboard(token: string): Promise<Dashboard> {
  try {
    const res = await request<{ dashboard: Dashboard }>('/api/dashboard/summary', {}, token);
    return res.dashboard;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
      const legacy = await request<{
        summary: {
          totalTasks: number;
          todo: number;
          inProgress: number;
          done: number;
          overdue: number;
          dueSoon: number;
        };
        myTasks: Record<string, unknown>[];
      }>('/api/dashboard', {}, token);
      return mapLegacyDashboard(legacy);
    }
    throw error;
  }
}
