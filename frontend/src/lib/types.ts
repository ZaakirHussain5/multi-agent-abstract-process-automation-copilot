export type PermissionLevel = "observe" | "draft" | "act_with_approval" | "act";
export type ModelHint = "spark" | "code" | "image" | "general";
export type DeliverableKind = "document" | "code" | "image" | "research" | "plan" | "data";
export type SessionStatus =
  | "clarifying"
  | "designing"
  | "review"
  | "running"
  | "awaiting_approval"
  | "awaiting_input"
  | "completed"
  | "error";

export type Silhouette = "tall" | "compact" | "broad";
export type ScenePreset = "loft" | "lab" | "war_room" | "studio" | "rooftop" | "library";
export type TimeOfDay = "dawn" | "day" | "dusk" | "night";
export type SceneLayout = "open" | "desks" | "meeting";
export type SceneQuality = "full" | "simple";

export type ProposedTool = {
  name: string;
  description: string;
  side_effect: boolean;
  reason: string;
};

export type DeliverableSpec = {
  id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  kind: DeliverableKind;
};

export type TeamMemberSpec = {
  id: string;
  name: string;
  role: string;
  expertise: string[];
  responsibilities: string[];
  deliverables: DeliverableSpec[];
  allowed_tools: string[];
  permission_level: PermissionLevel;
  model_hint: ModelHint;
  reports_to: string | null;
  avatar_hue: number;
  persona: string;
  silhouette: Silhouette;
  proposed_tools: ProposedTool[];
};

export type SceneProps = {
  plants: boolean;
  screens: boolean;
  posters: boolean;
  lamps: boolean;
  rug: boolean;
};

export type SceneConfig = {
  preset: ScenePreset;
  time_of_day: TimeOfDay;
  layout: SceneLayout;
  props: SceneProps;
  lighting: { ambient: number; key: number; accent: string };
  camera: { fov: number; height: number; radius: number };
  palette: { floor: string; wall: string; trim: string; fog: string; accent: string };
  poster_title: string;
  poster_image: string;
  quality: SceneQuality;
  source_prompt: string;
  customized: boolean;
};

export type TeamSpec = {
  id: string;
  name: string;
  mission: string;
  domain: string;
  structure: string;
  members: TeamMemberSpec[];
};

export type Question = {
  id: string;
  prompt: string;
  rationale: string;
  placeholder: string;
  suggestions: string[];
};

export type ActivityEvent = {
  id: string;
  ts: string;
  agent_id: string | null;
  agent_name: string | null;
  kind: string;
  title: string;
  body: string;
  meta: Record<string, unknown>;
};

export type Approval = {
  id: string;
  agent_id: string;
  agent_name: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
  resolved_at: string | null;
};

export type Verification = {
  passed: boolean;
  summary: string;
  criteria: { criterion: string; met: boolean; evidence: string }[];
};

export type DeliverableResult = {
  id: string;
  spec_id: string;
  member_id: string;
  member_name: string;
  title: string;
  kind: DeliverableKind;
  content: string;
  status: string;
  verification: Verification | null;
  version: number;
};

export type OpenQuestion = {
  id: string;
  agent_id: string;
  agent_name: string;
  question: string;
  blocking: boolean;
  assumption: string;
  answer: string | null;
};

export type Session = {
  id: string;
  title: string;
  prompt: string;
  status: SessionStatus;
  questions: Question[];
  answers: Record<string, string>;
  team: TeamSpec | null;
  scene: SceneConfig | null;
  events: ActivityEvent[];
  approvals: Approval[];
  deliverables: DeliverableResult[];
  open_questions: OpenQuestion[];
  approve_all: boolean;
  error: string | null;
  summary: string;
  created_at: string;
  updated_at: string;
};

export type SessionBrief = {
  id: string;
  title: string;
  status: SessionStatus;
  summary: string;
  domain: string | null;
  updated_at: string;
  created_at: string;
};

export type JobRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "succeeded" | "failed";
  summary: string;
};

export type Job = {
  id: string;
  name: string;
  instruction: string;
  interval_minutes: number;
  enabled: boolean;
  team: TeamSpec;
  source_session_id: string | null;
  created_at: string;
  next_run_at: string;
  last_run_at: string | null;
  runs: JobRun[];
};

export type Template = {
  id: string;
  name: string;
  description: string;
  team: TeamSpec;
  source_prompt: string;
  created_at: string;
  yaml?: string;
};

export type ToolInfo = {
  name: string;
  description: string;
  side_effect: boolean;
  parameters: Record<string, string>;
};

export type Health = {
  ok: boolean;
  provider: string;
  models: { spark: string; code: string; image: string };
  base_url: string | null;
};
