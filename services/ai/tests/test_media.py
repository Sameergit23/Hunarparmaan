from __future__ import annotations

import io

import av
import numpy as np
import pytest
from conftest import jpeg
from PIL import Image

from hunarpramaan_ai.media import MAX_SIDE, UnreadableMedia, read_frames, read_media


def mp4(seconds: float = 4.0, fps: int = 10, size=(96, 64)) -> bytes:
    """A small clip whose frame brightness counts up, so each frame can be told apart."""
    buffer = io.BytesIO()
    with av.open(buffer, "w", format="mp4") as container:
        stream = container.add_stream("mpeg4", rate=fps)
        stream.width, stream.height = size
        stream.pix_fmt = "yuv420p"
        total = int(seconds * fps)
        for i in range(total):
            level = int(255 * i / total)
            array = np.full((size[1], size[0], 3), level, dtype=np.uint8)
            for packet in stream.encode(av.VideoFrame.from_ndarray(array, format="rgb24")):
                container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)
    return buffer.getvalue()


def test_a_photo_is_one_frame():
    media = read_media(jpeg(), "image/jpeg", max_frames=6)
    assert media.kind == "photo"
    assert [(f.index, f.time_sec) for f in media.frames] == [(0, 0.0)]


def test_large_photos_are_scaled_down():
    buffer = io.BytesIO()
    Image.new("RGB", (4000, 3000), (10, 20, 30)).save(buffer, "PNG")
    media = read_media(buffer.getvalue(), "image/png", max_frames=6)
    assert max(media.frames[0].image.size) == MAX_SIDE


def test_a_clip_is_sampled_evenly():
    media = read_media(mp4(seconds=4.0), "video/mp4", max_frames=4)
    assert media.kind == "video"
    assert media.duration_sec == pytest.approx(4.0, abs=0.2)
    times = [f.time_sec for f in media.frames]
    assert len(times) == 4
    assert times == sorted(times)
    # The middle of each quarter: about 0.5, 1.5, 2.5 and 3.5 s.
    assert times == pytest.approx([0.5, 1.5, 2.5, 3.5], abs=0.15)
    brightness = [np.asarray(f.image).mean() for f in media.frames]
    assert brightness == sorted(brightness)


def test_a_short_clip_gives_what_it_has():
    media = read_media(mp4(seconds=0.3), "video/mp4", max_frames=8)
    assert 1 <= len(media.frames) <= 8


@pytest.mark.parametrize(
    ("data", "mime"),
    [(b"not an image", "image/jpeg"), (b"not a video", "video/mp4"), (jpeg(), "text/plain")],
)
def test_unreadable_media_is_refused(data, mime):
    with pytest.raises(UnreadableMedia):
        read_media(data, mime, max_frames=4)


def test_frames_keep_their_times():
    media = read_frames([jpeg(), jpeg((0, 0, 0))], [2.0, 7.5])
    assert [(f.index, f.time_sec) for f in media.frames] == [(0, 2.0), (1, 7.5)]
