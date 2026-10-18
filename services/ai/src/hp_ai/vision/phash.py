"""Perceptual hashes for near-identical reused clips (FR-15, ADR 012 step 6)."""

from .media import RGB, Media


def frame_phash(rgb: RGB) -> str:
    """64-bit DCT perceptual hash of one frame, as 16 lowercase hex digits.

    Greyscale, resize to 32x32, 2-D DCT, keep the top-left 8x8 block (including
    the DC term), set each bit when the coefficient is above the block's median.
    Small changes (re-encoding, scaling, slight brightness change) move only a
    few bits; a different scene moves about half of them.
    """
    raise NotImplementedError


def media_phashes(media: Media) -> list[str]:
    """frame_phash of every frame in `media.phash_frames`, in order."""
    raise NotImplementedError


def hamming(a: str, b: str) -> int:
    """Number of differing bits between two 16-hex-digit hashes."""
    raise NotImplementedError


def similarity(a: list[str], b: list[str], *, max_bits: int = 10) -> float:
    """Share of the frames of the shorter clip that have a frame in the other clip
    within `max_bits` bits, from 0 to 1, independent of order (so a clip cut or
    re-ordered still matches). 0 when either list is empty.
    """
    raise NotImplementedError
