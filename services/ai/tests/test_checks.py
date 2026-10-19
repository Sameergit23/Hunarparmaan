from __future__ import annotations

from dataclasses import replace

import pytest
from conftest import region

from hunarpramaan_ai.vision.checks import (
    CHECKS,
    FrameJudgement,
    confidence,
    contains,
    iou,
    judge_clip,
    judge_frame,
    sits_on,
)

GLOVES = CHECKS["ppe.gloves"]
GOGGLES = CHECKS["ppe.goggles"]
HELMET = CHECKS["ppe.helmet"]


def test_check_ids_match_the_contract_pattern():
    import re

    for check in CHECKS:
        assert re.fullmatch(r"[a-z]+(\.[a-z_]+)+", check)


def test_a_bare_hand_is_a_fault_and_a_gloved_hand_is_not():
    bare = region(a_bare_hand=0.4, a_gloved_hand=0.2)
    gloved = region(a_bare_hand=0.25, a_gloved_hand=0.45)
    assert judge_frame(GLOVES, [bare]).status == "fault"
    assert judge_frame(GLOVES, [gloved]).status == "ok"


def test_a_fault_must_beat_the_ok_prompts_by_the_margin():
    close = region(a_bare_hand=0.40, a_gloved_hand=0.38)  # within the 0.05 margin
    assert judge_frame(GLOVES, [close]).status == "ok"


def test_weak_regions_are_ignored():
    faint = region(a_bare_hand=GLOVES.min_score - 0.01)
    assert judge_frame(GLOVES, [faint]).status == "unseen"
    assert judge_frame(GLOVES, []).status == "unseen"


def test_one_bare_hand_beside_a_gloved_one_is_still_a_fault():
    bare = region((0.1, 0.1, 0.2, 0.2), a_bare_hand=0.4)
    gloved = region((0.6, 0.6, 0.7, 0.7), a_work_glove=0.5)
    judgement = judge_frame(GLOVES, [bare, gloved])
    assert judgement.status == "fault"
    assert judgement.box == (0.1, 0.1, 0.2, 0.2)


def test_eye_protection_is_judged_only_while_grinding_or_welding():
    face = replace(region((0.3, 0.1, 0.6, 0.5)), scores={"a person's face": 0.4})
    assert judge_frame(GOGGLES, [face]).status == "not_applicable"
    sparks = region((0.6, 0.6, 0.9, 0.9), sparks=0.5)
    assert judge_frame(GOGGLES, [face, sparks]).status == "fault"


def test_goggles_inside_a_face_clear_it():
    face = replace(region((0.3, 0.1, 0.6, 0.5)), scores={"a person's face": 0.4})
    goggles = region((0.35, 0.2, 0.55, 0.28), safety_goggles=0.3)
    sparks = region((0.6, 0.6, 0.9, 0.9), sparks=0.5)
    assert judge_frame(GOGGLES, [face, goggles, sparks]).status == "ok"


def test_a_hard_hat_on_a_head_clears_the_head():
    head = region((0.4, 0.0, 0.6, 0.3), a_bare_head=0.3)
    hat = region((0.42, 0.0, 0.58, 0.12), a_hard_hat=0.5)
    assert judge_frame(HELMET, [head, hat]).status == "ok"


# A face boxed as a bare head, from y 0.2 to 0.4, with the hard hat in different places.
FACE = (0.40, 0.20, 0.60, 0.40)


def test_a_hard_hat_just_above_a_face_clears_it():
    face = region(FACE, a_bare_head=0.2)
    on_the_brim = region((0.38, 0.08, 0.62, 0.22), a_hard_hat=0.5)  # bottom 0.02 inside
    just_above = region((0.40, 0.06, 0.62, 0.18), a_hard_hat=0.5)  # bottom 0.02 above
    assert judge_frame(HELMET, [face, on_the_brim]).status == "ok"
    assert judge_frame(HELMET, [face, just_above]).status == "ok"


def test_a_hard_hat_beside_or_far_above_a_bare_head_does_not_clear_it():
    face = region(FACE, a_bare_head=0.2)
    beside = region((0.62, 0.08, 0.80, 0.21), a_hard_hat=0.5)  # another worker's hat
    barely_over = region((0.55, 0.08, 0.75, 0.21), a_hard_hat=0.5)  # 0.05 of 0.20 overlap
    far_above = region((0.42, 0.00, 0.58, 0.08), a_hard_hat=0.5)  # 0.12 gap, over 0.4 x 0.2
    for hat in (beside, barely_over, far_above):
        assert judge_frame(HELMET, [face, hat]).status == "fault"


