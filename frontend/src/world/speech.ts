import type { Session } from "@/lib/types";

export type SpeechKind = "message" | "suggestion" | "handoff" | "question" | "approval";

export type SpeechBubble = {
  id: string;
  memberId: string;
  kind: SpeechKind;
  short: string;
  full: string;
  title: string;
  sticky: boolean;
  ts: string;
  approvalId?: string;
  proposalId?: string;
};

const FADE_MS = 14_000;
const MAX_VISIBLE = 3;
const MAX_FADING = 2;
const MAX_STICKY = 2;

function clip(text: string, limit: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 1).trimEnd()}…`;
}

function talkKind(eventKind: string): SpeechKind | null {
  if (eventKind === "handoff") return "handoff";
  if (eventKind === "question") return "question";
  if (eventKind === "plan" || eventKind === "challenge") return "message";
  return null;
}

/** Short lines above an avatar. Pending suggestions and approvals stay; talk fades. */
export function speechBubbles(memberId: string, session: Session | null, now: number): SpeechBubble[] {
  if (!session) return [];
  const sticky: SpeechBubble[] = [];
  for (const proposal of session.proposals ?? []) {
    if (proposal.member_id !== memberId || proposal.status !== "pending") continue;
    const label = proposal.name.replaceAll("-", " ").replaceAll("_", " ");
    sticky.push({
      id: `proposal:${proposal.id}`,
      memberId,
      kind: "suggestion",
      short: clip(`Suggests ${label}`, 78),
      full: [proposal.description, proposal.reason].filter(Boolean).join("\n\n"),
      title: `Suggests ${proposal.name}`,
      sticky: true,
      ts: session.updated_at,
      proposalId: proposal.id,
    });
  }
  for (const approval of session.approvals) {
    if (approval.agent_id !== memberId || approval.status !== "pending") continue;
    sticky.push({
      id: `approval:${approval.id}`,
      memberId,
      kind: "approval",
      short: clip(`Needs a yes for ${approval.tool.replaceAll("_", " ")}`, 78),
      full: approval.reason || "This call leaves the workspace.",
      title: `Needs approval · ${approval.tool}`,
      sticky: true,
      ts: approval.created_at,
      approvalId: approval.id,
    });
  }

  const fading: SpeechBubble[] = [];
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index];
    if (event.agent_id !== memberId) continue;
    if (typeof event.meta?.proposal_name === "string") continue;
    const kind = talkKind(event.kind);
    if (!kind) continue;
    const stamped = Date.parse(event.ts);
    if (!Number.isFinite(stamped) || now - stamped > FADE_MS) continue;
    const body = event.body || event.title;
    fading.push({
      id: `event:${event.id}`,
      memberId,
      kind,
      short: clip(body, 78),
      full: body,
      title: event.title,
      sticky: false,
      ts: event.ts,
    });
    if (fading.length >= MAX_FADING) break;
  }

  return [...sticky.slice(0, MAX_STICKY), ...fading].slice(0, MAX_VISIBLE);
}

export function bubbleOpacity(bubble: SpeechBubble, now: number): number {
  if (bubble.sticky) return 1;
  const stamped = Date.parse(bubble.ts);
  if (!Number.isFinite(stamped)) return 1;
  const age = Math.max(0, now - stamped);
  return Math.max(0.45, 1 - age / FADE_MS);
}
