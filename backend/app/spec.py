"""Team-spec logic that does not depend on a live model.

Roles are invented from the clarifying questionnaire: the brief, the questions,
and the user's answers. Decisive answers are read first and can overrule a
keyword in the brief. A small set of work signals only decides the domain, the
deliverable kind, and which registry tools the person may call. There is no
catalog of job titles.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from typing import Any

import yaml

from app.models import (
    DeliverableKind,
    DeliverableSpec,
    ModelHint,
    PermissionLevel,
    ProposedTool,
    TeamMemberSpec,
    TeamSpec,
)

DEFAULT_TOOLS = {
    "web_search",
    "http_request",
    "code_execute",
    "file_write",
    "notes",
    "image_generate",
}

PERMISSIONS = {"observe", "draft", "act_with_approval", "act"}
MODEL_HINTS = {"spark", "code", "image", "general"}
KINDS = {"document", "code", "image", "research", "plan", "data"}

_FIRST = [
    "Amina",
    "Leo",
    "Priya",
    "Jonah",
    "Sofia",
    "Kenji",
    "Maya",
    "Elena",
    "Noah",
    "Hana",
    "Idris",
    "Clara",
    "Mateo",
    "Ines",
    "Ravi",
    "Noor",
]
_LAST = [
    "Okoye",
    "Marchetti",
    "Shah",
    "Adler",
    "Nguyen",
    "Sato",
    "Ibarra",
    "Vogel",
    "Rahman",
    "Berg",
    "Diallo",
    "Cho",
    "Almeida",
    "Petrov",
    "Hassan",
    "Klein",
]

_STOP = {
    "the", "and", "for", "with", "that", "this", "from", "into", "about", "your",
    "our", "their", "what", "when", "where", "which", "who", "how", "why", "can",
    "could", "should", "would", "will", "just", "than", "then", "them", "they",
    "have", "has", "had", "been", "being", "were", "was", "are", "is", "a", "an",
    "of", "to", "in", "on", "at", "by", "or", "as", "it", "its", "we", "you",
    "i", "me", "my", "please", "help", "need", "want", "make", "build", "create",
    "design", "plan", "write", "run", "set", "up", "using", "use", "across",
}


@dataclass(frozen=True)
class WorkSignal:
    """A reason to staff someone. The role title is not stored here."""

    key: str
    triggers: tuple[str, ...]
    tools: tuple[str, ...]
    permission: PermissionLevel
    model_hint: ModelHint
    kind: DeliverableKind
    craft: str
    focus: str


# Signals choose tools and a domain. They are not roles.
WORK_SIGNALS: tuple[WorkSignal, ...] = (
    WorkSignal(
        key="engineering",
        triggers=("engineer", "engineering", "code", "api", "software", "backend", "frontend", "bug", "implement", "script"),
        tools=("code_execute", "file_write", "notes"),
        permission="act_with_approval",
        model_hint="code",
        kind="code",
        craft="working build",
        focus="turn the brief into something that runs and can be checked",
    ),
    WorkSignal(
        key="marketing",
        triggers=("marketing", "campaign", "brand", "content", "launch", "seo", "audience", "social"),
        tools=("web_search", "notes", "file_write", "image_generate"),
        permission="act_with_approval",
        model_hint="image",
        kind="document",
        craft="public voice",
        focus="say one sharp thing to a specific audience",
    ),
    WorkSignal(
        key="design",
        triggers=("visual", "logo", "ui", "interface", "illustration", "packaging", "creative"),
        tools=("image_generate", "file_write", "notes"),
        permission="act_with_approval",
        model_hint="image",
        kind="image",
        craft="visual frame",
        focus="make the idea legible at a glance",
    ),
    WorkSignal(
        key="sales",
        triggers=("sales", "pipeline", "leads", "deal", "outbound", "revenue", "quota", "crm", "customers"),
        tools=("web_search", "notes"),
        permission="act_with_approval",
        model_hint="spark",
        kind="plan",
        craft="buyer path",
        focus="define the offer, the buyer, and the next conversation",
    ),
    WorkSignal(
        key="research",
        triggers=("research", "investigate", "analyze", "competitor", "landscape", "study", "literature"),
        tools=("web_search", "notes"),
        permission="act_with_approval",
        model_hint="spark",
        kind="research",
        craft="evidence pass",
        focus="separate what is known from what is only assumed",
    ),
    WorkSignal(
        key="analysis",
        triggers=("metric", "metrics", "forecast", "dashboard", "kpi", "finance", "pricing", "conversion", "churn"),
        tools=("code_execute", "notes"),
        permission="act_with_approval",
        model_hint="spark",
        kind="data",
        craft="measure pass",
        focus="define the number before arguing about it",
    ),
    WorkSignal(
        key="recruiting",
        triggers=("hire", "hiring", "recruit", "recruiting", "candidate", "talent", "interview"),
        tools=("web_search", "notes", "file_write"),
        permission="act_with_approval",
        model_hint="spark",
        kind="document",
        craft="search loop",
        focus="make the search and the loop unambiguous",
    ),
    WorkSignal(
        key="operations",
        triggers=("operations", "process", "workflow", "logistics", "sop", "runbook", "warehouse", "oncall", "on-call"),
        tools=("notes", "file_write"),
        permission="act_with_approval",
        model_hint="spark",
        kind="plan",
        craft="handoff map",
        focus="find where work waits, breaks, or gets redone",
    ),
    WorkSignal(
        key="writing",
        triggers=("writing", "blog", "report", "whitepaper", "documentation", "narrative", "essay", "copywriting"),
        tools=("notes", "file_write"),
        permission="draft",
        model_hint="spark",
        kind="document",
        craft="readable draft",
        focus="package the team's thinking so a stranger can use it",
    ),
    WorkSignal(
        key="risk",
        triggers=("legal", "compliance", "policy", "risk", "contract", "privacy", "security", "safety"),
        tools=("notes", "web_search"),
        permission="draft",
        model_hint="spark",
        kind="document",
        craft="downside note",
        focus="name the downside before the team commits",
    ),
    WorkSignal(
        key="strategy",
        triggers=("strategy", "roadmap", "prioritize", "priority", "portfolio"),
        tools=("notes", "web_search"),
        permission="act_with_approval",
        model_hint="spark",
        kind="plan",
        craft="cut list",
        focus="choose what not to do",
    ),
)

_GENERAL = WorkSignal(
    key="general",
    triggers=(),
    tools=("notes", "web_search"),
    permission="act_with_approval",
    model_hint="spark",
    kind="document",
    craft="scope note",
    focus="translate the brief into the decisions that matter here",
)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _hash(seed: str) -> bytes:
    return hashlib.sha256(seed.encode("utf-8")).digest()


def pick_name(seed: str) -> str:
    digest = _hash(seed)
    return f"{_FIRST[digest[0] % len(_FIRST)]} {_LAST[digest[1] % len(_LAST)]}"


_LEAD_VERBS = {
    "design",
    "build",
    "write",
    "plan",
    "map",
    "create",
    "make",
    "launch",
    "recruit",
    "hire",
    "investigate",
    "organize",
    "organise",
    "draft",
    "prepare",
    "fix",
    "improve",
    "research",
    "analyze",
    "analyse",
}


def topic_label(prompt: str, limit: int = 8) -> str:
    """A readable noun phrase from the brief, not a bag of keywords."""

    raw = " ".join(prompt.strip().split())
    raw = re.split(r"[.?!,;:\n]", raw)[0].strip()
    words = raw.split()
    if words and words[0].lower() in _LEAD_VERBS and len(words) > 3:
        words = words[1:]
    if len(words) >= 2 and words[0].lower() == "stand" and words[1].lower() == "up":
        words = words[2:]
    label = " ".join(words[:limit]).strip(" -")
    if not label:
        return "this brief"
    return label[:1].upper() + label[1:]


def topic_inline(prompt: str) -> str:
    label = topic_label(prompt)
    if label == "this brief":
        return label
    return label[:1].lower() + label[1:]


def _score(text: str, triggers: tuple[str, ...]) -> int:
    score = 0
    for trigger in triggers:
        if re.search(rf"\b{re.escape(trigger)}\b", text):
            score += 2 if len(trigger) > 5 else 1
    return score


def _content_words(prompt: str) -> list[str]:
    """Words the brief actually uses, in order, with filler removed."""

    found: list[str] = []
    seen: set[str] = set()
    for token in re.findall(r"[A-Za-z][A-Za-z0-9+'-]*", topic_label(prompt)):
        key = token.lower()
        if key in _STOP or key in _LEAD_VERBS or len(key) < 3:
            continue
        if key in seen:
            continue
        seen.add(key)
        found.append(token)
    return found or ["brief"]


def _rank_signals(text: str) -> list[tuple[int, WorkSignal]]:
    ranked = [(_score(text, signal.triggers), signal) for signal in WORK_SIGNALS]
    ranked.sort(key=lambda item: item[0], reverse=True)
    return ranked


def _role_title(words: list[str], craft: str, index: int) -> str:
    primary = words[index % len(words)]
    secondary = words[(index + 1) % len(words)]
    if secondary.lower() == primary.lower():
        return f"{primary.title()} {craft}"
    return f"{primary.title()} {secondary.lower()} {craft}"


def _silhouette(digest: bytes) -> str:
    return ("tall", "compact", "broad")[digest[4] % 3]


def _persona(name: str, role: str, topic: str, tools: list[str]) -> str:
    tool_list = ", ".join(tools) if tools else "notes"
    return (
        f"{name} shows up as {role} on {topic}. "
        f"They reach for {tool_list}, and they will send work back when a handoff skips the acceptance criteria."
    )


def _proposed_tool(topic: str) -> ProposedTool:
    slug = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")[:42] or "brief"
    name = f"{slug}-memory"
    return ProposedTool(
        name=name,
        description=f"Remember decisions, sources, and open assumptions for {topic} across handoffs.",
        side_effect=False,
        reason=f"The registry can search and write files, but nothing in it keeps a running memory of {topic}.",
    )


def specialist_cap(answers_text: str) -> int:
    lowered = answers_text.lower()
    if re.search(r"\b(small|lean|tiny|minimal|solo)\b", lowered):
        return 2
    if re.search(r"\b(thorough|comprehensive|full team|large team|deep)\b", lowered):
        return 4
    return 3


def _criteria(topic: str, kind: str, title: str) -> list[str]:
    specific = {
        "code": "Includes a runnable sketch and states how to tell it worked.",
        "image": "The visual can be read without the surrounding essay, and it names the idea in the frame.",
        "research": "Separates evidence from inference and lists what is still unknown.",
        "plan": "Sequences the work and names the owner of the next step.",
        "data": "Defines the metric, the comparison, and what would falsify the read.",
        "document": "A reader outside the team can act on it without a meeting.",
    }[kind if kind in KINDS else "document"]
    return [
        f"Directly addresses {topic} rather than a generic template.",
        f"{title} states the assumptions that would change the recommendation.",
        specific,
    ]


def _deferral(text: str) -> bool:
    lowered = text.lower()
    return "no preference" in lowered or "use your judgment" in lowered or "use your judgement" in lowered


def decisive_answers(answers: dict[str, str] | None) -> list[str]:
    """Answers that actually decide something. Deferrals are not decisions."""

    lines: list[str] = []
    for value in (answers or {}).values():
        text = " ".join(str(value).split())
        if not text or _deferral(text):
            continue
        lines.append(text)
    return lines


def _phrase_words(text: str) -> list[str]:
    words: list[str] = []
    seen: set[str] = set()
    for chunk in re.split(r"[\n]+", text):
        for word in _content_words(chunk):
            key = word.lower()
            if key in seen:
                continue
            seen.add(key)
            words.append(word)
    return words or ["brief"]


def _signals_for(text: str) -> list[WorkSignal]:
    """Read the questionnaire text for which kinds of work were actually asked for."""

    ranked = [signal for score, signal in _rank_signals(text.lower()) if score > 0]
    lowered = text.lower()
    kept: list[WorkSignal] = []
    for signal in ranked:
        if signal.key == "engineering" and re.search(
            r"\b(no|not|without|don't|do not)\b.{0,40}\bcode\b", lowered
        ):
            continue
        if signal.key == "marketing" and re.search(
            r"\b(no|not|without|n't)\b.{0,40}\b(campaign|marketing)\b", lowered
        ):
            continue
        kept.append(signal)
    return kept


def _reasoned_title(words: list[str], index: int) -> str:
    primary = words[index % len(words)]
    secondary = words[(index + 1) % len(words)]
    if secondary.lower() == primary.lower():
        # A one-word answer still needs a distinct seat when the team grows.
        if index == 0:
            return f"{primary.title()} partner"
        return f"{primary.title()} partner {index + 1}"
    return f"{primary.title()} {secondary.lower()} partner"


def _persona_from(name: str, role: str, heard: str) -> str:
    if heard:
        return (
            f"{name} is the {role} because the questionnaire said “{_clip(heard, 180)}”. "
            "They will not widen the work past that answer."
        )
    return (
        f"{name} is the {role}. The questionnaire left the outcome open, "
        "so this seat follows the brief the user originally wrote."
    )


def _employee(
    signal: WorkSignal,
    *,
    words: list[str],
    topic: str,
    mission: str,
    lead_id: str | None,
    index: int,
    role: str | None = None,
    heard: str = "",
    craft: str | None = None,
) -> TeamMemberSpec:
    seed = f"{mission}|{signal.key}|{role or craft or signal.craft}|{index}"
    digest = _hash(seed)
    role = role or _reasoned_title(words, index)
    tools = list(signal.tools)
    # Marketing briefs that are really about a look still use Muse Image.
    # Code stays off unless the signal itself is the engineering or analysis lane.
    hint: ModelHint = signal.model_hint
    title = f"{role}: {topic}"
    kind: DeliverableKind = signal.kind
    return TeamMemberSpec(
        id=f"m_{digest.hex()[:10]}",
        name=pick_name(seed),
        role=role,
        expertise=[topic, signal.focus, words[index % len(words)]],
        responsibilities=[
            f"Own the {kind} work for {topic}.",
            f"Push on the assumption that would change this {role.lower()} recommendation.",
            f"Hand the next teammate a concrete input, with caveats, so they can {signal.focus}.",
        ],
        deliverables=[
            DeliverableSpec(
                id=f"d_{digest.hex()[10:20]}",
                title=title,
                description=f"{signal.focus.capitalize()} for the mission: {mission[:240]}",
                acceptance_criteria=_criteria(topic, kind, title),
                kind=kind,
            )
        ],
        allowed_tools=tools,
        permission_level=signal.permission,
        model_hint=hint,
        reports_to=lead_id,
        avatar_hue=(digest[2] * 360) // 256,
        persona=_persona_from(pick_name(seed), role, heard),
        silhouette=_silhouette(digest),  # type: ignore[arg-type]
        proposed_tools=[],
    )


def design_team(
    prompt: str,
    answers: dict[str, str] | None = None,
    questions: list[dict] | None = None,
) -> TeamSpec:
    """Mock stand-in for Muse designing a team from the questionnaire.

    Decisive answers are read first. The brief is used only where an answer
    deferred ("no preference") or never mentioned the point. Job titles and
    personas quote that reading. Tools follow the same reading, including
    when an answer rules a kind of work out.
    """

    answers = answers or {}
    heard = decisive_answers(answers)
    # Titles and personas quote the answers. The brief is the fallback only
    # when every answer deferred or the questionnaire was never shown.
    title_source = "\n".join(heard) if heard else prompt
    # Domain and tools read the whole questionnaire. A negation in an answer
    # ("do not write code", "not a campaign") drops that lane even if the
    # brief named it.
    signal_source = "\n".join([prompt, *heard]) if heard else prompt
    topic = topic_label(prompt)
    words = _phrase_words(title_source)
    # Size is an answer, not a word that happened to appear in the brief.
    cap = specialist_cap("\n".join(answers.values()))
    chosen = _signals_for(signal_source)[:cap]
    domain = chosen[0].key if chosen else "general"

    mission = prompt.strip()
    if heard:
        mission = prompt.strip() + "\n\nFrom the questionnaire:\n" + "\n".join(f"- {line}" for line in heard)

    lead_seed = f"lead|{mission}"
    lead_digest = _hash(lead_seed)
    lead_id = f"m_{lead_digest.hex()[:10]}"
    lead_name = pick_name(lead_seed)
    lead_tools = ["web_search", "notes"]
    lead_role = _reasoned_title(words, 0).replace(" partner", " lead")
    lead_title = f"Team plan: {topic}"
    proposal = _proposed_tool(heard[0] if heard else topic)
    lead_heard = heard[0] if heard else ""
    lead = TeamMemberSpec(
        id=lead_id,
        name=lead_name,
        role=lead_role,
        expertise=[topic, "framing", "coordination", "review"],
        responsibilities=[
            "Frame the mission so every teammate can challenge it.",
            "Keep the questionnaire visible when the work starts to drift.",
            "Refuse a deliverable that does not meet its acceptance criteria.",
        ],
        deliverables=[
            DeliverableSpec(
                id=f"d_{lead_digest.hex()[10:20]}",
                title=lead_title,
                description="The operating plan for this team: outcome, sequence, and what will be verified.",
                acceptance_criteria=_criteria(topic, "plan", lead_title),
                kind="plan",
            )
        ],
        allowed_tools=lead_tools,
        permission_level="act_with_approval",
        model_hint="spark",
        reports_to=None,
        avatar_hue=(lead_digest[2] * 360) // 256,
        persona=_persona_from(lead_name, lead_role, lead_heard),
        silhouette=_silhouette(lead_digest),  # type: ignore[arg-type]
        proposed_tools=[proposal],
    )

    specialists: list[TeamMemberSpec] = []
    used_roles = {lead.role.lower()}

    def take_role(index: int) -> str:
        role = _reasoned_title(words, index + 1)
        bump = 0
        while role.lower() in used_roles and bump < 6:
            bump += 1
            role = _reasoned_title(words, index + 1 + bump)
        return role

    for index, signal in enumerate(chosen):
        role = take_role(index)
        line = heard[index % len(heard)] if heard else ""
        member = _employee(
            signal,
            words=words,
            topic=topic,
            mission=mission,
            lead_id=lead_id,
            index=index,
            role=role,
            heard=line,
        )
        used_roles.add(member.role.lower())
        specialists.append(member)

    slot = 0
    while len(specialists) < min(2, cap):
        role = take_role(len(specialists) + slot)
        line = heard[(len(specialists) + slot) % len(heard)] if heard else ""
        member = _employee(
            _GENERAL,
            words=words,
            topic=topic,
            mission=mission,
            lead_id=lead_id,
            index=len(specialists) + slot,
            role=role,
            heard=line,
        )
        slot += 1
        if member.role.lower() in used_roles:
            if slot > 8:
                break
            continue
        used_roles.add(member.role.lower())
        specialists.append(member)

    if cap >= 4 and len(specialists) < cap:
        role = take_role(len(specialists) + 3)
        line = heard[-1] if heard else ""
        extra = _employee(
            _GENERAL,
            words=words,
            topic=topic,
            mission=mission,
            lead_id=lead_id,
            index=len(specialists) + 3,
            role=role,
            heard=line,
        )
        if extra.role.lower() not in used_roles:
            specialists.append(extra)

    members = [lead, *specialists]
    question_bits = []
    for item in questions or []:
        if isinstance(item, dict) and item.get("prompt"):
            question_bits.append(str(item["prompt"]).strip())
    heard_bits = " ".join(f"Heard “{line}”." for line in heard) or "The questionnaire left the outcome to the brief."
    asked = (" Asked: " + " ".join(question_bits)) if question_bits else ""
    structure_bits = [
        f"{lead.name} ({lead.role}) holds the team to the questionnaire. {heard_bits}{asked}"
    ]
    for member in specialists:
        structure_bits.append(
            f"{member.name} ({member.role}) reports to {lead.name} and owns “{member.deliverables[0].title}”."
        )
    structure_bits.append(
        f"{lead.name} suggests {proposal.name}, which is not registered until someone approves it. "
        "Teammates plan, challenge assumptions, hand work across, and verify on their own. "
        "A person is asked only when a tool would leave the workspace."
    )
    team = TeamSpec(
        id=f"t_{_hash(mission)[:6].hex()}",
        name=f"{topic[:48]} team",
        mission=mission,
        domain=domain,
        structure=" ".join(structure_bits),
        members=members,
    )
    errors = validate_team(team)
    if errors:
        raise RuntimeError("designer produced an invalid team: " + "; ".join(errors))
    return team


def tool_decision(tool_name: str, permission: str, *, side_effect: bool) -> str:
    """Return allow, approve, or deny for a tool call under a member's permission."""

    if tool_name not in DEFAULT_TOOLS and tool_name != "notes":
        # Unknown tools are not executed. Known custom tools still honor the gate.
        pass
    if not side_effect:
        return "deny" if permission == "observe" and tool_name not in {"notes"} else "allow"
    if permission == "observe":
        return "deny"
    if permission == "act":
        return "allow"
    return "approve"


