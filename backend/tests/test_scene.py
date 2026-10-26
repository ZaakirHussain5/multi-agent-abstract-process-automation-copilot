"""Scene config generation, including natural-language edits."""

import pytest

from app.llm import MockProvider
from app.models import SceneConfig
from app.prompts import scene_messages
from app.scene import apply_scene_prompt, scene_for_brief


def test_research_brief_is_a_lab_and_a_launch_without_brand_is_a_war_room():
    lab = scene_for_brief("Investigate why the cohort experiment drifted")
    assert lab.preset == "lab"
    assert lab.customized is False
    war = scene_for_brief("Launch the product on Friday")
    assert war.preset == "war_room"
    assert war.time_of_day == "night"


def test_brand_campaign_is_a_studio_even_when_it_says_launch():
    studio = scene_for_brief("Launch a brand campaign for a specialty coffee subscription")
    assert studio.preset == "studio"
    library = scene_for_brief("Organize a neighborhood tool library for the apartment block")
    assert library.preset == "library"


def test_plain_brief_is_a_loft():
    loft = scene_for_brief("Build a small invoicing API for freelance designers")
    assert loft.preset == "loft"
    assert loft.palette.floor == "#c4b39a"
    assert loft.poster_title


def test_rooftop_at_night_edits_the_current_room():
    loft = scene_for_brief("A quiet place to work")
    assert loft.preset == "loft"
    edited = apply_scene_prompt(loft, "make it a rooftop at night")
    assert edited.preset == "rooftop"
    assert edited.time_of_day == "night"
    assert edited.customized is True
    assert edited.palette.floor == "#2a3038"
    assert edited.camera.radius == 11.0
    # Unrelated props the prompt did not mention follow the rooftop preset.
    assert edited.props.screens is False
    assert edited.props.lamps is True


def test_scene_edit_keeps_fields_the_prompt_does_not_mention():
    lab = scene_for_brief("Investigate the signup experiment")
    edited = apply_scene_prompt(lab, "turn the lamps off")
    assert edited.preset == "lab"
    assert edited.props.lamps is False
    assert edited.props.screens is True
    assert edited.layout == lab.layout


@pytest.mark.asyncio
async def test_mock_provider_turns_a_prompt_into_scene_json():
    base = scene_for_brief("a quiet loft")
    raw = await MockProvider().complete(
        messages=scene_messages("make it a rooftop at night", base),
        model_hint="spark",
    )
    scene = SceneConfig.model_validate_json(raw)
    assert scene.preset == "rooftop"
    assert scene.time_of_day == "night"
    assert scene.customized is True
