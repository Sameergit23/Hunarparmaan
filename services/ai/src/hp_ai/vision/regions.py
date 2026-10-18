"""Crops for each kind of check, from where the people are (ADR 012, step 3).

Pure geometry on FramePeople, so it is tested without MediaPipe.
"""

from dataclasses import dataclass
from typing import Literal

from .media import RGB
from .people import Box, FramePeople

RegionKind = Literal["hand", "head", "eyes", "feet", "work_area"]


@dataclass
class Region:
    kind: RegionKind
    box: Box
    #: The crop itself, at least 32 px on each side.
    rgb: RGB


def regions(rgb: RGB, people: FramePeople) -> list[Region]:
    """Every useful crop in a frame:

    - hand: each detected hand's box, grown 1.6x around its centre (gloves);
      when the hand detector found none, a box around visible pose wrist and
      hand points (visibility >= 0.5).
    - head: around the eyes and ears, about 2.4x the ear-to-ear distance wide,
      reaching up 1.3x that width above the eyes (helmet).
    - eyes: a band across the eyes, about 3x the eye-to-eye distance wide (glasses).
    - feet: around visible ankles, heels and toes, grown 1.8x (footwear).
    - work_area: around the hands, grown 3x, clipped to the frame (exposed
      wire, insulated tools).

    Boxes are clipped to the frame; crops smaller than 32 px on a side are
    dropped. A region needs landmarks with visibility >= 0.5.
    """
    raise NotImplementedError
