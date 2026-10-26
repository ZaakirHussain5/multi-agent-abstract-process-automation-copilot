import { useEffect, useState, type ReactNode } from "react";
import { Button, Dialog, DialogContent, FieldLabel, Input, Textarea } from "@/components/ui";
import type { DeliverableKind, DeliverableSpec, ModelHint, PermissionLevel, TeamMemberSpec, TeamSpec, ToolInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const KINDS: DeliverableKind[] = ["document", "plan", "research", "code", "image", "data"];
const PERMISSIONS: { value: PermissionLevel; label: string; hint: string }[] = [
  { value: "observe", label: "Observe", hint: "Can read. No side effects." },
  { value: "draft", label: "Draft", hint: "Writes deliverables. Side effects wait." },
  { value: "act_with_approval", label: "Act with approval", hint: "Tools run after you approve." },
  { value: "act", label: "Act", hint: "Allowed tools run without asking." },
];
const MODELS: { value: ModelHint; label: string }[] = [
  { value: "spark", label: "Muse Spark" },
  { value: "code", label: "Muse Code" },
  { value: "image", label: "Muse Image" },
];

export function AgentEditor({
  open,
  member,
  team,
  tools,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  member: TeamMemberSpec | null;
  team: TeamSpec;
  tools: ToolInfo[];
  onClose: () => void;
  onSave: (member: TeamMemberSpec) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<TeamMemberSpec | null>(member);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(member);
    setError(null);
  }, [member]);

  if (!draft) return null;

  function update(patch: Partial<TeamMemberSpec>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function save() {
    if (!draft) return;
    const cleaned: TeamMemberSpec = {
      ...draft,
      name: draft.name.trim(),
      role: draft.role.trim(),
      expertise: draft.expertise.map((item) => item.trim()).filter(Boolean),
      responsibilities: draft.responsibilities.map((item) => item.trim()).filter(Boolean),
      deliverables: draft.deliverables.map((item) => ({
        ...item,
        title: item.title.trim(),
        description: item.description.trim(),
        acceptance_criteria: item.acceptance_criteria.map((criterion) => criterion.trim()).filter(Boolean),
      })),
    };
    if (!cleaned.name || !cleaned.role) {
      setError("Name and role are required.");
      return;
    }
    if (cleaned.expertise.length === 0 || cleaned.responsibilities.length === 0) {
      setError("Add expertise and at least one responsibility.");
      return;
    }
    if (cleaned.deliverables.length === 0 || cleaned.deliverables.some((item) => !item.title || !item.description || item.acceptance_criteria.length === 0)) {
      setError("Every deliverable needs a title, a description, and acceptance criteria.");
      return;
    }
    onSave(cleaned);
  }

  const permission = PERMISSIONS.find((item) => item.value === draft.permission_level);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        align="right"
        title={member && team.members.some((item) => item.id === member.id) ? draft.name || "Edit teammate" : "Add teammate"}
        description="This is the spec the runner will follow."
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4 scrollbar-thin">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Name</FieldLabel>
              <Input value={draft.name} onChange={(event) => update({ name: event.target.value })} />
            </div>
            <div>
              <FieldLabel>Role</FieldLabel>
              <Input value={draft.role} onChange={(event) => update({ role: event.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Model</FieldLabel>
              <Select value={draft.model_hint} onChange={(value) => update({ model_hint: value as ModelHint })}>
                {MODELS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel>Reports to</FieldLabel>
              <Select
                value={draft.reports_to ?? ""}
                onChange={(value) => update({ reports_to: value || null })}
              >
                <option value="">No one — a lead</option>
                {team.members
                  .filter((item) => item.id !== draft.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.role}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
          <div>
            <FieldLabel hint={permission?.hint}>Permission</FieldLabel>
            <Select value={draft.permission_level} onChange={(value) => update({ permission_level: value as PermissionLevel })}>
              {PERMISSIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
          <ChipEditor label="Expertise" values={draft.expertise} onChange={(expertise) => update({ expertise })} />
          <StringList label="Responsibilities" values={draft.responsibilities} onChange={(responsibilities) => update({ responsibilities })} />
          <div>
            <FieldLabel hint="Side effects wait for approval unless permission is Act">Tools</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {(tools.length ? tools : draft.allowed_tools.map((name) => ({ name, description: "", side_effect: false, parameters: {} }))).map((tool) => {
                const checked = draft.allowed_tools.includes(tool.name);
                return (
                  <label key={tool.name} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-[13px]", checked && "border-foreground/30 bg-accent")}>
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={checked}
                      onChange={() => {
                        const allowed_tools = checked
                          ? draft.allowed_tools.filter((name) => name !== tool.name)
                          : [...draft.allowed_tools, tool.name];
                        update({ allowed_tools });
                      }}
                    />
                    <span>
                      <span className="block font-medium">{tool.name}</span>
                      {tool.side_effect ? <span className="text-[11px] text-muted-foreground">Side effect</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <FieldLabel>Deliverables</FieldLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  update({
                    deliverables: [
                      ...draft.deliverables,
                      {
                        id: `d_${crypto.randomUUID().slice(0, 8)}`,
                        title: "",
                        description: "",
                        acceptance_criteria: [""],
                        kind: "document",
                      },
                    ],
                  })
                }
              >
                Add
              </Button>
            </div>
            {draft.deliverables.map((deliverable, index) => (
              <DeliverableFields
                key={deliverable.id}
                deliverable={deliverable}
                onChange={(next) => {
                  const deliverables = draft.deliverables.slice();
                  deliverables[index] = next;
                  update({ deliverables });
                }}
                onRemove={
                  draft.deliverables.length > 1
                    ? () => update({ deliverables: draft.deliverables.filter((item) => item.id !== deliverable.id) })
                    : undefined
                }
              />
            ))}
          </div>
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          {onDelete ? (
            <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              Save teammate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeliverableFields({
  deliverable,
  onChange,
  onRemove,
}: {
  deliverable: DeliverableSpec;
  onChange: (next: DeliverableSpec) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <Input
          value={deliverable.title}
          placeholder="Title"
          onChange={(event) => onChange({ ...deliverable, title: event.target.value })}
        />
        <Select value={deliverable.kind} onChange={(value) => onChange({ ...deliverable, kind: value as DeliverableKind })}>
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        value={deliverable.description}
        placeholder="What this deliverable is for"
        className="min-h-[64px]"
        onChange={(event) => onChange({ ...deliverable, description: event.target.value })}
      />
      <StringList
        label="Acceptance criteria"
        values={deliverable.acceptance_criteria}
        onChange={(acceptance_criteria) => onChange({ ...deliverable, acceptance_criteria })}
      />
      {onRemove ? (
        <button type="button" className="text-[12px] text-muted-foreground hover:text-destructive" onClick={onRemove}>
          Remove deliverable
        </button>
      ) : null}
    </div>
  );
}

function StringList({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  const rows = values.length ? values : [""];
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="space-y-2">
        {rows.map((value, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={value}
              onChange={(event) => {
                const next = rows.slice();
                next[index] = event.target.value;
                onChange(next);
              }}
            />
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label}`}
                onClick={() => onChange(rows.filter((_, row) => row !== index))}
              >
                –
              </Button>
            ) : null}
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...rows, ""])}>
          Add line
        </Button>
      </div>
    </div>
  );
}

function ChipEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  const [text, setText] = useState("");
  return (
    <div>
      <FieldLabel hint="Enter to add">{label}</FieldLabel>
      <div className="rounded-lg border bg-background px-2 py-2">
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <button
              key={value}
              type="button"
              className="rounded-md bg-muted px-1.5 py-0.5 text-[12px]"
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              {value} ×
            </button>
          ))}
        </div>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const next = text.trim();
              if (next && !values.includes(next)) onChange([...values, next]);
              setText("");
            }
            if (event.key === "Backspace" && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          placeholder="Add expertise"
          className="mt-1 h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </select>
  );
}
