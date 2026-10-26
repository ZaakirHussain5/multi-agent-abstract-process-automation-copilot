"""Scene configs for the 3D room.

Pure functions. The mock provider and the tests call these directly. A live
Muse model is asked for the same JSON shape; the route still falls back here
when the model reply cannot be parsed.
"""

from __future__ import annotations

import re

from app.models import SceneCamera, SceneConfig, SceneLighting, ScenePalette, SceneProps
from app.spec import topic_label

PresetName = str

_PALETTES: dict[str, ScenePalette] = {
    "loft": ScenePalette(floor="#c4b39a", wall="#efe6d6", trim="#2c2824", fog="#d9d0c3", accent="#e07a3d"),
    "lab": ScenePalette(floor="#d5dde4", wall="#f4f7f8", trim="#243044", fog="#e4ebf0", accent="#3d8bfd"),
    "war_room": ScenePalette(floor="#1a1c22", wall="#12141a", trim="#3a342c", fog="#0c0e14", accent="#e8a04a"),
    "studio": ScenePalette(floor="#d8c7ae", wall="#f3eee6", trim="#3a322c", fog="#e7dccb", accent="#c4654a"),
    "rooftop": ScenePalette(floor="#2a3038", wall="#1b2128", trim="#c9c3b6", fog="#12161c", accent="#f2c14e"),
    "library": ScenePalette(floor="#8d6a48", wall="#efe4d2", trim="#3a2a1e", fog="#e6d7c3", accent="#b5522a"),
}

_PRESET_LAYOUT = {
    "loft": "desks",
    "lab": "desks",
    "war_room": "meeting",
    "studio": "open",
    "rooftop": "open",
    "library": "desks",
}

_PRESET_TIME = {
    "loft": "day",
    "lab": "day",
    "war_room": "night",
    "studio": "day",
    "rooftop": "night",
    "library": "dusk",
}

_PRESET_CAMERA = {
    "loft": SceneCamera(fov=38, height=1.6, radius=8.5),
    "lab": SceneCamera(fov=36, height=1.65, radius=8.0),
    "war_room": SceneCamera(fov=34, height=1.75, radius=7.4),
    "studio": SceneCamera(fov=40, height=1.5, radius=8.6),
    "rooftop": SceneCamera(fov=42, height=2.15, radius=11.0),
    "library": SceneCamera(fov=36, height=1.55, radius=8.0),
}

_PRESET_PROPS = {
    "loft": SceneProps(plants=True, screens=True, posters=True, lamps=True, rug=True),
    "lab": SceneProps(plants=False, screens=True, posters=True, lamps=True, rug=False),
    "war_room": SceneProps(plants=False, screens=True, posters=True, lamps=True, rug=True),
    "studio": SceneProps(plants=True, screens=True, posters=True, lamps=True, rug=True),
    "rooftop": SceneProps(plants=True, screens=False, posters=False, lamps=True, rug=False),
    "library": SceneProps(plants=True, screens=False, posters=False, lamps=True, rug=True),
}


def _has(text: str, *words: str) -> bool:
    return any(re.search(rf"\b{re.escape(word)}\b", text) for word in words)


def preset_for_text(text: str) -> str:
    """Pick a room from the brief. Order is deliberate.

    A brand or campaign line is a studio even when it also says launch.
    A launch with no brand language is a war room. Research language is a lab.
    """

    lowered = text.lower()
    if _has(lowered, "rooftop", "roof", "terrace"):
        return "rooftop"
    if _has(lowered, "library", "archive", "reading"):
        return "library"
    if _has(lowered, "lab", "laboratory", "research", "investigate", "experiment"):
        return "lab"
    if _has(lowered, "brand", "campaign", "marketing", "studio"):
        return "studio"
    if _has(lowered, "launch", "war room", "incident", "go-live", "golive"):
        return "war_room"
    return "loft"


def time_for_text(text: str) -> str | None:
    lowered = text.lower()
    if _has(lowered, "night", "midnight", "evening", "after dark"):
        return "night"
    if _has(lowered, "dawn", "sunrise", "morning"):
        return "dawn"
    if _has(lowered, "dusk", "sunset", "twilight"):
        return "dusk"
    if _has(lowered, "noon", "afternoon", "daytime", "midday"):
        return "day"
    if re.search(r"\bday\b", lowered) and not _has(lowered, "today", "daytime"):
        return "day"
    return None


def _lighting(preset: str, time_of_day: str) -> SceneLighting:
    accent = _PALETTES[preset].accent
    table = {
        "dawn": (0.46, 0.85),
        "day": (0.7, 1.15),
        "dusk": (0.34, 0.62),
        "night": (0.16, 0.42),
    }
    ambient, key = table[time_of_day]
    if preset == "war_room" and time_of_day == "night":
        key = 0.55
    if preset == "rooftop" and time_of_day == "night":
        ambient = 0.2
    return SceneLighting(ambient=ambient, key=key, accent=accent)


