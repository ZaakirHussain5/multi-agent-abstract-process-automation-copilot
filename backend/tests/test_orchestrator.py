import asyncio
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.llm import MockProvider, OpenAICompatProvider
from app.main import create_app
from app.models import ProposedTool, ToolProposal
from app.orchestrator import APIError, Orchestrator, parse_turn
from app.prompts import clarify_messages, design_messages
from app.scene import scene_for_brief
from app.scheduler import Scheduler
from app.spec import new_id
from app.store import Store
from app.tools import ToolContext, build_registry


@pytest.fixture
def env(tmp_path: Path):
    store = Store(tmp_path)
    registry = build_registry()
    orch = Orchestrator(store, MockProvider(), registry, data_dir=tmp_path, step_delay=0)
    return store, orch, registry


def test_clarify_prompt_includes_the_brief():
    messages = clarify_messages("Open a weekend clinic for bike repair")
    assert "TASK: clarify" in messages[0]["content"]
    assert "bike repair" in messages[1]["content"]
    designed = design_messages(
        "Open a weekend clinic",
        {"q1": "Small"},
        [{"id": "q1", "prompt": "What does a successful outcome look like?"}],
    )
    assert "TASK: design" in designed[0]["content"]
    assert "Read the answers first" in designed[0]["content"]
    assert "QUESTIONNAIRE_JSON" in designed[1]["content"]
    assert "successful outcome" in designed[1]["content"]


def test_parse_turn_is_lenient():
    turn = parse_turn(
        {
            "message": "Starting.",
            "challenges": ["The scope is doing too much."],
            "open_questions": ["Who signs off?"],
            "handoffs": [{"to_role": "Engineer", "task": "Sketch the API."}],
            "tool_calls": [{"tool": "notes", "args": {"text": "hi"}, "reason": "remember"}],
            "deliverables": [{"spec_id": "d1", "content": "hello"}],
        }
    )
    assert turn["open_questions"][0]["blocking"] is False
    assert turn["tool_calls"][0]["tool"] == "notes"


@pytest.mark.asyncio
async def test_run_pauses_for_approval_then_verifies(env):
    store, orch, _registry = env
    session = await orch.start("Build a small invoicing API for freelance designers")
    assert len(session.questions) >= 3
    assert "invoicing" in session.questions[0].prompt.lower()
    answers = {question.id: "A documented first version I can try this week" for question in session.questions}
    session = await orch.submit_answers(session.id, answers)
    assert session.status == "review"
    assert session.team is not None
    assert any(member.model_hint == "code" for member in session.team.members)

    orch.start_run(session.id)
    current = store.get_session(session.id)
    for _ in range(50):
        current = store.get_session(session.id)
        if current.status in {"awaiting_approval", "completed", "error"}:
            break
        await _nap()
    assert current.status == "awaiting_approval", current.error
    assert current.deliverables, "drafts should land before the approval gate"
    assert any(event.kind == "challenge" for event in current.events)
    pending = next(item for item in current.approvals if item.status == "pending")
    orch.resolve_approval(session.id, pending.id, "approved", approve_all=True)
    await _nap(times=1)
    await __import__("asyncio").wait_for(orch._tasks[session.id], timeout=20)
    finished = store.get_session(session.id)
    assert finished.status == "completed", finished.error
    assert finished.deliverables
    assert all(item.verification is not None for item in finished.deliverables)
    assert any(item.verification and item.verification.passed for item in finished.deliverables)
    assert any(event.kind == "handoff" for event in finished.events)
    assert any(event.kind == "verification" for event in finished.events)
    assert any(event.kind == "question" for event in finished.events)


@pytest.mark.asyncio
async def test_sales_team_is_not_an_engineering_team(env):
    _store, orch, _registry = env
    session = await orch.start("Rebuild our outbound pipeline for mid-market deals")
    session = await orch.submit_answers(
        session.id,
        {question.id: "No preference — use your judgment" for question in session.questions},
    )
    roles = {member.role for member in session.team.members}
    assert "Engineer" not in roles
    assert session.team.domain == "sales"


