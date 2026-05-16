import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './lib/prisma.js';
import { Prisma, Role, TaskPriority, TaskStatus, type User } from '@prisma/client';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const port = Number(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET ?? 'team-task-manager-secret';
const publicDir = path.resolve(process.cwd(), 'public');

/** Express 5 types `params` values as `string | string[]`. */
const routeStringParam = (value: string | string[] | undefined): string | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value[0] : value;

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

type AuthedRequest = Request & { user: SessionUser };

const authSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  role: z.enum(['Admin', 'Member'])
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

const projectSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  color: z.enum(['sand', 'sage', 'ember', 'stone']).default('sand')
});

const memberSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['Admin', 'Member']).default('Member')
});

const taskCreateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  status: z.enum(['Todo', 'InProgress', 'Done']).default('Todo'),
  priority: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  dueDate: z.string().datetime().optional().or(z.literal('')),
  assigneeId: z.string().optional().or(z.literal(''))
});

const taskUpdateSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(['Todo', 'InProgress', 'Done']).optional(),
  priority: z.enum(['Low', 'Medium', 'High']).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeId: z.string().optional().nullable()
});

const tokenForUser = (user: SessionUser) => jwt.sign(user, jwtSecret, { expiresIn: '7d' });

const parseBearerToken = (request: Request) => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length);
};

const requireAuth = (request: Request, response: Response, next: NextFunction) => {
  const token = parseBearerToken(request);

  if (!token) {
    response.status(401).json({ error: 'Login required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as SessionUser;
    (request as AuthedRequest).user = decoded;
    next();
  } catch {
    response.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
};

const asyncHandler =
  (handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };

const formatUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role
});

const formatTask = (task: Prisma.TaskGetPayload<{ include: { assignee: true; creator: true } }>) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate?.toISOString() ?? null,
  projectId: task.projectId,
  creatorId: task.creatorId,
  assigneeId: task.assigneeId,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
  completedAt: task.completedAt?.toISOString() ?? null,
  assignee: task.assignee ? formatUser(task.assignee) : null,
  creator: formatUser(task.creator)
});

const formatProject = (
  project: Prisma.ProjectGetPayload<{
    include: { owner: true; members: { include: { user: true } }; tasks: { include: { assignee: true; creator: true } } }
  }>
) => {
  const tasks = project.tasks.map((task) => formatTask(task));
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    ownerId: project.ownerId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    owner: formatUser(project.owner),
    members: project.members.map((member) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      user: formatUser(member.user)
    })),
    tasks,
    counts: {
      tasks: tasks.length,
      todo: tasks.filter((task) => task.status === 'Todo').length,
      inProgress: tasks.filter((task) => task.status === 'InProgress').length,
      done: tasks.filter((task) => task.status === 'Done').length
    }
  };
};

const getAccessibleProjectsWhere = (user: SessionUser): Prisma.ProjectWhereInput => {
  if (user.role === 'Admin') {
    return {};
  }

  return {
    OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }]
  };
};

const getProjectForUser = async (projectId: string, user: SessionUser) => {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...(user.role === 'Admin' ? {} : { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] })
    },
    include: {
      owner: true,
      members: { include: { user: true } },
      tasks: { include: { assignee: true, creator: true }, orderBy: [{ createdAt: 'desc' }] }
    }
  });

  return project ? formatProject(project) : null;
};

const ensureProjectManager = (project: { ownerId: string }, user: SessionUser) => {
  if (user.role === 'Admin' || project.ownerId === user.id) {
    return true;
  }

  return false;
};

const canEditTask = (task: { creatorId: string; assigneeId: string | null; project: { ownerId: string } }, user: SessionUser) => {
  return user.role === 'Admin' || task.creatorId === user.id || task.assigneeId === user.id || task.project.ownerId === user.id;
};