def order_members(team: TeamSpec) -> list[TeamMemberSpec]:
    """Parents before children. Cycles do not raise; leftovers keep their original order."""

    by_id = {member.id: member for member in team.members}
    children: dict[str | None, list[TeamMemberSpec]] = {}
    for member in team.members:
        parent = member.reports_to if member.reports_to in by_id and member.reports_to != member.id else None
        if member.reports_to is None:
            parent = None
        children.setdefault(parent, []).append(member)

    ordered: list[TeamMemberSpec] = []
    seen: set[str] = set()

    def walk(parent: str | None) -> None:
        for member in children.get(parent, []):
            if member.id in seen:
                continue
            seen.add(member.id)
            ordered.append(member)
            walk(member.id)

    walk(None)
    for member in team.members:
        if member.id not in seen:
            ordered.append(member)
    return ordered


def validate_team(team: TeamSpec, known_tools: set[str] | None = None) -> list[str]:
    known = known_tools or DEFAULT_TOOLS
    errors: list[str] = []
    if not team.name.strip():
        errors.append("Team name is required.")
    if not team.mission.strip():
        errors.append("Mission is required.")
    if not 2 <= len(team.members) <= 8:
        errors.append("A team needs between 2 and 8 members.")
    member_ids = [member.id for member in team.members]
    if len(member_ids) != len(set(member_ids)):
        errors.append("Member ids must be unique.")
    deliverable_ids: list[str] = []
    id_set = set(member_ids)
    for member in team.members:
        label = member.name or member.id or "member"
        if not member.name.strip():
            errors.append("Every member needs a name.")
        if not member.role.strip():
            errors.append(f"{label} needs a role.")
        if not member.expertise:
            errors.append(f"{label} needs at least one area of expertise.")
        if not member.responsibilities:
            errors.append(f"{label} needs at least one responsibility.")
        if member.permission_level not in PERMISSIONS:
            errors.append(f"{label} has an unknown permission level.")
        if member.model_hint not in MODEL_HINTS:
            errors.append(f"{label} has an unknown model hint.")
        if member.reports_to is not None and member.reports_to not in id_set:
            errors.append(f"{label} reports to someone who is not on the team.")
        if member.reports_to == member.id:
            errors.append(f"{label} cannot report to themselves.")
        unknown = [tool for tool in member.allowed_tools if tool not in known]
        if unknown:
            errors.append(f"{label} lists unknown tools: {', '.join(unknown)}.")
        if not member.deliverables:
            errors.append(f"{label} needs at least one deliverable.")
        for deliverable in member.deliverables:
            deliverable_ids.append(deliverable.id)
            if not deliverable.title.strip():
                errors.append(f"{label} has a deliverable without a title.")
            if not deliverable.description.strip():
                errors.append(f"{deliverable.title or label} needs a description.")
            if deliverable.kind not in KINDS:
                errors.append(f"{deliverable.title or label} has an unknown kind.")
            criteria = [item.strip() for item in deliverable.acceptance_criteria if item.strip()]
            if not criteria:
                errors.append(f"{deliverable.title or label} needs acceptance criteria.")
    if len(deliverable_ids) != len(set(deliverable_ids)):
        errors.append("Deliverable ids must be unique.")
    if _has_cycle(team):
        errors.append("Reporting lines contain a cycle.")
    return errors


