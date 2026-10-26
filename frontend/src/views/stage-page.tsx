import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CommandBar } from "@/overlay/CommandBar";
import { LibraryPanel, ProfilePanel, QuestionsCard, SettingsPanel } from "@/overlay/panels";
import {
  createSession,
  getHealth,
  getSession,
  getTools,
  interpretScene,
  resolveApproval,
  runSession,
  saveScene,
  saveTeam,
  submitAnswers,
} from "@/lib/api";
import type { Health, SceneConfig, Session, TeamMemberSpec, ToolInfo } from "@/lib/types";
import { LOFT, PRESET_LABEL } from "@/world/defaults";
import { Stage } from "@/world/Stage";
import { graphicsPreference, prefersSimple, supportsWebGL } from "@/world/state";

function roomIntent(text: string): boolean {
  return /^(make it|make this|restyle|turn the|turn it)\b/i.test(text.trim());
}

export function StagePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [scene, setScene] = useState<SceneConfig>(LOFT);
  const [held, setHeld] = useState(false);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [mode, setMode] = useState<"hire" | "room">("hire");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [graphics, setGraphics] = useState(graphicsPreference);
  const [webgl] = useState(supportsWebGL);
  const statusRef = useRef<Session["status"] | undefined>(undefined);
  const saveTimer = useRef<number | null>(null);
  statusRef.current = session?.status;

  const reload = useCallback(async () => {
    if (!id) return;
    const next = await getSession(id);
    setSession(next);
  }, [id]);

  useEffect(() => {
    void getTools().then(setTools).catch(() => setTools([]));
    void getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    setHeld(false);
    setSelectedId(null);
    setReady(false);
    if (!id) {
      setSession(null);
      setScene(LOFT);
      return;
    }
    let cancel = false;
    const load = async () => {
      try {
        const next = await getSession(id);
        if (cancel) return;
        setSession(next);
      } catch (error) {
        if (!cancel) toast.error(error instanceof Error ? error.message : "Could not open this team");
      }
    };
    void load();
    const timer = window.setInterval(() => {
      const status = statusRef.current;
      if (status && ["running", "awaiting_approval", "awaiting_input", "designing"].includes(status)) {
        void load();
      }
    }, 900);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [id]);

  useEffect(() => {
    if (held) return;
    if (session?.scene) setScene(session.scene);
  }, [session?.scene, held]);

  function rememberGraphics(value: "auto" | "full" | "simple") {
    setGraphics(value);
    try {
      localStorage.setItem("muster-graphics", value);
    } catch {
      /* ignore */
    }
  }

  function updateScene(next: SceneConfig) {
    setScene(next);
    setHeld(true);
    if (!session) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const sessionId = session.id;
    saveTimer.current = window.setTimeout(() => {
      void saveScene(sessionId, next).catch((error: Error) => toast.error(error.message));
    }, 280);
  }

  async function onCommand() {
    const text = draft.trim();
    if (!text) return;
    const asRoom = mode === "room" || roomIntent(text);
    setBusy(true);
    try {
      if (asRoom) {
        const next = await interpretScene(text, scene);
        setScene(next);
        setHeld(true);
        setDraft("");
        if (session) await saveScene(session.id, next);
        toast.success(PRESET_LABEL[next.preset] + " · " + next.time_of_day);
      } else {
        const created = await createSession(text);
        setDraft("");
        navigate(`/s/${created.id}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not go through");
    } finally {
      setBusy(false);
    }
  }

  async function onRun() {
    if (!session) return;
    setBusy(true);
    try {
      await runSession(session.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start");
    } finally {
      try {
        await reload();
      } catch {
        /* reload surfaces its own error */
      }
      setBusy(false);
    }
  }

  async function onAnswers(answers: Record<string, string>) {
    if (!session) return;
    setBusy(true);
    try {
      const next = await submitAnswers(session.id, answers);
      setSession(next);
      if (next.scene && !held) setScene(next.scene);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not design the team");
    } finally {
      setBusy(false);
    }
  }

  async function decide(approvalId: string, decision: "approved" | "denied") {
    if (!session) return;
    try {
      const next = await resolveApproval(session.id, approvalId, decision);
      setSession(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resolve that");
    }
  }

  async function onTeam(members: TeamMemberSpec[]) {
    if (!session?.team) return;
    try {
      const next = await saveTeam(session.id, { ...session.team, members });
      setSession(next);
      toast.success("Roster updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "a" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const pending = session?.approvals.find((item) => item.status === "pending");
      if (!pending) return;
      event.preventDefault();
      void decide(pending.id, "approved");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const member = session?.team?.members.find((item) => item.id === selectedId) ?? null;
  const simple = prefersSimple(graphics, scene.quality);
  const canRun = session?.status === "review" && Boolean(session.team);
  const running = session?.status === "running" || session?.status === "awaiting_approval" || session?.status === "designing";
  const provider = health ? (health.provider === "mock" ? "Muse mock" : "Muse") : "…";

  return (
    <div className="relative h-full min-h-screen w-full overflow-hidden bg-[#14110e] text-[#f6efe4]">
      {webgl ? (
        <div className="absolute inset-0">
          <Stage
            scene={scene}
            session={session}
            selectedId={selectedId}
            simple={simple}
            onSelect={setSelectedId}
            onApprove={(approvalId) => void decide(approvalId, "approved")}
            ready={ready}
            onReady={() => setReady(true)}
          />
        </div>
      ) : (
        <FlatRoom scene={scene} session={session} onSelect={setSelectedId} />
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto">
          <button type="button" onClick={() => navigate("/")} className="text-left">
            <div className="text-[15px] font-medium tracking-tight">Muster</div>
            <div className="text-[11px] text-[#f6efe4]/70">
              {PRESET_LABEL[scene.preset]} · {scene.time_of_day} · {provider}
              {simple ? " · simple graphics" : ""}
            </div>
          </button>
          {session?.team ? (
            <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-[#f6efe4]/80">{session.team.structure.slice(0, 180)}</p>
          ) : (
            <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-[#f6efe4]/75">
              An empty room. Describe the work and a team will move in.
            </p>
          )}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button type="button" className="rounded-full bg-[#1a140f]/75 px-3 py-1.5 text-[12px] backdrop-blur" onClick={() => setLibraryOpen(true)}>
            Watches
          </button>
          <button type="button" className="rounded-full bg-[#1a140f]/75 px-3 py-1.5 text-[12px] backdrop-blur" onClick={() => setSettingsOpen(true)}>
            Room
          </button>
        </div>
      </header>

      {session?.status === "designing" ? (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-[#1a140f]/80 px-4 py-2 text-sm">
          Finding desks for the team
        </div>
      ) : null}
      {session?.status === "error" && session.error ? (
        <div className="absolute left-1/2 top-24 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl bg-[#3a1c16]/90 px-4 py-3 text-sm">
          {session.error}
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-3 pb-5">
        {session?.status === "clarifying" && session.questions.length ? (
          <QuestionsCard session={session} busy={busy} onSubmit={(answers) => void onAnswers(answers)} />
        ) : null}
        <CommandBar
          mode={mode}
          onMode={setMode}
          value={draft}
          onChange={setDraft}
          onSubmit={() => void onCommand()}
          busy={busy}
          canRun={canRun}
          running={Boolean(running)}
          onRun={() => void onRun()}
          placeholder={
            mode === "room"
              ? "Make it a rooftop at night"
              : session
                ? "A new brief starts another room"
                : "Hire a team for…"
          }
        />
      </div>

      <SettingsPanel
        open={settingsOpen}
        scene={scene}
        graphics={graphics}
        onGraphics={rememberGraphics}
        onClose={() => setSettingsOpen(false)}
        onChange={updateScene}
      />
      <LibraryPanel
        open={libraryOpen}
        session={session}
        onClose={() => setLibraryOpen(false)}
        onOpenSession={(nextId) => {
          setLibraryOpen(false);
          navigate(`/s/${nextId}`);
        }}
      />
      {session && member ? (
        <ProfilePanel
          session={session}
          member={member}
          tools={tools}
          onClose={() => setSelectedId(null)}
          onApprove={(approvalId) => void decide(approvalId, "approved")}
          onDeny={(approvalId) => void decide(approvalId, "denied")}
          onTeam={(members) => void onTeam(members)}
        />
      ) : null}
    </div>
  );
}

function FlatRoom({
  scene,
  session,
  onSelect,
}: {
  scene: SceneConfig;
  session: Session | null;
  onSelect: (id: string) => void;
}) {
  const members = session?.team?.members ?? [];
  return (
    <div className="absolute inset-0" style={{ background: scene.palette.fog }}>
      <div
        className="absolute inset-[8%] rounded-[2rem] shadow-inner"
        style={{ background: scene.palette.floor, boxShadow: `inset 0 0 0 12px ${scene.palette.wall}` }}
      />
      <div className="absolute inset-x-0 top-28 text-center text-sm text-[#1a140f]">
        This machine has no WebGL. The room is drawn flat so the team is still here.
      </div>
      <div className="absolute inset-x-0 bottom-36 flex flex-wrap justify-center gap-3 px-6">
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onSelect(member.id)}
            className="rounded-2xl px-3 py-3 text-left text-[#1a140f] shadow"
            style={{ background: scene.palette.wall }}
          >
            <span
              className="mb-2 block h-10 w-10 rounded-full"
              style={{ background: `hsl(${member.avatar_hue} 40% 48%)` }}
            />
            <span className="block text-sm font-medium">{member.name}</span>
            <span className="block text-[12px] opacity-70">{member.role}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