const formatDashboard = async (user: SessionUser) => {
  const projects = await prisma.project.findMany({
    where: getAccessibleProjectsWhere(user),
    include: {
      tasks: { include: { assignee: true, creator: true } },
      members: { include: { user: true } },
      owner: true
    },
    orderBy: { updatedAt: 'desc' }
  });

  const projectCount = projects.length;
  const tasks = projects.flatMap((project) => project.tasks.map((task) => ({ ...task, project })));
  const now = new Date();
  const overdue = tasks.filter((task) => task.status !== 'Done' && task.dueDate && task.dueDate < now);
  const dueSoon = tasks.filter((task) => {
    if (task.status === 'Done' || !task.dueDate) {
      return false;
    }

    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 3);
    return task.dueDate <= deadline && task.dueDate >= now;
  });

  const statusCounts = {
    Todo: tasks.filter((task) => task.status === 'Todo').length,
    InProgress: tasks.filter((task) => task.status === 'InProgress').length,
    Done: tasks.filter((task) => task.status === 'Done').length
  };

  const recentTasks = tasks
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 8)
    .map((task) => formatTask(task as Prisma.TaskGetPayload<{ include: { assignee: true; creator: true } }>));

  const completionRate = tasks.length ? Math.round((statusCounts.Done / tasks.length) * 100) : 0;

  return {
    projects: projectCount,
    tasks: tasks.length,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    completionRate,
    statusCounts,
    recentTasks,
    projectsSummary: projects.map((project) => formatProject(project as Prisma.ProjectGetPayload<{ include: { owner: true; members: { include: { user: true } }; tasks: { include: { assignee: true, creator: true } } } }>))
  };
};

const corsOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://ethara-assignment-frontend.vercel.app',
  ...(process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [])
];

const corsOriginPatterns = [
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)?bylakshayjain\.online$/i
];

app.use(cors({
  origin: (origin, callback) => {
    const allowedByPattern = Boolean(origin && corsOriginPatterns.some((pattern) => pattern.test(origin)));
    if (!origin || corsOrigins.includes(origin) || allowedByPattern) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/version', (_request, response) => {
  response.json({ version: '2', server: 'server.ts', auth: ['signup', 'register', 'login'] });
});

const signupHandler = asyncHandler(async (request: Request, response: Response) => {
  const parsed = authSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid signup details' });
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (existingUser) {
    response.status(409).json({ error: 'That email is already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role
    }
  });

  const sessionUser: SessionUser = formatUser(user);
  response.status(201).json({ token: tokenForUser(sessionUser), user: sessionUser });
});

app.post('/api/auth/signup', signupHandler);
app.post('/api/auth/register', signupHandler);

app.post(
  '/api/auth/login',
  asyncHandler(async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid login details' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    if (!user) {
      response.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);

    if (!passwordMatches) {
      response.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const sessionUser: SessionUser = formatUser(user);
    response.json({ token: tokenForUser(sessionUser), user: sessionUser });
  })
);

app.get(
  '/api/auth/me',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    response.json({ user });
  })
);

app.get(
  '/api/projects',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    const projects = await prisma.project.findMany({
      where: getAccessibleProjectsWhere(user),
      include: {
        owner: true,
        members: { include: { user: true } },
        tasks: { include: { assignee: true, creator: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });

    response.json({ projects: projects.map((project) => formatProject(project)) });
  })
);

app.post(
  '/api/projects',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;

    if (user.role !== 'Admin') {
      response.status(403).json({ error: 'Only admins can create projects' });
      return;
    }

    const parsed = projectSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid project details' });
      return;
    }

    const project = await prisma.project.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        color: parsed.data.color,
        ownerId: user.id,
        members: {
          create: [{ userId: user.id, role: user.role }]
        }
      },
      include: {
        owner: true,
        members: { include: { user: true } },
        tasks: { include: { assignee: true, creator: true } }
      }
    });

    response.status(201).json({ project: formatProject(project) });
  })
);

app.get(
  '/api/projects/:projectId',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    const projectId = routeStringParam(request.params.projectId);
    if (!projectId) {
      response.status(400).json({ error: 'Invalid project id' });
      return;
    }
    const project = await getProjectForUser(projectId, user);

    if (!project) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }

    response.json({ project });
  })
);

app.patch(
  '/api/projects/:projectId',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    const projectId = routeStringParam(request.params.projectId);
    if (!projectId) {
      response.status(400).json({ error: 'Invalid project id' });
      return;
    }
    const existingProject = await prisma.project.findUnique({ where: { id: projectId } });

    if (!existingProject) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }

    if (!ensureProjectManager(existingProject, user)) {
      response.status(403).json({ error: 'You do not have access to update this project' });
      return;
    }

    const parsed = projectSchema.partial().safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid project details' });
      return;
    }

    const project = await prisma.project.update({
      where: { id: existingProject.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
        ...(parsed.data.color ? { color: parsed.data.color } : {})
      },
      include: {
        owner: true,
        members: { include: { user: true } },
        tasks: { include: { assignee: true, creator: true } }
      }
    });

    response.json({ project: formatProject(project) });
  })
);

