import type { Dashboard, Project, ProjectCounts, Role, Task, TaskStatus, User } from './types';
import { ApiError, getStoredRole, request, setStoredRole } from './api';

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

export function normalizeUser(
  raw: { id: string; name: string; email: string; role?: string | null },
  fallbackRole?: Role
): User {
  let role: Role = fallbackRole ?? getStoredRole() ?? 'Member';
  if (raw.role === 'Admin' || raw.role === 'ADMIN') role = 'Admin';
  if (raw.role === 'Member' || raw.role === 'MEMBER') role = 'Member';
  return { id: raw.id, name: raw.name, email: raw.email, role };
}

function mapLegacyTask(raw: Record<string, unknown>): Task {
  const statusKey = String(raw.status ?? 'Todo');
  const status = legacyStatusMap[statusKey] ?? 'Todo';
  const priorityRaw = raw.priority;
  let priority: Task['priority'] = 'Medium';
  if (typeof priorityRaw === 'string' && ['Low', 'Medium', 'High'].includes(priorityRaw)) {
    priority = priorityRaw as Task['priority'];
  } else if (typeof priorityRaw === 'number') {
    priority = priorityRaw >= 2 ? 'High' : priorityRaw === 1 ? 'Medium' : 'Low';
  }

  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    description: (raw.description as string | null) ?? null,
    status,
    priority,
    dueDate: raw.dueDate ? String(raw.dueDate) : null,
    projectId: String(raw.projectId ?? ''),
    creatorId: String(raw.createdById ?? raw.creatorId ?? ''),
    assigneeId: raw.assigneeId ? String(raw.assigneeId) : null,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    completedAt: status === 'Done' ? String(raw.updatedAt ?? null) : null,
    assignee: (raw.assignee as User | null) ?? null,
    creator: (raw.createdBy as User) ?? (raw.creator as User) ?? {
      id: String(raw.createdById ?? raw.creatorId ?? 'unknown'),
      name: 'Member',
      email: '',
      role: 'Member'
    }
  };
}

function normalizeProjectShape(raw: Record<string, unknown>, sessionUser: User): Project {
  const tasks = Array.isArray(raw.tasks) ? raw.tasks.map((t) => mapLegacyTask(t as Record<string, unknown>)) : [];
  const members = Array.isArray(raw.members)
    ? (raw.members as Record<string, unknown>[]).map((member) => {
        const memberRole: Role =
          member.role === 'ADMIN' || member.role === 'Admin' ? 'Admin' : 'Member';
        return {
          id: String(member.id),
          role: memberRole,
          joinedAt: String(member.joinedAt ?? new Date().toISOString()),
          user: member.user
            ? normalizeUser(member.user as { id: string; name: string; email: string; role?: string })
            : sessionUser
        };
      })
    : [];

  const ownerRaw = raw.owner as { id: string; name: string; email: string; role?: string } | undefined;
  const owner = ownerRaw ? normalizeUser(ownerRaw) : sessionUser;
  const countsRaw = raw.counts as ProjectCounts | undefined;

  const todo = tasks.filter((t) => t.status === 'Todo').length;
  const inProgress = tasks.filter((t) => t.status === 'InProgress').length;
  const done = tasks.filter((t) => t.status === 'Done').length;

  return {
    id: String(raw.id),
    name: String(raw.name ?? 'Project'),
    description: (raw.description as string | null) ?? null,
    color: (['sand', 'sage', 'ember', 'stone'].includes(String(raw.color)) ? raw.color : 'sand') as Project['color'],
    ownerId: String(raw.ownerId ?? owner.id),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? new Date().toISOString()),
    owner,
    members,
    tasks,
    counts: countsRaw ?? { tasks: tasks.length, todo, inProgress, done }
  };
}

function isLegacyProjectListItem(item: Record<string, unknown>) {
  return 'taskCount' in item && !('tasks' in item);
}

function mapLegacyListItem(item: Record<string, unknown>, sessionUser: User): Project {
  const taskCount = Number(item.taskCount ?? 0);
  return {
    id: String(item.id),
    name: String(item.name ?? 'Project'),
    description: (item.description as string | null) ?? null,
    color: 'sand',
    ownerId: sessionUser.id,
    createdAt: String(item.createdAt ?? new Date().toISOString()),
    updatedAt: String(item.createdAt ?? new Date().toISOString()),
    owner: sessionUser,
    members: [],
    tasks: [],
    counts: { tasks: taskCount, todo: taskCount, inProgress: 0, done: 0 }
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
  projects?: { id: string; name: string }[];
}): Dashboard {
  const { summary } = legacy;
  const recentTasks = legacy.myTasks.map(mapLegacyTask);

  return {
    projects: legacy.projects?.length ?? 0,
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
  const requestedRole: Role = body.role === 'Admin' ? 'Admin' : 'Member';

  try {
    const res = await request<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const user = normalizeUser(res.user, res.user.role ?? requestedRole);
    setStoredRole(user.role);
    return { token: res.token, user };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      const legacy = await request<{ token: string; user: { id: string; name: string; email: string; role?: string } }>(
        '/api/auth/register',
        { method: 'POST', body: JSON.stringify(body) }
      );
      const user = normalizeUser(legacy.user, requestedRole);
      setStoredRole(user.role);
      return { token: legacy.token, user };
    }
    throw error;
  }
}

export async function fetchSessionUser(token: string): Promise<User> {
  const me = await request<{ user: { id: string; name: string; email: string; role?: string } }>('/api/auth/me', {}, token);
  const user = normalizeUser(me.user);
  setStoredRole(user.role);
  return user;
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
        projects?: { id: string; name: string }[];
      }>('/api/dashboard', {}, token);
      return mapLegacyDashboard(legacy);
    }
    throw error;
  }
}

export async function fetchProjects(token: string, sessionUser: User): Promise<Project[]> {
  const res = await request<{ projects: Record<string, unknown>[] }>('/api/projects', {}, token);
  const items = res.projects ?? [];

  if (!items.length) {
    return [];
  }

  if (!isLegacyProjectListItem(items[0])) {
    return items.map((item) => normalizeProjectShape(item, sessionUser));
  }

  const hydrated = await Promise.all(
    items.map(async (item) => {
      const id = String(item.id);
      try {
        const detail = await request<{ project: Record<string, unknown> }>(`/api/projects/${id}`, {}, token);
        return normalizeProjectShape(detail.project, sessionUser);
      } catch {
        return mapLegacyListItem(item, sessionUser);
      }
    })
  );

  return hydrated;
}
