import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import { StatusDot } from "@/components/avatar";
import { Button, Kbd } from "@/components/ui";
import type { OutletContext } from "@/components/shell";
import { createSession } from "@/lib/api";
import { formatWhen, statusLabel } from "@/lib/utils";

const EXAMPLES = [
  { domain: "Research", prompt: "Investigate why paid signup conversion dropped after the last pricing change." },
  { domain: "Engineering", prompt: "Design a small invoicing API for freelance studios, including what the first version should refuse to do." },
  { domain: "Marketing", prompt: "Write the launch narrative and packaging story for a specialty coffee subscription." },
  { domain: "Recruiting", prompt: "Recruit a founding designer and plan the first thirty days of the interview loop." },
  { domain: "Operations", prompt: "Map the failure modes in our warehouse receiving process and propose a narrower fix." },
];

export function Home() {
  const { sessions, refreshSessions, health } = useOutletContext<OutletContext>();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit() {
    const text = prompt.trim();
    if (text.length < 8 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await createSession(text);
      refreshSessions();
      navigate(`/s/${session.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start";
      setError(message);
      toast.error(message);
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <div className="hero-glow">
        <div className="mx-auto flex max-w-[720px] flex-col px-5 pb-16 pt-16 sm:pt-24">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Muster</p>
          <h1 className="mt-3 max-w-[16ch] text-balance text-[36px] font-medium leading-[1.08] tracking-[-0.035em] sm:text-[44px]">
            Hire an entire AI team with a single prompt.
          </h1>
          <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-muted-foreground">
            Describe the outcome. Muster asks a few sharp questions, designs a team you can edit, then runs the work.
            Anything with a side effect waits for you.
          </p>
          <form
            className="mt-8 overflow-hidden rounded-xl border bg-card shadow-card focus-within:ring-2 focus-within:ring-ring"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="sr-only" htmlFor="prompt">
              What do you need done?
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="A market to understand, a system to design, a role to hire, a process to fix."
              className="min-h-[120px] w-full resize-none bg-transparent px-4 py-4 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
              <p className="text-[12px] text-muted-foreground">
                {health?.provider === "mock" ? "Running locally on the mock provider" : "Connected to the Model API"}
                <span className="hidden sm:inline"> · </span>
                <span className="hidden sm:inline">
                  <Kbd>⌘</Kbd> <Kbd>Enter</Kbd>
                </span>
              </p>
              <Button type="submit" size="sm" disabled={busy || prompt.trim().length < 8}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {busy ? "Reading the brief" : "Hire a team"}
                {busy ? null : <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </form>
          {error ? (
            <p role="alert" className="mt-3 text-[13px] text-destructive">
              {error}
            </p>
          ) : null}

          <div className="mt-10">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Try a brief</h2>
            <ul className="mt-2 divide-y overflow-hidden rounded-xl border bg-card">
              {EXAMPLES.map((example) => (
                <li key={example.domain}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-accent/70"
                    onClick={() => setPrompt(example.prompt)}
                  >
                    <span className="w-24 shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {example.domain}
                    </span>
                    <span className="text-[13px] leading-relaxed">{example.prompt}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {sessions.length > 0 ? (
            <div className="mt-10">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Recent</h2>
              <ul className="mt-2 divide-y overflow-hidden rounded-xl border bg-card">
                {sessions.slice(0, 5).map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/70"
                      onClick={() => navigate(`/s/${session.id}`)}
                    >
                      <StatusDot status={session.status} />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{session.title}</span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">{statusLabel(session.status)}</span>
                      <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:inline">
                        {formatWhen(session.updated_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
