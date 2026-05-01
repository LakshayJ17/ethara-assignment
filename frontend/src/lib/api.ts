const getBase = () => import.meta.env.VITE_API_URL ?? "";

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

async function request<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, headers, ...rest } = options;
  const token = getToken();
  const res = await fetch(`${getBase()}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : data?.error?.formErrors?.join?.(", ") ?? res.statusText;
    throw new Error(msg || "Request failed");
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),
  register: (body: { email: string; password: string; name: string }) =>
    request<{ user: User; token: string }>("/api/auth/register", {
      method: "POST",
      json: body,
    }),
  login: (body: { email: string; password: string }) =>
    request<{ user: User; token: string }>("/api/auth/login", {
      method: "POST",
      json: body,
    }),
  me: () => request<{ user: User }>("/api/auth/me"),
  dashboard: () => request<DashboardResponse>("/api/dashboard"),
  projects: () => request<{ projects: ProjectListItem[] }>("/api/projects"),
  project: (id: string) => request<{ project: ProjectDetail }>(`/api/projects/${id}`),
  createProject: (body: { name: string; description?: string | null }) =>
    request<{ project: { id: string } }>("/api/projects", { method: "POST", json: body }),
  updateProject: (id: string, body: { name?: string; description?: string | null }) =>
    request<{ project: unknown }>(`/api/projects/${id}`, { method: "PATCH", json: body }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  inviteMember: (projectId: string, body: { email: string; role: MemberRole }) =>
    request<{ member: ProjectMember }>(`/api/projects/${projectId}/members`, {
      method: "POST",
      json: body,
    }),
  updateMemberRole: (projectId: string, userId: string, role: MemberRole) =>
    request<{ member: ProjectMember }>(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      json: { role },
    }),
  removeMember: (projectId: string, userId: string) =>
    request<void>(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
  createTask: (projectId: string, body: CreateTaskBody) =>
    request<{ task: Task }>(`/api/projects/${projectId}/tasks`, { method: "POST", json: body }),
  updateTask: (projectId: string, taskId: string, body: Partial<CreateTaskBody>) =>
    request<{ task: Task }>(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      json: body,
    }),
  deleteTask: (projectId: string, taskId: string) =>
    request<void>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }),
};

export type MemberRole = "ADMIN" | "MEMBER";

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  role: MemberRole;
  createdAt: string;
  taskCount: number;
  memberCount: number;
};

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  assigneeId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; name: string; email: string } | null;
  createdBy?: { id: string; name: string };
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
  user: { id: string; name: string; email: string };
};

export type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  owner: { id: string; name: string; email: string };
  members: ProjectMember[];
  tasks: Task[];
};

export type DashboardResponse = {
  summary: {
    totalTasks: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number;
    dueSoon: number;
  };
  myTasks: (Task & { project: { id: string; name: string } })[];
  projects: { id: string; name: string }[];
};

export type CreateTaskBody = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: number;
  dueDate?: string | null;
  assigneeId?: string | null;
};
