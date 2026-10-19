"""Turn uploaded evidence into frames: a photo is one frame, a clip is sampled evenly.

Everything stays in memory. Nothing is written to disk or logged (rule 8).
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import av
from PIL import Image, UnidentifiedImageError

# Frames are resized so the longest side is at most this; the detector resizes again.
MAX_SIDE = 1280

IMAGE_TYPES = {"image/jpeg", "image/png"}
VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}


class UnreadableMedia(ValueError):
    """The bytes could not be decoded as the declared type."""


@dataclass(frozen=True)
class Frame:
    image: Image.Image
    index: int
    #: Seconds from the start of the clip; 0 for a photo.
    time_sec: float


@dataclass(frozen=True)
class Media:
    kind: str  # "photo", "video" or "frames"
    frames: list[Frame]
    duration_sec: float | None = None


def _fit(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE))
    return image


def load_image(data: bytes, index: int = 0, time_sec: float = 0.0) -> Frame:
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            return Frame(_fit(img), index, time_sec)
    except (UnidentifiedImageError, OSError) as exc:
        raise UnreadableMedia("not a readable image") from exc


def sample_video(data: bytes, max_frames: int) -> Media:
    """Decode up to `max_frames` frames spread evenly over the clip."""
    try:
        with av.open(io.BytesIO(data)) as container:
            stream = next((s for s in container.streams if s.type == "video"), None)
            if stream is None:
                raise UnreadableMedia("the clip has no video stream")
            duration = _duration(container, stream)
            decoded = list(_decode_evenly(container, stream, duration, max_frames))
    except av.FFmpegError as exc:
        raise UnreadableMedia("not a readable video") from exc
    if not decoded:
        raise UnreadableMedia("the clip has no frames")
    frames = [Frame(_fit(img), i, t) for i, (t, img) in enumerate(decoded)]
    return Media("video", frames, duration)


def _duration(container: av.container.InputContainer, stream: av.VideoStream) -> float | None:
    if stream.duration is not None and stream.time_base is not None:
        return float(stream.duration * stream.time_base)
    if container.duration is not None:
        return container.duration / av.time_base
    return None


def _decode_evenly(container, stream, duration: float | None, max_frames: int):
    """Yield (seconds, image) at the middle of `max_frames` equal slices of the clip.

    Decoding every frame of a 60 s clip is cheap at 480p, and it avoids seeking,
    which is unreliable for some phone recordings.
    """
    targets = [duration * (i + 0.5) / max_frames for i in range(max_frames)] if duration else None
    taken: list[tuple[float, Image.Image]] = []
    last: tuple[float, Image.Image] | None = None
    for frame in container.decode(stream):
        t = float(frame.time) if frame.time is not None else 0.0
        if targets is None:
            taken.append((t, frame.to_image()))
            if len(taken) >= max_frames:
                break
            continue
        if targets and t >= targets[0]:
            while targets and t >= targets[0]:
                targets.pop(0)
            taken.append((t, frame.to_image()))
        last = (t, frame)
        if not targets:
            break
    # A clip shorter than its metadata says: keep its last frame for the remaining slices.
    if targets and last is not None and len(taken) < max_frames:
        taken.append((last[0], last[1].to_image()))
    yield from taken


def read_media(data: bytes, mime_type: str, max_frames: int) -> Media:
    if mime_type in IMAGE_TYPES:
        return Media("photo", [load_image(data)])
    if mime_type in VIDEO_TYPES:
        return sample_video(data, max_frames)
    raise UnreadableMedia(f"unsupported media type {mime_type}")


def read_frames(parts: list[bytes], times: list[float] | None) -> Media:
    """Frames already sampled by the caller, for example by the phone."""
    frames = [
        load_image(data, i, times[i] if times and i < len(times) else float(i))
        for i, data in enumerate(parts)
    ]
    return Media("frames", frames)
