import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { Markdown } from "@/components/markdown";
import { Badge, Button, Dialog, DialogContent, Input, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@/components/ui";
import { answerQuestion, createJob, resolveApproval, runSession } from "@/lib/api";
import type { ActivityEvent, Approval, DeliverableResult, Session, TeamMemberSpec } from "@/lib/types";
import { cn, formatWhen, modelLabel, statusLabel } from "@/lib/utils";

export function Workspace({ session, onChange }: { session: Session; onChange: () => Promise<void> }) {
  const [agentId, setAgentId] = useState<string | "all">("all");
  const [selectedDeliverable, setSelectedDeliverable] = useState<string | null>(session.deliverables[0]?.id ?? null);
  const [jobOpen, setJobOpen] = useState(false);
  const members = session.team?.members ?? [];
  const pending = session.approvals.filter((item) => item.status === "pending");
  const events = session.events.filter((event) => agentId === "all" || event.agent_id === agentId);
  const deliverable = session.deliverables.find((item) => item.id === selectedDeliverable) ?? session.deliverables[0];

  useEffect(() => {
    if (!selectedDeliverable && session.deliverables[0]) setSelectedDeliverable(session.deliverables[0].id);
  }, [session.deliverables, selectedDeliverable]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || pending.length === 0) return;
      if (event.key.toLowerCase() === "a" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        void decide(session.id, pending[0].id, "approved", false, onChange);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, session.id, onChange]);

  const live = session.status === "running" || session.status === "awaiting_approval" || session.status === "awaiting_input";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-medium tracking-tight">{session.team?.name ?? session.title}</h1>
            <Badge className={cn(live && "border-signal/40 text-signal")}>{statusLabel(session.status)}</Badge>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{session.summary || session.prompt}</p>
        </div>
        {session.status === "completed" || session.status === "error" ? (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void rerun(session, onChange)}>
              Run again
            </Button>
            {session.status === "completed" ? (
              <Button size="sm" onClick={() => setJobOpen(true)}>
                Keep this team on watch
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {session.error ? (
        <div role="alert" className="border-b bg-destructive/10 px-4 py-2 text-[13px] text-destructive">
          {session.error}
        </div>
      ) : null}
      <Questions session={session} onChange={onChange} />
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.3fr)_300px_340px]">
        <div className="hidden min-h-0 lg:contents">
          <Timeline events={events} members={members} agentId={agentId} onAgent={setAgentId} live={live} />
          <Approvals session={session} onChange={onChange} />
          <Deliverables
            deliverables={session.deliverables}
            selected={deliverable}
            onSelect={setSelectedDeliverable}
            members={members}
          />
        </div>
        <div className="flex h-full min-h-0 flex-col lg:hidden">
          <Tabs defaultValue="activity" className="flex h-full min-h-0 flex-col">
            <TabsList className="mx-3 mt-3 self-start">
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="approvals">Approvals{pending.length ? ` ${pending.length}` : ""}</TabsTrigger>
              <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
            </TabsList>
            <TabsContent value="activity" className="min-h-0 flex-1">
              <Timeline events={events} members={members} agentId={agentId} onAgent={setAgentId} live={live} />
            </TabsContent>
            <TabsContent value="approvals" className="min-h-0 flex-1">
              <Approvals session={session} onChange={onChange} />
            </TabsContent>
            <TabsContent value="deliverables" className="min-h-0 flex-1">
              <Deliverables
                deliverables={session.deliverables}
                selected={deliverable}
                onSelect={setSelectedDeliverable}
                members={members}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <ScheduleDialog open={jobOpen} onOpenChange={setJobOpen} session={session} />
    </div>
  );
}

