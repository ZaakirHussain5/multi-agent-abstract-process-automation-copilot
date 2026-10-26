import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AgentEditor } from "@/components/agent-editor";
import { Markdown } from "@/components/markdown";
import { Badge, Button, Dialog, DialogContent, Input, Switch } from "@/components/ui";
import { createJob, listJobs, listTemplates, runJob, saveTemplate, useTemplate } from "@/lib/api";
import type { Job, SceneConfig, Session, TeamMemberSpec, Template, ToolInfo } from "@/lib/types";
import type { SpeechBubble } from "@/world/speech";
import { PRESET_LABEL, withPreset, withTime } from "@/world/defaults";
import { employeePose } from "@/world/state";

const TIMES: SceneConfig["time_of_day"][] = ["dawn", "day", "dusk", "night"];
const LAYOUTS: SceneConfig["layout"][] = ["open", "desks", "meeting"];
const PRESETS = Object.keys(PRESET_LABEL) as SceneConfig["preset"][];

export function QuestionsCard({
  session,
  busy,
  onSubmit,
}: {
  session: Session;
  busy: boolean;
  onSubmit: (answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <form
      className="pointer-events-auto w-[min(440px,calc(100vw-1.5rem))] rounded-2xl border border-white/15 bg-[#1a140f]/85 p-4 text-[#f6efe4] shadow-2xl backdrop-blur-md"
      onSubmit={(event) => {
        event.preventDefault();
        const filled: Record<string, string> = {};
        for (const question of session.questions) {
          filled[question.id] = (answers[question.id] || "").trim() || "No preference — use your judgment";
        }
        onSubmit(filled);
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#e7d3bc]">Before anyone sits down</p>
      <div className="mt-3 space-y-3">
        {session.questions.map((question, index) => (
          <label key={question.id} className="block">
            <span className="text-[13px] leading-snug">
              {index + 1}. {question.prompt}
            </span>
            <input
              value={answers[question.id] ?? ""}
              onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
              placeholder={question.placeholder || "Your call"}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-white/35"
            />
            {question.suggestions.length ? (
              <span className="mt-1.5 flex flex-wrap gap-1">
                {question.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-[#f6efe4]/85 hover:bg-white/20"
                    onClick={() => setAnswers((current) => ({ ...current, [question.id]: suggestion }))}
                  >
                    {suggestion}
                  </button>
                ))}
              </span>
            ) : null}
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-full bg-[#f6efe4] py-2 text-[13px] font-medium text-[#1a140f] disabled:opacity-50"
      >
        {busy ? "Designing the team" : "Bring them in"}
      </button>
    </form>
  );
}

export function SettingsPanel({
  open,
  scene,
  graphics,
  onGraphics,
  onClose,
  onChange,
}: {
  open: boolean;
  scene: SceneConfig;
  graphics: "auto" | "full" | "simple";
  onGraphics: (value: "auto" | "full" | "simple") => void;
  onClose: () => void;
  onChange: (scene: SceneConfig) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent align="right" title="Room" description="Layout, light, and props. A sentence in the command bar can do the same thing.">
        <div className="flex-1 space-y-5 overflow-auto px-5 py-4">
          <fieldset>
            <legend className="text-[12px] uppercase tracking-wider text-muted-foreground">Preset</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChange(withPreset(scene, preset))}
                  className={`rounded-full border px-2.5 py-1 text-[12px] ${scene.preset === preset ? "border-foreground bg-foreground text-background" : "border-border"}`}
                >
                  {PRESET_LABEL[preset]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-[12px] uppercase tracking-wider text-muted-foreground">Time of day</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TIMES.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => onChange(withTime(scene, time))}
                  className={`rounded-full border px-2.5 py-1 text-[12px] capitalize ${scene.time_of_day === time ? "border-foreground bg-foreground text-background" : "border-border"}`}
                >
                  {time}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-[12px] uppercase tracking-wider text-muted-foreground">Layout</legend>
            <div className="mt-2 flex gap-1.5">
              {LAYOUTS.map((layout) => (
                <button
                  key={layout}
                  type="button"
                  onClick={() => onChange({ ...scene, layout, customized: true })}
                  className={`rounded-full border px-2.5 py-1 text-[12px] capitalize ${scene.layout === layout ? "border-foreground bg-foreground text-background" : "border-border"}`}
                >
                  {layout}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            {(
              [
                ["plants", "Plants"],
                ["screens", "Screens"],
                ["posters", "Posters"],
                ["lamps", "Lamps"],
                ["rug", "Rug"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between text-sm">
                {label}
                <Switch
                  checked={scene.props[key]}
                  onCheckedChange={(checked) =>
                    onChange({ ...scene, props: { ...scene.props, [key]: checked }, customized: true })
                  }
                />
              </label>
            ))}
          </div>
          <label className="block text-sm">
            Camera height
            <input
              type="range"
              min={0.9}
              max={3.2}
              step={0.05}
              value={scene.camera.height}
              onChange={(event) =>
                onChange({
                  ...scene,
                  camera: { ...scene.camera, height: Number(event.target.value) },
                  customized: true,
                })
              }
              className="mt-2 w-full"
            />
          </label>
          <fieldset>
            <legend className="text-[12px] uppercase tracking-wider text-muted-foreground">Graphics</legend>
            <div className="mt-2 flex gap-1.5">
              {(["auto", "full", "simple"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onGraphics(value)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] capitalize ${graphics === value ? "border-foreground bg-foreground text-background" : "border-border"}`}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Auto drops shadows and extra detail when the machine has four cores or fewer. Simple is the same fallback, on purpose.
            </p>
          </fieldset>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ProfilePanel({
  session,
  member,
  tools,
  focus,
  onClose,
  onApprove,
  onDeny,
  onResolveProposal,
  onTeam,
}: {
  session: Session;
  member: TeamMemberSpec | null;
  tools: ToolInfo[];
  focus: SpeechBubble | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onResolveProposal: (id: string, decision: "approved" | "denied") => void;
  onTeam: (members: TeamMemberSpec[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [member?.id]);
  if (!session.team || !member) {
    return null;
  }
  const team = session.team;
  const pose = employeePose(member, session);
  const events = session.events.filter((event) => event.agent_id === member.id).slice(-8).reverse();
  const deliverables = session.deliverables.filter((item) => item.member_id === member.id);
  const pending = session.approvals.filter((item) => item.agent_id === member.id && item.status === "pending");
  const proposals = (session.proposals ?? []).filter((item) => item.member_id === member.id);
  const focusedProposal = focus?.proposalId ? proposals.find((item) => item.id === focus.proposalId) ?? null : null;
  const focusedApproval = focus?.approvalId ? pending.find((item) => item.id === focus.approvalId) ?? null : null;
  const spoken = focus && focus.memberId === member.id ? focus : null;
  return (
    <>
      <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
        <DialogContent align="right" title={member.name} description={`${member.role} · ${pose}`}>
          <div className="flex-1 space-y-5 overflow-auto px-5 py-4 text-sm">
            {spoken ? (
              <section className="rounded-lg border bg-muted/40 p-3">
                <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground">
                  {spoken.kind === "suggestion"
                    ? "Suggestion"
                    : spoken.kind === "approval"
                      ? "Approval request"
                      : spoken.kind === "handoff"
                        ? "Handoff"
                        : spoken.kind === "question"
                          ? "Question"
                          : "Message"}
                </h3>
                <p className="mt-1 font-medium">{spoken.title}</p>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{spoken.full}</p>
                {focusedProposal ? (
                  <div className="mt-3">
                    <p className="text-[12px] text-muted-foreground">
                      {focusedProposal.side_effect
                        ? "Approving registers this tool. Each call still waits, because it leaves the workspace."
                        : "Approving registers this tool for the team. A later call that leaves the workspace still waits."}
                    </p>
                    {focusedProposal.status === "pending" ? (
                      <div className="mt-2 flex gap-2">
                        <Button type="button" size="sm" onClick={() => onResolveProposal(focusedProposal.id, "approved")}>
                          Approve and register
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => onResolveProposal(focusedProposal.id, "denied")}>
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-2 text-[12px] text-muted-foreground">This suggestion is {focusedProposal.status}.</p>
                    )}
                  </div>
                ) : null}
                {focusedApproval ? (
                  <div className="mt-3 flex gap-2">
                    <Button type="button" size="sm" onClick={() => onApprove(focusedApproval.id)}>
                      Approve
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => onDeny(focusedApproval.id)}>
                      Reject
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}
            <p className="leading-relaxed text-muted-foreground">{member.persona || "No persona yet."}</p>
            <div className="flex flex-wrap gap-1.5">
              {member.expertise.map((item) => (
                <Badge key={item}>{item}</Badge>
              ))}
            </div>
            <section>
              <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground">Tools they can call</h3>
              <ul className="mt-2 space-y-1">
                {member.allowed_tools.map((tool) => (
                  <li key={tool} className="font-mono text-[12px]">
                    {tool}
                  </li>
                ))}
              </ul>
            </section>
            {proposals.length ? (
              <section className="space-y-2">
                <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground">Tool suggestions</h3>
                {proposals.map((tool) => (
                  <div key={tool.id} className="rounded-lg border p-3">
                    <div className="font-mono text-[12px]">{tool.name}</div>
                    <p className="mt-1 text-[13px] text-muted-foreground">{tool.reason || tool.description}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">{tool.status}</p>
                    {tool.status === "pending" && tool.id !== spoken?.proposalId ? (
                      <div className="mt-2 flex gap-2">
                        <Button type="button" size="sm" onClick={() => onResolveProposal(tool.id, "approved")}>
                          Approve and register
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => onResolveProposal(tool.id, "denied")}>
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}
            {pending.length ? (
              <section className="space-y-2">
                <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground">Waiting on you</h3>
                {pending
                  .filter((item) => item.id !== spoken?.approvalId)
                  .map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="font-medium">{item.tool}</div>
                    <p className="mt-1 text-[13px] text-muted-foreground">{item.reason}</p>
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="sm" onClick={() => onApprove(item.id)}>
                        Approve
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onDeny(item.id)}>
                        Deny
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            ) : null}
            <section>
              <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground">Live work</h3>
              <ul className="mt-2 space-y-2">
                {events.length === 0 ? <li className="text-muted-foreground">Nothing on the floor yet.</li> : null}
                {events.map((event) => (
                  <li key={event.id}>
                    <div className="text-[13px] font-medium">{event.title}</div>
                    {event.body ? <p className="text-[12px] leading-relaxed text-muted-foreground">{event.body.slice(0, 280)}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
            <section className="space-y-3">
              <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground">Related deliverables</h3>
              {deliverables.length === 0 ? <p className="text-muted-foreground">Nothing drafted yet.</p> : null}
              {deliverables.map((item) => (
                <article key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-medium">{item.title}</h4>
                    <Badge>{item.status}</Badge>
                  </div>
                  <div className="mt-2">
                    <Markdown content={item.content} />
                  </div>
                </article>
              ))}
            </section>
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Edit this employee
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AgentEditor
        open={editing}
        member={member}
        team={team}
        tools={tools}
        onClose={() => setEditing(false)}
        onSave={(next) => {
          onTeam(team.members.map((item) => (item.id === next.id ? next : item)));
          setEditing(false);
        }}
      />
    </>
  );
}

export function LibraryPanel({
  open,
  session,
  onClose,
  onOpenSession,
}: {
  open: boolean;
  session: Session | null;
  onClose: () => void;
  onOpenSession: (id: string) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [instruction, setInstruction] = useState("Check the assumptions and write a short watch note.");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    void listJobs().then(setJobs).catch(() => setJobs([]));
    void listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent align="right" title="After hours" description="Saved rosters and watches. A watch does not take outward actions.">
        <div className="flex-1 space-y-6 overflow-auto px-5 py-4">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Keep this team on</h3>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={session?.team?.name || "Watch name"} />
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              className="min-h-20 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
            />
            <Button
              type="button"
              disabled={!session?.team}
              onClick={() => {
                if (!session) return;
                void createJob({
                  source_session_id: session.id,
                  name: name || session.team?.name || "Watch",
                  instruction,
                  interval_minutes: 60,
                })
                  .then((job) => {
                    setJobs((current) => [job, ...current]);
                    toast.success("They will check in on their own.");
                  })
                  .catch((error: Error) => toast.error(error.message));
              }}
            >
              Schedule hourly watch
            </Button>
            <ul className="space-y-2 pt-2">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px]">
                  <span>
                    {job.name}
                    <span className="block text-[11px] text-muted-foreground">{job.enabled ? "On" : "Paused"}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void runJob(job.id)
                        .then((next) => {
                          setJobs((current) => current.map((item) => (item.id === next.id ? next : item)));
                          toast.success("Watch note written.");
                        })
                        .catch((error: Error) => toast.error(error.message));
                    }}
                  >
                    Run now
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Rosters</h3>
            <Button
              type="button"
              variant="outline"
              disabled={!session?.team}
              onClick={() => {
                if (!session) return;
                void saveTemplate(session.id, session.team?.name || "Roster", session.prompt)
                  .then((template) => {
                    setTemplates((current) => [template, ...current]);
                    toast.success("Roster saved.");
                  })
                  .catch((error: Error) => toast.error(error.message));
              }}
            >
              Save this roster
            </Button>
            <ul className="space-y-2">
              {templates.map((template) => (
                <li key={template.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px]">
                  <span>{template.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void useTemplate(template.id)
                        .then((next) => onOpenSession(next.id))
                        .catch((error: Error) => toast.error(error.message));
                    }}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