def _has_cycle(team: TeamSpec) -> bool:
    graph = {member.id: member.reports_to for member in team.members}
    for start in graph:
        seen: set[str] = set()
        cursor: str | None = start
        while cursor:
            if cursor in seen:
                return True
            seen.add(cursor)
            cursor = graph.get(cursor)
    return False


def _clean_str_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned = []
    for value in values:
        text = str(value).strip()
        if text:
            cleaned.append(text)
    return cleaned


def _infer_hint(role: str, tools: list[str]) -> ModelHint:
    blob = role.lower() + " " + " ".join(tools)
    if any(token in blob for token in ("engineer", "code", "developer")):
        return "code"
    if any(token in blob for token in ("design", "visual", "image", "brand")):
        return "image"
    return "spark"


def coerce_member(raw: dict[str, Any], index: int, *, repair: bool) -> TeamMemberSpec:
    if not isinstance(raw, dict):
        raw = {}
    member_id = str(raw.get("id") or new_id("m"))
    name = str(raw.get("name") or "").strip()
    role = str(raw.get("role") or "").strip()
    if repair:
        name = name or f"Teammate {index + 1}"
        role = role or "Specialist"
    expertise = _clean_str_list(raw.get("expertise"))
    responsibilities = _clean_str_list(raw.get("responsibilities"))
    if repair and not expertise:
        expertise = [role or "generalist"]
    if repair and not responsibilities:
        responsibilities = [f"Deliver the work described for {role or 'this role'}."]
    tools = _clean_str_list(raw.get("allowed_tools"))
    tools = [tool for tool in tools if tool in DEFAULT_TOOLS] if repair else tools
    if repair and not tools:
        tools = ["notes"]
    permission = str(raw.get("permission_level") or "act_with_approval")
    if permission not in PERMISSIONS:
        permission = "act_with_approval" if repair else permission
    hint = str(raw.get("model_hint") or "")
    if hint not in MODEL_HINTS:
        hint = _infer_hint(role, tools) if repair else (hint or "spark")
    reports_to = raw.get("reports_to")
    reports_to = str(reports_to) if reports_to else None
    try:
        hue = int(raw.get("avatar_hue", 220)) % 360
    except (TypeError, ValueError):
        hue = 220
    persona = str(raw.get("persona") or "").strip()
    if repair and not persona:
        persona = f"{name or role or 'This teammate'} owns {role or 'the work'} and will say when a handoff is incomplete."
    silhouette = str(raw.get("silhouette") or "compact")
    if silhouette not in {"tall", "compact", "broad"}:
        silhouette = "compact"
    proposed_tools: list[ProposedTool] = []
    raw_proposed = raw.get("proposed_tools") or []
    if isinstance(raw_proposed, list):
        for item in raw_proposed:
            if not isinstance(item, dict):
                continue
            proposed_name = str(item.get("name") or "").strip()
            if not proposed_name:
                continue
            proposed_tools.append(
                ProposedTool(
                    name=proposed_name,
                    description=str(item.get("description") or "").strip() or f"Proposed tool {proposed_name}.",
                    side_effect=bool(item.get("side_effect", False)),
                    reason=str(item.get("reason") or "").strip(),
                )
            )
    deliverables_raw = raw.get("deliverables") or []
    deliverables: list[DeliverableSpec] = []
    if isinstance(deliverables_raw, list):
        for offset, item in enumerate(deliverables_raw):
            if not isinstance(item, dict):
                continue
            kind = str(item.get("kind") or "document")
            if kind not in KINDS:
                kind = "document" if repair else kind
            criteria = _clean_str_list(item.get("acceptance_criteria"))
            title = str(item.get("title") or "").strip()
            description = str(item.get("description") or "").strip()
            if repair:
                title = title or f"{role or 'Work'} deliverable"
                description = description or f"Work product owned by {name or role}."
                if not criteria:
                    criteria = [f"Addresses the mission and is specific to {title}."]
            deliverables.append(
                DeliverableSpec(
                    id=str(item.get("id") or new_id("d")),
                    title=title,
                    description=description,
                    acceptance_criteria=criteria,
                    kind=kind,  # type: ignore[arg-type]
                )
            )
    if repair and not deliverables:
        deliverables.append(
            DeliverableSpec(
                id=new_id("d"),
                title=f"{role} deliverable",
                description=f"Primary work product for {name}.",
                acceptance_criteria=["States a recommendation and the assumption behind it."],
                kind="document",
            )
        )
    return TeamMemberSpec(
        id=member_id,
        name=name,
        role=role,
        expertise=expertise,
        responsibilities=responsibilities,
        deliverables=deliverables,
        allowed_tools=tools,
        permission_level=permission,  # type: ignore[arg-type]
        model_hint=hint,  # type: ignore[arg-type]
        reports_to=reports_to,
        avatar_hue=hue,
        persona=persona,
        silhouette=silhouette,  # type: ignore[arg-type]
        proposed_tools=proposed_tools,
    )


