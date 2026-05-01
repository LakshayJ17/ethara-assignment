import { Router } from "express";
import { TaskStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { loadProjectMembership, type ProjectContextRequest } from "../middleware/rbac";

const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.number().int().min(0).max(2).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeId: z.string().min(1).max(64).optional().nullable(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.number().int().min(0).max(2).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeId: z.string().min(1).max(64).optional().nullable(),
});

export const tasksRouter = Router({ mergeParams: true });
tasksRouter.use(requireAuth);

const projectParams = loadProjectMembership("projectId");

tasksRouter.get("/:projectId/tasks", projectParams, async (req: ProjectContextRequest, res) => {
  const tasks = await prisma.task.findMany({
    where: { projectId: req.projectId! },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  res.json({ tasks });
});

tasksRouter.post("/:projectId/tasks", projectParams, async (req: ProjectContextRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const userId = req.userId!;
  const projectId = req.projectId!;
  const body = parsed.data;

  if (body.assigneeId) {
    const assigneeMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: body.assigneeId } },
    });
    if (!assigneeMember) {
      res.status(400).json({ error: "Assignee must be a project member" });
      return;
    }
    if (req.memberRole === "MEMBER" && body.assigneeId !== userId) {
      res.status(403).json({ error: "Members can only assign tasks to themselves" });
      return;
    }
  }

  let dueDate: Date | null = null;
  if (body.dueDate) dueDate = new Date(body.dueDate);

  const task = await prisma.task.create({
    data: {
      projectId,
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? TaskStatus.TODO,
      priority: body.priority ?? 0,
      dueDate,
      assigneeId: body.assigneeId ?? null,
      createdById: userId,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  res.status(201).json({ task });
});

tasksRouter.patch(
  "/:projectId/tasks/:taskId",
  projectParams,
  async (req: ProjectContextRequest, res) => {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const projectId = req.projectId!;
    const taskId = req.params.taskId;
    const userId = req.userId!;
    const body = parsed.data;

    const existing = await prisma.task.findFirst({
      where: { id: taskId, projectId },
    });
    if (!existing) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (req.memberRole === "MEMBER") {
      const isAssignee = existing.assigneeId === userId;
      const isCreator = existing.createdById === userId;
      if (!isAssignee && !isCreator) {
        res.status(403).json({
          error: "Members can only edit tasks they created or are assigned to",
        });
        return;
      }
      if (body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId) {
        if (body.assigneeId && body.assigneeId !== userId) {
          res.status(403).json({ error: "Members cannot reassign tasks to others" });
          return;
        }
      }
    }

    if (body.assigneeId) {
      const assigneeMember = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: body.assigneeId } },
      });
      if (!assigneeMember) {
        res.status(400).json({ error: "Assignee must be a project member" });
        return;
      }
    }

    const data: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: number;
      dueDate?: Date | null;
      assigneeId?: string | null;
    } = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.dueDate !== undefined) {
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;

    const task = await prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    res.json({ task });
  }
);

tasksRouter.delete(
  "/:projectId/tasks/:taskId",
  projectParams,
  async (req: ProjectContextRequest, res) => {
    const projectId = req.projectId!;
    const taskId = req.params.taskId;
    const userId = req.userId!;
    const existing = await prisma.task.findFirst({
      where: { id: taskId, projectId },
    });
    if (!existing) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (req.memberRole !== "ADMIN" && existing.createdById !== userId) {
      res.status(403).json({ error: "Only admins or the task creator can delete" });
      return;
    }
    await prisma.task.delete({ where: { id: taskId } });
    res.status(204).send();
  }
);
