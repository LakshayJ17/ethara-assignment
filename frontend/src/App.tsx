import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCircle2, CirclePlus, Clock3, LayoutDashboard, LayoutGrid, LogOut, Menu, Shield, Sparkles, SquarePen, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea
} from './components/ui';
import { clearStoredToken, getStoredToken, request, setStoredRole, setStoredToken } from './lib/api';
import { fetchDashboard, fetchProjects, fetchSessionUser, normalizeUser, signupUser } from './lib/api-compat';
import type { Dashboard, Project, Role, SeedResponse, Task, TaskPriority, TaskStatus, User } from './lib/types';

const authRoles: Role[] = ['Admin', 'Member'];
const projectColors = [
  { value: 'sand', label: 'Sand' },
  { value: 'sage', label: 'Sage' },
  { value: 'ember', label: 'Ember' },
  { value: 'stone', label: 'Stone' }
] as const;

const statusMeta: Record<TaskStatus, { label: string; tone: 'default' | 'subtle' | 'success' | 'danger' }> = {
  Todo: { label: 'To do', tone: 'subtle' },
  InProgress: { label: 'In progress', tone: 'default' },
  Done: { label: 'Done', tone: 'success' }
};

const priorityMeta: Record<TaskPriority, { label: string; className: string }> = {
  Low: { label: 'Low', className: 'border-line/60 bg-transparent text-muted' },
  Medium: { label: 'Medium', className: 'border-line/60 bg-panel2 text-text' },
  High: { label: 'High', className: 'border-danger/25 bg-danger/10 text-danger' }
};

type AuthMode = 'login' | 'signup';

type AuthForm = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

type ProjectForm = {
  name: string;
  description: string;
  color: Project['color'];
};

type TaskForm = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assigneeId: string;
};

type MemberForm = {
  email: string;
  role: Role;
};

const emptyAuthForm: AuthForm = {
  name: '',
  email: '',
  password: '',
  role: 'Admin'
};

const emptyProjectForm: ProjectForm = {
  name: '',
  description: '',
  color: 'sand'
};

const emptyTaskForm: TaskForm = {
  title: '',
  description: '',
  status: 'Todo',
  priority: 'Medium',
  dueDate: '',
  assigneeId: ''
};

const emptyMemberForm: MemberForm = {
  email: '',
  role: 'Member'
};

const colorLabel: Record<Project['color'], string> = {
  sand: 'Warm sand',
  sage: 'Muted sage',
  ember: 'Clay ember',
  stone: 'Slate stone'
};

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part.trim().charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) {
    return 'No due date';
  }

  return format(new Date(value), 'dd MMM');
}

function isOverdue(task: Task) {
  return task.status !== 'Done' && task.dueDate ? new Date(task.dueDate).getTime() < Date.now() : false;
}

function projectAccent(color: Project['color']) {
  switch (color) {
    case 'sage':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'ember':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'stone':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'sand':
    default:
      return 'bg-stone-100 text-stone-700 border-stone-200';
  }
}

type WorkspaceTab = 'dashboard' | 'board' | 'tasks' | 'team';

