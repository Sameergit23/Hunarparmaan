"""Run the requested checks over a clip's frames."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from ..media import Media
from .checks import CHECKS, CheckResult, judge_clip, judge_frame
from .detector import Detector

#: Bumped whenever prompts, thresholds or the aggregation change, so a stored
#: result says which rules produced it.
RULES_VERSION = "2"


@dataclass(frozen=True)
class VisionReport:
    engine: str
    results: list[CheckResult]
    #: Requested checks this service has no rule for (for example `meter.reading`).
    unsupported: list[str]


def supported(checks: Sequence[str]) -> tuple[list[str], list[str]]:
    known = [c for c in dict.fromkeys(checks) if c in CHECKS]
    return known, [c for c in dict.fromkeys(checks) if c not in CHECKS]


def run_checks(detector: Detector, media: Media, checks: Sequence[str]) -> VisionReport:
    known, unsupported = supported(checks)
    engine = f"{detector.name}+rules.{RULES_VERSION}"
    if not known:
        return VisionReport(engine, [], unsupported)
    specs = [CHECKS[c] for c in known]
    queries = list(dict.fromkeys(q for spec in specs for q in spec.queries))
    per_frame = detector.detect([f.image for f in media.frames], queries)
    times = [f.time_sec for f in media.frames]
    results = [
        judge_clip(spec, [judge_frame(spec, proposals) for proposals in per_frame], times)
        for spec in specs
    ]
    return VisionReport(engine, results, unsupported)