def test_a_hat_box_reaching_far_into_the_head_does_not_clear_it():
    # The hat's bottom edge is 0.15 below the head's top, more than 0.4 x 0.2.
    head = region(FACE, a_bare_head=0.2)
    low = region((0.38, 0.10, 0.62, 0.35), a_hard_hat=0.5)
    assert judge_frame(HELMET, [head, low]).status == "fault"


def test_only_checks_that_ask_for_it_clear_a_fault_below_an_ok_region():
    face = region(FACE, a_bare_head=0.2)
    hat = region((0.38, 0.08, 0.62, 0.22), a_hard_hat=0.5)
    assert HELMET.above_clears > 0
    assert all(spec.above_clears == 0 for spec in CHECKS.values() if spec is not HELMET)
    assert judge_frame(replace(HELMET, above_clears=0.0), [face, hat]).status == "fault"


def frames(*statuses: str, score: float = 0.4) -> list[FrameJudgement]:
    return [FrameJudgement(s, score if s in ("fault", "ok") else 0.0) for s in statuses]


def test_a_photo_needs_one_fault_frame():
    result = judge_clip(GLOVES, frames("fault"), [0.0])
    assert result.status == "raised"
    assert result.frames[0].index == 0


def test_a_clip_needs_two_fault_frames_so_one_odd_frame_does_not_raise_it():
    times = [5.0, 15.0, 25.0, 35.0, 45.0, 55.0]
    once = judge_clip(GLOVES, frames("ok", "fault", "ok", "ok", "unseen", "ok"), times)
    assert once.status == "clear"
    twice = judge_clip(GLOVES, frames("ok", "fault", "ok", "fault", "unseen", "ok"), times)
    assert twice.status == "raised"
    assert [f.time_sec for f in twice.frames] == [15.0, 35.0]


def test_nothing_seen_is_unclear_not_clear():
    result = judge_clip(GLOVES, frames("unseen", "unseen"), [0.0, 1.0])
    assert (result.status, result.reason, result.confidence) == ("unclear", "not_visible", 0.0)


def test_no_hazard_in_any_frame_is_unclear():
    result = judge_clip(GOGGLES, frames("not_applicable", "not_applicable"), [0.0, 1.0])
    assert (result.status, result.reason) == ("unclear", "no_hazard_seen")


def test_confidence_rises_with_the_score_and_is_half_at_the_threshold():
    assert confidence(GLOVES, GLOVES.min_score) == pytest.approx(0.5)
    assert confidence(GLOVES, 0.2) < confidence(GLOVES, 0.3) < confidence(GLOVES, 0.5)
    assert confidence(GLOVES, 0.0) >= 0.0 and confidence(GLOVES, 1.0) <= 1.0


def test_box_geometry():
    assert iou((0, 0, 1, 1), (0, 0, 1, 1)) == pytest.approx(1.0)
    assert iou((0, 0, 0.5, 0.5), (0.5, 0.5, 1, 1)) == 0.0
    assert contains((0, 0, 1, 1), (0.2, 0.2, 0.4, 0.4))
    assert not contains((0, 0, 0.3, 0.3), (0.2, 0.2, 0.6, 0.6))
    below = (0.4, 0.2, 0.6, 0.4)
    assert sits_on((0.4, 0.1, 0.6, 0.2), below, gap=0.1)
    assert sits_on((0.4, 0.1, 0.6, 0.21), below, gap=0.1)  # a little inside
    assert not sits_on((0.4, 0.1, 0.6, 0.15), below, gap=0.1)  # 0.05 short, over 0.1 x 0.2
    assert not sits_on((0.4, 0.5, 0.6, 0.6), below, gap=1.0)  # under it, not on it
    assert not sits_on((0.4, 0.2, 0.6, 0.21), below, gap=0.1)  # same top: not higher
    assert not sits_on((0.4, 0.1, 0.4, 0.2), below, gap=0.1)  # no width
    # Half the narrower box's width must overlap.
    assert sits_on((0.45, 0.1, 0.65, 0.2), below, gap=0.1)
    assert not sits_on((0.55, 0.1, 0.75, 0.2), below, gap=0.1)
