import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button, Skeleton } from "@/components/ui";
import { submitAnswers } from "@/lib/api";
import type { Question, Session } from "@/lib/types";
import { cn, wait } from "@/lib/utils";

export function Clarify({
  session,
  onDone,
}: {
  session: Session;
  onDone: () => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...session.answers }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await Promise.all([submitAnswers(session.id, answers), wait(reduce ? 0 : 700)]);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not design the team");
      setBusy(false);
    }
  }

  if (busy) {
    return <Assembling />;
  }

  const answered = session.questions.filter((question) => (answers[question.id] || "").trim()).length;

  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <form
        className="mx-auto max-w-[740px] px-5 py-10"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Before anyone starts</p>
        <h1 className="mt-2 text-[28px] font-medium tracking-[-0.03em]">A few questions.</h1>
        <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
          The roster, the roles, and the deliverables come from your brief and these answers. Leave one blank and the
          team will use its judgment.
        </p>
        <p className="mt-4 text-[12px] text-muted-foreground">
          {answered} of {session.questions.length} answered
        </p>
        <ol className="mt-6 space-y-4">
          {session.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              index={index}
              question={question}
              value={answers[question.id] ?? ""}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            />
          ))}
        </ol>
        {error ? (
          <p role="alert" className="mt-4 text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t bg-background/90 py-4 backdrop-blur">
          <p className="text-[12px] text-muted-foreground">⌘ Enter to continue</p>
          <Button type="submit">Compose the team</Button>
        </div>
      </form>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex gap-3">
        <span className="mt-0.5 font-mono text-[12px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <label className="text-[15px] font-medium leading-snug" htmlFor={question.id}>
            {question.prompt}
          </label>
          {question.rationale ? <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{question.rationale}</p> : null}
          <textarea
            id={question.id}
            value={value}
            placeholder={question.placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className="mt-3 min-h-[72px] w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {question.suggestions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {question.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground",
                    value === suggestion && "border-foreground/30 bg-accent text-foreground",
                  )}
                  onClick={() => onChange(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ClarifySkeleton() {
  return (
    <div className="mx-auto max-w-[740px] space-y-4 px-5 py-10">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

function Assembling() {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="relative h-16 w-40">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="absolute top-4 h-8 w-8 rounded-full border bg-card"
            style={{ left: 16 + index * 36 }}
            initial={reduce ? false : { y: 12, opacity: 0 }}
            animate={reduce ? undefined : { y: [12, 0, 0], opacity: 1 }}
            transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      <h1 className="mt-2 text-lg font-medium tracking-tight">Assembling a team</h1>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
        Matching the brief to roles, deliverables, and who is allowed to act.
      </p>
      <Loader2 className="mt-4 h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}