def normalize_team(data: dict[str, Any], *, repair: bool) -> TeamSpec:
    if not isinstance(data, dict):
        raise ValueError("Team spec must be an object.")
    if "members" not in data and isinstance(data.get("team"), dict):
        data = data["team"]
    raw_members = data.get("members") or []
    if not isinstance(raw_members, list):
        raise ValueError("Team members must be a list.")
    members = [coerce_member(item, index, repair=repair) for index, item in enumerate(raw_members)]
    # Drop duplicate ids by regenerating when repairing.
    if repair:
        seen: set[str] = set()
        for member in members:
            if member.id in seen:
                member.id = new_id("m")
            seen.add(member.id)
        seen_d: set[str] = set()
        for member in members:
            for deliverable in member.deliverables:
                if deliverable.id in seen_d:
                    deliverable.id = new_id("d")
                seen_d.add(deliverable.id)
        if members and all(member.reports_to for member in members):
            members[0].reports_to = None
        ids = {member.id for member in members}
        for member in members:
            if member.reports_to and member.reports_to not in ids:
                member.reports_to = None
    team = TeamSpec(
        id=str(data.get("id") or new_id("t")),
        name=str(data.get("name") or ("Untitled team" if repair else "")).strip(),
        mission=str(data.get("mission") or ("" if not repair else "Mission not specified.")).strip(),
        domain=str(data.get("domain") or "general").strip() or "general",
        structure=str(data.get("structure") or "").strip(),
        members=members,
    )
    errors = validate_team(team)
    if errors:
        raise ValueError(" ".join(errors))
    return team


