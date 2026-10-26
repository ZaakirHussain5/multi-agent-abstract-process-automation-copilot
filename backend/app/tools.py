"""Pluggable tool registry.

Side-effecting tools are marked. The runner, not the tool, decides whether the
current member may call one without a person approving it.
"""

from __future__ import annotations

import inspect
import ipaddress
import socket
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

import httpx

from app.models import ToolInfo

Handler = Callable[[dict[str, Any], "ToolContext"], Any | Awaitable[dict[str, Any]]]

_ALLOWED_SUFFIXES = {".md", ".txt", ".json", ".py", ".svg", ".yaml", ".yml", ".csv"}
_BLOCKED_CODE = (
    "import ",
    "import\t",
    "__",
    "open(",
    "exec(",
    "eval(",
    "compile(",
    "os.",
    "sys.",
    "subprocess",
    "socket",
    "shutil",
    "pathlib",
    "breakpoint(",
)


@dataclass
class ToolContext:
    session_id: str
    data_dir: Path
    llm: Any


@dataclass
class Tool:
    name: str
    description: str
    side_effect: bool
    parameters: dict[str, Any]
    handler: Handler


class Registry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool:
        if name not in self._tools:
            raise KeyError(name)
        return self._tools[name]

    def names(self) -> set[str]:
        return set(self._tools)

    def info(self) -> list[ToolInfo]:
        return [
            ToolInfo(
                name=tool.name,
                description=tool.description,
                side_effect=tool.side_effect,
                parameters=tool.parameters,
            )
            for tool in self._tools.values()
        ]

    async def invoke(self, name: str, args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        tool = self.get(name)
        result = tool.handler(args or {}, ctx)
        if inspect.isawaitable(result):
            result = await result
        if not isinstance(result, dict):
            raise RuntimeError(f"{name} did not return an object.")
        return result


def build_registry() -> Registry:
    registry = Registry()
    registry.register(
        Tool(
            name="web_search",
            description="Search the public web. Simulated until a search backend is configured.",
            side_effect=True,
            parameters={"query": "string"},
            handler=_web_search,
        )
    )
    registry.register(
        Tool(
            name="http_request",
            description="HTTP GET a public URL. Private networks are refused.",
            side_effect=True,
            parameters={"url": "string", "method": "GET"},
            handler=_http_request,
        )
    )
    registry.register(
        Tool(
            name="code_execute",
            description="Run a short Python sketch in a restricted interpreter.",
            side_effect=True,
            parameters={"code": "string"},
            handler=_code_execute,
        )
    )
    registry.register(
        Tool(
            name="file_write",
            description="Write a text file inside this session's workspace.",
            side_effect=True,
            parameters={"path": "string", "content": "string"},
            handler=_file_write,
        )
    )
    registry.register(
        Tool(
            name="notes",
            description="Keep a working note on the activity timeline. No side effects.",
            side_effect=False,
            parameters={"text": "string"},
            handler=_notes,
        )
    )
    registry.register(
        Tool(
            name="image_generate",
            description="Generate a visual with the image model (Muse Image when configured).",
            side_effect=True,
            parameters={"prompt": "string"},
            handler=_image_generate,
        )
    )
    return registry


async def _web_search(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    del ctx
    query = str(args.get("query") or "").strip()
    if not query:
        raise ValueError("web_search needs a query.")
    return {
        "simulated": True,
        "query": query,
        "note": (
            "No search backend is configured. These leads are synthesized from the query "
            "so the team can keep working. They are not sources."
        ),
        "results": [
            {
                "title": f"Public framing of {query[:80]}",
                "snippet": (
                    f"Discussion of {query[:140]} usually turns on scope, who it is for, "
                    "and which constraint is treated as fixed."
                ),
            },
            {
                "title": "What to verify before relying on this",
                "snippet": "Confirm any fact that would change the recommendation. This result is a placeholder, not a citation.",
            },
        ],
    }


async def _http_request(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    del ctx
    url = str(args.get("url") or "").strip()
    method = str(args.get("method") or "GET").upper()
    if method != "GET":
        raise ValueError("Only GET requests are enabled.")
    if not _is_public_http_url(url):
        raise ValueError("That URL is not allowed. Only public http(s) hosts are.")
    async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
        response = await client.get(url)
    return {
        "url": url,
        "status": response.status_code,
        "body_preview": response.text[:4000],
    }


def _is_public_http_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    host = parsed.hostname.strip("[]")
    if host in {"localhost", "127.0.0.1", "::1"}:
        return False
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if not ip.is_global:
            return False
    return True


async def _code_execute(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    del ctx
    code = str(args.get("code") or "")
    if not code.strip():
        raise ValueError("code_execute needs code.")
    if len(code) > 4000:
        raise ValueError("Code is limited to 4000 characters.")
    lowered = code.lower()
    for token in _BLOCKED_CODE:
        if token in lowered:
            raise ValueError(f"Code uses a blocked construct ({token.strip()}).")
    runner = Path(__file__).with_name("sandbox_runner.py")
    try:
        completed = subprocess.run(
            [sys.executable, "-I", str(runner)],
            input=code.encode("utf-8"),
            capture_output=True,
            timeout=3,
            check=False,
            env={"PYTHONDONTWRITEBYTECODE": "1", "PYTHONNOUSERSITE": "1"},
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError("Code timed out after 3 seconds.") from exc
    raw = completed.stdout.decode("utf-8", errors="replace").strip()
    if not raw:
        stderr = completed.stderr.decode("utf-8", errors="replace")[:500]
        raise ValueError(stderr or "The sandbox returned no output.")
    try:
        payload = json_loads(raw)
    except ValueError as exc:
        raise ValueError(f"The sandbox returned an unreadable result: {raw[:300]}") from exc
    return {
        "ok": bool(payload.get("ok")),
        "stdout": str(payload.get("stdout") or ""),
        "error": payload.get("error"),
    }


def json_loads(raw: str) -> dict[str, Any]:
    import json

    loaded = json.loads(raw)
    if not isinstance(loaded, dict):
        raise ValueError("expected object")
    return loaded


async def _file_write(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    relative = str(args.get("path") or "").strip().replace("\\", "/")
    content = str(args.get("content") or "")
    if not relative or relative.startswith("/") or ".." in relative.split("/"):
        raise ValueError("Path must stay inside the session workspace.")
    suffix = Path(relative).suffix.lower()
    if suffix not in _ALLOWED_SUFFIXES:
        raise ValueError("That file type is not allowed.")
    if len(content) > 200_000:
        raise ValueError("Content is too large.")
    root = (ctx.data_dir / "workspace" / ctx.session_id).resolve()
    root.mkdir(parents=True, exist_ok=True)
    target = (root / relative).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Path must stay inside the session workspace.")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    return {"path": str(target.relative_to(root)), "bytes": len(content.encode("utf-8"))}


async def _notes(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    del ctx
    text = str(args.get("text") or "").strip()
    if not text:
        raise ValueError("notes needs text.")
    return {"text": text[:4000]}


async def _image_generate(args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    prompt = str(args.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("image_generate needs a prompt.")
    image = await ctx.llm.image(prompt=prompt)
    return {"prompt": prompt, "image": image}
