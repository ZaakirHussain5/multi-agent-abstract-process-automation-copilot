"""In-process scheduler for teams that stay on after the chat.

Jobs persist on disk. The loop lives in the API process, so a restart resumes
from the saved next-run time. Unattended runs never fire side-effecting tools;
they write a monitoring note and wait for a person if something outward is needed.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from app.models import Job, JobRun
from app.orchestrator import Orchestrator
from app.spec import new_id
from app.store import Store, utcnow


class Scheduler:
    def __init__(self, store: Store, orchestrator: Orchestrator):
        self.store = store
        self.orchestrator = orchestrator
        self._busy: set[str] = set()

    async def loop(self) -> None:
        while True:
            try:
                await self.tick()
            except Exception:
                # A single bad job should not kill the loop. The job itself records the failure.
                pass
            await asyncio.sleep(5)

    async def tick(self) -> None:
        now = datetime.now(timezone.utc)
        for job in self.store.list_jobs():
            if not job.enabled or job.id in self._busy:
                continue
            try:
                due = datetime.fromisoformat(job.next_run_at)
            except ValueError:
                continue
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if due <= now:
                await self.run_job(job.id)

    async def run_job(self, job_id: str) -> Job:
        if job_id in self._busy:
            return self.store.get_job(job_id)
        self._busy.add(job_id)
        run_id = new_id("jr")
        try:
            job = self.store.get_job(job_id)
            interval = max(1, min(job.interval_minutes, 7 * 24 * 60))

            def start(found: Job) -> None:
                found.runs.append(
                    JobRun(id=run_id, started_at=utcnow(), status="running", summary="Checking in.")
                )
                found.runs = found.runs[-20:]
                found.next_run_at = _after(interval)

            self.store.update_job(job_id, start)
            try:
                summary = await self.orchestrator.monitor(job.team, job.instruction)
                status = "succeeded"
            except Exception as exc:  # noqa: BLE001
                summary = f"Check-in failed: {exc}"
                status = "failed"

            def finish(found: Job) -> None:
                found.last_run_at = utcnow()
                for run in found.runs:
                    if run.id == run_id:
                        run.status = status  # type: ignore[assignment]
                        run.summary = summary
                        run.finished_at = utcnow()

            return self.store.update_job(job_id, finish)
        finally:
            self._busy.discard(job_id)


def _after(minutes: int) -> str:
    moment = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(minutes=minutes)
    return moment.isoformat()
