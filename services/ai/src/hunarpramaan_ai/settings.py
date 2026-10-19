"""Settings from the environment. The service keeps no state and never touches the database."""

from __future__ import annotations

import os
from dataclasses import dataclass

from .vision.detector import DEFAULT_MODEL, DEFAULT_REVISION


@dataclass(frozen=True)
class Settings:
    vision_model: str = DEFAULT_MODEL
    vision_revision: str = DEFAULT_REVISION
    #: "cpu" or "cuda"; empty picks CUDA when PyTorch can see a GPU.
    device: str | None = None
    #: Frames sampled from each clip. About 8 s each on a laptop CPU, well under 1 s on a GPU.
    max_frames: int = 6
    max_upload_mb: int = 80
    #: When set, callers must send `Authorization: Bearer <token>`.
    token: str | None = None
    #: Load the model at start-up instead of on the first request.
    preload: bool = False

    @classmethod
    def from_env(cls) -> Settings:
        env = os.environ

        def opt(name: str) -> str | None:
            value = env.get(name, "").strip()
            return value or None

        return cls(
            vision_model=opt("AI_VISION_MODEL") or DEFAULT_MODEL,
            vision_revision=opt("AI_VISION_REVISION") or DEFAULT_REVISION,
            device=opt("AI_DEVICE"),
            max_frames=int(opt("AI_MAX_FRAMES") or cls.max_frames),
            max_upload_mb=int(opt("AI_MAX_UPLOAD_MB") or cls.max_upload_mb),
            token=opt("AI_SERVICE_TOKEN"),
            preload=(opt("AI_PRELOAD") or "false").lower() == "true",
        )
