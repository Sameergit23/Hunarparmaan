"""People, hands and screens in a frame, with MediaPipe Tasks (Apache-2.0) (ADR 012, step 3).

MediaPipe is optional: it has no wheel for Intel Macs, and on Linux it needs the
system EGL library (libegl1). Without it, `PeopleDetector.load` returns None and
the checks that need people come back `unavailable`.

Models (in the models directory, from `hp-ai fetch-models`):
- pose_landmarker_full.task: up to 4 people, 33 landmarks each
- hand_landmarker.task: up to 4 hands, 21 landmarks each
- efficientdet_lite2.tflite: COCO objects; we keep person, tv, laptop, cell phone
"""

from dataclasses import dataclass, field
from pathlib import Path

from .media import RGB


@dataclass(frozen=True)
class Box:
    """Pixel box in the frame: left, top, right, bottom (right > left, bottom > top)."""

    left: float
    top: float
    right: float
    bottom: float

    @property
    def width(self) -> float:
        return self.right - self.left

    @property
    def height(self) -> float:
        return self.bottom - self.top

    @property
    def area(self) -> float:
        return max(0.0, self.width) * max(0.0, self.height)


@dataclass(frozen=True)
class Point:
    """Pixel position with MediaPipe's visibility (0-1)."""

    x: float
    y: float
    visibility: float = 1.0


@dataclass
class Pose:
    """One person's body landmarks, by MediaPipe pose index (0 nose, 2/5 eyes,
    7/8 ears, 11/12 shoulders, 15/16 wrists, 17-22 hand points, 27/28 ankles,
    29/30 heels, 31/32 foot index). Coordinates are in pixels."""

    landmarks: list[Point]
    box: Box


@dataclass
class Hand:
    #: 21 landmarks in pixels.
    landmarks: list[Point]
    box: Box
    #: "Left" or "Right" as MediaPipe reports it.
    handedness: str
    score: float


@dataclass
class Detection:
    #: COCO label: "person", "tv", "laptop" or "cell phone".
    label: str
    score: float
    box: Box


@dataclass
class FramePeople:
    width: int
    height: int
    poses: list[Pose] = field(default_factory=list)
    hands: list[Hand] = field(default_factory=list)
    #: People found by the object detector (score >= 0.5).
    persons: list[Detection] = field(default_factory=list)
    #: Screens: tv, laptop, cell phone (score >= 0.4).
    screens: list[Detection] = field(default_factory=list)


class PeopleDetector:
    #: For the report's `models` entry, e.g. {"pose": "pose_landmarker_full", ...}.
    models: dict[str, str]

    @classmethod
    def load(cls, models_dir: Path) -> "PeopleDetector | None":
        """None when MediaPipe cannot be imported or loaded, or the model files are missing."""
        raise NotImplementedError

    def detect(self, rgb: RGB) -> FramePeople:
        """Run pose, hands and objects on one frame (IMAGE mode, CPU)."""
        raise NotImplementedError

    def close(self) -> None:
        """Release the MediaPipe tasks."""
        raise NotImplementedError
