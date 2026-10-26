import { Briefcase, Home, Menu, Moon, Plus, Sun, Users } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mark, StatusDot } from "@/components/avatar";
import { CommandPalette } from "@/components/command-palette";
import {
  Button,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Kbd,
  TooltipProvider,
} from "@/components/ui";
import { listSessions } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { Health, SessionBrief, ToolInfo } from "@/lib/types";
import { cn, statusLabel } from "@/lib/utils";

export type OutletContext = {
  sessions: SessionBrief[];
  refreshSessions: () => void;
  health: Health | null;
  tools: ToolInfo[];
};

export function Shell({
  health,
  tools,
  apiError,
}: {
  health: Health | null;
  tools: ToolInfo[];
  apiError: string | null;
}) {
  const [sessions, setSessions] = useState<SessionBrief[]>([]);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { choice, setChoice } = useTheme();

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load sessions");
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
    const timer = window.setInterval(() => void refreshSessions(), 4000);
    return () => window.clearInterval(timer);
  }, [refreshSessions]);

  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      }
      if (!isTyping(event.target) && event.key === "?") {
        event.preventDefault();
        setShortcuts(true);
      }
      if (!isTyping(event.target) && event.key === "c" && !meta) {
        event.preventDefault();
        navigate("/");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const context: OutletContext = { sessions, refreshSessions, health, tools };

  return (
    <TooltipProvider>
      <div className="flex h-full bg-background text-foreground">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r bg-sidebar md:flex">
          <SidebarBody
            sessions={sessions}
            health={health}
            onNew={() => navigate("/")}
          />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-4">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation">
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
              <Mark />
              <span className="hidden text-foreground sm:inline">Muster</span>
              <span className="text-border">/</span>
              <span className="truncate text-foreground">{crumb(location.pathname, sessions)}</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                className="hidden items-center gap-2 rounded-md border px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent sm:flex"
                onClick={() => setPalette(true)}
              >
                Search
                <Kbd>⌘K</Kbd>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Theme">
                    {choice === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setChoice("light")}>Light</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setChoice("dark")}>Dark</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setChoice("system")}>System</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          {apiError ? (
            <div role="alert" className="border-b bg-destructive/10 px-4 py-2 text-[13px] text-destructive">
              {apiError}
            </div>
          ) : null}
          <main className="min-h-0 flex-1">
            <Outlet context={context} />
          </main>
        </div>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} onShortcuts={() => setShortcuts(true)} />
      <Dialog open={shortcuts} onOpenChange={setShortcuts}>
        <DialogContent title="Keyboard" description="These work anywhere you are not typing in a field.">
          <ul className="space-y-2 text-[13px]">
            <Shortcut keys="⌘K" label="Command menu" />
            <Shortcut keys="⌘ Enter" label="Submit the prompt, the answers, or run the team" />
            <Shortcut keys="C" label="New team" />
            <Shortcut keys="?" label="This list" />
            <Shortcut keys="A" label="Approve the pending action, while a run is waiting" />
          </ul>
        </DialogContent>
      </Dialog>
      <Dialog open={mobileNav} onOpenChange={setMobileNav}>
        <DialogContent title="Navigate" align="right">
          <div className="min-h-0 flex-1 overflow-auto">
            <SidebarBody sessions={sessions} health={health} onNew={() => navigate("/")} />
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

function SidebarBody({
  sessions,
  health,
  onNew,
}: {
  sessions: SessionBrief[];
  health: Health | null;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <Mark />
        <span className="text-sm font-medium tracking-tight">Muster</span>
      </div>
      <div className="px-3">
        <Button variant="secondary" className="w-full justify-start" onClick={onNew}>
          <Plus className="h-3.5 w-3.5" />
          New team
        </Button>
      </div>
      <nav className="mt-3 space-y-0.5 px-3" aria-label="Primary">
        <SideLink to="/" end icon={<Home className="h-3.5 w-3.5" />} label="Home" />
        <SideLink to="/jobs" icon={<Briefcase className="h-3.5 w-3.5" />} label="Jobs" />
        <SideLink to="/templates" icon={<Users className="h-3.5 w-3.5" />} label="Templates" />
      </nav>
      <div className="mt-5 px-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Recent</div>
      <div className="mt-1 min-h-0 flex-1 overflow-auto px-2 scrollbar-thin">
        {sessions.length === 0 ? (
          <p className="px-2 py-2 text-[12px] leading-relaxed text-muted-foreground">Teams you hire show up here.</p>
        ) : (
          sessions.map((session) => (
            <NavLink
              key={session.id}
              to={`/s/${session.id}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
                  isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                )
              }
            >
              <StatusDot status={session.status} />
              <span className="min-w-0 flex-1 truncate">{session.title}</span>
            </NavLink>
          ))
        )}
      </div>
      <div className="border-t px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {health?.provider === "mock" ? "Mock provider" : "Meta Model API"}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {health
            ? `${prettyModel(health.models.spark)} plans · ${prettyModel(health.models.code)} builds · ${prettyModel(health.models.image)} draws`
            : "Connecting…"}
        </p>
      </div>
    </div>
  );
}

function SideLink({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
          isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <Kbd>{keys}</Kbd>
    </li>
  );
}

function crumb(pathname: string, sessions: SessionBrief[]) {
  if (pathname === "/") return "New team";
  if (pathname.startsWith("/jobs")) return "Jobs";
  if (pathname.startsWith("/templates")) return "Templates";
  const id = pathname.split("/")[2];
  return sessions.find((session) => session.id === id)?.title ?? statusLabel("review");
}

function prettyModel(name: string) {
  return name.replace("muse-", "Muse ").replace(/\b\w/g, (letter) => letter.toUpperCase()).replace("Muse ", "Muse ");
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
