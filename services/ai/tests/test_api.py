from __future__ import annotations

import pytest
from conftest import FakeDetector, jpeg, region
from fastapi.testclient import TestClient
from test_media import mp4

from hunarpramaan_ai.app import create_app
from hunarpramaan_ai.settings import Settings

BARE_HAND = region((0.1, 0.5, 0.3, 0.8), a_bare_hand=0.45, a_gloved_hand=0.1)
HARD_HAT = region((0.4, 0.0, 0.6, 0.2), a_hard_hat=0.6)


def client(detector=None, **settings) -> TestClient:
    detector = detector or FakeDetector([BARE_HAND, HARD_HAT])
    app = create_app(Settings(**settings), detector_factory=lambda: detector)
    return TestClient(app)


def post(c: TestClient, body: bytes, mime="image/jpeg", checks="ppe.gloves,ppe.helmet", **kw):
    return c.post(
        "/v1/vision/checks",
        params={"checks": checks},
        content=body,
        headers={"content-type": mime, **kw.pop("headers", {})},
        **kw,
    )


def test_health_lists_the_checks_and_loads_no_model():
    detector = FakeDetector()
    res = client(detector).get("/healthz")
    assert res.status_code == 200
    assert res.json()["detector"] is None
    assert "ppe.gloves" in res.json()["checks"]
    assert detector.calls == 0


def test_a_photo_gets_a_result_per_check(photo):
    res = post(client(), photo, checks="ppe.gloves,ppe.helmet,meter.reading")
    assert res.status_code == 200
    body = res.json()
    assert body["engine"].startswith("fake@0000000+rules.")
    assert body["media"] == {"kind": "photo", "frames": 1, "durationSec": None}
    assert body["unsupported"] == ["meter.reading"]
    results = {r["check"]: r for r in body["results"]}
    assert results["ppe.gloves"]["status"] == "raised"
    assert results["ppe.gloves"]["frames"] == [
        {"index": 0, "timeSec": 0.0, "score": 0.45, "box": [0.1, 0.5, 0.3, 0.8]}
    ]
    assert 0.5 < results["ppe.gloves"]["confidence"] <= 1.0
    assert results["ppe.helmet"]["status"] == "clear"


def test_a_clip_is_sampled_and_checked():
    res = post(client(), mp4(seconds=3.0), mime="video/mp4")
    assert res.status_code == 200
    body = res.json()
    assert body["media"]["kind"] == "video"
    assert body["media"]["frames"] == 6
    gloves = next(r for r in body["results"] if r["check"] == "ppe.gloves")
    assert gloves["status"] == "raised"
    assert len(gloves["frames"]) == 3


def test_max_frames_can_be_lowered():
    res = client().post(
        "/v1/vision/checks",
        params={"checks": "ppe.gloves", "maxFrames": 2},
        content=mp4(seconds=2.0),
        headers={"content-type": "video/mp4"},
    )
    assert res.json()["media"]["frames"] == 2


def test_only_unsupported_checks_skip_the_model(photo):
    detector = FakeDetector()
    res = post(client(detector), photo, checks="meter.reading,step.order")
    assert res.json()["results"] == []
    assert detector.calls == 0


@pytest.mark.parametrize(
    ("body", "mime", "checks", "status", "code"),
    [
        (jpeg(), "image/jpeg", "", 400, "no_checks"),
        (b"hello", "text/plain", "ppe.gloves", 415, "unsupported_media"),
        (b"not a jpeg", "image/jpeg", "ppe.gloves", 422, "unreadable_media"),
    ],
)
def test_bad_requests(body, mime, checks, status, code):
    res = post(client(), body, mime=mime, checks=checks)
    assert res.status_code == status
    assert res.json()["error"]["code"] == code


def test_uploads_over_the_limit_are_refused():
    res = post(client(max_upload_mb=1), b"\xff" * (1024 * 1024 + 1))
    assert res.status_code == 413


def test_a_token_is_required_when_set(photo):
    c = client(token="s3cret-token")
    assert post(c, photo).status_code == 401
    assert post(c, photo, headers={"authorization": "Bearer wrong"}).status_code == 401
    assert post(c, photo, headers={"authorization": "Bearer s3cret-token"}).status_code == 200
    assert c.get("/healthz").status_code == 200


def test_frames_sampled_by_the_caller():
    res = client().post(
        "/v1/vision/frames",
        data={"checks": "ppe.gloves", "times": "1.5,9"},
        files=[
            ("frames", ("a.jpg", jpeg(), "image/jpeg")),
            ("frames", ("b.jpg", jpeg(), "image/jpeg")),
        ],
    )
    assert res.status_code == 200
    gloves = res.json()["results"][0]
    assert gloves["status"] == "raised"
    assert [f["timeSec"] for f in gloves["frames"]] == [1.5, 9.0]


def test_the_prompts_are_published():
    res = client().get("/v1/vision/checks")
    gloves = next(c for c in res.json() if c["id"] == "ppe.gloves")
    assert "a bare hand" in gloves["fault"]
