import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { api, type TaskStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

function statusBadgeVariant(s: TaskStatus): "outline" | "success" | "muted" | "warning" {
  if (s === "DONE") return "success";
  if (s === "IN_PROGRESS") return "warning";
  return "outline";
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading overview…
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-destructive">Could not load dashboard.</p>;
  }

  const { summary, myTasks, projects } = data;

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Work across {projects.length} project{projects.length === 1 ? "" : "s"}.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open work</CardDescription>
            <CardTitle className="font-serif text-2xl tabular-nums">
              {summary.todo + summary.inProgress}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            To do {summary.todo} · In progress {summary.inProgress}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="font-serif text-2xl tabular-nums">{summary.done}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            of {summary.totalTasks} total tasks
          </CardContent>
        </Card>
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription>Attention</CardDescription>
            <CardTitle className="font-serif text-2xl tabular-nums text-warning">
              {summary.overdue}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Overdue · {summary.dueSoon} due within 3 days
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-semibold">Assigned to you</h2>
            <Link
              to="/projects"
              className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              Projects <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="border border-border bg-card">
            {myTasks.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No open assignments.</p>
            ) : (
              <ul className="divide-y divide-border">
                {myTasks.map((t) => {
                  const overdue =
                    t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "DONE";
                  return (
                    <li key={t.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <Link
                          to={`/projects/${t.project.id}`}
                          className="font-medium hover:underline"
                        >
                          {t.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{t.project.name}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {overdue ? (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            {format(new Date(t.dueDate!), "MMM d")}
                          </span>
                        ) : t.dueDate ? (
                          <span className="text-xs text-muted-foreground">
                            Due {format(new Date(t.dueDate), "MMM d")}
                          </span>
                        ) : null}
                        <Badge variant={statusBadgeVariant(t.status)}>{statusLabel(t.status)}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-serif text-xl font-semibold">Projects</h2>
          <div className="border border-border bg-card">
            {projects.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Join or create a project from the Projects tab.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      className="flex items-center justify-between p-4 transition-colors hover:bg-secondary/30"
                    >
                      <span className="font-medium">{p.name}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
