"""Safety-gear and workmanship checks, written as text prompts for an open-vocabulary detector.

Each check compares two sets of prompts on the same region of a frame: what the
right gear or work looks like (`ok`) and what its absence looks like (`fault`).
A region is a fault only when the fault prompts beat the ok prompts there, so a
gloved hand is not reported as a bare hand just because it is a hand.

A check only suggests (rule 1). Its result is a hint beside the assessor's score.
The prompts, thresholds and calibration were chosen on the tune split of the
labelled set in evaluation/safety-gear; the README reports the test split.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from .detector import Box, Proposal

Status = Literal["raised", "clear", "unclear"]
FrameStatus = Literal["fault", "ok", "unseen", "not_applicable"]


@dataclass(frozen=True)
class CheckSpec:
    id: str
    #: Prompts for the gear being worn, or the work done right.
    ok: tuple[str, ...]
    #: Prompts for the gear missing, or the work done wrong.
    fault: tuple[str, ...]
    #: When set, the check applies only to frames where one of these is seen
    #: (eye protection matters while grinding or welding).
    context: tuple[str, ...] = ()
    #: A region counts when its best prompt scores at least this.
    min_score: float = 0.2
    #: A fault region must beat the ok prompts on the same region by this much.
    margin: float = 0.0
    #: A fault region that contains an ok region is cleared (goggles on a face, a helmet on a head).
    contain_clears: bool = False
    context_score: float = 0.25
    #: How fast the confidence rises above `min_score`, where it is 50% (see `confidence`).
    scale: float = 0.1

    @property
    def queries(self) -> tuple[str, ...]:
        return self.ok + self.fault + self.context


CHECKS: dict[str, CheckSpec] = {
    spec.id: spec
    for spec in (
        # Thresholds from a grid search on the tune split (evaluate.py --tune), rules 1.
        CheckSpec(
            id="ppe.gloves",
            ok=("a gloved hand", "a work glove", "a rubber glove"),
            fault=("a bare hand", "bare fingers"),
            min_score=0.15,
            margin=0.1,
        ),
        CheckSpec(
            id="ppe.helmet",
            ok=("a hard hat", "a safety helmet"),
            fault=("a bare head", "a head of hair"),
            min_score=0.1,
            margin=0.1,
            contain_clears=True,
        ),
        CheckSpec(
            id="ppe.shoes",
            ok=("a safety boot", "a work boot", "a closed shoe"),
            fault=("a bare foot", "a sandal", "a flip-flop", "a slipper"),
            min_score=0.3,
            margin=0.05,
        ),
        CheckSpec(
            id="ppe.goggles",
            ok=("safety goggles", "safety glasses", "a face shield", "a welding helmet"),
            fault=("a person's face", "a person's eyes"),
            context=("sparks", "an angle grinder", "a welding torch", "a grinding wheel"),
            min_score=0.2,
            margin=0.1,
            contain_clears=True,
            context_score=0.3,
        ),
        CheckSpec(
            id="work.joint_insulated",
            ok=("electrical tape wrapped around wires", "a twist-on wire connector"),
            fault=("bare twisted copper wires", "an exposed copper wire joint"),
            min_score=0.1,
            margin=0.05,
        ),
    )
}


@dataclass(frozen=True)
class Region:
    box: Box
    role: Literal["ok", "fault"]
    score: float


@dataclass(frozen=True)
class FrameJudgement:
    status: FrameStatus
    #: The fault score for a fault frame, the ok score for an ok frame, else 0.
    score: float = 0.0
    box: Box | None = None


@dataclass(frozen=True)
class FrameRef:
    index: int
    time_sec: float
    score: float
    box: Box | None


@dataclass(frozen=True)
class CheckResult:
    check: str
    status: Status
    confidence: float
    #: Why the check is unclear: "not_visible" or "no_hazard_seen".
    reason: str | None
    #: The frames behind the result: fault frames when raised, ok frames when clear.
    frames: list[FrameRef]


def _area(b: Box) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _intersection(a: Box, b: Box) -> float:
    return _area((max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])))


def iou(a: Box, b: Box) -> float:
    inter = _intersection(a, b)
    union = _area(a) + _area(b) - inter
    return inter / union if union > 0 else 0.0


def contains(outer: Box, inner: Box, share: float = 0.6) -> bool:
    """Whether most of `inner` lies inside `outer`."""
    area = _area(inner)
    return area > 0 and _intersection(outer, inner) / area >= share


def regions(spec: CheckSpec, proposals: Sequence[Proposal]) -> list[Region]:
    """Each region labelled by the stronger prompt set, after non-maximum suppression."""
    found: list[Region] = []
    for p in proposals:
        ok = max((p.scores.get(q, 0.0) for q in spec.ok), default=0.0)
        fault = max((p.scores.get(q, 0.0) for q in spec.fault), default=0.0)
        if max(ok, fault) < spec.min_score:
            continue
        if fault > ok + spec.margin:
            found.append(Region(p.box, "fault", fault))
        else:
            found.append(Region(p.box, "ok", ok))
    found.sort(key=lambda r: r.score, reverse=True)
    kept: list[Region] = []
    for r in found:
        if all(iou(r.box, k.box) < 0.5 for k in kept):
            kept.append(r)
    return kept


def judge_frame(spec: CheckSpec, proposals: Sequence[Proposal]) -> FrameJudgement:
    if spec.context:
        seen = max((p.scores.get(q, 0.0) for p in proposals for q in spec.context), default=0.0)
        if seen < spec.context_score:
            return FrameJudgement("not_applicable")
    found = regions(spec, proposals)
    oks = [r for r in found if r.role == "ok"]
    faults = [r for r in found if r.role == "fault"]
    if spec.contain_clears:
        faults = [f for f in faults if not any(contains(f.box, o.box) for o in oks)]
    if faults:
        worst = max(faults, key=lambda r: r.score)
        return FrameJudgement("fault", worst.score, worst.box)
    if oks:
        best = max(oks, key=lambda r: r.score)
        return FrameJudgement("ok", best.score, best.box)
    return FrameJudgement("unseen")


def confidence(spec: CheckSpec, score: float) -> float:
    """The detector's score as a confidence: 50% at the check's threshold, rising to 88%
    0.2 above it. A ranking, not a calibrated probability: the README's precision per
    check says how often a raised flag was right."""
    return 1.0 / (1.0 + math.exp(-(score - spec.min_score) / spec.scale))


def min_fault_frames(seen_frames: int) -> int:
    """One frame decides for a photo; a clip needs the fault in two frames, so one odd frame
    does not raise a flag."""
    return 1 if seen_frames <= 2 else 2


def judge_clip(
    spec: CheckSpec, judgements: Sequence[FrameJudgement], times: Sequence[float]
) -> CheckResult:
    refs = [(j, FrameRef(i, times[i], round(j.score, 4), j.box)) for i, j in enumerate(judgements)]
    applicable = [(j, r) for j, r in refs if j.status != "not_applicable"]
    if not applicable:
        return CheckResult(spec.id, "unclear", 0.0, "no_hazard_seen", [])
    faults = sorted(
        ((j, r) for j, r in applicable if j.status == "fault"), key=lambda x: -x[0].score
    )
    oks = sorted(((j, r) for j, r in applicable if j.status == "ok"), key=lambda x: -x[0].score)
    seen = len(faults) + len(oks)
    needed = min_fault_frames(seen)
    if len(faults) >= needed:
        # The weakest of the frames needed to raise it, so one strong frame cannot carry it.
        score = faults[needed - 1][0].score
        return CheckResult(
            spec.id, "raised", round(confidence(spec, score), 2), None, [r for _, r in faults[:3]]
        )
    if oks:
        # Clear: how plainly the gear (or the insulated joint) was seen.
        score = oks[0][0].score
        return CheckResult(
            spec.id, "clear", round(confidence(spec, score), 2), None, [r for _, r in oks[:3]]
        )
    return CheckResult(spec.id, "unclear", 0.0, "not_visible", [r for _, r in faults[:3]])