def team_to_yaml(team: TeamSpec) -> str:
    payload = team.model_dump(mode="json")
    return yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)


def team_from_yaml(text: str, *, repair: bool = False) -> TeamSpec:
    loaded = yaml.safe_load(text)
    if not isinstance(loaded, dict):
        raise ValueError("YAML did not contain a team object.")
    return normalize_team(loaded, repair=repair)


def team_to_json(team: TeamSpec) -> str:
    return json.dumps(team.model_dump(mode="json"), indent=2)


def team_from_json(text: str, *, repair: bool = False) -> TeamSpec:
    loaded = json.loads(text)
    if not isinstance(loaded, dict):
        raise ValueError("JSON did not contain a team object.")
    return normalize_team(loaded, repair=repair)


def parse_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        loaded = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            raise
        loaded = json.loads(match.group(0))
    if not isinstance(loaded, dict):
        raise ValueError("Expected a JSON object.")
    return loaded


def heuristic_questions(prompt: str) -> dict[str, Any]:
    inline = topic_inline(prompt)
    specific = f"What would you refuse to compromise on for {inline}, even if the team has to cut everything else?"
    return {
        "questions": [
            {
                "id": "q1",
                "prompt": f"What does a successful outcome look like for {topic_inline(prompt)}?",
                "rationale": "The team sizes its work to the outcome, not to a default playbook.",
                "placeholder": "A concrete artifact, a decision, or a system that keeps running.",
                "suggestions": [
                    "A document I can forward without rewriting",
                    "A recommendation with the tradeoff made explicit",
                    "A first version I can try this week",
                ],
            },
            {
                "id": "q2",
                "prompt": "Who is this for, and which constraint is non-negotiable?",
                "rationale": "Audience and constraint change who belongs on the team.",
                "placeholder": "Name the reader, buyer, user, or operator, and the hard limit.",
                "suggestions": [
                    "Internal team, and time is the hard limit",
                    "External customers, and trust is the hard limit",
                    "Just me, and I want a small team",
                ],
            },
            {
                "id": "q3",
                "prompt": specific,
                "rationale": "This is the question the brief still leaves open.",
                "placeholder": "Be specific. The team will treat this as a requirement.",
                "suggestions": [
                    "Optimize for clarity over coverage",
                    "Be thorough, even if the team is larger",
                    "No preference — use your judgment",
                ],
            },
            {
                "id": "q4",
                "prompt": "When the team is unsure, or about to take an action outside this workspace, what should they do?",
                "rationale": "Sets the approval posture before anyone runs a tool.",
                "placeholder": "Ask me, proceed and label assumptions, or draft only.",
                "suggestions": [
                    "Draft only, and ask me before anything outward-facing",
                    "Proceed, and label every assumption",
                    "Ask me when you are blocked",
                ],
            },
        ]
    }


