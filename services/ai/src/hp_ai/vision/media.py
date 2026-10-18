"""Decoding clips and photos into frames (ADR 012, step 1)."""

from dataclasses import dataclass, field
from typing import Literal

import numpy as np
from numpy.typing import NDArray

RGB = NDArray[np.uint8]
"""An image as an (height, width, 3) uint8 array in RGB order."""


class MediaError(ValueError):
    """The upload is not a clip or photo we can decode. The API answers 422."""


@dataclass
class Frame:
    #: Seconds from the start of the clip (0 for a photo).
    time_sec: float
    rgb: RGB


@dataclass
class Media:
    kind: Literal["video", "photo"]
    #: Real duration from the container (0 for a photo).
    duration_sec: float
    #: Size of the original, before any scaling.
    width: int
    height: int
    #: Up to `quality_fps` frames a second (at most `max_quality_frames`), at most
    #: `max_side` px on the long side: for the quality checks.
    quality_frames: list[Frame] = field(default_factory=list)
    #: One frame every `model_interval_sec` (at most `max_model_frames`), at most
    #: `max_side` px: for the people detector and CLIP.
    model_frames: list[Frame] = field(default_factory=list)
    #: One frame every `phash_interval_sec`, for the perceptual hash.
    phash_frames: list[Frame] = field(default_factory=list)
    phash_interval_sec: float = 1.0


def decode_media(
    data: bytes,
    *,
    quality_fps: float = 4.0,
    max_quality_frames: int = 160,
    model_interval_sec: float = 1.0,
    max_model_frames: int = 24,
    phash_interval_sec: float = 1.0,
    max_phash_frames: int = 120,
    max_side: int = 640,
) -> Media:
    """Decode a video (any container PyAV reads: mp4, webm, mov, avi) or a photo
    (JPEG, PNG, WebP via Pillow) from bytes.

    - Frames are spread evenly over the whole clip; when a clip is longer than
      the caps allow, the interval grows rather than cutting the end off.
    - A photo gives one frame in each list, kind "photo", duration 0.
    - Raises MediaError for anything that is not a decodable clip or photo,
      or that has no frames.
    - Never writes to disk and never logs pixels (rule 8).
    """
    raise NotImplementedError
