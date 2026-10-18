"""Clip quality and still-image checks, with plain image maths (ADR 012, step 2).

Checks handled here: quality.dark, quality.blurry, quality.shaky,
quality.too_short and evidence.static_image. No model is needed, so these run
even when the models are not installed.
"""

from .media import Media
from .schema import CheckResult

QUALITY_CHECKS: frozenset[str] = frozenset(
    {
        "quality.dark",
        "quality.blurry",
        "quality.shaky",
        "quality.too_short",
        "evidence.static_image",
    }
)


def quality_checks(
    media: Media,
    checks: list[str],
    *,
    min_seconds: int | None = None,
    max_seconds: int | None = None,
) -> list[CheckResult]:
    """One CheckResult for each id in `checks` that is in QUALITY_CHECKS, in order.

    Uses `media.quality_frames`. Confidence is how likely the problem is (0-1),
    mapped smoothly from the measured value around its threshold, never a hard 0/1
    unless the value is far from it. `params` carry the measured values so the
    dashboard can say why, for example {"brightness": 0.07} or {"seconds": 12, "minimum": 30}.
    `moments` are the worst frames' times. Video-only checks on a photo come back
    `unavailable` with params {"reason": "photo"}; too_short without `min_seconds`
    is `unavailable` with {"reason": "no_minimum"}.
    """
    raise NotImplementedError
