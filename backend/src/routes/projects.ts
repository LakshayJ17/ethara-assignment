import { Router } from "express";
import { MemberRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import {
  loadProjectMembership,
  requireProjectAdmin,
  type ProjectContextRequest,
} from "../middleware/rbac";

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(MemberRole).optional().default(MemberRole.MEMBER),
});

const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(MemberRole),
});

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          _count: { select: { tasks: true, members: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });
  res.json({
    projects: memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      description: m.project.description,
      role: m.role,
      createdAt: m.project.createdAt,
      taskCount: m.project._count.tasks,
      memberCount: m.project._count.members,
    })),
  });
});

projectsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const userId = req.userId!;
  const { name, description } = parsed.data;
  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        name,
        description: description ?? null,
        ownerId: userId,
        members: {
          create: { userId, role: MemberRole.ADMIN },
        },
      },
    });
    return p;
  });
  res.status(201).json({ project });
});

const projectParams = loadProjectMembership("id");

projectsRouter.get("/:id", projectParams, async (req: ProjectContextRequest, res) => {
  const projectId = req.projectId!;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: "asc" },
      },
      tasks: {
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      },
    },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json({ project });
});

projectsRouter.patch(
  "/:id",
  projectParams,
  requireProjectAdmin,
  async (req: ProjectContextRequest, res) => {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const projectId = req.projectId!;
    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const project = await prisma.project.update({
      where: { id: projectId },
      data,
    });
    res.json({ project });
  }
);

projectsRouter.delete(
  "/:id",
  projectParams,
  requireProjectAdmin,
  async (req: ProjectContextRequest, res) => {
    await prisma.project.delete({ where: { id: req.projectId! } });
    res.status(204).send();
  }
);

projectsRouter.get("/:id/members", projectParams, async (req: ProjectContextRequest, res) => {
  const members = await prisma.projectMember.findMany({
    where: { projectId: req.projectId! },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });
  res.json({ members });
});

projectsRouter.post(
  "/:id/members",
  projectParams,
  requireProjectAdmin,
  async (req: ProjectContextRequest, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { email, role } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: "No user with that email" });
      return;
    }
    try {
      const member = await prisma.projectMember.create({
        data: {
          projectId: req.projectId!,
          userId: user.id,
          role,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      res.status(201).json({ member });
    } catch {
      res.status(409).json({ error: "User is already a member" });
    }
  }
);

projectsRouter.patch(
  "/:id/members/:userId",
  projectParams,
  requireProjectAdmin,
  async (req: ProjectContextRequest, res) => {
    const targetUserId = req.params.userId;
    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { role } = parsed.data;
    const projectId = req.projectId!;
    const admins = await prisma.projectMember.count({
      where: { projectId, role: MemberRole.ADMIN },
    });
    const current = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (!current) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (current.role === MemberRole.ADMIN && role === MemberRole.MEMBER && admins <= 1) {
      res.status(400).json({ error: "Project must keep at least one admin" });
      return;
    }
    const member = await prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json({ member });
  }
);

projectsRouter.delete(
  "/:id/members/:userId",
  projectParams,
  requireProjectAdmin,
  async (req: ProjectContextRequest, res) => {
    const targetUserId = req.params.userId;
    const projectId = req.projectId!;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project?.ownerId === targetUserId) {
      res.status(400).json({ error: "Cannot remove the project owner" });
      return;
    }
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (member.role === MemberRole.ADMIN) {
      const admins = await prisma.projectMember.count({
        where: { projectId, role: MemberRole.ADMIN },
      });
      if (admins <= 1) {
        res.status(400).json({ error: "Cannot remove the last admin" });
        return;
      }
    }
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    res.status(204).send();
  }
);
