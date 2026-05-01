import type { MemberRole } from "@prisma/client";
import type { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthedRequest } from "./auth";

export type ProjectContextRequest = AuthedRequest & {
  projectId?: string;
  memberRole?: MemberRole;
};

export function loadProjectMembership(paramName: string) {
  return async (
    req: ProjectContextRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const projectId = req.params[paramName];
    if (!projectId) {
      res.status(400).json({ error: "Project id required" });
      return;
    }
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership) {
      res.status(403).json({ error: "Not a member of this project" });
      return;
    }
    req.projectId = projectId;
    req.memberRole = membership.role;
    next();
  };
}

export function requireProjectAdmin(
  req: ProjectContextRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.memberRole !== "ADMIN") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  next();
}
