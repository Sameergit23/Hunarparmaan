"""The vision report, mirrored from packages/contracts/src/vision.ts (pydantic).

tests/test_contract.py checks real reports against the JSON Schemas generated
from the zod contract (packages/contracts/json-schema/).
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .catalogue import CHECK_IDS

CheckId = Annotated[str, Field(pattern=r"^[a-z]+(\.[a-z_]+)+$")]
Status = Literal["raised", "clear", "uncertain", "not_visible", "unavailable"]
#: Values for a reason, worded by each app in Hindi or English (rule 7).
Params = dict[str, str | int | float]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CheckResult(Strict):
    check: CheckId
    status: Status
    #: How likely the problem is, 0 to 1. None exactly when the check did not look.
    confidence: Annotated[float, Field(ge=0, le=1)] | None
    frames_seen: Annotated[int, Field(ge=0, serialization_alias="framesSeen")]
    frames_total: Annotated[int, Field(ge=0, serialization_alias="framesTotal")]
    #: Up to three moments, in seconds, where the problem shows most.
    moments: Annotated[list[Annotated[float, Field(ge=0)]], Field(max_length=3)] = []
    params: Params = {}

    @model_validator(mode="after")
    def _consistent(self) -> "CheckResult":
        did_not_look = self.status in ("not_visible", "unavailable")
        if did_not_look != (self.confidence is None):
            raise ValueError("confidence is None exactly when the check did not look")
        if self.frames_seen > self.frames_total:
            raise ValueError("frames_seen cannot exceed frames_total")
        if self.check not in CHECK_IDS:
            raise ValueError(f"unknown check {self.check}")
        return self

    @classmethod
    def unavailable(cls, check: str, frames_total: int, reason: str) -> "CheckResult":
        return cls(
            check=check,
            status="unavailable",
            confidence=None,
            frames_seen=0,
            frames_total=frames_total,
            params={"reason": reason},
        )

    @classmethod
    def not_visible(cls, check: str, frames_total: int, reason: str) -> "CheckResult":
        return cls(
            check=check,
            status="not_visible",
            confidence=None,
            frames_seen=0,
            frames_total=frames_total,
            params={"reason": reason},
        )


class VideoInfo(Strict):
    kind: Literal["video", "photo"]
    duration_sec: Annotated[float, Field(ge=0, serialization_alias="durationSec")]
    width: Annotated[int, Field(gt=0)]
    height: Annotated[int, Field(gt=0)]
    frames_decoded: Annotated[int, Field(ge=0, serialization_alias="framesDecoded")]
    frames_analysed: Annotated[int, Field(ge=0, serialization_alias="framesAnalysed")]


class Phash(Strict):
    algorithm: Literal["dct64"] = "dct64"
    interval_sec: Annotated[float, Field(gt=0, serialization_alias="intervalSec")]
    frames: list[Annotated[str, Field(pattern=r"^[0-9a-f]{16}$")]]


class VisionReport(Strict):
    report_version: Literal[1] = Field(default=1, serialization_alias="reportVersion")
    engine: str
    models: dict[str, str]
    video: VideoInfo
    checks: list[CheckResult]
    phash: Phash
    timing_ms: Annotated[int, Field(ge=0, serialization_alias="timingMs")]

    def to_json(self) -> dict[str, object]:
        """The wire format: camelCase keys, as in the TypeScript contract."""
        return self.model_dump(by_alias=True, mode="json")


class AnalyzeOptions(Strict):
    """The `options` form field of POST /vision/analyze."""

    checks: Annotated[list[CheckId], Field(min_length=1)]
    min_seconds: Annotated[int, Field(gt=0, alias="minSeconds")] | None = None
    max_seconds: Annotated[int, Field(gt=0, alias="maxSeconds")] | None = None
