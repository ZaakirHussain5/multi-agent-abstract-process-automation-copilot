"""From a prompt to a team, then through collaboration, tools, and verification."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from app.models import (
    ActivityEvent,
    Approval,
    DeliverableResult,
    OpenQuestion,
    Question,
    SceneConfig,
    Session,
    TeamMemberSpec,
    TeamSpec,
    Template,
    Verification,
)
from app.scene import scene_for_brief
from app.prompts import (
    act_messages,
    clarify_messages,
    design_messages,
    monitor_messages,
    revise_messages,
    verify_messages,
)
from app.spec import (
    new_id,
    normalize_team,
    order_members,
    parse_json_object,
    parse_questions,
    tool_decision,
    validate_team,
)
from app.store import Store, utcnow
from app.tools import Registry, ToolContext


class APIError(Exception):
    def __init__(self, detail: str, status: int = 400):
        self.detail = detail
        self.status = status


def parse_turn(payload: dict[str, Any]) -> dict[str, Any]:
    questions = []
    for item in payload.get("open_questions") or []:
        if isinstance(item, str):
            item = {"question": item}
        if not isinstance(item, dict):
            continue
        question = str(item.get("question") or "").strip()
        if not question:
            continue
        questions.append(
            {
                "question": question,
                "blocking": bool(item.get("blocking")),
                "assumption": str(item.get("assumption") or "").strip(),
            }
        )
    handoffs = []
    for item in payload.get("handoffs") or []:
        if not isinstance(item, dict):
            continue
        task = str(item.get("task") or "").strip()
        if not task:
            continue
        handoffs.append({"to_role": str(item.get("to_role") or "").strip(), "task": task})
    tool_calls = []
    for item in payload.get("tool_calls") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("tool") or "").strip()
        if not name:
            continue
        args = item.get("args") if isinstance(item.get("args"), dict) else {}
        tool_calls.append({"tool": name, "args": args, "reason": str(item.get("reason") or "").strip()})
    deliverables = []
    for item in payload.get("deliverables") or []:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content") or "")
        if not content.strip():
            continue
        deliverables.append({"spec_id": str(item.get("spec_id") or ""), "content": content})
    challenges = [str(item).strip() for item in (payload.get("challenges") or []) if str(item).strip()]
    return {
        "message": str(payload.get("message") or "").strip(),
        "challenges": challenges,
        "open_questions": questions,
        "handoffs": handoffs,
        "tool_calls": tool_calls,
        "deliverables": deliverables,
    }


class Orchestrator:
    def __init__(
        self,
        store: Store,
        llm: Any,
        registry: Registry,
        *,
        data_dir: Path,
        step_delay: float = 0.16,
    ):
        self.store = store
        self.llm = llm
        self.registry = registry
        self.data_dir = Path(data_dir)
        self.step_delay = step_delay
        self._waiters: dict[str, asyncio.Event] = {}
        self._signals: dict[str, dict[str, Any]] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    async def start(self, prompt: str) -> Session:
        prompt = prompt.strip()
        if len(prompt) < 8:
            raise APIError("Describe the problem in a sentence or two.")
        now = utcnow()
        session = Session(
            id=new_id("s"),
            title=_title(prompt),
            prompt=prompt,
            status="clarifying",
            scene=scene_for_brief(prompt),
            created_at=now,
            updated_at=now,
        )
        self.store.save_session(session)
        try:
            raw = await self.llm.complete(messages=clarify_messages(prompt), model_hint="spark", json_mode=True)
            questions = parse_questions(parse_json_object(raw))
        except Exception as exc:
            self._fail(session.id, f"Could not draft clarifying questions: {exc}")
            raise APIError(f"Could not draft clarifying questions: {exc}", 502) from exc

        def apply(found: Session) -> None:
            found.questions = [Question.model_validate(item) for item in questions]

        return self.store.update_session(session.id, apply)

    async def submit_answers(self, session_id: str, answers: dict[str, str]) -> Session:
        session = self._session(session_id)
        if session.status != "clarifying":
            raise APIError("Answers are already in. Edit the team or run it.", 409)
        if not session.questions:
            raise APIError("There are no questions to answer.", 409)
        normalized: dict[str, str] = {}
        for question in session.questions:
            value = str(answers.get(question.id) or "").strip()
            normalized[question.id] = value or "No preference — use your judgment."

        def mark(found: Session) -> None:
            found.status = "designing"
            found.answers = normalized

        self.store.update_session(session_id, mark)
        try:
            raw = await self.llm.complete(
                messages=design_messages(session.prompt, normalized),
                model_hint="spark",
                json_mode=True,
            )
            team = normalize_team(parse_json_object(raw), repair=True)
        except Exception as exc:
            self._fail(session_id, f"Could not design a team: {exc}")
            raise APIError(f"Could not design a team: {exc}", 502) from exc

        def apply(found: Session) -> None:
            found.answers = normalized
            found.team = team
            found.status = "review"
            found.error = None
            found.summary = team.structure
            if found.scene is None or not found.scene.customized:
                found.scene = scene_for_brief(found.prompt + "\n" + "\n".join(normalized.values()))

        return self.store.update_session(session_id, apply)

    def save_scene(self, session_id: str, payload: dict[str, Any]) -> Session:
        self._session(session_id)
        try:
            scene = SceneConfig.model_validate(payload)
        except Exception as exc:
            raise APIError(f"That room configuration is not valid: {exc}") from exc
        scene.customized = True

        def apply(found: Session) -> None:
            found.scene = scene

        return self.store.update_session(session_id, apply)

    def save_team(self, session_id: str, payload: dict[str, Any]) -> Session:
        session = self._session(session_id)
        if session.status in {"running", "awaiting_approval", "awaiting_input"}:
            raise APIError("The team is in the middle of a run.", 409)
        try:
            team = normalize_team(payload, repair=False)
        except ValueError as exc:
            raise APIError(str(exc)) from exc

        def apply(found: Session) -> None:
            found.team = team
            found.status = "review"
            found.error = None
            found.summary = team.structure

        return self.store.update_session(session_id, apply)

    def start_run(self, session_id: str) -> Session:
        session = self._session(session_id)
        if session.team is None:
            raise APIError("Design a team before running it.", 409)
        if session.status in {"running", "awaiting_approval", "awaiting_input", "designing"}:
            raise APIError("This team is already running.", 409)
        existing = self._tasks.get(session_id)
        if existing and not existing.done():
            raise APIError("This team is already running.", 409)
        errors = validate_team(session.team, self.registry.names())
        if errors:
            raise APIError(" ".join(errors))

        def apply(found: Session) -> None:
            found.events = [
                ActivityEvent(
                    id=new_id("e"),
                    ts=utcnow(),
                    kind="status",
                    title="Run started",
                    body=found.team.structure if found.team else "",
                )
            ]
            found.approvals = []
            found.deliverables = []
            found.open_questions = []
            found.approve_all = False
            found.error = None
            found.status = "running"

        updated = self.store.update_session(session_id, apply)
        try:
            self._tasks[session_id] = asyncio.create_task(self._run(session_id))
        except RuntimeError as exc:
            self._fail(session_id, "Could not start the run because no event loop is running.")
            raise APIError("Could not start the run.", 500) from exc
        return updated

    def resolve_approval(
        self,
        session_id: str,
        approval_id: str,
        decision: str,
        *,
        approve_all: bool = False,
    ) -> Session:
        if decision not in {"approved", "denied"}:
            raise APIError("Decision must be approved or denied.")

        def apply(found: Session) -> None:
            if approve_all and decision == "approved":
                found.approve_all = True
            match = next((item for item in found.approvals if item.id == approval_id), None)
            if match is None:
                raise APIError("That approval is not on this session.", 404)
            if match.status != "pending":
                raise APIError("That approval was already resolved.", 409)
            match.status = decision  # type: ignore[assignment]
            match.resolved_at = utcnow()
            verb = "approved" if decision == "approved" else "denied"
            _append(
                found,
                kind="note",
                agent_id=match.agent_id,
                agent_name=match.agent_name,
                title=f"You {verb} {match.tool}",
                body="Further side effects in this run are pre-approved." if found.approve_all else match.reason,
            )

        updated = self.store.update_session(session_id, apply)
        self._signal(approval_id, {"decision": decision})
        return updated

    def answer_question(self, session_id: str, question_id: str, answer: str) -> Session:
        answer = answer.strip()
        if not answer:
            raise APIError("Write an answer first.")

        def apply(found: Session) -> None:
            match = next((item for item in found.open_questions if item.id == question_id), None)
            if match is None:
                raise APIError("That question is not on this session.", 404)
            match.answer = answer
            _append(
                found,
                kind="question",
                agent_id=match.agent_id,
                agent_name=match.agent_name,
                title="You answered",
                body=answer,
            )
            if found.status == "awaiting_input":
                found.status = "running"

        updated = self.store.update_session(session_id, apply)
        self._signal(question_id, {"answer": answer})
        return updated

    def save_template(self, session_id: str, name: str, description: str) -> Template:
        session = self._session(session_id)
        if session.team is None:
            raise APIError("There is no team to save yet.", 409)
        template = Template(
            id=new_id("tpl"),
            name=(name or session.team.name).strip() or session.team.name,
            description=(description or session.team.structure).strip(),
            team=session.team.model_copy(deep=True),
            source_prompt=session.prompt,
            created_at=utcnow(),
        )
        return self.store.save_template(template)

    def session_from_template(self, template_id: str, prompt: str | None = None) -> Session:
        try:
            template = self.store.get_template(template_id)
        except KeyError as exc:
            raise APIError("Template not found.", 404) from exc
        text = (prompt or template.source_prompt or template.team.mission).strip()
        team = template.team.model_copy(deep=True)
        if prompt and prompt.strip():
            team.mission = prompt.strip()
        now = utcnow()
        session = Session(
            id=new_id("s"),
            title=_title(text),
            prompt=text,
            status="review",
            team=team,
            scene=scene_for_brief(text),
            summary=team.structure,
            created_at=now,
            updated_at=now,
        )
        return self.store.save_session(session)

    async def monitor(self, team: TeamSpec, instruction: str) -> str:
        raw = await self.llm.complete(
            messages=monitor_messages(team, instruction),
            model_hint="spark",
            json_mode=True,
        )
        try:
            summary = str(parse_json_object(raw).get("summary") or "").strip()
        except (ValueError, TypeError):
            summary = ""
        return summary or "Check-in completed, with nothing new to flag."

    async def _run(self, session_id: str) -> None:
        try:
            await self._run_body(session_id)
        except asyncio.CancelledError:
            self._fail(session_id, "The run was cancelled.")
            raise
        except Exception as exc:  # noqa: BLE001
            self._fail(session_id, str(exc))

    async def _run_body(self, session_id: str) -> None:
        session = self._session(session_id)
        team = session.team
        if team is None:
            raise RuntimeError("No team to run.")
        members = order_members(team)
        inbox: dict[str, list[str]] = {member.id: [] for member in members}
        for index, member in enumerate(members):
            await self._pause()
            handoff = "\n".join(inbox.get(member.id) or [])
            raw = await self.llm.complete(
                messages=act_messages(member=member, team=team, handoff=handoff, tool_notes=""),
                model_hint=member.model_hint,
                json_mode=True,
            )
            try:
                turn = parse_turn(parse_json_object(raw))
            except (ValueError, TypeError) as exc:
                raise RuntimeError(f"{member.name} returned an unreadable turn: {exc}") from exc
            if turn["message"]:
                self._emit(
                    session_id,
                    kind="plan",
                    agent_id=member.id,
                    agent_name=member.name,
                    title=member.role,
                    body=turn["message"],
                )
            for challenge in turn["challenges"]:
                self._emit(
                    session_id,
                    kind="challenge",
                    agent_id=member.id,
                    agent_name=member.name,
                    title="Challenged an assumption",
                    body=challenge,
                )
            for question in turn["open_questions"]:
                await self._raise_question(session_id, member, question)
            self._route_handoffs(session_id, member, members, index, turn["handoffs"], inbox)
            self._store_drafts(session_id, member, turn["deliverables"])
            tool_notes = await self._run_tools(session_id, member, turn["tool_calls"])
            if tool_notes:
                self._emit(
                    session_id,
                    kind="note",
                    agent_id=member.id,
                    agent_name=member.name,
                    title="Folded tool results into the draft",
                    body=tool_notes[:500],
                )
            await self._verify_member(session_id, team, member)
        passed = [
            item
            for item in self._session(session_id).deliverables
            if item.verification and item.verification.passed
        ]
        total = len(self._session(session_id).deliverables)

        def finish(found: Session) -> None:
            found.status = "completed"
            found.error = None
            found.summary = f"{len(passed)} of {total} deliverables passed verification."
            _append(
                found,
                kind="status",
                title="Run complete",
                body=found.summary,
            )

        self.store.update_session(session_id, finish)

    async def _raise_question(self, session_id: str, member: TeamMemberSpec, question: dict[str, Any]) -> None:
        question_id = new_id("oq")

        def apply(found: Session) -> None:
            found.open_questions.append(
                OpenQuestion(
                    id=question_id,
                    agent_id=member.id,
                    agent_name=member.name,
                    question=question["question"],
                    blocking=question["blocking"],
                    assumption=question["assumption"],
                )
            )
            _append(
                found,
                kind="question",
                agent_id=member.id,
                agent_name=member.name,
                title="Open question" + (" · blocking" if question["blocking"] else ""),
                body=question["question"]
                + (f"\n\nProceeding on: {question['assumption']}" if question["assumption"] and not question["blocking"] else ""),
                meta={"question_id": question_id, "blocking": question["blocking"]},
            )
            if question["blocking"]:
                found.status = "awaiting_input"

        self.store.update_session(session_id, apply)
        if question["blocking"]:
            await self._wait(question_id)
            self._set_status(session_id, "running")

    def _route_handoffs(
        self,
        session_id: str,
        member: TeamMemberSpec,
        members: list[TeamMemberSpec],
        index: int,
        handoffs: list[dict[str, str]],
        inbox: dict[str, list[str]],
    ) -> None:
        routed = False
        for handoff in handoffs:
            target = _match_role(members, handoff["to_role"])
            if target is None or target.id == member.id:
                continue
            inbox[target.id].append(handoff["task"])
            routed = True
            self._emit(
                session_id,
                kind="handoff",
                agent_id=member.id,
                agent_name=member.name,
                title=f"Handed to {target.name}",
                body=handoff["task"],
                meta={"to": target.id},
            )
        if routed or index + 1 >= len(members):
            return
        nxt = members[index + 1]
        title = member.deliverables[0].title if member.deliverables else member.role
        task = f"Use {member.name}'s draft of “{title}” as input, and flag anything that fights your acceptance criteria."
        inbox[nxt.id].append(task)
        self._emit(
            session_id,
            kind="handoff",
            agent_id=member.id,
            agent_name=member.name,
            title=f"Handed to {nxt.name}",
            body=task,
            meta={"to": nxt.id},
        )

    def _store_drafts(self, session_id: str, member: TeamMemberSpec, drafts: list[dict[str, str]]) -> None:
        if not drafts:
            return
        specs = {item.id: item for item in member.deliverables}

        def apply(found: Session) -> None:
            used: set[str] = set()
            for draft in drafts:
                spec = specs.get(draft["spec_id"])
                if spec is None:
                    spec = next((item for item in member.deliverables if item.id not in used), None)
                if spec is None:
                    continue
                used.add(spec.id)
                found.deliverables.append(
                    DeliverableResult(
                        id=new_id("del"),
                        spec_id=spec.id,
                        member_id=member.id,
                        member_name=member.name,
                        title=spec.title,
                        kind=spec.kind,
                        content=draft["content"],
                        status="draft",
                        version=1,
                    )
                )
                _append(
                    found,
                    kind="deliverable",
                    agent_id=member.id,
                    agent_name=member.name,
                    title=spec.title,
                    body="Draft is ready for verification.",
                    meta={"spec_id": spec.id},
                )

        self.store.update_session(session_id, apply)

    async def _run_tools(self, session_id: str, member: TeamMemberSpec, calls: list[dict[str, Any]]) -> str:
        notes: list[str] = []
        for call in calls:
            name = call["tool"]
            if name not in member.allowed_tools:
                self._emit(
                    session_id,
                    kind="tool_result",
                    agent_id=member.id,
                    agent_name=member.name,
                    title=f"{name} blocked",
                    body="That tool is not on this member's spec.",
                )
                continue
            try:
                tool = self.registry.get(name)
            except KeyError:
                self._emit(
                    session_id,
                    kind="tool_result",
                    agent_id=member.id,
                    agent_name=member.name,
                    title=f"{name} is not registered",
                    body="Add it to the tool registry before a teammate can call it.",
                )
                continue
            session = self._session(session_id)
            decision = tool_decision(name, member.permission_level, side_effect=tool.side_effect)
            if session.approve_all and decision == "approve":
                decision = "allow"
            if decision == "deny":
                self._emit(
                    session_id,
                    kind="tool_result",
                    agent_id=member.id,
                    agent_name=member.name,
                    title=f"{name} denied by permission",
                    body=f"{member.name} is set to {member.permission_level}, which cannot take this action.",
                )
                continue
            if decision == "approve":
                approval_id = new_id("apr")

                def apply(found: Session, approval_id: str = approval_id, call: dict = call, name: str = name) -> None:
                    found.status = "awaiting_approval"
                    found.approvals.append(
                        Approval(
                            id=approval_id,
                            agent_id=member.id,
                            agent_name=member.name,
                            tool=name,
                            args=call["args"],
                            reason=call["reason"],
                            status="pending",
                            created_at=utcnow(),
                        )
                    )
                    _append(
                        found,
                        kind="tool_request",
                        agent_id=member.id,
                        agent_name=member.name,
                        title=f"Needs approval · {name}",
                        body=call["reason"] or "Side effect.",
                        meta={"approval_id": approval_id, "tool": name},
                    )

                self.store.update_session(session_id, apply)
                signal = await self._wait(approval_id)
                self._set_status(session_id, "running")
                if signal.get("decision") != "approved":
                    notes.append(f"{name} was denied.")
                    continue
            try:
                result = await self.registry.invoke(
                    name,
                    call["args"],
                    ToolContext(session_id=session_id, data_dir=self.data_dir, llm=self.llm),
                )
            except Exception as exc:  # noqa: BLE001
                self._emit(
                    session_id,
                    kind="tool_result",
                    agent_id=member.id,
                    agent_name=member.name,
                    title=f"{name} failed",
                    body=str(exc),
                )
                notes.append(f"{name} failed: {exc}")
                continue
            preview = _preview_result(result)
            self._emit(
                session_id,
                kind="tool_result",
                agent_id=member.id,
                agent_name=member.name,
                title=name,
                body=preview,
                meta={"tool": name},
            )
            notes.append(f"{name}: {preview}")
        return "\n".join(notes)

    async def _verify_member(self, session_id: str, team: TeamSpec, member: TeamMemberSpec) -> None:
        session = self._session(session_id)
        owned = [item for item in session.deliverables if item.member_id == member.id]
        spec_by_id = {item.id: item for item in member.deliverables}
        for deliverable in owned:
            spec = spec_by_id.get(deliverable.spec_id)
            criteria = spec.acceptance_criteria if spec else []
            self._set_deliverable_status(session_id, deliverable.id, "verifying")
            verification = await self._verify_once(member, deliverable, criteria)
            if not verification.passed:
                failed = [item.criterion for item in verification.criteria if not item.met]
                revised = await self._revise(member, deliverable, criteria, failed)
                if revised and revised != deliverable.content:
                    self._replace_content(session_id, deliverable.id, revised)
                    deliverable = self._deliverable(session_id, deliverable.id)
                    verification = await self._verify_once(member, deliverable, criteria)
            status = "passed" if verification.passed else "failed"
            self._set_verification(session_id, deliverable.id, verification, status)
            self._emit(
                session_id,
                kind="verification",
                agent_id=member.id,
                agent_name=member.name,
                title=("Passed" if verification.passed else "Failed") + f" · {deliverable.title}",
                body=verification.summary,
            )
        del team

    async def _verify_once(
        self,
        member: TeamMemberSpec,
        deliverable: DeliverableResult,
        criteria: list[str],
    ) -> Verification:
        raw = await self.llm.complete(
            messages=verify_messages(deliverable, criteria),
            model_hint=member.model_hint,
            json_mode=True,
        )
        try:
            return Verification.model_validate(parse_json_object(raw))
        except (ValueError, TypeError):
            from app.spec import heuristic_verify

            return Verification.model_validate(heuristic_verify(deliverable.content, criteria))

    async def _revise(
        self,
        member: TeamMemberSpec,
        deliverable: DeliverableResult,
        criteria: list[str],
        failed: list[str],
    ) -> str:
        raw = await self.llm.complete(
            messages=revise_messages(member, deliverable, criteria, failed),
            model_hint=member.model_hint,
            json_mode=True,
        )
        try:
            return str(parse_json_object(raw).get("content") or "")
        except (ValueError, TypeError):
            return ""

    async def _wait(self, key: str) -> dict[str, Any]:
        if key in self._signals:
            return self._signals.pop(key)
        event = asyncio.Event()
        self._waiters[key] = event
        await event.wait()
        self._waiters.pop(key, None)
        return self._signals.pop(key, {})

    def _signal(self, key: str, payload: dict[str, Any]) -> None:
        self._signals[key] = payload
        waiter = self._waiters.get(key)
        if waiter is not None:
            waiter.set()

    def _session(self, session_id: str) -> Session:
        try:
            return self.store.get_session(session_id)
        except KeyError as exc:
            raise APIError("Session not found.", 404) from exc

    def _emit(self, session_id: str, **kwargs: Any) -> None:
        def apply(found: Session) -> None:
            _append(found, **kwargs)

        self.store.update_session(session_id, apply)

    def _set_status(self, session_id: str, status: str) -> None:
        def apply(found: Session) -> None:
            if found.status != "error":
                found.status = status  # type: ignore[assignment]

        self.store.update_session(session_id, apply)

    def _fail(self, session_id: str, message: str) -> None:
        try:
            def apply(found: Session) -> None:
                if found.status == "completed":
                    return
                found.status = "error"
                found.error = message
                _append(found, kind="error", title="Run stopped", body=message)

            self.store.update_session(session_id, apply)
        except KeyError:
            return

    def _set_deliverable_status(self, session_id: str, deliverable_id: str, status: str) -> None:
        def apply(found: Session) -> None:
            for item in found.deliverables:
                if item.id == deliverable_id:
                    item.status = status  # type: ignore[assignment]

        self.store.update_session(session_id, apply)

    def _replace_content(self, session_id: str, deliverable_id: str, content: str) -> None:
        def apply(found: Session) -> None:
            for item in found.deliverables:
                if item.id == deliverable_id:
                    item.content = content
                    item.version += 1
                    item.status = "revised"

        self.store.update_session(session_id, apply)

    def _set_verification(self, session_id: str, deliverable_id: str, verification: Verification, status: str) -> None:
        def apply(found: Session) -> None:
            for item in found.deliverables:
                if item.id == deliverable_id:
                    item.verification = verification
                    item.status = status  # type: ignore[assignment]

        self.store.update_session(session_id, apply)

    def _deliverable(self, session_id: str, deliverable_id: str) -> DeliverableResult:
        session = self._session(session_id)
        for item in session.deliverables:
            if item.id == deliverable_id:
                return item
        raise RuntimeError("Deliverable disappeared during verification.")

    async def _pause(self) -> None:
        if self.step_delay > 0:
            await asyncio.sleep(self.step_delay)


def _append(session: Session, **kwargs: Any) -> None:
    session.events.append(ActivityEvent(id=new_id("e"), ts=utcnow(), **kwargs))


def _title(prompt: str) -> str:
    compact = " ".join(prompt.split())
    if len(compact) <= 72:
        return compact
    return compact[:71].rstrip() + "…"


def _match_role(members: list[TeamMemberSpec], role: str) -> TeamMemberSpec | None:
    if not role:
        return None
    lowered = role.lower()
    for member in members:
        if member.role.lower() == lowered or lowered in member.role.lower():
            return member
    return None


def _preview_result(result: dict[str, Any]) -> str:
    if "stdout" in result:
        stdout = str(result.get("stdout") or "").strip()
        error = result.get("error")
        if error:
            return f"{stdout}\n{error}".strip()
        return stdout or "Ran with no output."
    if "path" in result:
        return f"Wrote {result['path']} ({result.get('bytes', 0)} bytes)."
    if "image" in result:
        return "Image is attached to the tool result."
    if "text" in result:
        return str(result["text"])
    if "note" in result:
        return str(result["note"])
    if "body_preview" in result:
        return f"HTTP {result.get('status')}: {str(result['body_preview'])[:240]}"
    return str(result)[:400]
