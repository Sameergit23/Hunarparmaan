"""HunarPramaan AI service (FastAPI).

Stateless (rule 3): it reads the evidence it is sent, returns suggestions and
keeps nothing. The API's queue worker stores the results as `ai_result.stored`
events; this service never writes a score or touches the database (rule 1).
Bodies are never logged (rule 8).

Run: uv run --extra detector uvicorn hunarpramaan_ai.app:app --port 8000
"""

from __future__ import annotations

import hmac
import threading
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, Form, Header, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .media import IMAGE_TYPES, VIDEO_TYPES, Media, UnreadableMedia, read_frames, read_media
from .settings import Settings
from .vision.checks import CHECKS
from .vision.detector import Detector
from .vision.service import VisionReport, run_checks


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def owlv2_factory(settings: Settings) -> Callable[[], Detector]:
    def build() -> Detector:
        try:
            from .vision.detector import Owlv2Detector
        except ImportError as exc:  # pragma: no cover - depends on the install
            raise ApiError(503, "detector_unavailable", str(exc)) from exc
        try:
            return Owlv2Detector(settings.vision_model, settings.vision_revision, settings.device)
        except ImportError as exc:
            raise ApiError(
                503,
                "detector_unavailable",
                "the detector needs the `detector` extra: uv sync --extra detector",
            ) from exc

    return build


class DetectorHolder:
    """Loads the model once, on first use, and runs one inference at a time."""

    def __init__(self, factory: Callable[[], Detector]) -> None:
        self._factory = factory
        self._detector: Detector | None = None
        self._lock = threading.Lock()

    @property
    def name(self) -> str | None:
        return self._detector.name if self._detector else None

    def run(self, media: Media, checks: list[str]) -> VisionReport:
        with self._lock:
            if self._detector is None:
                self._detector = self._factory()
            return run_checks(self._detector, media, checks)


def report_json(report: VisionReport, media: Media) -> dict[str, Any]:
    return {
        "engine": report.engine,
        "media": {
            "kind": media.kind,
            "frames": len(media.frames),
            "durationSec": media.duration_sec,
        },
        "results": [
            {
                "check": r.check,
                "status": r.status,
                "confidence": r.confidence,
                "reason": r.reason,
                "frames": [
                    {
                        "index": f.index,
                        "timeSec": round(f.time_sec, 2),
                        "score": f.score,
                        "box": [round(v, 4) for v in f.box] if f.box else None,
                    }
                    for f in r.frames
                ],
            }
            for r in report.results
        ],
        "unsupported": report.unsupported,
    }


def parse_checks(raw: str | None) -> list[str]:
    checks = [c.strip() for c in (raw or "").split(",") if c.strip()]
    if not checks:
        raise ApiError(400, "no_checks", "name at least one check, for example checks=ppe.gloves")
    return checks


def create_app(
    settings: Settings | None = None, detector_factory: Callable[[], Detector] | None = None
) -> FastAPI:
    settings = settings or Settings.from_env()
    holder = DetectorHolder(detector_factory or owlv2_factory(settings))
    max_bytes = settings.max_upload_mb * 1024 * 1024

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if settings.preload:
            await run_in_threadpool(holder.run, Media("frames", []), [])
        yield

    app = FastAPI(
        title="HunarPramaan AI service",
        version="0.1.0",
        description="Assessment aids that only suggest. A person always decides.",
        lifespan=lifespan,
    )

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            {"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status
        )

    def authorised(authorization: Annotated[str | None, Header()] = None) -> None:
        if settings.token is None:
            return
        expected = f"Bearer {settings.token}"
        if authorization is None or not hmac.compare_digest(authorization, expected):
            raise ApiError(401, "unauthorised", "a valid service token is required")

    @app.get("/healthz")
    def healthz() -> dict[str, Any]:
        return {"ok": True, "detector": holder.name, "checks": sorted(CHECKS)}

    @app.get("/v1/vision/checks", dependencies=[Depends(authorised)])
    def list_checks() -> list[dict[str, Any]]:
        """Every check and the prompts behind it, so a reviewer can see what the AI looks for."""
        return [
            {"id": s.id, "ok": s.ok, "fault": s.fault, "context": s.context}
            for s in CHECKS.values()
        ]

    @app.post("/v1/vision/checks", dependencies=[Depends(authorised)])
    async def check_media(
        request: Request,
        checks: Annotated[str, Query(description="Comma-separated check ids")],
        max_frames: Annotated[int | None, Query(alias="maxFrames", ge=1, le=32)] = None,
    ) -> dict[str, Any]:
        """The body is one photo (image/jpeg, image/png) or clip (video/mp4)."""
        wanted = parse_checks(checks)
        mime = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
        if mime not in IMAGE_TYPES | VIDEO_TYPES:
            raise ApiError(415, "unsupported_media", f"expected a photo or a clip, got {mime!r}")
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > max_bytes:
            raise ApiError(413, "too_large", f"the limit is {settings.max_upload_mb} MB")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > max_bytes:
                raise ApiError(413, "too_large", f"the limit is {settings.max_upload_mb} MB")
        try:
            media = await run_in_threadpool(
                read_media, bytes(body), mime, max_frames or settings.max_frames
            )
        except UnreadableMedia as exc:
            raise ApiError(422, "unreadable_media", str(exc)) from exc
        report = await run_in_threadpool(holder.run, media, wanted)
        return report_json(report, media)

    @app.post("/v1/vision/frames", dependencies=[Depends(authorised)])
    async def check_frames(
        checks: Annotated[str, Form()],
        frames: Annotated[list[UploadFile], File(description="JPEG or PNG frames")],
        times: Annotated[str | None, Form(description="Comma-separated seconds")] = None,
    ) -> dict[str, Any]:
        """Frames the caller already sampled, for example on the phone."""
        wanted = parse_checks(checks)
        if not 1 <= len(frames) <= 32:
            raise ApiError(400, "bad_frames", "send between 1 and 32 frames")
        parts = [await f.read() for f in frames]
        if sum(len(p) for p in parts) > max_bytes:
            raise ApiError(413, "too_large", f"the limit is {settings.max_upload_mb} MB")
        try:
            seconds = [float(t) for t in times.split(",")] if times else None
            media = await run_in_threadpool(read_frames, parts, seconds)
        except ValueError as exc:  # UnreadableMedia is a ValueError too
            raise ApiError(422, "unreadable_media", str(exc)) from exc
        report = await run_in_threadpool(holder.run, media, wanted)
        return report_json(report, media)

    return app


# For `uvicorn hunarpramaan_ai.app:app`. Cheap: the model loads on the first request.
app = create_app()
