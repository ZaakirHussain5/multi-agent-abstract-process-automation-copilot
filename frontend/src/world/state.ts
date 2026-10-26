import type { SceneLayout } from "@/lib/types";
import type { Approval, Session, TeamMemberSpec } from "@/lib/types";

export type EmployeePose = "idle" | "thinking" | "working" | "talking" | "waiting" | "done";

export type Slot = { x: number; z: number; rot: number };

export function employeePose(member: TeamMemberSpec, session: Session | null): EmployeePose {
  if (!session) return "idle";
  const waiting = session.approvals.some((item) => item.agent_id === member.id && item.status === "pending");
  if (waiting) return "waiting";
  const mine = session.deliverables.filter((item) => item.member_id === member.id);
  const passed = mine.length > 0 && mine.every((item) => item.status === "passed" || item.verification?.passed);
  if (passed && (session.status === "completed" || session.status === "running")) return "done";
  const events = session.events.filter((event) => event.agent_id === member.id);
  const last = events[events.length - 1];
  const live = session.status === "running" || session.status === "awaiting_approval" || session.status === "awaiting_input";
  if (live && last && (last.kind === "handoff" || last.kind === "challenge" || last.kind === "question")) return "talking";
  if (live && mine.some((item) => item.status === "draft" || item.status === "revised" || item.status === "verifying")) {
    return "working";
  }
  if (session.status === "running") return "thinking";
  if (session.status === "completed" && mine.length > 0) return "done";
  return "idle";
}

export function pendingApproval(member: TeamMemberSpec, session: Session | null): Approval | null {
  if (!session) return null;
  return session.approvals.find((item) => item.agent_id === member.id && item.status === "pending") ?? null;
}

export function deskSlots(count: number, layout: SceneLayout): Slot[] {
  const n = Math.max(count, 4);
  if (layout === "meeting") {
    const radius = 2.35;
    return Array.from({ length: n }, (_, index) => {
      const angle = (index / n) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius * 0.82, rot: angle + Math.PI / 2 };
    });
  }
  if (layout === "open") {
    return Array.from({ length: n }, (_, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return { x: (col - 1) * 2.5, z: -1.2 + row * 2.1, rot: row % 2 === 0 ? 0 : Math.PI };
    });
  }
  const cols = Math.ceil(n / 2);
  return Array.from({ length: n }, (_, index) => {
    const row = index < cols ? 0 : 1;
    const col = row === 0 ? index : index - cols;
    const span = Math.max(cols - 1, 1);
    return {
      x: (col - span / 2) * 2.15,
      z: row === 0 ? -1.7 : 1.55,
      rot: row === 0 ? 0 : Math.PI,
    };
  });
}

export function gatherSlot(index: number, total: number): Slot {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 + 0.4;
  return { x: Math.cos(angle) * 1.15, z: Math.sin(angle) * 0.9, rot: angle + Math.PI };
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function graphicsPreference(): "auto" | "full" | "simple" {
  try {
    const stored = localStorage.getItem("muster-graphics");
    if (stored === "full" || stored === "simple" || stored === "auto") return stored;
  } catch {
    /* private mode */
  }
  return "auto";
}

export function prefersSimple(preference: "auto" | "full" | "simple", sceneQuality: "full" | "simple"): boolean {
  if (preference === "simple" || sceneQuality === "simple") return true;
  if (preference === "full") return false;
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 8 : 8;
  return cores <= 4;
}