def parse_questions(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("questions") if isinstance(payload, dict) else None
    if not isinstance(raw, list) or not raw:
        raise ValueError("The planner did not return any clarifying questions.")
    questions = []
    for index, item in enumerate(raw[:6]):
        if isinstance(item, str):
            item = {"prompt": item}
        if not isinstance(item, dict):
            continue
        prompt = str(item.get("prompt") or "").strip()
        if not prompt:
            continue
        suggestions = _clean_str_list(item.get("suggestions"))[:4]
        questions.append(
            {
                "id": str(item.get("id") or f"q{index + 1}"),
                "prompt": prompt,
                "rationale": str(item.get("rationale") or "").strip(),
                "placeholder": str(item.get("placeholder") or "").strip(),
                "suggestions": suggestions,
            }
        )
    if len(questions) < 2:
        raise ValueError("The planner needs to ask at least two questions.")
    # Ensure unique ids.
    seen: set[str] = set()
    for question in questions:
        if question["id"] in seen:
            question["id"] = new_id("q")
        seen.add(question["id"])
    return questions


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def render_deliverable(
    member: TeamMemberSpec,
    spec: DeliverableSpec,
    mission: str,
    *,
    tool_notes: str = "",
    revision_notes: str = "",
) -> str:
    topic = topic_label(mission)
    if spec.kind == "image":
        return _render_svg(member, spec, topic, mission)
    if spec.kind == "code":
        return _render_code(member, spec, topic, mission, tool_notes, revision_notes)
    return _render_doc(member, spec, topic, mission, tool_notes, revision_notes)


def _render_doc(
    member: TeamMemberSpec,
    spec: DeliverableSpec,
    topic: str,
    mission: str,
    tool_notes: str,
    revision_notes: str,
) -> str:
    criteria = "\n".join(
        f"- {item}\n  Evidence: this draft names “{topic}”, states the assumption below, and ends with a next step."
        for item in spec.acceptance_criteria
    )
    notes = f"\n\n## Tool notes\n{tool_notes}\n" if tool_notes else ""
    revision = f"\n\n## Revision\n{revision_notes}\n" if revision_notes else ""
    return f"""# {spec.title}

Prepared by {member.name}, {member.role}.

## Recommendation

Treat “{topic}” as the whole job. {_clip(mission, 320)}

{member.name} recommends a narrow first pass: do the part of the work that would still be useful if the tightest constraint in the brief turned out to be real, and write down what was left out.

## Assumptions

- The brief is the source of scope. Anything not stated is an assumption, not a requirement.
- Success is the outcome described by the requester, not a larger program of work.
- External facts were not treated as verified unless a tool result says they were.

## What {member.role.lower()} will stand behind

{spec.description}

Responsibilities carried into this draft:

{chr(10).join(f"- {item}" for item in member.responsibilities)}

## Next step

Hand this to the teammate who owns the following deliverable and ask them to challenge the assumption they trust least. If they cannot name one, the draft is not finished.
{notes}{revision}
## Acceptance check

{criteria}
"""


def _render_code(
    member: TeamMemberSpec,
    spec: DeliverableSpec,
    topic: str,
    mission: str,
    tool_notes: str,
    revision_notes: str,
) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", topic.lower()).strip("_") or "work"
    criteria = "\n".join(
        f"- {item}\n  Evidence: the sketch below is runnable and prints a readiness line for {topic}."
        for item in spec.acceptance_criteria
    )
    notes = f"\nTool notes: {tool_notes}\n" if tool_notes else ""
    revision = f"\nRevision: {revision_notes}\n" if revision_notes else ""
    return f"""# {spec.title}

Prepared by {member.name}, {member.role}.

## Recommendation

Ship a small, inspectable sketch for {topic} before any larger build. Mission context: {_clip(mission, 280)}

Assumption: a first version that can be read in one sitting is more useful than a framework.

```python
focus = {slug!r}
checks = ["scope_named", "assumption_visible", "next_step_present"]
print("focus", focus)
print("checks", len(checks))
print("ready")
```

## How to tell it worked

Running the sketch prints `ready`. That is a scaffold, not the product. The next edit should replace `checks` with the real acceptance checks from this brief.
{notes}{revision}
## Acceptance check

{criteria}
"""


def _render_svg(member: TeamMemberSpec, spec: DeliverableSpec, topic: str, mission: str) -> str:
    title = _clip(spec.title, 42)
    subtitle = _clip(topic, 64)
    caption = _clip(mission, 90)
    # Escape XML.
    def esc(value: str) -> str:
        return (
            value.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    criteria = " · ".join(_clip(item, 48) for item in spec.acceptance_criteria[:2])
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#101114"/>
  <rect x="48" y="48" width="864" height="444" rx="18" fill="#181a1f" stroke="#2a2d34"/>
  <text x="80" y="112" fill="#8b8d98" font-family="Inter, Helvetica, sans-serif" font-size="14" letter-spacing="2">{esc(member.role.upper())}</text>
  <text x="80" y="168" fill="#f4f4f5" font-family="Inter, Helvetica, sans-serif" font-size="36" font-weight="600">{esc(title)}</text>
  <text x="80" y="214" fill="#c4c6d0" font-family="Inter, Helvetica, sans-serif" font-size="18">{esc(subtitle)}</text>
  <text x="80" y="276" fill="#9a9cab" font-family="Inter, Helvetica, sans-serif" font-size="16">{esc(caption)}</text>
  <rect x="80" y="320" width="240" height="88" rx="12" fill="#22252c"/>
  <rect x="344" y="320" width="240" height="88" rx="12" fill="#22252c"/>
  <rect x="608" y="320" width="240" height="88" rx="12" fill="#22252c"/>
  <text x="104" y="360" fill="#d9dbe3" font-family="Inter, Helvetica, sans-serif" font-size="14">Frame</text>
  <text x="104" y="384" fill="#8b8d98" font-family="Inter, Helvetica, sans-serif" font-size="13">One idea, named</text>
  <text x="368" y="360" fill="#d9dbe3" font-family="Inter, Helvetica, sans-serif" font-size="14">Proof</text>
  <text x="368" y="384" fill="#8b8d98" font-family="Inter, Helvetica, sans-serif" font-size="13">Assumption visible</text>
  <text x="632" y="360" fill="#d9dbe3" font-family="Inter, Helvetica, sans-serif" font-size="14">Next</text>
  <text x="632" y="384" fill="#8b8d98" font-family="Inter, Helvetica, sans-serif" font-size="13">A step someone owns</text>
  <text x="80" y="456" fill="#6f7280" font-family="Inter, Helvetica, sans-serif" font-size="12">{esc(criteria)}</text>
</svg>"""


def heuristic_verify(content: str, criteria: list[str]) -> dict[str, Any]:
    text = content.strip()
    lowered = text.lower()
    results = []
    for criterion in criteria:
        met = _criterion_met(lowered, criterion) and len(text) > 80
        evidence = _evidence_sentence(text, criterion) if met else "The draft does not show this criterion."
        results.append({"criterion": criterion, "met": met, "evidence": evidence})
    passed = bool(results) and all(item["met"] for item in results)
    if passed:
        summary = "Every acceptance criterion is visible in the draft."
    else:
        missing = sum(1 for item in results if not item["met"])
        summary = f"{missing} acceptance criterion failed."
    return {"passed": passed, "criteria": results, "summary": summary}


def _criterion_met(lowered_content: str, criterion: str) -> bool:
    fragment = criterion.strip().lower()
    if not fragment:
        return False
    if fragment in lowered_content:
        return True
    words = [word for word in re.findall(r"[a-z0-9']{5,}", fragment) if word not in _STOP]
    if not words:
        return fragment[:24] in lowered_content
    hits = sum(1 for word in words if word in lowered_content)
    return hits >= max(1, min(3, len(words)))


def _evidence_sentence(content: str, criterion: str) -> str:
    for line in content.splitlines():
        if criterion[:48].lower() in line.lower():
            return _clip(line, 180)
    for line in content.splitlines():
        if line.strip() and not line.startswith("#"):
            return _clip(line, 180)
    return "Present in the draft."


def mock_act(
    member: TeamMemberSpec,
    mission: str,
    *,
    handoff_from: str = "",
    tool_notes: str = "",
    already_tooled: bool = False,
) -> dict[str, Any]:
    topic = topic_label(mission)
    challenge = (
        f"I do not want to treat the constraints on “{topic}” as complete. "
        f"If time, risk, or audience is tighter than the brief says, "
        f"“{member.deliverables[0].title}” should get narrower, not vaguer."
    )
    question = {
        "question": f"Is there a stakeholder for {topic} who can veto {member.role.lower()} decisions after this draft?",
        "blocking": False,
        "assumption": "No hidden veto. The requester is the decision maker until they say otherwise.",
    }
    deliverables = [
        {
            "spec_id": spec.id,
            "content": render_deliverable(member, spec, mission, tool_notes=tool_notes),
        }
        for spec in member.deliverables
    ]
    tool_calls: list[dict[str, Any]] = []
    if not already_tooled:
        tool_calls.extend(_mock_tool_call(member, mission))
    handoffs = []
    if handoff_from:
        challenge = f"Taking the handoff (“{_clip(handoff_from, 140)}”). " + challenge
    return {
        "message": (
            f"{member.name} is working {member.deliverables[0].title}. "
            f"The draft stays tied to {topic} and names the assumption it depends on."
        ),
        "challenges": [challenge],
        "open_questions": [question],
        "handoffs": handoffs,
        "tool_calls": tool_calls,
        "deliverables": deliverables,
    }


def _mock_tool_call(member: TeamMemberSpec, mission: str) -> list[dict[str, Any]]:
    topic = topic_label(mission)
    preferred = [tool for tool in member.allowed_tools if tool != "notes"]
    if not preferred:
        return [
            {
                "tool": "notes",
                "args": {"text": f"Assumption: scope for {topic} is exactly the brief."},
                "reason": "Record the assumption before drafting.",
            }
        ]
    tool = preferred[0]
    if tool == "web_search":
        args: dict[str, Any] = {"query": topic}
        reason = "Look for public context before treating the brief as complete."
    elif tool == "code_execute":
        slug = re.sub(r"[^a-z0-9]+", "_", topic.lower()).strip("_") or "work"
        args = {
            "code": (
                f"focus = {slug!r}\n"
                "checks = ['scope_named', 'assumption_visible', 'next_step_present']\n"
                "print('focus', focus)\n"
                "print('checks', len(checks))\n"
                "print('ready')\n"
            )
        }
        reason = "Run a tiny readiness check used in the engineering draft."
    elif tool == "file_write":
        args = {
            "path": "notes.md",
            "content": f"# Working note\n\nScope: {topic}\n\nAssumption: the brief is complete until challenged.\n",
        }
        reason = "Leave a working note in the session workspace."
    elif tool == "image_generate":
        args = {"prompt": f"A quiet editorial diagram of {topic}, three labeled stages, dark background"}
        reason = "Produce a visual the deliverable can stand next to."
    elif tool == "http_request":
        args = {"url": "https://example.com", "method": "GET"}
        reason = "Fetch a public page referenced by the brief."
    else:
        args = {}
        reason = "Use the allowed tool."
    return [{"tool": tool, "args": args, "reason": reason}]


def mock_handoff(member: TeamMemberSpec, nxt: TeamMemberSpec | None) -> dict[str, str] | None:
    if nxt is None:
        return None
    return {
        "to_role": nxt.role,
        "task": (
            f"Use “{member.deliverables[0].title}” as input. "
            f"Flag anything that conflicts with your own acceptance criteria."
        ),
    }


def mock_monitor(team: TeamSpec, instruction: str) -> str:
    topic = topic_label(team.mission)
    return (
        f"Watch on “{team.name}”. Instruction: {_clip(instruction, 180)}. "
        f"No outward action was taken; unattended runs do not fire side effects. "
        f"The outcome to keep watching for {topic} is still the one in the original mission. "
        f"Nothing in the saved deliverables contradicts that brief. "
        f"Next check should confirm the requester still agrees with the assumption each lead draft named."
    )