@pytest.mark.asyncio
async def test_office_is_built_from_the_questionnaire_team(env):
    store, orch, _registry = env
    session = await orch.start("Launch the product on Friday")
    assert session.scene is None
    assert scene_for_brief(session.prompt).preset == "war_room"
    answer = "The outcome is a research read of the lab notes, not a campaign. Do not write code. Keep the team small."
    session = await orch.submit_answers(
        session.id,
        {question.id: answer for question in session.questions},
    )
    assert session.team is not None
    assert session.team.domain == "research"
    assert session.scene is not None
    assert session.scene.preset == "lab"
    assert any("lab notes" in member.persona.lower() for member in session.team.members)
    assert session.proposals
    assert all(item.status == "pending" for item in session.proposals)
    assert store.get_session(session.id).scene.preset == "lab"


@pytest.mark.asyncio
async def test_approving_a_proposal_registers_it_behind_the_same_gate(env):
    store, orch, registry = env
    session = await orch.start("Launch the product on Friday")
    answer = "The outcome is a research read of the lab notes, not a campaign. Do not write code."
    session = await orch.submit_answers(
        session.id,
        {question.id: answer for question in session.questions},
    )
    proposal = session.proposals[0]
    assert proposal.name not in registry.names()
    updated = orch.resolve_proposal(session.id, proposal.id, "approved")
    owner = next(member for member in updated.team.members if member.id == proposal.member_id)
    assert proposal.name in owner.allowed_tools
    assert updated.proposals[0].status == "approved"
    recorded = await orch._invoke_tool(session.id, proposal.name, {"note": "keep the lab notes"})
    assert recorded["ok"] is True

    builtin = ToolProposal(
        id="prop_builtin",
        member_id=owner.id,
        member_name=owner.name,
        name="web_search",
        description="Already a built-in.",
        side_effect=True,
        reason="Should not double-register.",
    )

    def add_builtin(found):
        found.proposals.append(builtin)

    store.update_session(session.id, add_builtin)
    with pytest.raises(APIError):
        orch.resolve_proposal(session.id, builtin.id, "approved")

    custom = ProposedTool(
        name="page-the-oncall",
        description="Page someone outside the workspace.",
        side_effect=True,
        reason="The lab notes named an on-call rotation.",
    )
    from app.tools import make_registered_tool

    orch._registered.setdefault(session.id, {})[custom.name] = make_registered_tool(custom)

    def allow_custom(found):
        found.status = "running"
        found.team.members[0].allowed_tools.append(custom.name)

    store.update_session(session.id, allow_custom)
    member = store.get_session(session.id).team.members[0]
    task = asyncio.create_task(
        orch._run_tools(
            session.id,
            member,
            [{"tool": custom.name, "args": {"who": "lead"}, "reason": "Page the on-call about the lab notes."}],
        )
    )
    pending = None
    for _ in range(40):
        current = store.get_session(session.id)
        pending = next((item for item in current.approvals if item.tool == custom.name and item.status == "pending"), None)
        if pending:
            break
        await asyncio.sleep(0.02)
    assert pending is not None
    orch.resolve_approval(session.id, pending.id, "approved")
    notes = await asyncio.wait_for(task, timeout=5)
    assert "page-the-oncall" in notes
    assert store.get_session(session.id).approvals[-1].status == "approved"


@pytest.mark.asyncio
async def test_user_can_edit_the_team_before_run(env):
    _store, orch, _registry = env
    session = await orch.start("Write a field guide for new warehouse supervisors")
    session = await orch.submit_answers(
        session.id,
        {question.id: "A short guide a supervisor can use on shift one" for question in session.questions},
    )
    payload = session.team.model_dump(mode="json")
    payload["members"] = payload["members"][:2]
    payload["members"][1]["role"] = "Shift Editor"
    payload["members"][1]["responsibilities"] = ["Keep the guide to one page"]
    updated = orch.save_team(session.id, payload)
    assert updated.team.members[1].role == "Shift Editor"
    assert len(updated.team.members) == 2


