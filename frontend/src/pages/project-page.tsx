import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/auth-context";
import {
  api,
  type MemberRole,
  type Task,
  type TaskStatus,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function statusLabel(s: TaskStatus) {
  switch (s) {
    case "TODO":
      return "To do";
    case "IN_PROGRESS":
      return "In progress";
    case "DONE":
      return "Done";
  }
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.project(id!),
    enabled: Boolean(id),
  });

  const myMembership = data?.project.members.find((m) => m.userId === user?.id);
  const isAdmin = myMembership?.role === "ADMIN";

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<MemberRole>("MEMBER");

  const invite = useMutation({
    mutationFn: () => api.inviteMember(id!, { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      setInviteOpen(false);
      setInviteEmail("");
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.removeMember(id!, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      api.updateMemberRole(id!, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", id] }),
  });

  const deleteProject = useMutation({
    mutationFn: () => api.deleteProject(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      navigate("/projects");
    },
  });

  const [taskModal, setTaskModal] = React.useState<
    { mode: "create" } | { mode: "edit"; task: Task } | null
  >(null);

  if (!id) return null;
  if (isLoading) return <p className="text-muted-foreground">Loading project…</p>;
  if (error || !data) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">Project not found or inaccessible.</p>
        <Button variant="outline" asChild>
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }

  const { project } = data;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" className="w-fit gap-2 px-0" asChild>
          <Link to="/projects">
            <ArrowLeft className="h-4 w-4" />
            Projects
          </Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{project.name}</h1>
            {project.description ? (
              <p className="max-w-2xl text-muted-foreground">{project.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Owner {project.owner.name} · You are {myMembership?.role === "ADMIN" ? "admin" : "member"}
            </p>
          </div>
          {isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <ProjectSettingsDialog project={project} />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Delete this project and all tasks? This cannot be undone.")) {
                    deleteProject.mutate();
                  }
                }}
                disabled={deleteProject.isPending}
              >
                Delete project
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="font-serif text-lg">Team</CardTitle>
              <CardDescription>{project.members.length} people</CardDescription>
            </div>
            {isAdmin ? (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <UserPlus className="h-4 w-4" />
                    Invite
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite by email</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 px-4 pb-2">
                    <div className="space-y-2">
                      <Label htmlFor="inv-email">Email</Label>
                      <Input
                        id="inv-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        value={inviteRole}
                        onValueChange={(v) => setInviteRole(v as MemberRole)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEMBER">Member</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {invite.error ? (
                      <p className="text-sm text-destructive">
                        {invite.error instanceof Error ? invite.error.message : "Failed"}
                      </p>
                    ) : null}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setInviteOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={!inviteEmail || invite.isPending}
                      onClick={() => invite.mutate()}
                    >
                      {invite.isPending ? "Sending…" : "Add member"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-0 divide-y divide-border px-0">
            {project.members.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{m.user.name}</p>
                  <p className="text-xs text-muted-foreground">{m.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && m.userId !== project.ownerId ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        updateRole.mutate({ userId: m.userId, role: v as MemberRole })
                      }
                    >
                      <SelectTrigger className="h-8 w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={m.role === "ADMIN" ? "success" : "muted"}>
                      {m.role === "ADMIN" ? "Admin" : "Member"}
                    </Badge>
                  )}
                  {isAdmin && m.userId !== project.ownerId ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remove ${m.user.name} from the project?`)) {
                          removeMember.mutate(m.userId);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-semibold">Tasks</h2>
            <Button size="sm" onClick={() => setTaskModal({ mode: "create" })}>
              <Plus className="h-4 w-4" />
              Add task
            </Button>
          </div>

          <div className="border border-border bg-card">
            {project.tasks.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No tasks yet. Capture the next step above.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {project.tasks.map((t) => {
                  const overdue =
                    t.dueDate &&
                    new Date(t.dueDate) < new Date() &&
                    t.status !== "DONE";
                  const canEdit =
                    isAdmin ||
                    t.assigneeId === user?.id ||
                    t.createdById === user?.id;
                  return (
                    <li key={t.id} className="p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <p className="font-medium">{t.title}</p>
                          {t.description ? (
                            <p className="text-sm text-muted-foreground">{t.description}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {t.assignee ? `Assigned · ${t.assignee.name}` : "Unassigned"} · Created
                            by {t.createdBy?.name}
                          </p>
                          {t.dueDate ? (
                            <p
                              className={cn(
                                "text-xs",
                                overdue ? "text-destructive" : "text-muted-foreground"
                              )}
                            >
                              Due {format(new Date(t.dueDate), "MMM d, yyyy HH:mm")}
                              {overdue ? " · overdue" : ""}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              t.status === "DONE"
                                ? "success"
                                : t.status === "IN_PROGRESS"
                                  ? "warning"
                                  : "outline"
                            }
                          >
                            {statusLabel(t.status)}
                          </Badge>
                          {canEdit ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  Update
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => setTaskModal({ mode: "edit", task: t })}
                                >
                                  Edit details
                                </DropdownMenuItem>
                                <TaskQuickStatus
                                  projectId={id}
                                  task={t}
                                  onDone={() => {
                                    qc.invalidateQueries({ queryKey: ["project", id] });
                                    qc.invalidateQueries({ queryKey: ["dashboard"] });
                                  }}
                                />
                                {(isAdmin || t.createdById === user?.id) && (
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => {
                                      if (confirm("Delete this task?")) {
                                        void api.deleteTask(id, t.id).then(() => {
                                          qc.invalidateQueries({ queryKey: ["project", id] });
                                          qc.invalidateQueries({ queryKey: ["dashboard"] });
                                        });
                                      }
                                    }}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <Dialog
        open={taskModal !== null}
        onOpenChange={(o) => {
          if (!o) setTaskModal(null);
        }}
      >
        {taskModal ? (
          <TaskFormDialog
            projectId={id}
            members={project.members}
            task={taskModal.mode === "edit" ? taskModal.task : null}
            isAdmin={isAdmin}
            currentUserId={user?.id}
            onDone={() => {
              setTaskModal(null);
              qc.invalidateQueries({ queryKey: ["project", id] });
              qc.invalidateQueries({ queryKey: ["dashboard"] });
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function TaskQuickStatus({
  projectId,
  task,
  onDone,
}: {
  projectId: string;
  task: Task;
  onDone: () => void;
}) {
  const cycle: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
  const next = cycle[(cycle.indexOf(task.status) + 1) % cycle.length];
  const label =
    next === "TODO"
      ? "To do"
      : next === "IN_PROGRESS"
        ? "In progress"
        : "Done";
  return (
    <DropdownMenuItem
      onClick={() => {
        void api.updateTask(projectId, task.id, { status: next }).then(onDone);
      }}
    >
      Advance to {label}
    </DropdownMenuItem>
  );
}

function TaskFormDialog({
  projectId,
  members,
  task,
  isAdmin,
  currentUserId,
  onDone,
}: {
  projectId: string;
  members: { userId: string; user: { id: string; name: string } }[];
  task: Task | null;
  isAdmin: boolean;
  currentUserId?: string;
  onDone: () => void;
}) {
  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [status, setStatus] = React.useState<TaskStatus>(task?.status ?? "TODO");
  const [assigneeId, setAssigneeId] = React.useState<string | "">(
    task?.assigneeId ?? ""
  );
  const [due, setDue] = React.useState(toLocalInput(task?.dueDate ?? null));
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "TODO");
    setAssigneeId(task?.assigneeId ?? "");
    setDue(toLocalInput(task?.dueDate ?? null));
  }, [task]);

  async function save() {
    setErr(null);
    const dueIso = due ? new Date(due).toISOString() : null;
    const assignee = assigneeId || null;
    try {
      if (task) {
        await api.updateTask(projectId, task.id, {
          title,
          description: description || null,
          status,
          assigneeId: assignee,
          dueDate: dueIso,
        });
      } else {
        await api.createTask(projectId, {
          title,
          description: description || null,
          status,
          assigneeId: assignee,
          dueDate: dueIso,
        });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 px-4 pb-2">
        <div className="space-y-2">
          <Label htmlFor="t-title">Title</Label>
          <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="t-desc">Description</Label>
          <Textarea
            id="t-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODO">To do</SelectItem>
                <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                <SelectItem value="DONE">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-due">Due</Label>
            <Input
              id="t-due"
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Assignee</Label>
          <Select
            value={assigneeId || "__none__"}
            onValueChange={(v) => setAssigneeId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {members.map((m) => (
                <SelectItem
                  key={m.userId}
                  value={m.userId}
                  disabled={!isAdmin && m.userId !== currentUserId}
                >
                  {m.user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isAdmin ? (
            <p className="text-xs text-muted-foreground">
              Members may assign only themselves unless an admin edits the task.
            </p>
          ) : null}
        </div>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
      </div>
      <DialogFooter>
        <Button type="button" onClick={save} disabled={!title.trim()}>
          {task ? "Save" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ProjectSettingsDialog({
  project,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
  };
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description ?? "");

  React.useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
  }, [project]);

  const save = useMutation({
    mutationFn: () =>
      api.updateProject(project.id, {
        name,
        description: description || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-4 pb-2">
          <div className="space-y-2">
            <Label htmlFor="set-name">Name</Label>
            <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-desc">Description</Label>
            <Textarea
              id="set-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {save.error ? (
            <p className="text-sm text-destructive">
              {save.error instanceof Error ? save.error.message : "Failed"}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
