"""The service's catalogue and report shapes match packages/contracts."""

from contract import assert_matches, schema

from hp_ai.vision.catalogue import CHECKS
from hp_ai.vision.schema import CheckResult, Phash, VideoInfo, VisionReport


def test_catalogue_matches_the_contract() -> None:
    contract = schema("vision-checks")
    assert list(contract) == list(CHECKS)
    for check, spec in CHECKS.items():
        assert contract[check] == {"group": spec.group, "always": spec.always, "photo": spec.photo}


def test_a_report_fits_the_contract() -> None:
    report = VisionReport(
        engine="hp-ai 0.1.0",
        models={"clip": "test"},
        video=VideoInfo(
            kind="video",
            duration_sec=31.5,
            width=854,
            height=480,
            frames_decoded=126,
            frames_analysed=24,
        ),
        checks=[
            CheckResult(
                check="ppe.gloves",
                status="raised",
                confidence=0.81,
                frames_seen=10,
                frames_total=24,
                moments=[3.0, 8.0],
                params={"reason": "bare_hand"},
            ),
            CheckResult.not_visible("ppe.footwear", 24, "no_feet"),
            CheckResult.unavailable("step.order", 24, "not_built"),
        ],
        phash=Phash(interval_sec=1.0, frames=["00ff00ff00ff00ff"]),
        timing_ms=1234,
    )
    assert_matches("vision-report", report.to_json())


def test_wrong_confidence_is_refused() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CheckResult(
            check="ppe.gloves", status="clear", confidence=None, frames_seen=1, frames_total=1
        )
    with pytest.raises(ValidationError):
        CheckResult(
            check="ppe.gloves", status="not_visible", confidence=0.2, frames_seen=0, frames_total=1
        )
