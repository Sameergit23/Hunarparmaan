from __future__ import annotations

import io
from collections.abc import Sequence

import pytest
from PIL import Image

from hunarpramaan_ai.vision.detector import Proposal


class FakeDetector:
    """Returns the same proposals for every frame, scored only on the prompts given."""

    name = "fake@0000000"

    def __init__(self, proposals: Sequence[Proposal] = ()) -> None:
        self.proposals = list(proposals)
        self.calls = 0

    def detect(self, images, queries) -> list[list[Proposal]]:
        self.calls += 1
        return [
            [Proposal(p.box, {q: p.scores.get(q, 0.0) for q in queries}) for p in self.proposals]
            for _ in images
        ]


def region(box=(0.1, 0.1, 0.3, 0.3), **scores: float) -> Proposal:
    """A proposal with scores keyed by prompt (spaces written as underscores)."""
    return Proposal(box, {k.replace("_", " "): v for k, v in scores.items()})


def jpeg(colour=(200, 120, 60), size=(64, 48)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, colour).save(buffer, "JPEG")
    return buffer.getvalue()


@pytest.fixture
def photo() -> bytes:
    return jpeg()
