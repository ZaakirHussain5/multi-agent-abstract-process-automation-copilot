import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import type { OutletContext } from "@/components/shell";
import { Badge, Button, Dialog, DialogContent, Input, Switch, Textarea } from "@/components/ui";
import { createJob, deleteJob, listJobs, patchJob, runJob } from "@/lib/api";
import type { Job } from "@/lib/types";
import { formatWhen } from "@/lib/utils";

export function Jobs() {
  const { sessions } = useOutletContext<OutletContext>();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  async function reload() {
    try {
      setJobs(await listJobs());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs");
    }
  }

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const eligible = sessions.filter((session) => session.status !== "clarifying" && session.status !== "designing");

  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-medium tracking-[-0.03em]">Jobs</h1>
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
              Teams that stay on after the chat. Each check-in writes a note. Nothing outward runs while you are away.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} disabled={eligible.length === 0}>
            New watch
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-4 text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        {jobs === null ? (
          <div className="mt-6 space-y-3">
            <div className="h-28 animate-pulse rounded-xl border bg-muted/40" />
            <div className="h-28 animate-pulse rounded-xl border bg-muted/40" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed px-6 py-12">
            <h2 className="text-sm font-medium">No recurring work yet</h2>
            <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Finish a team, then keep them on watch. Or hire a team first.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => navigate("/")}>
              Hire a team
            </Button>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-medium">{job.name}</h2>
                      <Badge>{intervalLabel(job.interval_minutes)}</Badge>
                      {!job.enabled ? <Badge>Paused</Badge> : null}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{job.instruction}</p>
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Next {formatWhen(job.next_run_at)}
                      {job.last_run_at ? ` · last ${formatWhen(job.last_run_at)}` : ""}
                      {job.team ? ` · ${job.team.members.length} people` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={job.enabled}
                      aria-label={job.enabled ? "Pause job" : "Resume job"}
                      onCheckedChange={(enabled) => {
                        void patchJob(job.id, { enabled })
                          .then(reload)
                          .catch((err) => toast.error(err instanceof Error ? err.message : "Could not update"));
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === job.id}
                      onClick={() => {
                        setBusyId(job.id);
                        void runJob(job.id)
                          .then(() => reload())
                          .catch((err) => toast.error(err instanceof Error ? err.message : "Run failed"))
                          .finally(() => setBusyId(null));
                      }}
                    >
                      {busyId === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Run now
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void deleteJob(job.id)
                          .then(reload)
                          .catch((err) => toast.error(err instanceof Error ? err.message : "Could not delete"));
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {job.runs.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t pt-3">
                    {job.runs.slice().reverse().slice(0, 3).map((run) => (
                      <li key={run.id} className="text-[13px] leading-relaxed">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{run.status}</span>
                        <span className="text-muted-foreground"> · {formatWhen(run.finished_at || run.started_at)} · </span>
                        {run.summary}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 border-t pt-3 text-[13px] text-muted-foreground">No check-ins yet.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <NewWatch
        open={creating}
        onOpenChange={setCreating}
        sessions={eligible}
        onCreated={() => {
          setCreating(false);
          void reload();
        }}
      />
    </div>
  );
}

function NewWatch({
  open,
  onOpenChange,
  sessions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: OutletContext["sessions"];
  onCreated: () => void;
}) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [name, setName] = useState("Watch");
  const [instruction, setInstruction] = useState("Monitor whether the original outcome still holds.");
  const [interval, setIntervalMinutes] = useState(60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sessionId && sessions[0]) setSessionId(sessions[0].id);
  }, [sessions, sessionId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New watch" description="Pick a team that already exists. The job copies its spec.">
        <div className="space-y-3">
          <label className="block text-[13px]">
            <span className="mb-1 block text-muted-foreground">Team</span>
            <select
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
          </label>
          <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Name" />
          <Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} aria-label="Instruction" />
          <select
            value={interval}
            onChange={(event) => setIntervalMinutes(Number(event.target.value))}
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
            aria-label="Interval"
          >
            <option value={1}>Every minute</option>
            <option value={15}>Every 15 minutes</option>
            <option value={60}>Every hour</option>
            <option value={1440}>Every day</option>
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || !sessionId}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await createJob({ source_session_id: sessionId, name, instruction, interval_minutes: interval });
                  toast.success("Watch scheduled");
                  onCreated();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not schedule");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function intervalLabel(minutes: number) {
  if (minutes < 60) return `Every ${minutes}m`;
  if (minutes % 1440 === 0) return `Every ${minutes / 1440}d`;
  if (minutes % 60 === 0) return `Every ${minutes / 60}h`;
  return `Every ${minutes}m`;
}
