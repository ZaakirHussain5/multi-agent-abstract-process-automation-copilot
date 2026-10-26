"""Shared schemas. Team specs are the unit of reuse; sessions are a run of one."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PermissionLevel = Literal["observe", "draft", "act_with_approval", "act"]
ModelHint = Literal["spark", "code", "image", "general"]
DeliverableKind = Literal["document", "code", "image", "research", "plan", "data"]
SessionStatus = Literal[
    "clarifying",
    "designing",
    "review",
    "running",
    "awaiting_approval",
    "awaiting_input",
    "completed",
    "error",
]
EventKind = Literal[
    "status",
    "plan",
    "challenge",
    "question",
    "handoff",
    "tool_request",
    "tool_result",
    "deliverable",
    "verification",
    "error",
    "note",
]
ApprovalStatus = Literal["pending", "approved", "denied"]
DeliverableStatus = Literal["draft", "verifying", "passed", "failed", "revised"]


class DeliverableSpec(BaseModel):
    id: str
    title: str
    description: str
    acceptance_criteria: list[str] = Field(default_factory=list)
    kind: DeliverableKind = "document"


class TeamMemberSpec(BaseModel):
    id: str
    name: str
    role: str
    expertise: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    deliverables: list[DeliverableSpec] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list)
    permission_level: PermissionLevel = "act_with_approval"
    model_hint: ModelHint = "spark"
    reports_to: str | None = None
    avatar_hue: int = 220


class TeamSpec(BaseModel):
    id: str
    name: str
    mission: str
    domain: str = "general"
    structure: str = ""
    members: list[TeamMemberSpec] = Field(default_factory=list)


class Question(BaseModel):
    id: str
    prompt: str
    rationale: str = ""
    placeholder: str = ""
    suggestions: list[str] = Field(default_factory=list)


class ActivityEvent(BaseModel):
    id: str
    ts: str
    agent_id: str | None = None
    agent_name: str | None = None
    kind: EventKind
    title: str
    body: str = ""
    meta: dict = Field(default_factory=dict)


class Approval(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    tool: str
    args: dict = Field(default_factory=dict)
    reason: str = ""
    status: ApprovalStatus = "pending"
    created_at: str
    resolved_at: str | None = None


class CriterionResult(BaseModel):
    criterion: str
    met: bool
    evidence: str = ""


class Verification(BaseModel):
    passed: bool
    criteria: list[CriterionResult] = Field(default_factory=list)
    summary: str = ""


class DeliverableResult(BaseModel):
    id: str
    spec_id: str
    member_id: str
    member_name: str
    title: str
    kind: DeliverableKind = "document"
    content: str = ""
    status: DeliverableStatus = "draft"
    verification: Verification | None = None
    version: int = 1


class OpenQuestion(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    question: str
    blocking: bool = False
    assumption: str = ""
    answer: str | None = None


class Session(BaseModel):
    id: str
    title: str
    prompt: str
    status: SessionStatus = "clarifying"
    questions: list[Question] = Field(default_factory=list)
    answers: dict[str, str] = Field(default_factory=dict)
    team: TeamSpec | None = None
    events: list[ActivityEvent] = Field(default_factory=list)
    approvals: list[Approval] = Field(default_factory=list)
    deliverables: list[DeliverableResult] = Field(default_factory=list)
    open_questions: list[OpenQuestion] = Field(default_factory=list)
    approve_all: bool = False
    error: str | None = None
    summary: str = ""
    created_at: str
    updated_at: str


class JobRun(BaseModel):
    id: str
    started_at: str
    finished_at: str | None = None
    status: Literal["running", "succeeded", "failed"] = "running"
    summary: str = ""


class Job(BaseModel):
    id: str
    name: str
    instruction: str
    interval_minutes: int = 60
    enabled: bool = True
    team: TeamSpec
    source_session_id: str | None = None
    created_at: str
    next_run_at: str
    last_run_at: str | None = None
    runs: list[JobRun] = Field(default_factory=list)


class Template(BaseModel):
    id: str
    name: str
    description: str = ""
    team: TeamSpec
    source_prompt: str = ""
    created_at: str


class ToolInfo(BaseModel):
    name: str
    description: str
    side_effect: bool
    parameters: dict = Field(default_factory=dict)
