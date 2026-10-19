"""The detector interface (ADR 007): frame in, scored boxes out.

The checks never see the model, only `Proposal`s, so the model can be swapped
(for example for a fine-tuned YOLOX or D-FINE later) without touching the rules.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np
from PIL import Image

#: (x0, y0, x1, y1), each a fraction of the image width or height.
Box = tuple[float, float, float, float]


@dataclass(frozen=True)
class Proposal:
    """One region of a frame, with the detector's score for every text query."""

    box: Box
    scores: dict[str, float] = field(default_factory=dict)


class Detector(Protocol):
    #: Model and revision, recorded with every result so a result can be traced to its model.
    name: str

    def detect(self, images: Sequence[Image.Image], queries: Sequence[str]) -> list[list[Proposal]]:
        """Score each query on regions of each image; one list of proposals per image."""
        ...


DEFAULT_MODEL = "google/owlv2-base-patch16-ensemble"
DEFAULT_REVISION = "cfd3195ba4ea9592eec887ded089f4c08eff231d"


def proposals_from(
    boxes: np.ndarray, scores: np.ndarray, queries: Sequence[str], min_score: float
) -> list[Proposal]:
    """Proposals for the regions where at least one query scores `min_score` or more."""
    keep = scores.max(axis=1) >= min_score
    return [
        Proposal(
            (float(b[0]), float(b[1]), float(b[2]), float(b[3])),
            {q: float(s) for q, s in zip(queries, row, strict=True)},
        )
        for b, row in zip(boxes[keep], scores[keep], strict=True)
    ]


class Owlv2Detector:
    """OWLv2 (Apache-2.0), an open-vocabulary detector: the checks are written as text.

    Needs the `detector` extra (PyTorch and transformers). The weights download
    from Hugging Face on first use, about 620 MB, pinned to one revision.
    """

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL,
        revision: str = DEFAULT_REVISION,
        device: str | None = None,
        min_score: float = 0.05,
        batch_size: int = 4,
    ) -> None:
        import torch
        from transformers import Owlv2ForObjectDetection, Owlv2Processor

        self._torch = torch
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.processor = Owlv2Processor.from_pretrained(model_id, revision=revision)
        self.model = Owlv2ForObjectDetection.from_pretrained(model_id, revision=revision)
        self.model.to(self.device).eval()
        self.min_score = min_score
        self.batch_size = batch_size
        self.name = f"{model_id.split('/')[-1]}@{revision[:7]}"

    def detect(self, images: Sequence[Image.Image], queries: Sequence[str]) -> list[list[Proposal]]:
        return [
            proposals_from(boxes, scores, queries, self.min_score)
            for boxes, scores in self.score(images, queries)
        ]

    def score(
        self, images: Sequence[Image.Image], queries: Sequence[str]
    ) -> list[tuple[np.ndarray, np.ndarray]]:
        """Every region's box (N, 4) and its score for each query (N, Q), per image.

        Boxes depend only on the image and each query is scored on its own, so the
        evaluation can cache these and add queries later.
        """
        out: list[tuple[np.ndarray, np.ndarray]] = []
        for start in range(0, len(images), self.batch_size):
            out.extend(self._score_batch(images[start : start + self.batch_size], queries))
        return out

    def _score_batch(
        self, images: Sequence[Image.Image], queries: Sequence[str]
    ) -> list[tuple[np.ndarray, np.ndarray]]:
        torch = self._torch
        inputs = self.processor(
            text=[list(queries)] * len(images), images=list(images), return_tensors="pt"
        ).to(self.device)
        with torch.inference_mode():
            outputs = self.model(**inputs)
        scores = torch.sigmoid(outputs.logits).float().cpu().numpy()  # (batch, regions, queries)
        centres = outputs.pred_boxes.float().cpu().numpy()  # (batch, regions, 4): cx, cy, w, h
        result = []
        for i, image in enumerate(images):
            # OWLv2 pads each image to a square at the bottom and right before
            # resizing, so its boxes are fractions of that square.
            w, h = image.size
            side = max(w, h)
            cx, cy, bw, bh = centres[i].T
            boxes = np.stack(
                [
                    np.clip((cx - bw / 2) * side / w, 0, 1),
                    np.clip((cy - bh / 2) * side / h, 0, 1),
                    np.clip((cx + bw / 2) * side / w, 0, 1),
                    np.clip((cy + bh / 2) * side / h, 0, 1),
                ],
                axis=1,
            )
            # Regions that lie wholly in the padding have no area left after clipping.
            inside = (boxes[:, 2] > boxes[:, 0]) & (boxes[:, 3] > boxes[:, 1])
            result.append((boxes[inside], scores[i][inside]))
        return result
