"""Provider-agnostic language layer.

MockProvider runs the product with no keys. OpenAICompatProvider targets Meta's
Model API through the OpenAI-compatible chat and images endpoints. Muse Spark
is the planner, Muse Code is used for engineering roles, and Muse Image is used
for visual work. Model ids are environment variables because the public names
may change.
"""

from __future__ import annotations

import json
from typing import Protocol

import httpx

from app.config import Settings
from app.models import SceneConfig
from app.scene import apply_scene_prompt
from app.spec import design_team, heuristic_questions, heuristic_verify, mock_act, topic_label


class LLMProvider(Protocol):
    async def complete(
        self,
        *,
        messages: list[dict[str, str]],
        model_hint: str,
        json_mode: bool = True,
    ) -> str: ...

    async def image(self, *, prompt: str) -> str: ...


class MockProvider:
    """Deterministic stand-in. Behavior follows the TASK marker in the system prompt."""

    async def complete(
        self,
        *,
        messages: list[dict[str, str]],
        model_hint: str,
        json_mode: bool = True,
    ) -> str:
        del model_hint, json_mode
        system = messages[0]["content"] if messages else ""
        user = messages[-1]["content"] if messages else ""
        if "TASK: clarify" in system:
            prompt = _after(user, "USER_PROMPT:\n")
            return json.dumps(heuristic_questions(prompt))
        if "TASK: design" in system:
            if "QUESTIONNAIRE_JSON:\n" in user:
                prompt = _between(user, "USER_PROMPT:\n", "\n\nQUESTIONNAIRE_JSON:\n")
                questions_raw = _between(user, "QUESTIONNAIRE_JSON:\n", "\n\nANSWERS_JSON:\n")
            else:
                prompt = _between(user, "USER_PROMPT:\n", "\n\nANSWERS_JSON:\n")
                questions_raw = "[]"
            answers_raw = _after(user, "ANSWERS_JSON:\n")
            try:
                answers = json.loads(answers_raw) if answers_raw else {}
            except json.JSONDecodeError:
                answers = {}
            try:
                questions = json.loads(questions_raw) if questions_raw else []
            except json.JSONDecodeError:
                questions = []
            if not isinstance(answers, dict):
                answers = {}
            if not isinstance(questions, list):
                questions = []
            team = design_team(
                prompt,
                {str(k): str(v) for k, v in answers.items()},
                [item for item in questions if isinstance(item, dict)],
            )
            return team.model_dump_json()
        if "TASK: scene" in system:
            prompt = _between(user, "USER_PROMPT:\n", "\n\nCURRENT_SCENE_JSON:\n")
            current_raw = _after(user, "CURRENT_SCENE_JSON:\n")
            try:
                current = SceneConfig.model_validate_json(current_raw)
            except Exception:
                current = SceneConfig()
            return apply_scene_prompt(current, prompt).model_dump_json()
        if "TASK: act" in system:
            context = json.loads(_after(user, "CONTEXT_JSON:\n"))
            from app.models import TeamMemberSpec

            member = TeamMemberSpec.model_validate(context["you"])
            return json.dumps(
                mock_act(
                    member,
                    context.get("mission") or "",
                    handoff_from=context.get("handoff") or "",
                    tool_notes=context.get("tool_notes") or "",
                )
            )
        if "TASK: verify" in system:
            payload = json.loads(user)
            return json.dumps(heuristic_verify(payload.get("content") or "", payload.get("acceptance_criteria") or []))
        if "TASK: revise" in system:
            payload = json.loads(user)
            failed = payload.get("failed") or []
            note = "Revised to make the failed criteria explicit: " + "; ".join(failed)
            content = payload.get("previous") or ""
            if "Revision" not in content:
                content = content.rstrip() + f"\n\n## Revision\n{note}\n"
            else:
                content += f"\n{note}\n"
            # Echo failed criteria so a strict checker can see them.
            for item in failed:
                if item and item not in content:
                    content += f"\n- {item}\n  Evidence: addressed in this revision for the stated mission.\n"
            return json.dumps({"content": content})
        if "TASK: monitor" in system:
            payload = json.loads(user)
            summary = (
                f"Watch on “{payload.get('team', 'team')}”. "
                f"Instruction: {payload.get('instruction', '')}. "
                f"No outward action was taken. "
                f"Mission still in force: {topic_label(str(payload.get('mission') or ''))}."
            )
            return json.dumps({"summary": summary})
        return json.dumps({"message": "The mock provider received a task it does not recognize."})

    async def image(self, *, prompt: str) -> str:
        safe = (
            prompt.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">'
            '<rect width="960" height="540" fill="#101114"/>'
            '<text x="64" y="120" fill="#8b8d98" font-family="Inter, Helvetica, sans-serif" font-size="14">MUSE IMAGE · MOCK</text>'
            f'<text x="64" y="200" fill="#f4f4f5" font-family="Inter, Helvetica, sans-serif" font-size="28">{safe[:80]}</text>'
            "</svg>"
        )