app.post(
  '/api/projects/:projectId/members',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    const projectId = routeStringParam(request.params.projectId);
    if (!projectId) {
      response.status(400).json({ error: 'Invalid project id' });
      return;
    }
    const existingProject = await prisma.project.findUnique({ where: { id: projectId } });

    if (!existingProject) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }

    if (!ensureProjectManager(existingProject, user)) {
      response.status(403).json({ error: 'Only the project owner or admins can invite members' });
      return;
    }

    const parsed = memberSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid member details' });
      return;
    }

    const member = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    if (!member) {
      response.status(404).json({ error: 'No user exists with that email' });
      return;
    }

    const projectMember = await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: existingProject.id,
          userId: member.id
        }
      },
      update: { role: parsed.data.role },
      create: {
        projectId: existingProject.id,
        userId: member.id,
        role: parsed.data.role
      },
      include: { user: true, project: true }
    });

    response.status(201).json({
      member: {
        id: projectMember.id,
        role: projectMember.role,
        joinedAt: projectMember.joinedAt.toISOString(),
        user: formatUser(projectMember.user)
      }
    });
  })
);

app.get(
  '/api/projects/:projectId/tasks',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    const projectId = routeStringParam(request.params.projectId);
    if (!projectId) {
      response.status(400).json({ error: 'Invalid project id' });
      return;
    }
    const project = await getProjectForUser(projectId, user);

    if (!project) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }

    response.json({ tasks: project.tasks });
  })
);

app.post(
  '/api/projects/:projectId/tasks',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    const projectId = routeStringParam(request.params.projectId);
    if (!projectId) {
      response.status(400).json({ error: 'Invalid project id' });
      return;
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true }
    });

    if (!project) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }

    const canCreate = user.role === 'Admin' || project.ownerId === user.id || project.members.some((member) => member.userId === user.id);

    if (!canCreate) {
      response.status(403).json({ error: 'You are not part of this project' });
      return;
    }

    const parsed = taskCreateSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid task details' });
      return;
    }

    const assigneeId = parsed.data.assigneeId || null;

    if (assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
      const isMember = project.members.some((member) => member.userId === assigneeId);

      if (!assignee) {
        response.status(404).json({ error: 'Assignee not found' });
        return;
      }

      if (user.role !== 'Admin' && !isMember && project.ownerId !== assigneeId) {
        response.status(403).json({ error: 'You can only assign tasks to project members' });
        return;
      }
    }

    const task = await prisma.task.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        status: parsed.data.status,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        projectId: project.id,
        creatorId: user.id,
        assigneeId
      },
      include: { assignee: true, creator: true }
    });

    response.status(201).json({ task: formatTask(task) });
  })
);

app.patch(
  '/api/tasks/:taskId',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    const taskId = routeStringParam(request.params.taskId);
    if (!taskId) {
      response.status(400).json({ error: 'Invalid task id' });
      return;
    }
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: true } }, assignee: true, creator: true }
    });

    if (!task) {
      response.status(404).json({ error: 'Task not found' });
      return;
    }

    if (!canEditTask(task, user)) {
      response.status(403).json({ error: 'You do not have access to edit this task' });
      return;
    }

    const parsed = taskUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid task details' });
      return;
    }

    const isAdmin = user.role === 'Admin' || task.project.ownerId === user.id;
    const payload: Prisma.TaskUpdateInput = {};

    if (parsed.data.title !== undefined) {
      payload.title = parsed.data.title;
    }

    if (parsed.data.description !== undefined) {
      payload.description = parsed.data.description || null;
    }

    if (parsed.data.status !== undefined) {
      payload.status = parsed.data.status;
      payload.completedAt = parsed.data.status === 'Done' ? new Date() : null;
    }

    if (parsed.data.dueDate !== undefined) {
      payload.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    }

    if (parsed.data.priority !== undefined) {
      if (!isAdmin) {
        response.status(403).json({ error: 'Only admins can change task priority' });
        return;
      }

      payload.priority = parsed.data.priority;
    }

    if (parsed.data.assigneeId !== undefined) {
      if (!isAdmin) {
        response.status(403).json({ error: 'Only admins can reassign tasks' });
        return;
      }

      if (parsed.data.assigneeId) {
        const assignee = await prisma.user.findUnique({ where: { id: parsed.data.assigneeId } });

        if (!assignee) {
          response.status(404).json({ error: 'Assignee not found' });
          return;
        }

        const assigneeInProject =
          task.project.ownerId === assignee.id || task.project.members.some((member) => member.userId === assignee.id);

        if (!assigneeInProject) {
          response.status(403).json({ error: 'Assignee must be a member of this project' });
          return;
        }
      }

      payload.assignee = parsed.data.assigneeId
        ? { connect: { id: parsed.data.assigneeId } }
        : { disconnect: true };
    }

    if (Object.keys(payload).length === 0) {
      response.json({ task: formatTask(task) });
      return;
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: payload,
      include: { assignee: true, creator: true }
    });

    response.json({ task: formatTask(updatedTask) });
  })
);