function Questions({ session, onChange }: { session: Session; onChange: () => Promise<void> }) {
  const open = session.open_questions.filter((item) => !item.answer);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (open.length === 0 && session.open_questions.length === 0) return null;
  return (
    <div className="border-b bg-card/40 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Questions for you</div>
      <ul className="mt-2 space-y-2">
        {session.open_questions.map((question) => (
          <li key={question.id} className="text-[13px]">
            <div className="font-medium">
              {question.agent_name} · {question.question}
            </div>
            {question.answer ? (
              <p className="mt-1 text-muted-foreground">You answered: {question.answer}</p>
            ) : (
              <form
                className="mt-1 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const answer = (drafts[question.id] || "").trim();
                  if (!answer) return;
                  void answerQuestion(session.id, question.id, answer)
                    .then(() => onChange())
                    .catch((error) => toast.error(error instanceof Error ? error.message : "Could not send"));
                }}
              >
                <Input
                  value={drafts[question.id] ?? ""}
                  placeholder={question.assumption ? `Or they will assume: ${question.assumption}` : "Your answer"}
                  onChange={(event) => setDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                />
                <Button type="submit" size="sm" variant="outline">
                  Answer
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Timeline({
  events,
  members,
  agentId,
  onAgent,
  live,
}: {
  events: ActivityEvent[];
  members: TeamMemberSpec[];
  agentId: string | "all";
  onAgent: (id: string | "all") => void;
  live: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const initialCount = useRef(events.length);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [events.length]);

  return (
    <section className="flex h-full min-h-0 flex-col border-r">
      <header className="flex items-center gap-2 overflow-auto border-b px-3 py-2 scrollbar-thin">
        <FilterChip active={agentId === "all"} onClick={() => onAgent("all")}>
          All
        </FilterChip>
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onAgent(member.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[12px]",
              agentId === member.id ? "border-foreground/30 bg-accent text-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            <Avatar name={member.name} hue={member.avatar_hue} size={16} />
            {member.name.split(" ")[0]}
          </button>
        ))}
        {live ? <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-signal motion-safe:animate-pulse" /> : null}
      </header>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-3 scrollbar-thin">
        {events.length === 0 ? (
          <Empty title="No activity yet" body="When the team starts, each person’s work streams here." />
        ) : (
          <ol>
            {events.map((event, index) => {
              const member = members.find((item) => item.id === event.agent_id);
              const fresh = index >= initialCount.current;
              return (
                <motion.li
                  key={event.id}
                  initial={reduce || !fresh ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: fresh ? (index - initialCount.current) * 0.05 : 0 }}
                  className="flex gap-3 border-b border-border/70 py-3"
                >
                  {member ? (
                    <Avatar name={member.name} hue={member.avatar_hue} size={28} />
                  ) : (
                    <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-medium">{event.agent_name || "Muster"}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{kindLabel(event.kind)}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{formatWhen(event.ts)}</span>
                    </div>
                    <div className="mt-0.5 text-[13px]">{event.title}</div>
                    {event.body ? (
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{event.body}</p>
                    ) : null}
                  </div>
                </motion.li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function Approvals({ session, onChange }: { session: Session; onChange: () => Promise<void> }) {
  const pending = session.approvals.filter((item) => item.status === "pending");
  const history = session.approvals.filter((item) => item.status !== "pending");
  return (
    <section className="flex h-full min-h-0 flex-col border-r bg-card/30">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-[13px] font-medium">Approvals</h2>
        <Badge>{pending.length} waiting</Badge>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 scrollbar-thin">
        {session.approvals.length === 0 ? (
          <Empty title="Inbox is clear" body="Side effects — search, code, files, HTTP, images — land here before they run." />
        ) : null}
        {pending.map((approval) => (
          <ApprovalCard key={approval.id} approval={approval} sessionId={session.id} onChange={onChange} />
        ))}
        {history.map((approval) => (
          <div key={approval.id} className="rounded-lg border px-3 py-2 opacity-70">
            <div className="text-[12px] font-medium">
              {approval.agent_name} · {approval.tool}
            </div>
            <div className="text-[12px] capitalize text-muted-foreground">{approval.status}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApprovalCard({
  approval,
  sessionId,
  onChange,
}: {
  approval: Approval;
  sessionId: string;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <article className="rounded-xl border border-warning/40 bg-background p-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-warning">Needs you</div>
      <h3 className="mt-1 text-sm font-medium">
        {approval.agent_name} wants to run {approval.tool}
      </h3>
      {approval.reason ? <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{approval.reason}</p> : null}
      <pre className="mt-2 max-h-36 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed scrollbar-thin">
        {JSON.stringify(approval.args, null, 2)}
      </pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void decide(sessionId, approval.id, "denied", false, onChange, setBusy)}
        >
          <X className="h-3.5 w-3.5" />
          Deny
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void decide(sessionId, approval.id, "approved", false, onChange, setBusy)}>
          <Check className="h-3.5 w-3.5" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void decide(sessionId, approval.id, "approved", true, onChange, setBusy)}
        >
          Approve all this run
        </Button>
      </div>
    </article>
  );
}

function Deliverables({
  deliverables,
  selected,
  onSelect,
  members,
}: {
  deliverables: DeliverableResult[];
  selected?: DeliverableResult;
  onSelect: (id: string) => void;
  members: TeamMemberSpec[];
}) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="border-b px-4 py-3">
        <h2 className="text-[13px] font-medium">Deliverables</h2>
      </header>
      {deliverables.length === 0 ? (
        <Empty title="Nothing drafted yet" body="Drafts appear here, then a verifier checks each acceptance criterion." />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          <ul className="border-b">
            {deliverables.map((item) => {
              const member = members.find((person) => person.id === item.member_id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-accent/60",
                      selected?.id === item.id && "bg-accent",
                    )}
                  >
                    {member ? <Avatar name={member.name} hue={member.avatar_hue} size={18} /> : null}
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <StatusPill status={item.status} />
                  </button>
                </li>
              );
            })}
          </ul>
          {selected ? (
            <div className="px-4 py-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{selected.title}</h3>
                <span className="text-[11px] text-muted-foreground">
                  {selected.member_name} · v{selected.version} · {modelLabel(members.find((item) => item.id === selected.member_id)?.model_hint || "spark")}
                </span>
              </div>
              {selected.verification ? (
                <ul className="mt-3 space-y-1.5">
                  {selected.verification.criteria.map((criterion) => (
                    <li key={criterion.criterion} className="text-[12px] leading-relaxed">
                      <span className={criterion.met ? "text-success" : "text-destructive"}>{criterion.met ? "Met" : "Missed"}</span>
                      <span className="text-muted-foreground"> — {criterion.criterion}</span>
                    </li>
                  ))}
                  <li className="text-[12px] text-muted-foreground">{selected.verification.summary}</li>
                </ul>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">Waiting on verification.</p>
              )}
              <div className="mt-4">
                <Markdown content={selected.content} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session;
}) {
  const [name, setName] = useState(session.team?.name ?? "Watch");
  const [instruction, setInstruction] = useState(`Monitor outcomes for: ${session.prompt.slice(0, 220)}`);
  const [interval, setIntervalMinutes] = useState(60);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Keep them on watch" description="A scheduled check-in. Unattended runs do not fire side effects.">
        <div className="space-y-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Job name" />
          <Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} aria-label="Instruction" />
          <label className="block text-[13px]">
            <span className="mb-1 block text-muted-foreground">Every</span>
            <select
              value={interval}
              onChange={(event) => setIntervalMinutes(Number(event.target.value))}
              className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
            >
              <option value={1}>minute (demo)</option>
              <option value={15}>15 minutes</option>
              <option value={60}>hour</option>
              <option value={1440}>day</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await createJob({
                    source_session_id: session.id,
                    name,
                    instruction,
                    interval_minutes: interval,
                  });
                  toast.success("Watch scheduled");
                  onOpenChange(false);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not schedule");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[12px]",
        active ? "border-foreground/30 bg-accent text-foreground" : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "passed" ? "text-success" : status === "failed" ? "text-destructive" : "text-muted-foreground";
  return <span className={cn("text-[11px] capitalize", tone)}>{status}</span>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-8">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

async function decide(
  sessionId: string,
  approvalId: string,
  decision: "approved" | "denied",
  approveAll: boolean,
  onChange: () => Promise<void>,
  setBusy?: (busy: boolean) => void,
) {
  setBusy?.(true);
  try {
    await resolveApproval(sessionId, approvalId, decision, approveAll);
    await onChange();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not update the approval");
  } finally {
    setBusy?.(false);
  }
}

async function rerun(session: Session, onChange: () => Promise<void>) {
  try {
    await runSession(session.id);
    await onChange();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not run again");
  }
}

function kindLabel(kind: string) {
  if (kind === "tool_request") return "Tool";
  if (kind === "tool_result") return "Result";
  return kind;
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
}