class OpenAICompatProvider:
    """Chat completions and image generations against a configurable base URL."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self.settings = settings
        self._client = client

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.settings.llm_api_key:
            headers["Authorization"] = f"Bearer {self.settings.llm_api_key}"
        return headers

    async def complete(
        self,
        *,
        messages: list[dict[str, str]],
        model_hint: str,
        json_mode: bool = True,
    ) -> str:
        url = self.settings.llm_base_url.rstrip("/") + "/chat/completions"
        payload: dict = {
            "model": self.settings.model_name(model_hint),
            "messages": messages,
            "temperature": 0.4,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        response = await self._post(url, payload)
        try:
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise RuntimeError(f"Model API returned an unexpected chat payload: {response.text[:400]}") from exc

    async def image(self, *, prompt: str) -> str:
        url = self.settings.llm_base_url.rstrip("/") + "/images/generations"
        payload = {
            "model": self.settings.model_name("image"),
            "prompt": prompt,
            "n": 1,
        }
        response = await self._post(url, payload)
        try:
            data = response.json()
            item = data["data"][0]
        except (KeyError, IndexError, ValueError) as exc:
            raise RuntimeError(f"Model API returned an unexpected image payload: {response.text[:400]}") from exc
        if item.get("b64_json"):
            return f"data:image/png;base64,{item['b64_json']}"
        if item.get("url"):
            return str(item["url"])
        raise RuntimeError("Image response did not include a url or b64_json field.")

    async def _post(self, url: str, payload: dict) -> httpx.Response:
        if not self.settings.llm_api_key:
            raise RuntimeError(
                "LLM_API_KEY is empty. Set it to your Meta Model API key, or use LLM_PROVIDER=mock."
            )
        close = False
        client = self._client
        if client is None:
            client = httpx.AsyncClient(timeout=self.settings.llm_timeout_seconds)
            close = True
        try:
            response = await client.post(url, headers=self._headers(), json=payload)
        finally:
            if close:
                await client.aclose()
        if response.status_code >= 400:
            raise RuntimeError(
                f"Model API {response.status_code} from {url}: {response.text[:500]}"
            )
        return response


def build_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider.lower() in {"mock", "local", "fake"}:
        return MockProvider()
    if settings.llm_provider.lower() in {"openai", "meta", "muse", "openai_compat"}:
        return OpenAICompatProvider(settings)
    raise RuntimeError(
        f"Unknown LLM_PROVIDER {settings.llm_provider!r}. Use mock or openai."
    )


def _after(text: str, marker: str) -> str:
    index = text.find(marker)
    if index < 0:
        return text.strip()
    return text[index + len(marker) :].strip()


def _between(text: str, start: str, end: str) -> str:
    body = _after(text, start)
    index = body.find(end)
    if index < 0:
        return body.strip()
    return body[:index].strip()


__all__ = ["MockProvider", "OpenAICompatProvider", "build_provider"]
