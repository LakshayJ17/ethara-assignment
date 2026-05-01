import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function ProjectsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const create = useMutation({
    mutationFn: () => api.createProject({ name, description: description || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      setName("");
      setDescription("");
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Spaces where your team coordinates tasks.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 px-4 pb-2">
              <div className="space-y-2">
                <Label htmlFor="pname">Name</Label>
                <Input
                  id="pname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Quarterly launch"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdesc">Description</Label>
                <Textarea
                  id="pdesc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional context for the team"
                />
              </div>
              {create.error ? (
                <p className="text-sm text-destructive">
                  {create.error instanceof Error ? create.error.message : "Failed"}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading projects…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data?.projects ?? []).map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`}>
              <Card className="h-full transition-colors hover:bg-secondary/20">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-serif text-lg">{p.name}</CardTitle>
                    <Badge variant={p.role === "ADMIN" ? "success" : "muted"}>
                      {p.role === "ADMIN" ? "Admin" : "Member"}
                    </Badge>
                  </div>
                  {p.description ? (
                    <CardDescription className="line-clamp-2">{p.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {p.memberCount} members · {p.taskCount} tasks
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!isLoading && data?.projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No projects yet. Create one to invite teammates.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
