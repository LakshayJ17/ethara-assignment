import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, FolderKanban, LogOut, User } from "lucide-react";
import { useAuth } from "@/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2 border-l-2 px-3 py-2 text-sm transition-colors",
    isActive
      ? "border-primary bg-secondary/40 text-foreground"
      : "border-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
  );

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-4">
          <p className="font-serif text-lg font-semibold tracking-tight">Ledger</p>
          <p className="text-xs text-muted-foreground">Team task manager</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          <NavLink to="/" end className={navClass}>
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </NavLink>
          <NavLink to="/projects" className={navClass}>
            <FolderKanban className="h-4 w-4" />
            Projects
          </NavLink>
        </nav>
        <div className="border-t border-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 px-2 font-normal">
                <User className="h-4 w-4" />
                <span className="truncate text-left text-sm">{user?.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{user?.email}</div>
              <DropdownMenuItem onClick={logout} className="gap-2">
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-6 md:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
