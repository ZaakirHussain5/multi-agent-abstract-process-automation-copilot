"""Restricted Python exec used by the code_execute tool.

This file is launched as a subprocess. It is not imported by the app server.
User source arrives on stdin and cannot import, open files, or touch the network
because the only builtins available are the ones listed below.
"""

from __future__ import annotations

import json
import sys

code = sys.stdin.read()
buffer: list[str] = []


def _print(*args: object, **kwargs: object) -> None:
    sep = kwargs.get("sep", " ")
    buffer.append(str(sep).join(str(arg) for arg in args))


safe_builtins = {
    "print": _print,
    "range": range,
    "len": len,
    "sum": sum,
    "min": min,
    "max": max,
    "sorted": sorted,
    "enumerate": enumerate,
    "zip": zip,
    "map": map,
    "filter": filter,
    "list": list,
    "dict": dict,
    "set": set,
    "tuple": tuple,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "abs": abs,
    "round": round,
    "any": any,
    "all": all,
    "repr": repr,
    "isinstance": isinstance,
    "Exception": Exception,
    "ValueError": ValueError,
    "TypeError": TypeError,
}

try:
    exec(code, {"__builtins__": safe_builtins}, {})  # noqa: S102
    sys.stdout.write(json.dumps({"ok": True, "stdout": "\n".join(buffer)}))
except Exception as exc:  # noqa: BLE001
    sys.stdout.write(
        json.dumps(
            {
                "ok": False,
                "stdout": "\n".join(buffer),
                "error": f"{type(exc).__name__}: {exc}",
            }
        )
    )
