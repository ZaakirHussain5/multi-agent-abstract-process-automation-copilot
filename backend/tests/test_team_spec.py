import json

import pytest

from app.spec import (
    DEFAULT_TOOLS,
    design_team,
    heuristic_questions,
    heuristic_verify,
    normalize_team,
    order_members,
    parse_json_object,
    parse_questions,
    team_from_json,
    team_from_yaml,
    team_to_json,
    team_to_yaml,
    tool_decision,
    topic_label,
    validate_team,
)


def test_topic_label_drops_filler_words():
    assert "invoicing" in topic_label("Build a small invoicing API for freelance designers").lower()


def test_engineering_and_marketing_teams_differ():
    engineering = design_team("Build a small invoicing API for freelance designers")
    marketing = design_team("Launch a brand campaign for a specialty coffee subscription")
    eng_roles = {member.role for member in engineering.members}
    mkt_roles = {member.role for member in marketing.members}
    assert eng_roles != mkt_roles
    assert any(member.model_hint == "code" for member in engineering.members)
    assert all(member.model_hint != "code" for member in marketing.members)
    assert engineering.domain == "engineering"
    assert marketing.domain in {"marketing", "design", "writing"}
    eng_blob = " ".join(member.role for member in engineering.members).lower()
    mkt_blob = " ".join(member.role for member in marketing.members).lower()
    assert "invoic" in eng_blob or "api" in eng_blob
    assert any(token in mkt_blob for token in ("coffee", "campaign", "brand"))
    assert any("code_execute" in member.allowed_tools for member in engineering.members)
    assert all("code_execute" not in member.allowed_tools for member in marketing.members)
    proposed = [
        tool.name
        for member in engineering.members + marketing.members
        for tool in member.proposed_tools
    ]
    assert proposed
    assert all(name not in DEFAULT_TOOLS for name in proposed)
    assert all(member.persona for member in engineering.members)
    assert {member.silhouette for member in engineering.members} <= {"tall", "compact", "broad"}


def test_obscure_brief_still_produces_a_valid_team():
    team = design_team(
        "Organize a neighborhood tool library for the apartment block",
        {"q1": "Keep the team small", "q2": "Residents are the audience"},
    )
    assert validate_team(team) == []
    assert 2 <= len(team.members) <= 3
    for member in team.members:
        assert member.expertise
        assert member.responsibilities
        assert member.deliverables
        for deliverable in member.deliverables:
            assert deliverable.acceptance_criteria
            assert "tool library" in " ".join(deliverable.acceptance_criteria).lower() or member.role


def test_answers_change_team_size():
    prompt = "Investigate why paid signup conversion dropped after the pricing change"
    small = design_team(prompt, {"q2": "Keep the team small"})
    large = design_team(prompt, {"q2": "Be comprehensive"})
    assert len(large.members) > len(small.members)


def test_yaml_and_json_roundtrip():
    team = design_team("Recruit a founding designer and run the first thirty days of the loop")
    restored = team_from_yaml(team_to_yaml(team))
    assert restored.model_dump() == team.model_dump()
    again = team_from_json(team_to_json(team))
    assert again.model_dump() == team.model_dump()


def test_strict_edit_rejects_a_broken_spec():
    team = design_team("Map the failure modes in our warehouse receiving process")
    payload = team.model_dump(mode="json")
    payload["members"][0]["deliverables"][0]["acceptance_criteria"] = []
    with pytest.raises(ValueError):
        normalize_team(payload, repair=False)


def test_repair_fills_gaps_from_a_sloppy_model():
    payload = {
        "name": "Garden team",
        "mission": "Plan a school garden",
        "members": [
            {"name": "Ada", "role": "Team Lead", "reports_to": None},
            {"name": "Ben", "role": "Researcher", "reports_to": "missing", "allowed_tools": ["web_search", "not-a-tool"]},
        ],
    }
    team = normalize_team(payload, repair=True)
    assert validate_team(team) == []
    assert team.members[1].reports_to is None or team.members[1].reports_to in {m.id for m in team.members}
    assert "not-a-tool" not in team.members[1].allowed_tools
    assert team.members[0].deliverables[0].acceptance_criteria


def test_add_and_remove_member_round_trip():
    team = design_team("Write the onboarding guide for a clinic front desk")
    payload = json.loads(team_to_json(team))
    payload["members"].append(
        {
            "id": "m_new",
            "name": "Sam Ibarra",
            "role": "Writer",
            "expertise": ["plain language"],
            "responsibilities": ["Edit the guide"],
            "deliverables": [
                {
                    "id": "d_new",
                    "title": "Front desk guide",
                    "description": "A one-page guide.",
                    "acceptance_criteria": ["A new hire can finish the first hour without asking."],
                    "kind": "document",
                }
            ],
            "allowed_tools": ["notes"],
            "permission_level": "draft",
            "model_hint": "spark",
            "reports_to": payload["members"][0]["id"],
            "avatar_hue": 12,
        }
    )
    edited = normalize_team(payload, repair=False)
    assert any(member.id == "m_new" for member in edited.members)
    payload["members"] = [member for member in payload["members"] if member["id"] != "m_new"]
    # Dropping back to the original roster is still valid.
    assert validate_team(normalize_team(payload, repair=False)) == []


def test_order_members_is_stable_and_cycle_safe():
    team = design_team("Plan a community garden budget and the weekend build")
    ordered = order_members(team)
    assert ordered[0].reports_to is None
    # Introduce a cycle and confirm ordering does not raise.
    team.members[0].reports_to = team.members[1].id
    team.members[1].reports_to = team.members[0].id
    again = order_members(team)
    assert {member.id for member in again} == {member.id for member in team.members}
    assert validate_team(team)


def test_permission_gate():
    assert tool_decision("notes", "observe", side_effect=False) == "allow"
    assert tool_decision("web_search", "observe", side_effect=True) == "deny"
    assert tool_decision("web_search", "draft", side_effect=True) == "approve"
    assert tool_decision("file_write", "act_with_approval", side_effect=True) == "approve"
    assert tool_decision("code_execute", "act", side_effect=True) == "allow"
    assert tool_decision("notes", "act", side_effect=False) == "allow"


def test_questions_are_specific_to_the_brief():
    payload = heuristic_questions("Recruit a founding designer")
    questions = parse_questions(payload)
    assert len(questions) >= 3
    blob = " ".join(question["prompt"] for question in questions).lower()
    assert "founding designer" in blob or "designer" in blob


def test_parse_json_object_accepts_fenced_payloads():
    assert parse_json_object('```json\n{"questions": []}\n```')["questions"] == []


def test_parse_questions_repairs_ids_and_rejects_empty():
    questions = parse_questions(
        {"questions": [{"prompt": "First?"}, {"id": "q", "prompt": "Second?"}, {"id": "q", "prompt": "Third?"}]}
    )
    assert len({item["id"] for item in questions}) == 3
    with pytest.raises(ValueError):
        parse_questions({"questions": [{"prompt": "Only one?"}]})


def test_verification_passes_a_real_draft_and_fails_a_stub():
    team = design_team("Map failure modes in warehouse receiving")
    spec = team.members[0].deliverables[0]
    from app.spec import render_deliverable

    content = render_deliverable(team.members[0], spec, team.mission)
    passed = heuristic_verify(content, spec.acceptance_criteria)
    assert passed["passed"] is True
    failed = heuristic_verify("TODO", spec.acceptance_criteria)
    assert failed["passed"] is False
