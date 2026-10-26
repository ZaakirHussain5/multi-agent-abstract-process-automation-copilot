import { useCallback, useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import type { OutletContext } from "@/components/shell";
import { Button } from "@/components/ui";
import { getSession, runSession } from "@/lib/api";
import type { Session } from "@/lib/types";
import { Clarify, ClarifySkeleton } from "@/views/clarify";
import { TeamBuilder, TeamSkeleton } from "@/views/team";
import { Workspace } from "@/views/workspace";

export function SessionPage() {
  const { id } = useParams();
  const { refreshSessions, tools } = useOutletContext<OutletContext>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const next = await getSession(id);
      setSession(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this team");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!session) return;
    const live = ["running", "awaiting_approval", "awaiting_input", "designing"].includes(session.status);
    if (!live) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void reload();
    }, 800);
    return () => window.clearInterval(timer);
  }, [session?.status, reload]);

  useEffect(() => {
    if (session?.status === "completed" || session?.status === "review" || session?.status === "error") {
      refreshSessions();
    }
  }, [session?.status, refreshSessions]);

  if (loading && !session) {
    return <ClarifySkeleton />;
  }
  if (error && !session) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-lg font-medium">This team is not here</h1>
        <p role="alert" className="mt-2 text-[13px] text-muted-foreground">
          {error}
        </p>
      </div>
    );
  }
  if (!session) return null;

  if (session.status === "clarifying" || session.status === "designing") {
    if (session.questions.length === 0) return <ClarifySkeleton />;
    return (
      <Clarify
        session={session}
        onDone={async () => {
          await reload();
          refreshSessions();
        }}
      />
    );
  }

  if (session.status === "review" && session.team) {
    return (
      <TeamBuilder
        key={session.team.id + session.updated_at}
        sessionId={session.id}
        initial={session.team}
        tools={tools}
        onRun={async () => {
          await reload();
          refreshSessions();
        }}
      />
    );
  }

  if ((session.status === "running" || session.status === "awaiting_approval" || session.status === "awaiting_input" || session.status === "completed" || session.status === "error") && session.team) {
    return <Workspace session={session} onChange={reload} />;
  }

  if (!session.team) return <TeamSkeleton />;

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-lg font-medium">{session.title}</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">{session.error || "This session is in an unexpected state."}</p>
      <Button
        className="mt-4"
        onClick={() => {
          void runSession(session.id).then(() => reload());
        }}
      >
        Run team
      </Button>
    </div>
  );
}
