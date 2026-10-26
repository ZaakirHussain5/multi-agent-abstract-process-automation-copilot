"""JSON/YAML persistence for sessions, team templates, and jobs."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

import yaml

from app.models import Job, Session, Template


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class Store:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.sessions_dir = self.root / "sessions"
        self.templates_dir = self.root / "templates"
        self.jobs_dir = self.root / "jobs"
        self.workspace_dir = self.root / "workspace"
        for path in (self.sessions_dir, self.templates_dir, self.jobs_dir, self.workspace_dir):
            path.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def save_session(self, session: Session) -> Session:
        with self._lock:
            self._write_json(self.sessions_dir / f"{session.id}.json", session.model_dump(mode="json"))
            return session.model_copy(deep=True)

    def get_session(self, session_id: str) -> Session:
        with self._lock:
            return self._read_session(session_id)

    def update_session(self, session_id: str, mutate) -> Session:
        with self._lock:
            session = self._read_session(session_id)
            mutate(session)
            session.updated_at = utcnow()
            self._write_json(self.sessions_dir / f"{session.id}.json", session.model_dump(mode="json"))
            return session.model_copy(deep=True)

    def list_sessions(self) -> list[Session]:
        with self._lock:
            sessions = [
                Session.model_validate(json.loads(path.read_text()))
                for path in self.sessions_dir.glob("*.json")
            ]
        sessions.sort(key=lambda item: item.updated_at, reverse=True)
        return sessions

    def mark_interrupted(self) -> None:
        for session in self.list_sessions():
            if session.status in {"running", "awaiting_approval", "awaiting_input", "designing"}:
                def mutate(found: Session, sid: str = session.id) -> None:
                    if found.id != sid:
                        return
                    found.status = "error"
                    found.error = "This run was interrupted by a restart. You can run the team again."

                self.update_session(session.id, mutate)

    def save_template(self, template: Template) -> Template:
        payload = template.model_dump(mode="json")
        with self._lock:
            self._write_json(self.templates_dir / f"{template.id}.json", payload)
            yaml_path = self.templates_dir / f"{template.id}.yaml"
            yaml_path.write_text(yaml.safe_dump(payload, sort_keys=False, allow_unicode=True))
        return template.model_copy(deep=True)

    def get_template(self, template_id: str) -> Template:
        with self._lock:
            path = self.templates_dir / f"{template_id}.json"
            if not path.exists():
                raise KeyError(template_id)
            return Template.model_validate(json.loads(path.read_text()))

    def list_templates(self) -> list[Template]:
        with self._lock:
            templates = [
                Template.model_validate(json.loads(path.read_text()))
                for path in self.templates_dir.glob("*.json")
            ]
        templates.sort(key=lambda item: item.created_at, reverse=True)
        return templates

    def delete_template(self, template_id: str) -> None:
        with self._lock:
            json_path = self.templates_dir / f"{template_id}.json"
            yaml_path = self.templates_dir / f"{template_id}.yaml"
            if not json_path.exists():
                raise KeyError(template_id)
            json_path.unlink()
            if yaml_path.exists():
                yaml_path.unlink()

    def save_job(self, job: Job) -> Job:
        with self._lock:
            self._write_json(self.jobs_dir / f"{job.id}.json", job.model_dump(mode="json"))
            return job.model_copy(deep=True)

    def get_job(self, job_id: str) -> Job:
        with self._lock:
            return self._read_job(job_id)

    def update_job(self, job_id: str, mutate) -> Job:
        with self._lock:
            job = self._read_job(job_id)
            mutate(job)
            self._write_json(self.jobs_dir / f"{job.id}.json", job.model_dump(mode="json"))
            return job.model_copy(deep=True)

    def list_jobs(self) -> list[Job]:
        with self._lock:
            jobs = [Job.model_validate(json.loads(path.read_text())) for path in self.jobs_dir.glob("*.json")]
        jobs.sort(key=lambda item: item.created_at, reverse=True)
        return jobs

    def delete_job(self, job_id: str) -> None:
        with self._lock:
            path = self.jobs_dir / f"{job_id}.json"
            if not path.exists():
                raise KeyError(job_id)
            path.unlink()

    def _read_session(self, session_id: str) -> Session:
        path = self.sessions_dir / f"{session_id}.json"
        if not path.exists():
            raise KeyError(session_id)
        return Session.model_validate(json.loads(path.read_text()))

    def _read_job(self, job_id: str) -> Job:
        path = self.jobs_dir / f"{job_id}.json"
        if not path.exists():
            raise KeyError(job_id)
        return Job.model_validate(json.loads(path.read_text()))

    @staticmethod
    def _write_json(path: Path, payload: dict) -> None:
        path.write_text(json.dumps(payload, indent=2))