@pytest.mark.asyncio
async def test_template_and_job_roundtrip(env, tmp_path: Path):
    store, orch, _registry = env
    session = await orch.start("Plan the first month of a neighborhood tool library")
    session = await orch.submit_answers(
        session.id,
        {question.id: "Residents should be able to borrow without a staff meeting" for question in session.questions},
    )
    template = orch.save_template(session.id, "Library crew", "Reusable roster")
    yaml_path = tmp_path / "templates" / f"{template.id}.yaml"
    json_path = tmp_path / "templates" / f"{template.id}.json"
    assert yaml_path.exists()
    assert json_path.exists()
    loaded = json.loads(json_path.read_text())
    assert loaded["team"]["members"]
    cloned = orch.session_from_template(template.id, "Plan month two of the tool library")
    assert cloned.status == "review"
    assert "month two" in cloned.team.mission

    from app.models import Job
    from datetime import datetime, timedelta, timezone

    job = Job(
        id=new_id("job"),
        name="Library watch",
        instruction="Tell me if the borrowing assumption is still safe.",
        interval_minutes=60,
        enabled=True,
        team=cloned.team,
        source_session_id=cloned.id,
        created_at=cloned.created_at,
        next_run_at=(datetime.now(timezone.utc) + timedelta(minutes=60)).isoformat(),
    )
    store.save_job(job)
    scheduler = Scheduler(store, orch)
    finished = await scheduler.run_job(job.id)
    assert finished.runs[-1].status == "succeeded"
    assert "assumption" in finished.runs[-1].summary.lower() or "tool library" in finished.runs[-1].summary.lower()
    assert finished.last_run_at


@pytest.mark.asyncio
async def test_file_write_stays_in_the_workspace(env, tmp_path: Path):
    _store, _orch, registry = env
    ctx = ToolContext(session_id="s_test", data_dir=tmp_path, llm=MockProvider())
    written = await registry.invoke(
        "file_write",
        {"path": "notes.md", "content": "hello"},
        ctx,
    )
    assert written["path"] == "notes.md"
    assert (tmp_path / "workspace" / "s_test" / "notes.md").read_text() == "hello"
    with pytest.raises(ValueError):
        await registry.invoke("file_write", {"path": "../escape.md", "content": "no"}, ctx)
    code = await registry.invoke(
        "code_execute",
        {"code": "print(sum(range(3)))\nprint('ready')\n"},
        ctx,
    )
    assert code["ok"] is True
    assert "ready" in code["stdout"]
    with pytest.raises(ValueError):
        await registry.invoke("code_execute", {"code": "import os\nprint(os.getcwd())\n"}, ctx)


@pytest.mark.asyncio
async def test_openai_adapter_routes_muse_models():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        seen["auth"] = request.headers.get("authorization")
        if request.url.path.endswith("/images/generations"):
            return httpx.Response(200, json={"data": [{"b64_json": "aGVsbG8="}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": "{\"ok\": true}"}}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    settings = Settings(
        llm_provider="openai",
        llm_base_url="https://models.example.test/v1",
        llm_api_key="sk-test",
        muse_spark_model="muse-spark",
        muse_code_model="muse-code",
        muse_image_model="muse-image",
    )
    provider = OpenAICompatProvider(settings, client=client)
    text = await provider.complete(messages=[{"role": "user", "content": "hi"}], model_hint="code")
    assert text == '{"ok": true}'
    assert seen["body"]["model"] == "muse-code"
    assert seen["url"].endswith("/chat/completions")
    assert seen["auth"] == "Bearer sk-test"
    image = await provider.image(prompt="a diagram")
    assert image.startswith("data:image/png;base64,")
    assert seen["body"]["model"] == "muse-image"
    await client.aclose()


def test_run_endpoint_uses_the_server_loop(tmp_path: Path):
    settings = Settings(llm_provider="mock", data_dir=str(tmp_path / "data"))
    app = create_app(settings, step_delay=0)
    with TestClient(app) as client:
        created = client.post(
            "/api/sessions",
            json={"prompt": "Plan a weekend repair clinic for neighborhood bikes"},
        ).json()
        answers = {question["id"]: "A one-page plan I can hand to volunteers" for question in created["questions"]}
        client.post(f"/api/sessions/{created['id']}/answers", json={"answers": answers})
        started = client.post(f"/api/sessions/{created['id']}/run")
        assert started.status_code == 200, started.text
        assert started.json()["status"] == "running"


def test_http_api_lists_health_and_rejects_a_short_prompt(tmp_path: Path):
    settings = Settings(llm_provider="mock", data_dir=str(tmp_path / "data"))
    app = create_app(settings, step_delay=0)
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["provider"] == "mock"
        assert health.json()["models"]["spark"] == "muse-spark"
        bad = client.post("/api/sessions", json={"prompt": "no"})
        assert bad.status_code == 400
        tools = client.get("/api/tools").json()
        assert any(tool["name"] == "web_search" and tool["side_effect"] for tool in tools)


async def _nap(times: int = 1) -> None:
    import asyncio

    await asyncio.sleep(0.01 * times)