def _build(preset: str, time_of_day: str, *, prompt: str, customized: bool, layout: str | None = None) -> SceneConfig:
    return SceneConfig(
        preset=preset,  # type: ignore[arg-type]
        time_of_day=time_of_day,  # type: ignore[arg-type]
        layout=(layout or _PRESET_LAYOUT[preset]),  # type: ignore[arg-type]
        props=_PRESET_PROPS[preset].model_copy(deep=True),
        lighting=_lighting(preset, time_of_day),
        camera=_PRESET_CAMERA[preset].model_copy(deep=True),
        palette=_PALETTES[preset].model_copy(deep=True),
        poster_title=topic_label(prompt)[:64] if prompt.strip() else "Muster",
        poster_image="",
        quality="full",
        source_prompt=prompt.strip(),
        customized=customized,
    )


def scene_for_brief(prompt: str) -> SceneConfig:
    """A room that matches the work, before anyone customizes it."""

    preset = preset_for_text(prompt)
    time_of_day = time_for_text(prompt) or _PRESET_TIME[preset]
    layout = None
    lowered = prompt.lower()
    if _has(lowered, "meeting", "standup", "stand-up", "war room"):
        layout = "meeting"
    elif _has(lowered, "open plan", "open-plan", "studio"):
        layout = "open"
    return _build(preset, time_of_day, prompt=prompt, customized=False, layout=layout)


def apply_scene_prompt(scene: SceneConfig, text: str) -> SceneConfig:
    """Apply a natural-language edit on top of an existing room.

    Unmentioned fields stay. "Make it a rooftop at night" changes the preset
    and the time of day, then rebuilds palette, lights, and camera to match.
    """

    lowered = text.lower()
    preset = scene.preset
    mentioned_preset = False
    if _has(lowered, "rooftop", "roof", "terrace"):
        preset, mentioned_preset = "rooftop", True
    elif _has(lowered, "library", "archive", "reading"):
        preset, mentioned_preset = "library", True
    elif _has(lowered, "lab", "laboratory"):
        preset, mentioned_preset = "lab", True
    elif _has(lowered, "war room", "incident"):
        preset, mentioned_preset = "war_room", True
    elif _has(lowered, "studio"):
        preset, mentioned_preset = "studio", True
    elif _has(lowered, "loft", "office"):
        preset, mentioned_preset = "loft", True

    explicit_time = time_for_text(text)
    if explicit_time:
        time_of_day = explicit_time
    elif mentioned_preset:
        time_of_day = _PRESET_TIME[preset]
    else:
        time_of_day = scene.time_of_day

    layout = scene.layout
    if _has(lowered, "meeting", "around the table", "conference"):
        layout = "meeting"
    elif _has(lowered, "open plan", "open-plan", "no desks"):
        layout = "open"
    elif _has(lowered, "desks", "workstations"):
        layout = "desks"
    elif mentioned_preset:
        layout = _PRESET_LAYOUT[preset]  # type: ignore[assignment]

    if mentioned_preset or explicit_time:
        built = _build(preset, time_of_day, prompt=text, customized=True, layout=layout)
    else:
        built = scene.model_copy(deep=True)
        built.time_of_day = time_of_day  # type: ignore[assignment]
        built.layout = layout
        built.customized = True
        built.source_prompt = text.strip()
        built.lighting = _lighting(built.preset, time_of_day)

    props = built.props

    def _set_prop(current: bool, noun: str, *aliases: str) -> bool:
        names = "|".join(re.escape(item) for item in (noun, *aliases))
        if re.search(rf"\b(no|without|remove|drop|hide)\b.{{0,16}}\b(?:{names})\b", lowered):
            return False
        if re.search(rf"\b(?:{names})\b.{{0,16}}\b(off|away)\b", lowered):
            return False
        if _has(lowered, noun, *aliases):
            return True
        return current

    props.plants = _set_prop(props.plants, "plants", "greenery")
    props.screens = _set_prop(props.screens, "screens", "monitors")
    props.posters = _set_prop(props.posters, "posters", "poster")
    props.lamps = _set_prop(props.lamps, "lamps", "string lights", "lights")
    props.rug = _set_prop(props.rug, "rug")

    if _has(lowered, "simple", "low end", "low-end", "faster"):
        built.quality = "simple"
    elif _has(lowered, "detailed", "high quality", "shadows"):
        built.quality = "full"

    height = re.search(r"camera height\s+(\d+(?:\.\d+)?)", lowered)
    if height:
        built.camera.height = max(0.8, min(float(height.group(1)), 4.0))
    if _has(lowered, "closer", "zoom in"):
        built.camera.radius = max(4.5, built.camera.radius - 1.5)
    elif _has(lowered, "wider", "pull back", "zoom out"):
        built.camera.radius = min(14.0, built.camera.radius + 1.5)

    title = topic_label(text)
    if title and title != "this brief":
        built.poster_title = title[:64]
    built.poster_image = ""
    built.customized = True
    built.source_prompt = text.strip()
    return built
