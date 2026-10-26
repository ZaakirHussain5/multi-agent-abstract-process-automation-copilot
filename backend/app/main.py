"""Muster API."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel, Field

from app.config import Settings, load_settings
from app.llm import build_provider
from app.models import Job, SceneConfig
from app.orchestrator import APIError, Orchestrator
from app.prompts import scene_messages
from app.scene import scene_for_brief
from app.scheduler import Scheduler
from app.spec import new_id, parse_json_object, team_to_yaml
from app.store import Store, utcnow
from app.tools import build_registry


class PromptIn(BaseModel):
    prompt: str


class AnswersIn(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict)


class ApprovalIn(BaseModel):
    decision: Literal["approved", "denied"]
    approve_all: bool = False


class AnswerIn(BaseModel):
    answer: str


class TemplateIn(BaseModel):
    name: str = ""
    description: str = ""


class UseTemplateIn(BaseModel):
    prompt: str | None = None


class JobIn(BaseModel):
    source_session_id: str | None = None
    template_id: str | None = None
    name: str = ""
    instruction: str = ""
    interval_minutes: int = 60


class SceneIn(BaseModel):
    prompt: str
    base: dict[str, Any] | None = None


class JobPatch(BaseModel):
    enabled: bool | None = None
    interval_minutes: int | None = None
    name: str | None = None
    instruction: str | None = None


def create_app(settings: Settings | None = None, *, step_delay: float | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store = Store(settings.data_path)
        store.mark_interrupted()
        llm = build_provider(settings)
        registry = build_registry()
        delay = 0.16 if step_delay is None else step_delay
        orchestrator = Orchestrator(
            store,
            llm,
            registry,
            data_dir=settings.data_path,
            step_delay=delay,
        )
        scheduler = Scheduler(store, orchestrator)
        app.state.settings = settings
        app.state.store = store
        app.state.registry = registry
        app.state.orch = orchestrator
        app.state.scheduler = scheduler
        task = asyncio.create_task(scheduler.loop())
        yield
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    app = FastAPI(title="Muster", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(APIError)
    async def handle_api_error(_request: Request, exc: APIError) -> JSONResponse:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status)

    @app.exception_handler(KeyError)
    async def handle_missing(_request: Request, _exc: KeyError) -> JSONResponse:
        return JSONResponse({"detail": "Not found."}, status_code=404)

    @app.get("/api/health")
    def health(request: Request) -> dict[str, Any]:
        current: Settings = request.app.state.settings
        return {
            "ok": True,
            "provider": current.llm_provider,
            "models": {
                "spark": current.muse_spark_model,
                "code": current.muse_code_model,
                "image": current.muse_image_model,
            },
            "base_url": current.llm_base_url if current.llm_provider != "mock" else None,
        }

    @app.get("/api/tools")
    def tools(request: Request) -> list[dict[str, Any]]:
        return [item.model_dump(mode="json") for item in request.app.state.registry.info()]

    @app.post("/api/scene")
    async def interpret_scene(body: SceneIn, request: Request) -> dict[str, Any]:
        prompt = body.prompt.strip()
        if len(prompt) < 3:
            raise APIError("Say what the room should become.")
        base = SceneConfig.model_validate(body.base) if body.base else scene_for_brief(prompt)
        llm = request.app.state.orch.llm
        try:
            raw = await llm.complete(messages=scene_messages(prompt, base), model_hint="spark", json_mode=True)
            scene = SceneConfig.model_validate(parse_json_object(raw))
        except Exception:
            from app.scene import apply_scene_prompt

            scene = apply_scene_prompt(base, prompt)
        scene.source_prompt = prompt
        scene.customized = True
        try:
            scene.poster_image = await llm.image(
                prompt=f"Poster in the room titled {scene.poster_title}. {prompt}"
            )
        except Exception:
            scene.poster_image = scene.poster_image or ""
        return scene.model_dump(mode="json")

    @app.put("/api/sessions/{session_id}/scene")
    def put_scene(session_id: str, body: dict[str, Any], request: Request) -> dict[str, Any]:
        session = request.app.state.orch.save_scene(session_id, body)
        return session.model_dump(mode="json")

    @app.get("/api/sessions")
    def list_sessions(request: Request) -> list[dict[str, Any]]:
        return [_session_brief(item) for item in request.app.state.store.list_sessions()]

    @app.post("/api/sessions")
    async def create_session(body: PromptIn, request: Request) -> dict[str, Any]:
        session = await request.app.state.orch.start(body.prompt)
        return session.model_dump(mode="json")

    @app.get("/api/sessions/{session_id}")
    def get_session(session_id: str, request: Request) -> dict[str, Any]:
        return request.app.state.orch._session(session_id).model_dump(mode="json")

    @app.post("/api/sessions/{session_id}/answers")
    async def answers(session_id: str, body: AnswersIn, request: Request) -> dict[str, Any]:
        session = await request.app.state.orch.submit_answers(session_id, body.answers)
        return session.model_dump(mode="json")

    @app.put("/api/sessions/{session_id}/team")
    def put_team(session_id: str, body: dict[str, Any], request: Request) -> dict[str, Any]:
        session = request.app.state.orch.save_team(session_id, body)
        return session.model_dump(mode="json")

    @app.get("/api/sessions/{session_id}/team.yaml", response_class=PlainTextResponse)
    def team_yaml(session_id: str, request: Request) -> str:
        session = request.app.state.orch._session(session_id)
        if session.team is None:
            raise APIError("There is no team yet.", 404)
        return team_to_yaml(session.team)

    @app.post("/api/sessions/{session_id}/run")
    async def run(session_id: str, request: Request) -> dict[str, Any]:
        # Must be async: start_run schedules work on the running loop.
        # A sync endpoint is executed in a threadpool and has no loop.
        session = request.app.state.orch.start_run(session_id)
        return session.model_dump(mode="json")

    @app.post("/api/sessions/{session_id}/approvals/{approval_id}")
    def approve(session_id: str, approval_id: str, body: ApprovalIn, request: Request) -> dict[str, Any]:
        session = request.app.state.orch.resolve_approval(
            session_id,
            approval_id,
            body.decision,
            approve_all=body.approve_all,
        )
        return session.model_dump(mode="json")

    @app.post("/api/sessions/{session_id}/questions/{question_id}/answer")
    def answer(session_id: str, question_id: str, body: AnswerIn, request: Request) -> dict[str, Any]:
        session = request.app.state.orch.answer_question(session_id, question_id, body.answer)
        return session.model_dump(mode="json")

    @app.post("/api/sessions/{session_id}/template")
    def save_template(session_id: str, body: TemplateIn, request: Request) -> dict[str, Any]:
        template = request.app.state.orch.save_template(session_id, body.name, body.description)
        return template.model_dump(mode="json")

    @app.get("/api/templates")
    def list_templates(request: Request) -> list[dict[str, Any]]:
        return [item.model_dump(mode="json") for item in request.app.state.store.list_templates()]

    @app.get("/api/templates/{template_id}")
    def get_template(template_id: str, request: Request) -> dict[str, Any]:
        try:
            template = request.app.state.store.get_template(template_id)
        except KeyError as exc:
            raise APIError("Template not found.", 404) from exc
        payload = template.model_dump(mode="json")
        payload["yaml"] = team_to_yaml(template.team)
        return payload

    @app.delete("/api/templates/{template_id}")
    def delete_template(template_id: str, request: Request) -> dict[str, bool]:
        try:
            request.app.state.store.delete_template(template_id)
        except KeyError as exc:
            raise APIError("Template not found.", 404) from exc
        return {"ok": True}

    @app.post("/api/templates/{template_id}/use")
    def use_template(template_id: str, body: UseTemplateIn, request: Request) -> dict[str, Any]:
        session = request.app.state.orch.session_from_template(template_id, body.prompt)
        return session.model_dump(mode="json")

    @app.get("/api/jobs")
    def list_jobs(request: Request) -> list[dict[str, Any]]:
        return [item.model_dump(mode="json") for item in request.app.state.store.list_jobs()]

    @app.post("/api/jobs")
    def create_job(body: JobIn, request: Request) -> dict[str, Any]:
        store: Store = request.app.state.store
        orch: Orchestrator = request.app.state.orch
        team = None
        source_session = None
        if body.source_session_id:
            session = orch._session(body.source_session_id)
            if session.team is None:
                raise APIError("That session has no team yet.", 409)
            team = session.team
            source_session = session.id
            default_name = session.team.name
            default_instruction = f"Monitor outcomes for: {session.prompt[:240]}"
        elif body.template_id:
            try:
                template = store.get_template(body.template_id)
            except KeyError as exc:
                raise APIError("Template not found.", 404) from exc
            team = template.team
            default_name = template.name
            default_instruction = f"Monitor outcomes for: {template.team.mission[:240]}"
        else:
            raise APIError("Choose a session or a template to keep on.")
        interval = max(1, min(int(body.interval_minutes or 60), 7 * 24 * 60))
        now = datetime.now(timezone.utc).replace(microsecond=0)
        job = Job(
            id=new_id("job"),
            name=(body.name or default_name).strip() or default_name,
            instruction=(body.instruction or default_instruction).strip(),
            interval_minutes=interval,
            enabled=True,
            team=team.model_copy(deep=True),
            source_session_id=source_session,
            created_at=utcnow(),
            next_run_at=(now + timedelta(minutes=interval)).isoformat(),
        )
        return store.save_job(job).model_dump(mode="json")

    @app.patch("/api/jobs/{job_id}")
    def patch_job(job_id: str, body: JobPatch, request: Request) -> dict[str, Any]:
        store: Store = request.app.state.store

        def apply(found: Job) -> None:
            if body.enabled is not None:
                found.enabled = body.enabled
            if body.name is not None and body.name.strip():
                found.name = body.name.strip()
            if body.instruction is not None and body.instruction.strip():
                found.instruction = body.instruction.strip()
            if body.interval_minutes is not None:
                found.interval_minutes = max(1, min(int(body.interval_minutes), 7 * 24 * 60))

        try:
            job = store.update_job(job_id, apply)
        except KeyError as exc:
            raise APIError("Job not found.", 404) from exc
        return job.model_dump(mode="json")

    @app.delete("/api/jobs/{job_id}")
    def delete_job(job_id: str, request: Request) -> dict[str, bool]:
        try:
            request.app.state.store.delete_job(job_id)
        except KeyError as exc:
            raise APIError("Job not found.", 404) from exc
        return {"ok": True}

    @app.post("/api/jobs/{job_id}/run")
    async def run_job(job_id: str, request: Request) -> dict[str, Any]:
        try:
            job = await request.app.state.scheduler.run_job(job_id)
        except KeyError as exc:
            raise APIError("Job not found.", 404) from exc
        return job.model_dump(mode="json")

    return app


def _session_brief(session) -> dict[str, Any]:
    return {
        "id": session.id,
        "title": session.title,
        "status": session.status,
        "summary": session.summary,
        "domain": session.team.domain if session.team else None,
        "updated_at": session.updated_at,
        "created_at": session.created_at,
    }


app = create_app()