app.delete(
  '/api/tasks/:taskId',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    const taskId = routeStringParam(request.params.taskId);
    if (!taskId) {
      response.status(400).json({ error: 'Invalid task id' });
      return;
    }
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    });

    if (!task) {
      response.status(404).json({ error: 'Task not found' });
      return;
    }

    if (!canEditTask({ creatorId: task.creatorId, assigneeId: task.assigneeId, project: task.project }, user)) {
      response.status(403).json({ error: 'You do not have access to delete this task' });
      return;
    }

    await prisma.task.delete({ where: { id: task.id } });
    response.status(204).send();
  })
);

app.get(
  '/api/dashboard/summary',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    response.json({ dashboard: await formatDashboard(user) });
  })
);

app.post(
  '/api/demo/seed',
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = (request as AuthedRequest).user;
    const demoMemberEmail = 'member@demo.local';
    const demoMemberPassword = 'Demo123!';

    let demoMember = await prisma.user.findUnique({ where: { email: demoMemberEmail } });

    if (!demoMember) {
      demoMember = await prisma.user.create({
        data: {
          name: 'Demo Member',
          email: demoMemberEmail,
          passwordHash: await bcrypt.hash(demoMemberPassword, 12),
          role: Role.Member
        }
      });
    }

    const existingProject = await prisma.project.findFirst({
      where: {
        ownerId: user.id,
        name: 'Launch Sprint'
      },
      include: {
        owner: true,
        members: { include: { user: true } },
        tasks: { include: { assignee: true, creator: true } }
      }
    });

    const project =
      existingProject ??
      (await prisma.project.create({
        data: {
          name: 'Launch Sprint',
          description: 'A starter workspace showing the task flow, team management, and dashboard metrics.',
          color: 'sage',
          ownerId: user.id,
          members: {
            create: [
              { userId: user.id, role: user.role },
              { userId: demoMember.id, role: Role.Member }
            ]
          }
        },
        include: {
          owner: true,
          members: { include: { user: true } },
          tasks: { include: { assignee: true, creator: true } }
        }
      }));

    await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: demoMember.id
        }
      },
      update: { role: Role.Member },
      create: {
        projectId: project.id,
        userId: demoMember.id,
        role: Role.Member
      }
    });

    const taskTitles = ['Wire project overview', 'Assign launch tasks', 'Close overdue cleanup'];

    for (const [index, title] of taskTitles.entries()) {
      const existingTask = await prisma.task.findFirst({
        where: { projectId: project.id, title }
      });

      if (!existingTask) {
        await prisma.task.create({
          data: {
            title,
            description:
              index === 0
                ? 'A high-level snapshot of the project and its members.'
                : index === 1
                  ? 'Assign follow-up work to the demo member.'
                  : 'Resolve a stale item to demonstrate overdue handling.',
            status: index === 0 ? TaskStatus.InProgress : index === 1 ? TaskStatus.Todo : TaskStatus.Todo,
            priority: index === 2 ? TaskPriority.High : TaskPriority.Medium,
            dueDate: index === 2 ? new Date(Date.now() - 1000 * 60 * 60 * 24 * 2) : new Date(Date.now() + 1000 * 60 * 60 * 24 * (index + 2)),
            projectId: project.id,
            creatorId: user.id,
            assigneeId: index === 1 ? demoMember.id : user.id,
            completedAt: index === 0 ? null : null
          }
        });
      }
    }

    const hydratedProject = await getProjectForUser(project.id, user);

    response.status(201).json({
      project: hydratedProject,
      demoMember: {
        email: demoMemberEmail,
        password: demoMemberPassword
      }
    });
  })
);

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    response.status(400).json({ error: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ error: 'Something went wrong on the server' });
});

const start = async () => {
  if (!fs.existsSync(publicDir)) {
    console.warn(`Static build folder not found at ${publicDir}. Build the frontend before starting production.`);
  } else {
    app.use(express.static(publicDir, { index: false }));

    app.get(/^\/(?!api).*/, (_request, response) => {
      const indexPath = path.join(publicDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        response.sendFile(indexPath);
        return;
      }

      response.status(200).send('Frontend build not found. Run the frontend build first.');
    });
  }

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Route not found' });
  });

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });

  app.listen(port, () => {
    console.log(`Team Task Manager API running on port ${port}`);
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