function App() {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [authForm, setAuthForm] = useState<AuthForm>(emptyAuthForm);
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProjectForm);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyMemberForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('dashboard');

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId]
  );
  const canManageSelectedProject = Boolean(
    user && selectedProject && (user.role === 'Admin' || selectedProject.ownerId === user.id)
  );

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    void loadSession(token);
  }, [token]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    setTaskForm((current) => ({
      ...current,
      assigneeId: current.assigneeId || selectedProject.members[0]?.user.id || user?.id || ''
    }));
  }, [selectedProject, user]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(''), 6500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function loadSession(activeToken: string) {
    setLoading(true);
    setError('');

    try {
      const sessionUser = await fetchSessionUser(activeToken);
      setUser(sessionUser);
      await loadWorkspace(activeToken, sessionUser);
    } catch {
      clearStoredToken();
      setToken(null);
      setUser(null);
      setProjects([]);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace(activeToken?: string, sessionUser?: User) {
    const sessionToken = activeToken ?? token;

    if (!sessionToken) {
      return;
    }

    const currentUser = sessionUser ?? user ?? (await fetchSessionUser(sessionToken));

    const [projectList, dashboardData] = await Promise.all([
      fetchProjects(sessionToken, currentUser),
      fetchDashboard(sessionToken)
    ]);

    setProjects(projectList);
    setDashboard(dashboardData);

    if (projectList.length) {
      setSelectedProjectId((current) =>
        projectList.some((project) => project.id === current) ? current : projectList[0].id
      );
    } else {
      setSelectedProjectId('');
    }
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);

    try {
      const payload = authMode === 'signup'
        ? { ...authForm }
        : { email: authForm.email, password: authForm.password };

      const response =
        authMode === 'signup'
          ? await signupUser(payload)
          : await request<{ token: string; user: { id: string; name: string; email: string; role?: string } }>(
              '/api/auth/login',
              { method: 'POST', body: JSON.stringify(payload) }
            ).then((data) => ({ token: data.token, user: normalizeUser(data.user) }));

      setStoredToken(response.token);
      setStoredRole(response.user.role);
      setToken(response.token);
      setUser(response.user);
      setAuthForm(emptyAuthForm);
      await loadWorkspace(response.token, response.user);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Authentication failed');
    } finally {
      setSaving(false);
    }
  }

  async function refreshWorkspace() {
    if (!token) {
      return;
    }

    await loadWorkspace(token);
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await request<{ project: Project }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(projectForm)
      }, token);
      setIsProjectDialogOpen(false);
      setProjectForm(emptyProjectForm);
      await refreshWorkspace();
      setNotice('Project created successfully.');
      setWorkspaceTab('board');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to create project');
    } finally {
      setSaving(false);
    }
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedProject) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        ...taskForm,
        assigneeId: taskForm.assigneeId || '',
        dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : ''
      };

      await request<{ task: Task }>(`/api/projects/${selectedProject.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify(payload)
      }, token);
      setIsTaskDialogOpen(false);
      setTaskForm((current) => ({
        ...emptyTaskForm,
        assigneeId: current.assigneeId || selectedProject.members[0]?.user.id || user?.id || ''
      }));
      await refreshWorkspace();
      setNotice('Task created successfully.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to create task');
    } finally {
      setSaving(false);
    }
  }

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedProject) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await request(`/api/projects/${selectedProject.id}/members`, {
        method: 'POST',
        body: JSON.stringify(memberForm)
      }, token);
      setIsMemberDialogOpen(false);
      setMemberForm(emptyMemberForm);
      await refreshWorkspace();
      setNotice('Member invited successfully.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to invite member');
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(
    taskId: string,
    patch: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'assigneeId'>>
  ) {
    if (!token) {
      return;
    }

    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.priority !== undefined) body.priority = patch.priority;
    if (patch.dueDate !== undefined) body.dueDate = patch.dueDate;
    if (patch.assigneeId !== undefined) body.assigneeId = patch.assigneeId;

    try {
      await request(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      }, token);
      await refreshWorkspace();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to update task');
    }
  }

  async function removeTask(taskId: string) {
    if (!token) {
      return;
    }

    try {
      await request(`/api/tasks/${taskId}`, { method: 'DELETE' }, token);
      await refreshWorkspace();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to delete task');
    }
  }

  async function seedDemo() {
    if (!token) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await request<SeedResponse>('/api/demo/seed', {
        method: 'POST',
        body: '{}'
      }, token);
      await refreshWorkspace();
      if (response.project) {
        setSelectedProjectId(response.project.id);
      }
      setWorkspaceTab('board');
      setNotice(`Demo member created: ${response.demoMember.email} / ${response.demoMember.password}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to seed demo data');
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    clearStoredToken();
    setToken(null);
    setUser(null);
    setProjects([]);
    setDashboard(null);
    setSelectedProjectId('');
    setError('');
    setNotice('');
  }

  const groupedTasks = useMemo(() => {
    const tasks = selectedProject?.tasks ?? [];
    return {
      Todo: tasks.filter((task) => task.status === 'Todo'),
      InProgress: tasks.filter((task) => task.status === 'InProgress'),
      Done: tasks.filter((task) => task.status === 'Done')
    } as const;
  }, [selectedProject]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-line/50 bg-panel2 text-accent">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="text-xl font-semibold tracking-tight">Loading workspace</p>
            <p className="text-sm leading-6 text-muted">Preparing your projects, tasks, and dashboard metrics.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative flex items-center overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-transparent to-sky-50/80" />
          <div className="absolute left-1/4 top-24 h-52 w-52 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute bottom-8 right-16 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl" />
          <div className="relative z-10 max-w-2xl space-y-8">
            <Badge variant="subtle" className="w-fit rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider">
              Team Task Manager
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-text lg:text-6xl lg:leading-[1.08]">
                Project control without the noise.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-muted lg:text-xl">
                A focused workspace for assigning work, tracking progress, and keeping teams aligned with clear role-based access.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['Projects', 'Organize shared work in one place.'],
                ['Tasks', 'Assign, track, and close items with clarity.'],
                ['Dashboard', 'See overdue work and progress at a glance.']
              ].map(([title, text]) => (
                <Card key={title} className="border-line/40 bg-panel/90 shadow-none">
                  <CardContent className="space-y-1.5 p-4">
                    <p className="font-medium">{title}</p>
                    <p className="text-sm leading-6 text-muted">{text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle>{authMode === 'signup' ? 'Create your workspace' : 'Welcome back'}</CardTitle>
              <CardDescription>
                {authMode === 'signup'
                  ? 'Start as an admin or member, then create projects and invite your team.'
                  : 'Pick up where you left off and continue managing your delivery board.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 rounded-xl border border-line/50 bg-panel2 p-1">
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${authMode === 'signup' ? 'bg-panel text-text shadow-sm' : 'text-muted'}`}
                >
                  Sign up
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${authMode === 'login' ? 'bg-panel text-text shadow-sm' : 'text-muted'}`}
                >
                  Log in
                </button>
              </div>

              <form className="space-y-4" onSubmit={submitAuth}>
                {authMode === 'signup' && (
                  <Input
                    placeholder="Full name"
                    value={authForm.name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                )}
                <Input
                  type="email"
                  placeholder="Email address"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  required
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  required
                />
                {authMode === 'signup' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text">Role</label>
                    <select
                      className="flex h-11 w-full rounded-xl border border-line/60 bg-panel px-4 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
                      value={authForm.role}
                      onChange={(event) => setAuthForm((current) => ({ ...current, role: event.target.value as Role }))}
                    >
                      {authRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {error ? (
                  <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}
                <Button className="w-full" type="submit" disabled={saving}>
                  {saving ? 'Please wait...' : authMode === 'signup' ? 'Create account' : 'Log in'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-[1px] transition-opacity lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:flex-row lg:gap-8 lg:px-8">
        <aside
          className={`fixed inset-y-0 left-0 z-40 max-h-[100dvh] w-[min(100%,20rem)] max-w-[calc(100vw-1rem)] flex-col overflow-y-auto overscroll-contain border-r border-line/50 bg-panel p-4 shadow-2xl sm:p-5 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:w-64 lg:shrink-0 lg:rounded-2xl lg:border lg:border-line/50 lg:shadow-none ${sidebarOpen ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}
        >
          <div className="flex items-center justify-between pb-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Tasks</p>
              <p className="text-lg font-semibold tracking-tight text-text">Overview</p>
            </div>
            <button type="button" className="rounded-lg border border-line/60 bg-panel2 p-2 lg:hidden" onClick={() => setSidebarOpen(false)}>
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="rounded-xl border border-line/50 bg-panel2/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line/50 bg-panel text-sm font-semibold text-text">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium leading-tight">{user.name}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Badge variant={user.role === 'Admin' ? 'success' : 'subtle'}>{user.role}</Badge>
              <Button variant="ghost" size="sm" onClick={logout} className="px-2 text-muted hover:text-text" aria-label="Log out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <div className="flex-1 rounded-xl border border-line/50 bg-panel2/40 px-3 py-2.5">
              <p className="text-xs text-muted">Projects</p>
              <p className="text-xl font-semibold tabular-nums">{dashboard?.projects ?? 0}</p>
            </div>
            <div className="flex-1 rounded-xl border border-line/50 bg-panel2/40 px-3 py-2.5">
              <p className="text-xs text-muted">Overdue</p>
              <p className="text-xl font-semibold tabular-nums text-danger">{dashboard?.overdue ?? 0}</p>
            </div>
          </div>

          <div className="mt-6 min-h-0 flex-1">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-text">Your projects</p>
              {user.role === 'Admin' ? (
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setIsProjectDialogOpen(true)}>
                  <CirclePlus className="h-3.5 w-3.5" />
                  New
                </Button>
              ) : null}
            </div>
            <div className="space-y-1.5 overflow-y-auto pr-0.5 lg:max-h-[min(42vh,22rem)]">
              {projects.length ? (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setSidebarOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      project.id === selectedProjectId
                        ? 'border-accent/30 bg-accent text-white shadow-sm'
                        : 'border-transparent bg-panel2/40 text-text hover:bg-panel2'
                    }`}
                  >
                    <span className="min-w-0 truncate font-medium">{project.name}</span>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${
                        project.id === selectedProjectId ? 'bg-white/15 text-white' : 'bg-panel text-muted'
                      }`}
                    >
                      {project.counts.tasks}
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-line/60 px-3 py-4 text-center text-sm text-muted">No projects yet.</p>
              )}
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-5 sm:gap-6">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line/40 pb-4">
            <div className="flex min-w-0 items-start gap-3">
              <button type="button" className="mt-0.5 rounded-lg border border-line/60 bg-panel p-2 lg:hidden" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">Workspace</p>
                <h1 className="truncate text-2xl font-semibold tracking-tight text-text lg:text-3xl">
                  {selectedProject?.name ?? 'Choose a project'}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="subtle" className="hidden sm:inline-flex">
                <Shield className="h-3.5 w-3.5" />
                {user.role === 'Admin' ? 'Admin' : 'Member'}
              </Badge>
              {notice ? (
                <Button variant="ghost" size="sm" className="text-muted hover:text-text" onClick={() => setNotice('')}>
                  Dismiss
                </Button>
              ) : null}
            </div>
          </header>

          {notice ? (
            <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="leading-relaxed">{notice}</p>
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="leading-relaxed">{error}</p>
            </div>
          ) : null}

          <Tabs value={workspaceTab} onValueChange={(value) => setWorkspaceTab(value as WorkspaceTab)} className="min-w-0">
            <TabsList className="flex h-auto min-h-11 w-full flex-wrap gap-1 rounded-xl border border-line/50 bg-panel2/80 p-1">
              <TabsTrigger value="dashboard" className="min-w-[8.5rem] flex-1 gap-2">
                <LayoutDashboard className="h-4 w-4 shrink-0" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="board" className="min-w-[8.5rem] flex-1 gap-2">
                <LayoutGrid className="h-4 w-4 shrink-0" />
                Board
              </TabsTrigger>
              <TabsTrigger value="tasks" className="min-w-[8.5rem] flex-1 gap-2">
                <SquarePen className="h-4 w-4 shrink-0" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="team" className="min-w-[8.5rem] flex-1 gap-2">
                <Users className="h-4 w-4 shrink-0" />
                Team
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-5">
              <Card className="border-line/40 shadow-none">
                <CardContent className="space-y-4 p-4 sm:space-y-5 sm:p-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                    {[
                      { label: 'Active projects', value: dashboard?.projects ?? 0, icon: LayoutDashboard },
                      { label: 'Open tasks', value: (dashboard?.tasks ?? 0) - (dashboard?.statusCounts.Done ?? 0), icon: SquarePen },
                      { label: 'Due soon', value: dashboard?.dueSoon ?? 0, icon: Clock3 },
                      { label: 'Completion', value: `${dashboard?.completionRate ?? 0}%`, icon: CheckCircle2 }
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3 rounded-xl border border-line/40 bg-panel2/30 px-4 py-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line/50 bg-panel text-accent">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted">{item.label}</p>
                          <p className="text-xl font-semibold tabular-nums tracking-tight">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 border-t border-line/40 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
                    {user.role === 'Admin' ? (
                      <Button variant="subtle" size="sm" onClick={() => setIsProjectDialogOpen(true)}>
                        <CirclePlus className="h-4 w-4" />
                        New project
                      </Button>
                    ) : null}
                    <Button variant="subtle" size="sm" onClick={() => void seedDemo()} disabled={saving}>
                      <Sparkles className="h-4 w-4" />
                      Seed demo data
                    </Button>
                    {selectedProject ? (
                      <>
                        <Button variant="subtle" size="sm" onClick={() => setWorkspaceTab('board')}>
                          <LayoutGrid className="h-4 w-4" />
                          Open board
                        </Button>
                        <Button variant="subtle" size="sm" onClick={() => setWorkspaceTab('tasks')}>
                          <SquarePen className="h-4 w-4" />
                          Task list
                        </Button>
                        {canManageSelectedProject ? (
                          <Button variant="subtle" size="sm" onClick={() => setWorkspaceTab('team')}>
                            <Users className="h-4 w-4" />
                            Team & invites
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-line/40 shadow-none">
                <CardHeader>
                  <CardTitle>Recent updates</CardTitle>
                  <CardDescription>Latest activity across all projects you can access.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(dashboard?.recentTasks ?? []).length ? (
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      {(dashboard?.recentTasks ?? []).slice(0, 8).map((task) => (
                        <li key={task.id} className="rounded-xl border border-line/40 bg-panel2/30 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-snug text-text">{task.title}</p>
                              <p className="mt-0.5 text-xs text-muted">{task.assignee?.name || 'Unassigned'}</p>
                            </div>
                            <Badge variant={task.status === 'Done' ? 'success' : 'subtle'} className="self-start sm:mt-0.5">
                              {statusMeta[task.status].label}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted">
                            {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No recent task updates yet.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="board">
              {selectedProject ? (
                <div className="rounded-2xl border border-line/40 bg-panel p-4 shadow-none sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/40 pb-4 sm:gap-4">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold tracking-tight">{selectedProject.name}</h2>
                      <p className="mt-1 text-sm text-muted">{selectedProject.description || 'No description yet.'}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Badge className={projectAccent(selectedProject.color)}>{colorLabel[selectedProject.color]}</Badge>
                      <Button variant="subtle" size="sm" onClick={() => setIsTaskDialogOpen(true)}>
                        <CirclePlus className="h-4 w-4" />
                        Add task
                      </Button>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
                    <div>
                      <dt className="text-muted">Owner</dt>
                      <dd className="font-medium text-text">{selectedProject.owner.name}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Members</dt>
                      <dd className="font-medium tabular-nums">{selectedProject.members.length}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Tasks</dt>
                      <dd className="font-medium tabular-nums">{selectedProject.tasks.length}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Open</dt>
                      <dd className="font-medium tabular-nums">{selectedProject.counts.tasks - selectedProject.counts.done}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">In progress</dt>
                      <dd className="font-medium tabular-nums">{selectedProject.counts.inProgress}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Overdue</dt>
                      <dd className="font-medium tabular-nums text-danger">
                        {selectedProject.tasks.filter((task) => isOverdue(task)).length}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
                    {(['Todo', 'InProgress', 'Done'] as TaskStatus[]).map((status) => (
                      <div key={status} className="flex min-h-[12rem] flex-col rounded-xl border border-line/40 bg-panel2/20 p-4">
                        <div className="mb-3 flex items-baseline justify-between gap-2">
                          <h3 className="text-sm font-semibold text-text">{statusMeta[status].label}</h3>
                          <span className="text-xs tabular-nums text-muted">{groupedTasks[status].length}</span>
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                          {groupedTasks[status].length ? (
                            groupedTasks[status].map((task) => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                currentUser={user}
                                canManage={canManageSelectedProject}
                                onStatusChange={updateTask}
                                onDelete={removeTask}
                              />
                            ))
                          ) : (
                            <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line/50 px-2 py-6 text-center text-xs text-muted">
                              Empty
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No project selected"
                  description="Choose a project in the sidebar, create one as an admin, or seed demo data."
                  actionLabel={user.role === 'Admin' ? 'Create project' : 'Seed demo data'}
                  onAction={user.role === 'Admin' ? () => setIsProjectDialogOpen(true) : () => void seedDemo()}
                />
              )}
            </TabsContent>

            <TabsContent value="tasks">
              {selectedProject ? (
                <Card>
                  <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle>Task register</CardTitle>
                      <CardDescription>Update status inline and keep the delivery board current.</CardDescription>
                    </div>
                    <Button variant="subtle" className="w-full shrink-0 sm:w-auto" onClick={() => setIsTaskDialogOpen(true)}>
                      <CirclePlus className="h-4 w-4" />
                      Add task
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedProject.tasks.length ? (
                      selectedProject.tasks
                        .slice()
                        .sort((left, right) => {
                          const leftTime = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
                          const rightTime = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
                          return leftTime - rightTime;
                        })
                        .map((task) => (
                          <div
                            key={task.id}
                            className="flex flex-col gap-3 rounded-xl border border-line/40 bg-panel2/25 p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_11rem_auto] lg:items-center lg:gap-4"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{task.title}</p>
                                <Badge variant={task.status === 'Done' ? 'success' : 'subtle'}>{statusMeta[task.status].label}</Badge>
                                <Badge className={priorityMeta[task.priority].className}>{priorityMeta[task.priority].label}</Badge>
                              </div>
                              <p className="mt-2 text-sm leading-relaxed text-muted">{task.description || 'No description.'}</p>
                            </div>
                            <div className="text-sm text-muted lg:text-right">
                              <p className="font-medium text-text">{task.assignee?.name || 'Unassigned'}</p>
                              <p>Due {formatDate(task.dueDate)}</p>
                            </div>
                            <select
                              className="h-11 w-full rounded-xl border border-line/60 bg-panel px-3 text-sm text-text lg:max-w-none"
                              value={task.status}
                              onChange={(event) => void updateTask(task.id, { status: event.target.value as TaskStatus })}
                            >
                              {(['Todo', 'InProgress', 'Done'] as TaskStatus[]).map((status) => (
                                <option key={status} value={status}>
                                  {statusMeta[status].label}
                                </option>
                              ))}
                            </select>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                              <Button variant="ghost" size="sm" onClick={() => void removeTask(task.id)}>
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-line/50 bg-panel2/20 p-10 text-center">
                        <p className="text-xl font-semibold">No tasks yet</p>
                        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
                          Add the first work item for this project and use statuses to keep progress visible.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <EmptyState
                  title="Choose a project first"
                  description="Tasks live inside projects, so pick one from the sidebar before adding or updating work."
                  actionLabel={user.role === 'Admin' ? 'Create project' : 'Seed demo data'}
                  onAction={user.role === 'Admin' ? () => setIsProjectDialogOpen(true) : () => void seedDemo()}
                />
              )}
            </TabsContent>

            <TabsContent value="team">
              {selectedProject ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
                  <Card>
                    <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <CardTitle>Team members</CardTitle>
                        <CardDescription>Owners and invited collaborators are listed here.</CardDescription>
                      </div>
                      {canManageSelectedProject ? (
                        <Button variant="subtle" className="w-full shrink-0 sm:w-auto" onClick={() => setIsMemberDialogOpen(true)}>
                          <Users className="h-4 w-4" />
                          Invite
                        </Button>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedProject.members.map((member) => (
                        <div key={member.id} className="flex flex-col gap-2 rounded-xl border border-line/40 bg-panel2/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line/50 bg-panel text-sm font-semibold">
                              {initials(member.user.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{member.user.name}</p>
                              <p className="truncate text-sm text-muted">{member.user.email}</p>
                            </div>
                          </div>
                          <Badge variant={member.role === 'Admin' ? 'success' : 'subtle'} className="w-fit sm:shrink-0">
                            {member.role}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Access rules</CardTitle>
                      <CardDescription>Role-based behavior baked into the app logic.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-6 text-muted">
                      <div className="rounded-xl border border-line/40 bg-panel2/25 p-4">
                        <p className="text-sm font-semibold text-text">Admin</p>
                        <p className="mt-2 text-sm leading-relaxed text-muted">Create projects, invite members, reassign tasks, full task access.</p>
                      </div>
                      <div className="rounded-xl border border-line/40 bg-panel2/25 p-4">
                        <p className="text-sm font-semibold text-text">Member</p>
                        <p className="mt-2 text-sm leading-relaxed text-muted">See assigned projects, add tasks where allowed, update own items.</p>
                      </div>
                      <div className="rounded-xl border border-line/40 bg-panel2/25 p-4">
                        <p className="text-sm font-semibold text-text">Dashboard</p>
                        <p className="mt-2 text-sm leading-relaxed text-muted">Open work, overdue, due soon, and recent activity.</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <EmptyState
                  title="No team loaded"
                  description="Add a project first, or seed demo data to see invite and membership management in action."
                  actionLabel={user.role === 'Admin' ? 'Create project' : 'Seed demo data'}
                  onAction={user.role === 'Admin' ? () => setIsProjectDialogOpen(true) : () => void seedDemo()}
                />
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a project</DialogTitle>
            <DialogDescription>Set up a new workspace and start assigning work immediately.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createProject}>
            <Input placeholder="Project name" value={projectForm.name} onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))} required />
            <Textarea
              placeholder="Short description"
              value={projectForm.description}
              onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Theme</label>
              <select
                className="flex h-11 w-full rounded-xl border border-line/60 bg-panel px-4 text-sm text-text"
                value={projectForm.color}
                onChange={(event) => setProjectForm((current) => ({ ...current, color: event.target.value as Project['color'] }))}
              >
                {projectColors.map((color) => (
                  <option key={color.value} value={color.value}>
                    {color.label}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving}>
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a task</DialogTitle>
            <DialogDescription>Track work inside the selected project with a clear owner and status.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createTask}>
            <Input placeholder="Task title" value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea
              placeholder="Task description"
              value={taskForm.description}
              onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-line/60 bg-panel px-4 text-sm text-text"
                  value={taskForm.status}
                  onChange={(event) => setTaskForm((current) => ({ ...current, status: event.target.value as TaskStatus }))}
                >
                  {(['Todo', 'InProgress', 'Done'] as TaskStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {statusMeta[status].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Priority</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-line/60 bg-panel px-4 text-sm text-text"
                  value={taskForm.priority}
                  onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))}
                >
                  {(['Low', 'Medium', 'High'] as TaskPriority[]).map((priority) => (
                    <option key={priority} value={priority}>
                      {priorityMeta[priority].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text" htmlFor="task-due">
                  Due date
                </label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={taskForm.dueDate}
                  onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Assignee</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-line/60 bg-panel px-4 text-sm text-text"
                  value={taskForm.assigneeId}
                  onChange={(event) => setTaskForm((current) => ({ ...current, assigneeId: event.target.value }))}
                >
                  {[{ id: user.id, name: `${user.name} (you)` }, ...(selectedProject?.members.map((member) => member.user).filter((member) => member.id !== user.id) ?? [])].map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving}>
                Create task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isMemberDialogOpen} onOpenChange={setIsMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>Invite an existing user by email and set their project-level role.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={inviteMember}>
            <Input placeholder="Teammate email" value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} required />
            <div className="space-y-2">
              <label className="text-sm font-medium">Project role</label>
              <select
                className="flex h-11 w-full rounded-xl border border-line/60 bg-panel px-4 text-sm text-text"
                value={memberForm.role}
                onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value as Role }))}
              >
                {authRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving}>
                Invite member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskCard({
  task,
  currentUser,
  canManage,
  onStatusChange,
  onDelete
}: {
  task: Task;
  currentUser: User;
  canManage: boolean;
  onStatusChange: (taskId: string, patch: Partial<Task>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}) {
  const overdue = isOverdue(task);
  const canEdit = canManage || task.creatorId === currentUser.id || task.assigneeId === currentUser.id;

  return (
    <div className={`rounded-xl border p-4 ${overdue ? 'border-danger/25 bg-danger/10' : 'border-line/40 bg-panel'}`}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1 font-medium leading-snug">{task.title}</p>
          {overdue ? (
            <Badge variant="danger" className="shrink-0">
              Overdue
            </Badge>
          ) : null}
        </div>
        {task.description ? <p className="text-sm leading-relaxed text-muted">{task.description}</p> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={task.status === 'Done' ? 'success' : 'subtle'}>{statusMeta[task.status].label}</Badge>
        <Badge className={priorityMeta[task.priority].className}>{priorityMeta[task.priority].label}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>Due {formatDate(task.dueDate)}</span>
        <span className="min-w-0 truncate">{task.assignee?.name || 'Unassigned'}</span>
      </div>
      {canEdit ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="h-10 w-full flex-1 rounded-xl border border-line/60 bg-panel px-3 text-sm text-text sm:min-w-0"
            value={task.status}
            onChange={(event) => void onStatusChange(task.id, { status: event.target.value as TaskStatus })}
          >
            {(['Todo', 'InProgress', 'Done'] as TaskStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusMeta[status].label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="ghost" onClick={() => void onDelete(task.id)}>
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  onAction
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Card className="border-dashed border-line/50 bg-panel2/20 shadow-none">
      <CardContent className="space-y-4 p-6 text-center sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-line/50 bg-panel text-accent">
          <LayoutDashboard className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <p className="text-2xl font-semibold tracking-tight text-text">{title}</p>
          <p className="mx-auto max-w-2xl text-sm leading-6 text-muted">{description}</p>
        </div>
        <Button onClick={onAction}>{actionLabel}</Button>
      </CardContent>
    </Card>
  );
}

export default App;
