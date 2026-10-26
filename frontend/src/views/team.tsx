import { motion, useReducedMotion } from "framer-motion";
import { Plus, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AgentEditor } from "@/components/agent-editor";
import { Avatar } from "@/components/avatar";
import { Badge, Button, Dialog, DialogContent, Input } from "@/components/ui";
import { runSession, saveTeam, saveTemplate, teamYaml } from "@/lib/api";
import type { TeamMemberSpec, TeamSpec, ToolInfo } from "@/lib/types";
import { cn, modelLabel, slug } from "@/lib/utils";

export function TeamBuilder({
  sessionId,
  initial,
  tools,
  onRun,
}: {
  sessionId: string;
  initial: TeamSpec;
  tools: ToolInfo[];
  onRun: () => Promise<void>;
}) {
  const [team, setTeam] = useState<TeamSpec>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [editing, setEditing] = useState<TeamMemberSpec | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<"save" | "run" | "template" | null>(null);
  const [specOpen, setSpecOpen] = useState(false);
  const [yaml, setYaml] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState(initial.name);
  const reduce = useReducedMotion();
  const dirty = useMemo(() => JSON.stringify(team) !== baseline, [team, baseline]);

  function openCreate() {
    setCreating(true);
    setEditing(blankMember(team));
    setEditorOpen(true);
  }

  function openEdit(member: TeamMemberSpec) {
    setCreating(false);
    setEditing(member);
    setEditorOpen(true);
  }

  function commitMember(member: TeamMemberSpec) {
    setTeam((current) => {
      const exists = current.members.some((item) => item.id === member.id);
      const members = exists ? current.members.map((item) => (item.id === member.id ? member : item)) : [...current.members, member];
      return { ...current, members };
    });
    setEditorOpen(false);
  }

  function removeMember(id: string) {
    setTeam((current) => {
      let members = current.members.filter((item) => item.id !== id);
      if (members.length && !members.some((item) => !item.reports_to)) {
        members = members.map((item, index) => (index === 0 ? { ...item, reports_to: null } : item));
      }
      const root = members.find((item) => !item.reports_to)?.id ?? null;
      members = members.map((item) => (item.reports_to === id ? { ...item, reports_to: root } : item));
      return { ...current, members };
    });
    setEditorOpen(false);
  }

  async function persist() {
    const saved = await saveTeam(sessionId, team);
    if (saved.team) {
      setTeam(saved.team);
      setBaseline(JSON.stringify(saved.team));
    }
    return saved;
  }

  async function onSave() {
    setBusy("save");
    try {
      await persist();
      toast.success("Team saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function onRunClick() {
    setBusy("run");
    try {
      if (dirty) await persist();
      await runSession(sessionId);
      await onRun();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the run");
      try {
        await onRun();
      } catch {
        /* the original error is the one to show */
      }
      setBusy(null);
    }
  }

  async function openSpec() {
    try {
      if (dirty) await persist();
      setYaml(await teamYaml(sessionId));
      setSpecOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={team.name}
                onChange={(event) => setTeam({ ...team, name: event.target.value })}
                aria-label="Team name"
                className="w-full max-w-xl bg-transparent text-[22px] font-medium tracking-[-0.03em] outline-none"
              />
              <Badge className="capitalize">{team.domain}</Badge>
              <Badge>{team.members.length} people</Badge>
              {dirty ? <span className="text-[12px] text-muted-foreground">Unsaved</span> : null}
            </div>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{team.structure}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
            <Button variant="outline" size="sm" onClick={() => void openSpec()}>
              Spec
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)}>
              Save template
            </Button>
            <Button variant="ghost" size="sm" disabled={!dirty || busy === "save"} onClick={() => void onSave()}>
              {busy === "save" ? "Saving" : "Save"}
            </Button>
            <Button size="sm" disabled={busy === "run" || team.members.length < 2} onClick={() => void onRunClick()}>
              <Play className="h-3.5 w-3.5" />
              {busy === "run" ? "Starting" : "Run team"}
            </Button>
          </div>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto px-5 py-5 scrollbar-thin"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void onRunClick();
          }
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {team.members.map((member, index) => (
            <motion.button
              key={member.id}
              type="button"
              onClick={() => openEdit(member)}
              initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.38, delay: reduce ? 0 : index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MemberCard member={member} leadName={team.members.find((item) => item.id === member.reports_to)?.name} />
            </motion.button>
          ))}
        </div>
      </div>
      <AgentEditor
        open={editorOpen}
        member={editing}
        team={team}
        tools={tools}
        onClose={() => setEditorOpen(false)}
        onSave={commitMember}
        onDelete={!creating && team.members.length > 2 && editing ? () => removeMember(editing.id) : undefined}
      />
      <Dialog open={specOpen} onOpenChange={setSpecOpen}>
        <DialogContent title="Team spec" description="Saved as YAML and JSON so this roster can be reused.">
          <pre className="max-h-[50vh] overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed scrollbar-thin">
            {yaml}
          </pre>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([JSON.stringify(team, null, 2)], { type: "application/json" });
                download(blob, `${slug(team.name)}.json`);
              }}
            >
              Download JSON
            </Button>
            <Button
              size="sm"
              onClick={() => download(new Blob([yaml], { type: "text/yaml" }), `${slug(team.name)}.yaml`)}
            >
              Download YAML
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent title="Save as template" description="Templates keep the roster. The next brief can reuse it.">
          <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} aria-label="Template name" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy === "template"}
              onClick={() => {
                void (async () => {
                  setBusy("template");
                  try {
                    if (dirty) await persist();
                    await saveTemplate(sessionId, templateName, team.structure);
                    toast.success("Template saved");
                    setTemplateOpen(false);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not save template");
                  } finally {
                    setBusy(null);
                  }
                })();
              }}
            >
              Save template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberCard({ member, leadName }: { member: TeamMemberSpec; leadName?: string }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={member.name || member.role} hue={member.avatar_hue} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{member.name || "Unnamed"}</div>
          <div className="truncate text-[12px] text-muted-foreground">{member.role}</div>
        </div>
        <Badge className={cn("shrink-0")}>{permissionShort(member.permission_level)}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {member.expertise.slice(0, 4).map((item) => (
          <span key={item} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {item}
          </span>
        ))}
      </div>
      <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Responsibilities</div>
      <ul className="mt-1 space-y-1">
        {member.responsibilities.slice(0, 3).map((item) => (
          <li key={item} className="line-clamp-2 text-[13px] leading-snug">
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Deliverables</div>
      <ul className="mt-1 space-y-1">
        {member.deliverables.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate">{item.title}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{item.acceptance_criteria.length} checks</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{modelLabel(member.model_hint)}</span>
        <span className="truncate">{leadName ? `Reports to ${leadName}` : "Lead"}</span>
      </div>
    </>
  );
}

export function TeamSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-64 animate-pulse rounded-xl border bg-muted/40" />
      ))}
    </div>
  );
}

function blankMember(team: TeamSpec): TeamMemberSpec {
  const root = team.members.find((item) => !item.reports_to)?.id ?? team.members[0]?.id ?? null;
  return {
    id: `m_${crypto.randomUUID().slice(0, 8)}`,
    name: "",
    role: "",
    expertise: [],
    responsibilities: [""],
    deliverables: [
      {
        id: `d_${crypto.randomUUID().slice(0, 8)}`,
        title: "",
        description: "",
        acceptance_criteria: [""],
        kind: "document",
      },
    ],
    allowed_tools: ["notes"],
    permission_level: "act_with_approval",
    model_hint: "spark",
    reports_to: root,
    avatar_hue: Math.floor(Math.random() * 360),
  };
}

function permissionShort(value: string) {
  if (value === "act_with_approval") return "Approval";
  if (value === "observe") return "Observe";
  if (value === "draft") return "Draft";
  return "Act";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
