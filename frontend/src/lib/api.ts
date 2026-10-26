import type { Health, Job, SceneConfig, Session, SessionBrief, Template, ToolInfo } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("Can't reach the Muster API. Start the backend on port 8000.", 0);
  }
  if (!response.ok) {
    let detail = response.statusText || "Request failed";
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* plain text error */
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const getHealth = () => api<Health>("/api/health");
export const getTools = () => api<ToolInfo[]>("/api/tools");
export const listSessions = () => api<SessionBrief[]>("/api/sessions");
export const getSession = (id: string) => api<Session>(`/api/sessions/${id}`);
export const createSession = (prompt: string) =>
  api<Session>("/api/sessions", { method: "POST", body: JSON.stringify({ prompt }) });
export const submitAnswers = (id: string, answers: Record<string, string>) =>
  api<Session>(`/api/sessions/${id}/answers`, { method: "POST", body: JSON.stringify({ answers }) });
export const saveTeam = (id: string, team: Session["team"]) =>
  api<Session>(`/api/sessions/${id}/team`, { method: "PUT", body: JSON.stringify(team) });
export const runSession = (id: string) => api<Session>(`/api/sessions/${id}/run`, { method: "POST" });
export const interpretScene = (prompt: string, base?: SceneConfig | null) =>
  api<SceneConfig>("/api/scene", { method: "POST", body: JSON.stringify({ prompt, base: base ?? null }) });
export const saveScene = (id: string, scene: SceneConfig) =>
  api<Session>(`/api/sessions/${id}/scene`, { method: "PUT", body: JSON.stringify(scene) });
export const resolveApproval = (
  sessionId: string,
  approvalId: string,
  decision: "approved" | "denied",
  approveAll = false,
) =>
  api<Session>(`/api/sessions/${sessionId}/approvals/${approvalId}`, {
    method: "POST",
    body: JSON.stringify({ decision, approve_all: approveAll }),
  });
export const answerQuestion = (sessionId: string, questionId: string, answer: string) =>
  api<Session>(`/api/sessions/${sessionId}/questions/${questionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
export const saveTemplate = (sessionId: string, name: string, description: string) =>
  api<Template>(`/api/sessions/${sessionId}/template`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
export const teamYaml = async (sessionId: string) => {
  const response = await fetch(`/api/sessions/${sessionId}/team.yaml`);
  if (!response.ok) throw new ApiError("Could not export the spec.", response.status);
  return response.text();
};
export const listTemplates = () => api<Template[]>("/api/templates");
export const getTemplate = (id: string) => api<Template>(`/api/templates/${id}`);
export const deleteTemplate = (id: string) => api<{ ok: boolean }>(`/api/templates/${id}`, { method: "DELETE" });
export const useTemplate = (id: string, prompt?: string) =>
  api<Session>(`/api/templates/${id}/use`, { method: "POST", body: JSON.stringify({ prompt: prompt ?? null }) });
export const listJobs = () => api<Job[]>("/api/jobs");
export const createJob = (body: {
  source_session_id?: string;
  template_id?: string;
  name: string;
  instruction: string;
  interval_minutes: number;
}) => api<Job>("/api/jobs", { method: "POST", body: JSON.stringify(body) });
export const patchJob = (id: string, body: Partial<Pick<Job, "enabled" | "interval_minutes" | "name" | "instruction">>) =>
  api<Job>(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteJob = (id: string) => api<{ ok: boolean }>(`/api/jobs/${id}`, { method: "DELETE" });
export const runJob = (id: string) => api<Job>(`/api/jobs/${id}/run`, { method: "POST" });
