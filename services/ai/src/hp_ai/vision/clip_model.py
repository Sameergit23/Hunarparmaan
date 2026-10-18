"""OpenCLIP ViT-B/32 (LAION-400M, MIT) in plain NumPy, for zero-shot checks (ADR 012, step 4).

No PyTorch: the published checkpoint is read with a restricted unpickler that
only rebuilds tensors (weights.py), and the forward pass is written with NumPy.
tests/test_clip_reference.py compares it with the reference OpenCLIP output.

Architecture (open_clip "ViT-B-32-quickgelu"):
- image: conv1 32x32 stride 32 (768 ch, no bias) -> prepend class_embedding ->
  + positional_embedding (50x768) -> ln_pre -> 12 residual blocks (width 768,
  12 heads) -> ln_post on the class token -> @ proj (768x512)
- text: token_embedding (49408x512) + positional_embedding (77x512) -> 12
  residual blocks (width 512, 8 heads, causal mask) -> ln_final -> features at
  the end-of-text token (the largest token id) -> @ text_projection (512x512)
- block: x + attn(ln_1(x)); x + mlp(ln_2(x)); mlp = c_fc -> QuickGELU
  (x * sigmoid(1.702 x)) -> c_proj; LayerNorm eps 1e-5
- preprocessing: RGB -> 224x224 bicubic -> /255 -> normalise with mean
  (0.48145466, 0.4578275, 0.40821073) and std (0.26862954, 0.26130258, 0.27577711)
"""

from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from .media import RGB

Vectors = NDArray[np.float32]
"""(n, 512) float32, each row of unit length."""


class ClipModel:
    #: For the report's `models` entry.
    name: str = "openclip-vit-b-32-quickgelu-laion400m_e32"
    #: exp(logit_scale) from the checkpoint (about 100).
    logit_scale: float

    @classmethod
    def load(cls, weights: Path, vocab: Path) -> "ClipModel":
        """Load the checkpoint (`vit_b_32-quickgelu-laion400m_e32-46683a32.pt`) and the
        BPE vocabulary (`bpe_simple_vocab_16e6.txt.gz`). Weights stay float32."""
        raise NotImplementedError

    def encode_images(self, images: list[RGB], *, pad_to_square: bool = True) -> Vectors:
        """Unit-length image embeddings, in batches of up to 32.

        With `pad_to_square`, each image is first padded to a square with the
        normalisation mean colour, so nothing is cropped away (better for hand or
        head crops); without it, the shorter side is resized to 224 and the centre
        cropped, as OpenCLIP does."""
        raise NotImplementedError

    def encode_texts(self, texts: list[str]) -> Vectors:
        """Unit-length text embeddings (context length 77, truncated)."""
        raise NotImplementedError


def zero_shot(
    image_vectors: Vectors, class_vectors: Vectors, logit_scale: float
) -> NDArray[np.float32]:
    """Softmax over classes of logit_scale * cosine similarity.

    Returns (n_images, n_classes); each row sums to 1."""
    raise NotImplementedError
