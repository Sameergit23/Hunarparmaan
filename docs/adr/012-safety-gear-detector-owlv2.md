# 012. Safety-gear checks on the server with OWLv2, an open-vocabulary detector

- **Status:** Accepted
- **Date:** 2026-10-19
- **Requirements:** FR-08, NFR-02, NFR-07; rules 1, 3 and 8 in `CLAUDE.md`; builds on ADR 002, 006 and 007

## Context

FR-08 asks for AI flags beside the assessor's score, including missing safety gear. The checks
we need are: no gloves, no helmet, no safety shoes, no eye protection while grinding or welding,
and a bare (untaped) wire joint. ADR 002's fallback is to run the safety-gear check on the
server after sync while the on-device detector is not ready, and ADR 007 sets the licence rule:
Ultralytics YOLO (AGPL-3.0) only for the prototype, a permissive detector before any pilot.

We looked at three kinds of model (licences checked on the model cards, 19 Oct 2026):

| Option | Licence | Covers our checks | Notes |
|---|---|---|---|
| YOLO models fine-tuned on PPE datasets (for example `keremberke/yolov8m-protective-equipment-detection`) | AGPL-3.0 (Ultralytics), whatever the model card says | Gloves, helmet, goggles, shoes; not wire joints | Allowed by ADR 007 for the prototype only; it would have to be replaced before a pilot |
| Permissive PPE detectors on Hugging Face (`thalostech2025/dfine-small-construction-ppe-v1`, D-FINE) | Apache-2.0 model; training data licence not stated | Helmet, vest, boots; gloves mAP 0.15 and no-goggles mAP 0.00 on its own evaluation set | Too weak on gloves and eye protection; no joint class |
| Open-vocabulary detectors: OWLv2, Grounding DINO, OmDet-Turbo | Apache-2.0 | Any check that can be written as text, including wire joints | Zero-shot, so less accurate than a fine-tuned detector, and slower |

## Decision

- Run the checks in `services/ai` (Python, FastAPI) with **OWLv2**
  (`google/owlv2-base-patch16-ensemble`, Apache-2.0), pinned to revision `cfd3195`.
- Each check is a pair of prompt sets compared on the same region: what the right gear or work
  looks like (`ok`) and what its absence looks like (`fault`), for example "a gloved hand"
  against "a bare hand". A region is a fault only when the fault prompts win by a margin. Eye
  protection is judged only in frames where sparks, a grinder or a welding torch are seen.
  The prompts and thresholds are in `services/ai/src/hunarpramaan_ai/vision/checks.py` and are
  served at `GET /v1/vision/checks`, so a reviewer can see what the AI looks for (NFR-07).
- The detector sits behind the interface ADR 007 asks for (`Detector`: frames in, scored
  regions out), so a fine-tuned permissive model can replace OWLv2 without touching the rules,
  the API or the screens.
- After a clip's hash is verified, the API's queue worker sends it to the AI service and stores
  the answer as `ai_result.stored` in the append-only `ai_results` table. The AI service is
  stateless and never touches the database (rule 3). Nothing writes or changes a score (rule 1).
- Clips go only to our own AI service; no frame is sent to an outside service (rule 8).
- Thresholds are chosen on a tune split of a labelled set of public images, and precision and
  recall are reported on a separate test split (`evaluation/safety-gear`). The numbers are in
  the README; they are a measurement, not a promise.

## Consequences

- No AGPL code or weights in the stack, so ADR 007's swap is not needed for the server checks.
- New checks are new prompts plus a labelled set, not a training run. The wire-joint check exists
  only because of this; it is also the weakest one.
- Zero-shot accuracy is modest (see the README), so every result is a yellow hint and the
  assessor decides. A raised check beside full marks sends the clip to a blind re-score by a
  master assessor (FR-13), because the assessor scored offline before the server check ran.
- OWLv2 is about 620 MB and takes about 10 s a frame on a laptop CPU (6 frames a clip by default),
  well under 1 s on a GPU. It is too big for the 3 GB target phone (NFR-02): the on-device
  detector of ADR 002 is still to come, and is likely a small permissive model (YOLOX or D-FINE)
  fine-tuned on labels this server check and assessor corrections produce.
- The server's checks arrive after sync, so they cannot change what the assessor saw while
  scoring offline. Sending them to the phone (`GET /v1/sync/pull`) is a later contract change.
