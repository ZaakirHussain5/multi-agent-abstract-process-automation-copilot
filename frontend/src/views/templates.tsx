import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge, Button, Dialog, DialogContent, Input, Skeleton } from "@/components/ui";
import { deleteTemplate, getTemplate, listTemplates, useTemplate } from "@/lib/api";
import type { Template } from "@/lib/types";
import { formatWhen } from "@/lib/utils";

export function Templates() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Template | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function reload() {
    try {
      setTemplates(await listTemplates());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load templates");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function open(template: Template) {
    try {
      const full = await getTemplate(template.id);
      setActive(full);
      setPrompt(full.source_prompt);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open template");
    }
  }

  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-[28px] font-medium tracking-[-0.03em]">Templates</h1>
        <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          A saved roster. Use it on a new brief without designing the team again. Specs are stored as JSON and YAML.
        </p>
        {error ? (
          <p role="alert" className="mt-4 text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        {templates === null ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : templates.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed px-6 py-12">
            <h2 className="text-sm font-medium">No templates yet</h2>
            <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Design a team, then save it from the roster. It will be here the next time the work looks familiar.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => navigate("/")}>
              Hire a team
            </Button>
          </div>
        ) : (
          <ul className="mt-6 divide-y overflow-hidden rounded-xl border bg-card">
            {templates.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{template.name}</span>
                    <Badge className="capitalize">{template.team.domain}</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                    {template.team.members.map((member) => member.role).join(" · ")}
                  </p>
                </div>
                <span className="text-[12px] text-muted-foreground">{formatWhen(template.created_at)}</span>
                <Button size="sm" variant="outline" onClick={() => void open(template)}>
                  Use
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void deleteTemplate(template.id)
                      .then(reload)
                      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not delete"));
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog open={Boolean(active)} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent title={active?.name ?? "Template"} description="The roster is copied. You can still edit it before anyone runs.">
          {active ? (
            <>
              <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed scrollbar-thin">
                {active.yaml}
              </pre>
              <label className="mt-3 block text-[13px]">
                <span className="mb-1 block text-muted-foreground">Brief for this run</span>
                <Input value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setActive(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        const session = await useTemplate(active.id, prompt);
                        navigate(`/s/${session.id}`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not use template");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Open roster
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
