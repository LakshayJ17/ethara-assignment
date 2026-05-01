import { Router } from "express";
import { TaskStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthedRequest } from "../middleware/auth";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const now = new Date();

  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true, project: { select: { id: true, name: true } } },
  });
  const projectIds = memberships.map((m) => m.projectId);
  if (projectIds.length === 0) {
    res.json({
      summary: {
        totalTasks: 0,
        todo: 0,
        inProgress: 0,
        done: 0,
        overdue: 0,
        dueSoon: 0,
      },
      myTasks: [],
      projects: [],
    });
    return;
  }

  const tasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds } },
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  const totalTasks = tasks.length;
  const todo = tasks.filter((t) => t.status === TaskStatus.TODO).length;
  const inProgress = tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS).length;
  const done = tasks.filter((t) => t.status === TaskStatus.DONE).length;
  const overdue = tasks.filter(
    (t) =>
      t.dueDate &&
      t.dueDate < now &&
      t.status !== TaskStatus.DONE
  ).length;

  const inThreeDays = new Date(now);
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  const dueSoon = tasks.filter(
    (t) =>
      t.dueDate &&
      t.dueDate >= now &&
      t.dueDate <= inThreeDays &&
      t.status !== TaskStatus.DONE
  ).length;

  const myTasks = tasks
    .filter((t) => t.assigneeId === userId && t.status !== TaskStatus.DONE)
    .slice(0, 20);

  res.json({
    summary: {
      totalTasks,
      todo,
      inProgress,
      done,
      overdue,
      dueSoon,
    },
    myTasks,
    projects: memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
    })),
  });
});
