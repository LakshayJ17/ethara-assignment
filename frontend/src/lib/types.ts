export type Role = 'Admin' | 'Member';
export type TaskStatus = 'Todo' | 'InProgress' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type ProjectMember = {
  id: string;
  role: Role;
  joinedAt: string;
  user: User;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  projectId: string;
  creatorId: string;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignee: User | null;
  creator: User;
};

export type ProjectCounts = {
  tasks: number;
  todo: number;
  inProgress: number;
  done: number;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  color: 'sand' | 'sage' | 'ember' | 'stone';
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: User;
  members: ProjectMember[];
  tasks: Task[];
  counts: ProjectCounts;
};

export type Dashboard = {
  projects: number;
  tasks: number;
  overdue: number;
  dueSoon: number;
  completionRate: number;
  statusCounts: Record<TaskStatus, number>;
  recentTasks: Task[];
  projectsSummary: Project[];
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type SeedResponse = {
  project: Project | null;
  demoMember: {
    email: string;
    password: string;
  };
};
