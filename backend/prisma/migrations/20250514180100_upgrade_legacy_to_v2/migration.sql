-- Upgrade legacy schema (MemberRole, Task.createdById, int priority, etc.) to current Prisma schema.

-- App-level + task priority enums
CREATE TYPE "Role" AS ENUM ('Admin', 'Member');
CREATE TYPE "TaskPriority" AS ENUM ('Low', 'Medium', 'High');

-- Task.status: TODO/IN_PROGRESS/DONE -> Todo/InProgress/Done (reuse type name "TaskStatus")
BEGIN;
CREATE TYPE "TaskStatus_new" AS ENUM ('Todo', 'InProgress', 'Done');
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus_new" USING (
  CASE "status"::text
    WHEN 'TODO' THEN 'Todo'::"TaskStatus_new"
    WHEN 'IN_PROGRESS' THEN 'InProgress'::"TaskStatus_new"
    WHEN 'DONE' THEN 'Done'::"TaskStatus_new"
    ELSE 'Todo'::"TaskStatus_new"
  END
);
ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
DROP TYPE "TaskStatus_old";
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'Todo'::"TaskStatus";
COMMIT;

-- User: global role + Prisma @updatedAt column
ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'Member';
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "User" SET "updatedAt" = "createdAt";

-- Project: theme color + updatedAt
ALTER TABLE "Project" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'sand';
ALTER TABLE "Project" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Project" SET "updatedAt" = "createdAt";

-- ProjectMember: MemberRole -> Role (Admin/Member)
ALTER TABLE "ProjectMember" ADD COLUMN "roleV2" "Role";
UPDATE "ProjectMember" SET "roleV2" = CASE WHEN "role"::text = 'ADMIN' THEN 'Admin'::"Role" ELSE 'Member'::"Role" END;
ALTER TABLE "ProjectMember" DROP COLUMN "role";
DROP TYPE "MemberRole";
ALTER TABLE "ProjectMember" RENAME COLUMN "roleV2" TO "role";
ALTER TABLE "ProjectMember" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "ProjectMember" ALTER COLUMN "role" SET DEFAULT 'Member'::"Role";

-- Task: createdById -> creatorId (same data)
ALTER TABLE "Task" ADD COLUMN "creatorId" TEXT;
UPDATE "Task" SET "creatorId" = "createdById";
ALTER TABLE "Task" ALTER COLUMN "creatorId" SET NOT NULL;
ALTER TABLE "Task" DROP CONSTRAINT "Task_createdById_fkey";
ALTER TABLE "Task" DROP COLUMN "createdById";
ALTER TABLE "Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Task: int priority -> TaskPriority enum
ALTER TABLE "Task" ADD COLUMN "priorityV2" "TaskPriority" NOT NULL DEFAULT 'Medium';
UPDATE "Task" SET "priorityV2" = CASE
  WHEN "priority" <= 0 THEN 'Low'::"TaskPriority"
  WHEN "priority" = 1 THEN 'Medium'::"TaskPriority"
  ELSE 'High'::"TaskPriority"
END;
ALTER TABLE "Task" DROP COLUMN "priority";
ALTER TABLE "Task" RENAME COLUMN "priorityV2" TO "priority";
ALTER TABLE "Task" ALTER COLUMN "priority" SET DEFAULT 'Medium'::"TaskPriority";

-- Task: optional completion timestamp
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);
