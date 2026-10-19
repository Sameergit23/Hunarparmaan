"""Measure the safety-gear and workmanship checks on a labelled set of public images.

Run from the repository root (the first run downloads about 95 images and the model):

    uv run --project services/ai --extra detector python evaluation/safety-gear/evaluate.py

Images come from Wikimedia Commons and Flickr under open licences (see manifest.json)
and are downloaded into raw/, which Git ignores: no photo of anyone is committed.
The detector's raw scores are cached in raw/cache/, so changing a check's thresholds
re-scores in seconds; a new prompt only runs the model for that prompt.

The checks run through the same code as the service (`run_checks`), one photo at a time.
Each check is measured on the scene it runs on in the trade pack: the PPE checks on
photos of people at work, the joint check on photos of wiring. A positive is an image
labelled "fault"; a raised flag on an image labelled "ok", or not labelled for that
check (the gear or joint is not visible), is a false positive.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

from hunarpramaan_ai.media import Media, load_image
from hunarpramaan_ai.vision.checks import CHECKS, judge_clip, judge_frame
from hunarpramaan_ai.vision.detector import Proposal, proposals_from
from hunarpramaan_ai.vision.service import RULES_VERSION, run_checks

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
USER_AGENT = "HunarPramaanEval/0.1 (safety-gear detector evaluation; one request per second)"
#: The scene each check runs on; every other check runs on photos of people at work.
SCENES = {"work.joint_insulated": "wiring"}


def in_scope(entry: dict, check: str) -> bool:
    return entry["scene"] == SCENES.get(check, "worker")


# --- Images ---------------------------------------------------------------------------


def fetch(entry: dict) -> Path | None:
    """Download one image once, politely, and check it is the image that was labelled."""
    path = RAW / "images" / f"{entry['id']}{Path(entry['url']).suffix.lower() or '.jpg'}"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(entry["url"], headers={"User-Agent": USER_AGENT})
        for attempt in range(6):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    path.write_bytes(response.read())
                break
            except urllib.error.HTTPError as exc:
                if exc.code not in (429, 503):
                    print(f"  skip {entry['id']}: HTTP {exc.code}", file=sys.stderr)
                    return None
                time.sleep(10 * (attempt + 1))  # the server asked us to slow down
        else:
            print(f"  skip {entry['id']}: still rate-limited", file=sys.stderr)
            return None
        time.sleep(1)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if entry.get("sha256") and digest != entry["sha256"]:
        print(f"  warning: {entry['id']} changed upstream; check its labels", file=sys.stderr)
    return path


# --- Detector scores, cached ----------------------------------------------------------


class ScoreCache:
    """Region boxes and per-prompt scores for each image, so tuning never re-runs the model.

    OWLv2 scores each prompt independently and its boxes depend only on the image, so
    scores for new prompts can be added to a cached image later.
    """

    def __init__(self, model_tag: str) -> None:
        self.dir = RAW / "cache" / model_tag
        self.dir.mkdir(parents=True, exist_ok=True)
        self._detector = None
        self.name = model_tag

    def _model(self):
        if self._detector is None:
            from hunarpramaan_ai.vision.detector import Owlv2Detector

            self._detector = Owlv2Detector()
        return self._detector

    def scores(self, image_id: str, image, queries: list[str]) -> tuple[np.ndarray, dict]:
        file = self.dir / f"{image_id}.npz"
        boxes, table = None, {}
        if file.exists():
            data = np.load(file, allow_pickle=False)
            boxes = data["boxes"]
            names = json.loads(str(data["queries"]))
            table = {q: data["scores"][:, i] for i, q in enumerate(names)}
        missing = [q for q in queries if q not in table]
        if missing:
            ((new_boxes, new_scores),) = self._model().score([image], missing)
            if boxes is None:
                boxes = new_boxes
            for i, q in enumerate(missing):
                table[q] = new_scores[:, i]
            names = list(table)
            np.savez_compressed(
                file,
                boxes=boxes,
                scores=np.stack([table[q] for q in names], axis=1),
                queries=json.dumps(names),
            )
        return boxes, table


@dataclass
class CachedDetector:
    """A `Detector` that answers from the cache, for one image."""

    cache: ScoreCache
    image_id: str
    name: str = "cached"

    def detect(self, images, queries) -> list[list[Proposal]]:
        boxes, table = self.cache.scores(self.image_id, images[0], list(queries))
        scores = np.stack([table[q] for q in queries], axis=1)
        return [proposals_from(boxes, scores, queries, 0.05)]


# --- Metrics --------------------------------------------------------------------------


def wilson(successes: int, total: int, z: float = 1.96) -> tuple[float, float] | None:
    """95% Wilson score interval for a proportion; None when there is nothing to measure."""
    if total == 0:
        return None
    p = successes / total
    centre = (p + z * z / (2 * total)) / (1 + z * z / total)
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / (1 + z * z / total)
    return max(0.0, centre - half), min(1.0, centre + half)


def summarise(rows: list[dict], check: str) -> dict:
    tp = sum(1 for r in rows if r["label"] == "fault" and r["status"] == "raised")
    fn = sum(1 for r in rows if r["label"] == "fault" and r["status"] != "raised")
    fp = sum(1 for r in rows if r["label"] != "fault" and r["status"] == "raised")
    tn = sum(1 for r in rows if r["label"] != "fault" and r["status"] != "raised")
    by_label = Counter((r["label"], r["status"]) for r in rows)
    return {
        "check": check,
        "images": len(rows),
        "faults": tp + fn,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": tp / (tp + fp) if tp + fp else None,
        "precisionCi": wilson(tp, tp + fp),
        "recall": tp / (tp + fn) if tp + fn else None,
        "recallCi": wilson(tp, tp + fn),
        # How often a fault went unseen ("unclear") rather than missed outright.
        "statuses": {f"{label}/{status}": n for (label, status), n in sorted(by_label.items())},
    }


def pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.0f}%"


def ci(interval: tuple[float, float] | None) -> str:
    return "" if interval is None else f" ({interval[0] * 100:.0f}–{interval[1] * 100:.0f})"


def table(summaries: list[dict]) -> str:
    lines = [
        "| Check | Images (faults) | Precision (95% CI) | Recall (95% CI) | TP | FP | FN |",
        "|---|---|---|---|---|---|---|",
    ]
    for s in summaries:
        lines.append(
            f"| `{s['check']}` | {s['images']} ({s['faults']}) "
            f"| {pct(s['precision'])}{ci(s['precisionCi'])} "
            f"| {pct(s['recall'])}{ci(s['recallCi'])} | {s['tp']} | {s['fp']} | {s['fn']} |"
        )
    return "\n".join(lines)


# --- Tuning ---------------------------------------------------------------------------


def tune(entries: list[dict], cache: ScoreCache, checks: list[str]) -> None:
    """Grid-search each check's thresholds on these images and print the best by F1.

    Use it on the tune split only; the README reports the test split, which the
    chosen values never saw.
    """
    queries = list(dict.fromkeys(q for c in checks for q in CHECKS[c].queries))
    scored = []
    for entry in entries:
        path = fetch(entry)
        if path is None:
            continue
        frame = load_image(path.read_bytes())
        props = CachedDetector(cache, entry["id"]).detect([frame.image], queries)[0]
        scored.append((entry, props))
    for check in checks:
        base = CHECKS[check]
        contexts = [0.2, 0.25, 0.3, 0.35, 0.4] if base.context else [base.context_score]
        trials = []
        for min_score, margin, context in itertools.product(
            [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4], [0.0, 0.03, 0.05, 0.1], contexts
        ):
            spec = replace(base, min_score=min_score, margin=margin, context_score=context)
            rows = [
                {
                    "label": entry["labels"].get(check, "na"),
                    "status": judge_clip(spec, [judge_frame(spec, props)], [0.0]).status,
                }
                for entry, props in scored
                if in_scope(entry, check)
            ]
            s = summarise(rows, check)
            p, r = s["precision"] or 0.0, s["recall"] or 0.0
            f1 = 2 * p * r / (p + r) if p + r else 0.0
            trials.append((f1, p, r, min_score, margin, context))
        trials.sort(reverse=True)
        print(f"\n{check}: F1, precision, recall, min_score, margin, context_score")
        for t in trials[:5]:
            print("  " + ", ".join(f"{v:.2f}" for v in t))


# --- Main -----------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--split", choices=["tune", "test", "all"], default="test")
    parser.add_argument("--checks", help="comma-separated check ids (default: all)")
    parser.add_argument("--out", type=Path, help="write the summary as JSON here")
    parser.add_argument("--details", action="store_true", help="print every image's result")
    parser.add_argument("--tune", action="store_true", help="grid-search the check thresholds")
    args = parser.parse_args()

    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    checks = args.checks.split(",") if args.checks else list(CHECKS)
    entries = [e for e in manifest["images"] if args.split == "all" or e["split"] == args.split]
    cache = ScoreCache(manifest["model"])
    if args.tune:
        tune(entries, cache, checks)
        return 0

    rows: dict[str, list[dict]] = {c: [] for c in checks}
    for n, entry in enumerate(entries, 1):
        path = fetch(entry)
        if path is None:
            continue
        frame = load_image(path.read_bytes())
        wanted = [c for c in checks if in_scope(entry, c)]
        report = run_checks(CachedDetector(cache, entry["id"]), Media("photo", [frame]), wanted)
        for result in report.results:
            label = entry["labels"].get(result.check, "na")
            rows[result.check].append({"id": entry["id"], "label": label, "status": result.status})
            if args.details:
                print(
                    f"{n:3} {entry['id']:28} {result.check:22} {label:5} -> "
                    f"{result.status:8} {result.confidence:.2f}"
                )

    summaries = [summarise(rows[c], c) for c in checks]
    print(f"\nSplit: {args.split}, rules {RULES_VERSION}, model {manifest['model']}\n")
    print(table(summaries))
    if args.out:
        args.out.write_text(
            json.dumps(
                {
                    "split": args.split,
                    "rules": RULES_VERSION,
                    "model": manifest["model"],
                    "checks": summaries,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
