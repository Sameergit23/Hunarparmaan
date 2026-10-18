"""The models the service uses: where they come from, their licences and their
SHA-256, and `hp-ai fetch-models` to download and check them (ADR 012).

Models are never committed (.gitignore). Every download is checked against the
pinned hash before it is used, so a tampered or truncated file is never loaded.
"""

import hashlib
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import httpx

from .config import Settings

MEDIAPIPE = "https://storage.googleapis.com/mediapipe-models"


@dataclass(frozen=True)
class ModelFile:
    key: str
    filename: str
    url: str
    #: None only for files whose upstream publishes no fixed revision; the hash
    #: is then printed on download so it can be pinned here.
    sha256: str | None
    size_mb: int
    licence: str
    used_for: str


MODELS: tuple[ModelFile, ...] = (
    ModelFile(
        key="clip",
        filename="vit_b_32-quickgelu-laion400m_e32-46683a32.pt",
        url="https://github.com/mlfoundations/open_clip/releases/download/v0.2-weights/"
        "vit_b_32-quickgelu-laion400m_e32-46683a32.pt",
        sha256="46683a32721d5c68911153698992361285d20ca690bb4f317c11e45c03d798fa",
        size_mb=605,
        licence="MIT (OpenCLIP)",
        used_for="zero-shot safety gear, hazard and scene checks",
    ),
    ModelFile(
        key="clip_vocab",
        filename="bpe_simple_vocab_16e6.txt.gz",
        url="https://raw.githubusercontent.com/mlfoundations/open_clip/"
        "v2.24.0/src/open_clip/bpe_simple_vocab_16e6.txt.gz",
        sha256="924691ac288e54409236115652ad4aa250f48203de50a9e4722a6ecd48d6804a",
        size_mb=2,
        licence="MIT (OpenAI CLIP, OpenCLIP)",
        used_for="CLIP text prompts",
    ),
    ModelFile(
        key="pose",
        filename="pose_landmarker_full.task",
        url=f"{MEDIAPIPE}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
        sha256="5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1",
        size_mb=9,
        licence="Apache-2.0 (MediaPipe)",
        used_for="head, eyes, wrists and feet",
    ),
    ModelFile(
        key="hands",
        filename="hand_landmarker.task",
        url=f"{MEDIAPIPE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        sha256="fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
        size_mb=8,
        licence="Apache-2.0 (MediaPipe)",
        used_for="hands, including close-ups",
    ),
    ModelFile(
        key="objects",
        filename="efficientdet_lite2.tflite",
        url=f"{MEDIAPIPE}/object_detector/efficientdet_lite2/float32/1/efficientdet_lite2.tflite",
        sha256="ad2abbf2b4e10585e15176fd7b5ef03c28dda959ae26fc142549fdd1814db91d",
        size_mb=23,
        licence="Apache-2.0 (MediaPipe)",
        used_for="people count and screens",
    ),
    ModelFile(
        key="e5",
        filename="multilingual-e5-small.onnx",
        url="https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/onnx/model_quantized.onnx",
        sha256=None,
        size_mb=118,
        licence="MIT (intfloat/multilingual-e5-small)",
        used_for="QP mapping: claim and criterion embeddings",
    ),
    ModelFile(
        key="e5_tokenizer",
        filename="multilingual-e5-small.tokenizer.json",
        url="https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/tokenizer.json",
        sha256=None,
        size_mb=17,
        licence="MIT (intfloat/multilingual-e5-small)",
        used_for="QP mapping: tokenizer",
    ),
)

BY_KEY: dict[str, ModelFile] = {m.key: m for m in MODELS}


def model_path(settings: Settings, key: str) -> Path | None:
    """The file for `key` when it has been downloaded, else None."""
    path = settings.ai_models_dir / BY_KEY[key].filename
    return path if path.is_file() else None


def installed(settings: Settings) -> dict[str, bool]:
    return {m.key: model_path(settings, m.key) is not None for m in MODELS}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(settings: Settings, keys: list[str] | None = None, *, force: bool = False) -> bool:
    """Download the models that are missing (or all, with `force`) and check them.

    Returns True when every requested model is in place and matches its hash.
    Uses HTTPS_PROXY and SSL_CERT_FILE from the environment when they are set.
    """
    settings.ai_models_dir.mkdir(parents=True, exist_ok=True)
    ok = True
    for model in MODELS:
        if keys and model.key not in keys:
            continue
        target = settings.ai_models_dir / model.filename
        if target.is_file() and not force:
            if model.sha256 is None or sha256_file(target) == model.sha256:
                print(f"✓ {model.key}: {model.filename} is in place")
                continue
            print(f"! {model.key}: {model.filename} does not match its hash; downloading again")
        print(f"↓ {model.key}: {model.filename} (about {model.size_mb} MB, {model.licence})")
        partial = target.with_suffix(target.suffix + ".part")
        try:
            with httpx.stream("GET", model.url, follow_redirects=True, timeout=60) as response:
                response.raise_for_status()
                with partial.open("wb") as f:
                    for chunk in response.iter_bytes(1 << 20):
                        f.write(chunk)
        except httpx.HTTPError as error:
            print(f"✗ {model.key}: download failed: {error}", file=sys.stderr)
            partial.unlink(missing_ok=True)
            ok = False
            continue
        actual = sha256_file(partial)
        if model.sha256 is not None and actual != model.sha256:
            print(f"✗ {model.key}: hash {actual} does not match the pinned one", file=sys.stderr)
            partial.unlink(missing_ok=True)
            ok = False
            continue
        os.replace(partial, target)
        pinned = "" if model.sha256 else f" (not pinned yet: sha256 {actual})"
        print(f"✓ {model.key}: {model.filename}{pinned}")
    return ok
