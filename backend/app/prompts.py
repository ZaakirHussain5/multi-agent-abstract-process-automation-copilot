"""Prompt builders. The task marker is how the mock provider picks a behavior.

A real Muse model receives the same instructions and must answer with JSON.
"""

from __future__ import annotations

import json

from app.models import DeliverableResult, SceneConfig, TeamMemberSpec, TeamSpec


def _system(task: str, body: str) -> str:
    return (
        "You are part of Muster, a system that hires a temporary AI team from a single brief.\n"
        f"TASK: {task}\n"
        "The brief can be in any domain. Do not assume a company, industry, or playbook "
        "that the user did not state.\n"
        "Reply with one JSON object and no markdown fences.\n\n"
        f"{body}"
    )


def clarify_messages(prompt: str) -> list[dict[str, str]]:
    system = _system(
        "clarify",
        "Ask 3 to 5 clarifying questions before anyone is staffed.\n"
        "Rules:\n"
        "- Each question must depend on this brief. Do not ask anything the brief already answered.\n"
        "- Cover outcome, audience or constraint, the decision the work must change, and how to handle uncertainty.\n"
        "- Offer up to three short suggestions the user can accept or rewrite.\n"
        'Schema: {"questions":[{"id":"q1","prompt":"","rationale":"","placeholder":"","suggestions":[""]}]}',
    )
    user = f"USER_PROMPT:\n{prompt.strip()}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def design_messages(
    prompt: str,
    answers: dict[str, str],
    questions: list[dict] | None = None,
) -> list[dict[str, str]]:
    system = _system(
        "design",
        "Design the team by reasoning over the clarifying questionnaire. "
        "The questionnaire is the brief plus the questions you asked plus the user's answers. "
        "Read the answers first. When an answer disagrees with a keyword in the brief, follow the answer.\n"
        "Decide, from that reading, the team size, each job title, each persona, the responsibilities, and the toolset.\n"
        "Rules:\n"
        "- Between 2 and 6 members, including one lead who reports to nobody and uses model_hint spark.\n"
        "- Job titles are yours to invent from what the answers asked for. Do not use a stock list of titles such as Engineer, Marketer, Designer, Researcher, or Analyst.\n"
        "- Personas must say why this person is here, in words that trace back to an answer. If the user left an answer open, say that you fell back to the brief.\n"
        "- Team size follows the answers: a small or lean ask is a smaller team; a comprehensive ask is a larger one.\n"
        "- Choose allowed_tools from the registry based on the questionnaire, not from a role template. "
        "Use code_execute only when the answers ask for something that runs. Use image_generate when they ask for a picture. "
        "model_hint is code when code_execute is allowed, image when the work is visual, otherwise spark.\n"
        "- If an answer says not to write code, or not to run a campaign, do not staff that work.\n"
        "- Propose one new tool that is not in the registry, on proposed_tools. It is a suggestion, not a call. "
        "A person must approve it before it can be used. If it has side effects, each call still waits for approval.\n"
        "- Every member has expertise, responsibilities, and at least one deliverable with acceptance criteria drawn from the questionnaire.\n"
        "- allowed_tools is a subset of: web_search, http_request, code_execute, file_write, notes, image_generate.\n"
        "- permission_level is one of: observe, draft, act_with_approval, act.\n"
        "- Prefer act_with_approval for anything that can leave the workspace.\n"
        "- domain is a short label for the team you actually designed, after reading the answers.\n"
        'Schema: {"name":"","mission":"","domain":"","structure":"","members":[{"id":"","name":"","role":"","persona":"","silhouette":"compact","expertise":[""],"responsibilities":[""],"deliverables":[{"id":"","title":"","description":"","acceptance_criteria":[""],"kind":"document"}],"allowed_tools":[""],"proposed_tools":[{"name":"","description":"","side_effect":false,"reason":""}],"permission_level":"act_with_approval","model_hint":"spark","reports_to":null,"avatar_hue":200}]}',
    )
    user = (
        "USER_PROMPT:\n"
        + prompt.strip()
        + "\n\nQUESTIONNAIRE_JSON:\n"
        + json.dumps(questions or [], indent=2)
        + "\n\nANSWERS_JSON:\n"
        + json.dumps(answers, indent=2)
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def scene_messages(prompt: str, current: SceneConfig) -> list[dict[str, str]]:
    system = _system(
        "scene",
        "Turn the user's words into a room configuration for a 3D office where an AI team works.\n"
        "Change only what the user asked to change. Keep every other field from the current scene.\n"
        "preset is one of: loft, lab, war_room, studio, rooftop, library.\n"
        "time_of_day is one of: dawn, day, dusk, night.\n"
        "layout is one of: open, desks, meeting.\n"
        "A rooftop at night is preset rooftop and time_of_day night. "
        "Research or a lab is preset lab. A brand, campaign, or marketing brief is preset studio even if it also says launch. "
        "A launch with no brand language is preset war_room. A library is preset library.\n"
        "props has booleans plants, screens, posters, lamps, rug.\n"
        "lighting has ambient and key as numbers and accent as a hex color.\n"
        "camera has fov, height, radius.\n"
        "palette has floor, wall, trim, fog, accent as hex colors.\n"
        "quality is full or simple. poster_image may be an empty string; the image model fills it.\n"
        "Set customized true and source_prompt to the user's words.\n"
        'Schema: {"preset":"loft","time_of_day":"day","layout":"desks","props":{"plants":true,"screens":true,"posters":true,"lamps":true,"rug":true},"lighting":{"ambient":0.6,"key":1.0,"accent":"#e07a3d"},"camera":{"fov":38,"height":1.6,"radius":8.5},"palette":{"floor":"#c4b39a","wall":"#efe6d6","trim":"#2c2824","fog":"#d9d0c3","accent":"#e07a3d"},"poster_title":"","poster_image":"","quality":"full","source_prompt":"","customized":true}',
    )
    user = (
        "USER_PROMPT:\n"
        + prompt.strip()
        + "\n\nCURRENT_SCENE_JSON:\n"
        + current.model_dump_json()
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def act_messages(
    *,
    member: TeamMemberSpec,
    team: TeamSpec,
    handoff: str,
    tool_notes: str,
) -> list[dict[str, str]]:
    system = _system(
        "act",
        "You are one member of the team. Do your own work. Challenge at least one assumption. "
        "Raise an open question if something material is missing, and set blocking true only when you cannot draft without the answer. "
        "Hand off a concrete task when another role needs your output. "
        "Call a tool only if it is in your allowed_tools and you need it. "
        "Write every deliverable you own, and satisfy its acceptance criteria in the text.\n"
        'Schema: {"message":"","challenges":[""],"open_questions":[{"question":"","blocking":false,"assumption":""}],"handoffs":[{"to_role":"","task":""}],"tool_calls":[{"tool":"","args":{},"reason":""}],"deliverables":[{"spec_id":"","content":""}]}',
    )
    payload = {
        "mission": team.mission,
        "structure": team.structure,
        "you": member.model_dump(mode="json"),
        "teammates": [
            {"name": person.name, "role": person.role, "id": person.id}
            for person in team.members
            if person.id != member.id
        ],
        "handoff": handoff,
        "tool_notes": tool_notes,
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "CONTEXT_JSON:\n" + json.dumps(payload, indent=2)},
    ]


def verify_messages(deliverable: DeliverableResult, criteria: list[str]) -> list[dict[str, str]]:
    system = _system(
        "verify",
        "Check the deliverable against every acceptance criterion. "
        "Pass a criterion only when the text itself shows it. Do not be generous.\n"
        'Schema: {"passed":false,"summary":"","criteria":[{"criterion":"","met":false,"evidence":""}]}',
    )
    user = json.dumps(
        {"title": deliverable.title, "content": deliverable.content, "acceptance_criteria": criteria},
        indent=2,
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def revise_messages(
    member: TeamMemberSpec,
    deliverable: DeliverableResult,
    criteria: list[str],
    failed: list[str],
) -> list[dict[str, str]]:
    system = _system(
        "revise",
        "Rewrite the deliverable so every failed acceptance criterion is met in the text. "
        'Schema: {"content":""}',
    )
    user = json.dumps(
        {
            "role": member.role,
            "title": deliverable.title,
            "failed": failed,
            "acceptance_criteria": criteria,
            "previous": deliverable.content,
        },
        indent=2,
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def monitor_messages(team: TeamSpec, instruction: str) -> list[dict[str, str]]:
    system = _system(
        "monitor",
        "You are checking in on a team that stayed on after the original session. "
        "Do not take outward actions. Write a short status a person can skim.\n"
        'Schema: {"summary":""}',
    )
    user = json.dumps(
        {
            "team": team.name,
            "mission": team.mission,
            "instruction": instruction,
            "members": [member.role for member in team.members],
        },
        indent=2,
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
