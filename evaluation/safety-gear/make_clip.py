"""Stitch labelled photos into a short MP4, so the demo exercises the clip path end to end.

    pnpm ai:clip                       # raw/demo-clip.mp4 from DEFAULT_IDS
    uv run --directory services/ai python ../../evaluation/safety-gear/make_clip.py OUT ID...

Each photo (by its manifest id, already downloaded by evaluate.py) is shown for
SECONDS seconds at 480p, like an assessor's 30–60 s clip. Keep the clip under
raw/, which Git ignores.
"""

from __future__ import annotations

import sys
from pathlib import Path

import av
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SECONDS = 6
FPS = 10
SIZE = (854, 480)
#: Three photos of bare-handed work, labelled "fault" for gloves (pnpm demo:vision uses the clip).
DEFAULT_IDS = ["commons-31e8db8f", "commons-a076bcd7", "commons-249c2980"]


def frame_for(path: Path) -> np.ndarray:
    """The photo letterboxed onto a 480p frame."""
    image = Image.open(path).convert("RGB")
    image.thumbnail(SIZE)
    canvas = Image.new("RGB", SIZE, (0, 0, 0))
    canvas.paste(image, ((SIZE[0] - image.width) // 2, (SIZE[1] - image.height) // 2))
    return np.asarray(canvas)


def main(out: str, ids: list[str]) -> None:
    images = HERE / "raw" / "images"
    paths = [next(images.glob(f"{i}.*")) for i in ids]
    with av.open(out, "w", format="mp4") as container:
        stream = container.add_stream("mpeg4", rate=FPS)
        stream.width, stream.height = SIZE
        stream.pix_fmt = "yuv420p"
        stream.bit_rate = 1_500_000
        for path in paths:
            frame = av.VideoFrame.from_ndarray(frame_for(path), format="rgb24")
            for _ in range(SECONDS * FPS):
                for packet in stream.encode(frame):
                    container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)
    print(f"{out}: {len(paths) * SECONDS} s from {len(paths)} photos")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else str(HERE / "raw" / "demo-clip.mp4")
    main(out, sys.argv[2:] or DEFAULT_IDS)
