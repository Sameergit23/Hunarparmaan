# HunarPramaan AI service

Python 3.12, FastAPI and [uv](https://docs.astral.sh/uv/). Today it runs the safety-gear and
workmanship checks on evidence clips (README "AI workflow", step 3). Claim extraction, embeddings
and agreement statistics join it in later sprints.

It only suggests (rule 1): it reads the clip it is sent, returns hints with a confidence, and keeps
nothing. It never touches the database (rule 3); the API's queue worker stores its answers as
`ai_result.stored`. Clips stay on our servers: nothing is sent to an outside service (rule 8).
The choice of detector and its licence are in [ADR 012](../../docs/adr/012-safety-gear-detector-owlv2.md).

## Run it

```bash
uv sync --extra detector                                      # once: about 1 GB with CPU PyTorch
uv run --extra detector uvicorn hunarpramaan_ai.app:app --port 8000
```

From the repo root, `pnpm ai:dev` does the same. The first request downloads the model
(`google/owlv2-base-patch16-ensemble`, about 620 MB, Apache-2.0) into the Hugging Face cache. Then
point the API at it with `AI_SERVICE_URL=http://localhost:8000` in the root `.env`; each clip whose
hash the API verifies is checked in the background.

Without the `detector` extra, the service starts and its tests run, but a check answers 503.

## API

| Endpoint | What it does |
|---|---|
| `POST /v1/vision/checks?checks=ppe.gloves,ppe.helmet` | The body is one photo (`image/jpeg`, `image/png`) or clip (`video/mp4`). A clip is sampled at `maxFrames` evenly spaced frames (default 6) |
| `POST /v1/vision/frames` | Frames the caller already sampled: multipart `frames` (JPEG or PNG), `checks` and optional `times` in seconds |
| `GET /v1/vision/checks` | Every check with the prompts behind it, so a reviewer can see what the AI looks for (NFR-07) |
| `GET /healthz` | Liveness, the loaded model (null until the first check) and the check ids |

An answer:

```json
{
  "engine": "owlv2-base-patch16-ensemble@cfd3195+rules.2",
  "media": { "kind": "video", "frames": 6, "durationSec": 42.0 },
  "results": [
    {
      "check": "ppe.gloves",
      "status": "raised",
      "confidence": 0.81,
      "reason": null,
      "frames": [{ "index": 2, "timeSec": 17.5, "score": 0.42, "box": [0.1, 0.5, 0.3, 0.8] }]
    }
  ],
  "unsupported": ["meter.reading"]
}
```

`status` is `raised` (the fault was seen), `clear` (the gear or the right work was seen) or
`unclear` (`reason`: `not_visible`, or `no_hazard_seen` when nothing is ground, cut or welded for
the eye-protection check). `confidence` is the detector's score through a logistic curve that is
50% at the check's threshold; it ranks hints, and the measured precision says how often a raised
hint was right. Boxes are fractions of the frame. Errors are `{"error": {"code", "message"}}`:
400 `no_checks`, 401 `unauthorised`, 413 `too_large`, 415 `unsupported_media`, 422
`unreadable_media` and 503 `detector_unavailable`.

## Checks

| Check | Fault it looks for | Runs on (trade pack) |
|---|---|---|
| `ppe.gloves` | A bare hand | Most practical criteria |
| `ppe.helmet` | A bare head, unless a hard hat covers it or sits just above it | Wear and check PPE |
| `ppe.shoes` | Bare feet, sandals, flip-flops or slippers | Wear and check PPE; earth pit; cable trays |
| `ppe.goggles` | A face without goggles, glasses, a face shield or a welding helmet, in frames with sparks, a grinder or a welding torch | Conduit (wall chasing); earth pit; cable trays |
| `work.joint_insulated` | Bare twisted copper or an exposed joint, rather than tape or a connector | Switches and sockets; conduit (L4) |

Each check compares its `ok` and `fault` prompts on the same region, so a gloved hand is not
reported as a bare hand just because it is a hand. In a clip, a fault must show in two frames, so
one odd frame does not raise it. Precision and recall per check are in the root README; the
labelled set and the script are in [`evaluation/safety-gear`](../../evaluation/safety-gear).

## Settings

| Variable | Default | |
|---|---|---|
| `AI_MAX_FRAMES` | `6` | Frames sampled from a clip. About 10 s each on a laptop CPU, well under 1 s on a GPU |
| `AI_MAX_UPLOAD_MB` | `80` | Largest photo or clip accepted |
| `AI_SERVICE_TOKEN` | none | When set, callers must send `Authorization: Bearer <token>`; set the same in the API |
| `AI_DEVICE` | auto | `cpu` or `cuda` |
| `AI_PRELOAD` | `false` | Load the model at start-up rather than on the first check |
| `AI_VISION_MODEL` · `AI_VISION_REVISION` | OWLv2 base, `cfd3195…` | Another OWLv2 checkpoint, for example the large one |

## Develop

```bash
uv sync                      # without the detector: enough for the tests
uv run pytest                # tests use a fake detector, so they need no model
uv run ruff check . ../../evaluation && uv run ruff format --check . ../../evaluation
```

From the repo root: `pnpm ai:test` and `pnpm ai:lint`. CI runs both on Linux and Windows.
