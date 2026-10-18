# 012. AI checks on evidence clips

- **Status:** Accepted
- **Date:** 2026-10-18
- **Requirements:** FR-08, FR-11, FR-13, FR-15, NFR-02, NFR-07
- **Supersedes:** the detector choice in [ADR 007](007-detector-licence.md)

## Context

FR-08 asks for AI flags beside the rubric, "including missing safety gear". The team also wants
the AI to look at the background of the work: hazards in the scene, whether the clip honestly
shows this worker doing this task, and whether the clip is good enough to judge.

There is no labelled safety-gear dataset for Indian electrical work yet. The rater study will
produce our first labelled clips in November. So the first version has to work without training
on our own data, and it has to say how sure it is (NFR-07).

ADR 007 allowed Ultralytics YOLO (AGPL-3.0) for the prototype. We would rather not ship an
AGPL model at all.

## Decision

### Where the checks run

- **On the server, after upload.** The API's queue worker sends each verified clip to the AI
  service (`POST /vision/analyze`), which returns a `VisionReport`
  (`packages/contracts/src/vision.ts`). The service is stateless (rule 3): it keeps nothing and
  logs no pixels. The API stores the report and turns it into hints and flags.
- **On the phone, at capture (later).** The mobile app implements the `FrameDetector`
  interface from the same file with small on-device models. Its results become the `AiFlag`s
  (`source: 'device'`) the assessor sees offline. The server's run is the second, larger opinion.

### The checks

The catalogue is `VISION_CHECKS` in `packages/contracts/src/vision.ts`. Each check belongs to a
group, which decides what a raised result leads to:

| Group | Checks | Runs on | When raised |
|---|---|---|---|
| Safety gear | `ppe.gloves`, `ppe.helmet`, `ppe.eye_protection` (safety glasses, goggles, welding shield), `ppe.footwear`, `ppe.insulated_tools` | Criteria that list them in the trade pack's `aiChecks` | Hint. A `vision_conflict` flag and a blind re-score if the assessor gave full marks without a conflict reason |
| Hazards | `hazard.exposed_conductor` (open wire or a joint without insulation tape), `hazard.water`, `hazard.height`, `hazard.clutter` | Every clip | Hint. A `vision_conflict` flag as above, only where the criterion lists the check |
| Honest evidence | `evidence.no_person`, `evidence.multiple_people`, `evidence.screen_replay`, `evidence.static_image`, `evidence.off_task` | Every clip | A `vision_evidence` flag for the agency, and a blind re-score |
| Clip quality | `quality.dark`, `quality.blurry`, `quality.shaky`, `quality.too_short` | Every clip | `dark`, `blurry` and `too_short` add a `vision_quality` flag; `shaky` is a hint only |
| Work | `step.order`, `meter.reading` | Criteria that list them | Not built yet: always `unavailable` (FR-16 needs a vision-language model) |

`checksForCriterion()` builds the list for one clip: every always-on check plus the criterion's
own. Video-only checks are skipped for photos.

Each result has a status (`raised`, `clear`, `uncertain`, `not_visible`, `unavailable`), a
confidence (how likely the problem is), the frames it could look at, up to three moments in
seconds, and reason codes. The web app words them in Hindi and English (rule 7).

### How the service looks

1. **Frames.** PyAV decodes the clip. Up to 4 frames a second (at most 160) go to the quality
   checks. One frame a second (at most 24) goes to the models, scaled to at most 640 px.
2. **Quality** uses plain image maths, no model:
   - `dark`: mean brightness;
   - `blurry`: variance of the Laplacian;
   - `shaky`: global motion between frames (phase correlation);
   - `static_image`: almost no change across the whole clip;
   - `too_short`: duration against the criterion's `minSeconds`.
3. **People.** MediaPipe Tasks (Apache-2.0) finds people and body parts:
   - Pose Landmarker: head, eyes, wrists and ankles;
   - Hand Landmarker: hands, including close-ups with no body in view;
   - Object Detector (EfficientDet-Lite, COCO): people and screens (tv, laptop, phone).

   From these come crops: hands, head, eyes, feet, and the work area around the hands.
4. **Zero-shot classification.** OpenCLIP ViT-B/32 trained on LAION-400M (MIT) compares each
   crop, and the whole frame, with short text prompts: for example "a bare hand" against "a hand
   in a rubber safety glove". It needs no training on our data.
   - The image and text towers run in plain NumPy from the published weights, so the service
     needs no PyTorch.
   - A test checks the NumPy model against the reference implementation.
5. **One answer per clip.** For each check:
   - the frames where its region is visible are scored;
   - the median score becomes the confidence;
   - it is `raised` at 0.6 or more over at least 3 visible frames (1 for a photo), `clear` at
     0.4 or less, and `uncertain` in between;
   - with too few visible frames, it is `not_visible`.

   The thresholds live in one file in the service. They are starting values, to be tuned on the
   rater-study clips with the evaluation tool (`hp-ai eval`).
6. **Reused clips (FR-15).** A 64-bit DCT perceptual hash of one frame a second goes back with
   the report. The API compares it with stored clips from other sessions: when 60% or more of
   the frames have a match within 10 bits, it adds a `similar_clip` flag. Exact copies are
   already caught by the SHA-256 check.

If MediaPipe or the CLIP weights are missing (for example, MediaPipe has no wheel for Intel
Macs), the checks that need them return `unavailable`; quality, static-image and perceptual-hash
checks still run.

### Rule 1: AI suggests, people decide

- A check never writes or changes a score, never signs and never approves.
- No vision flag blocks approval. A raised check can add a flag for the agency to review and
  send the clip to a master assessor for blind re-scoring (FR-13), including after the session
  was signed.
- The dashboard shows checks as yellow hints beside the assessor's score, with their confidence.

### Privacy (rule 8)

- Clips go only to our own AI service, never to an outside API.
- The service keeps no frames and logs no pixels or transcripts.
- Reports hold timestamps and numbers, never images.
- No check identifies a person: the people checks count bodies and hands, and none compares
  faces.

## Consequences

- Safety gear, hazards, honest-evidence and quality checks work from day one, without a dataset.
  Zero-shot accuracy is unknown until we measure it, so every result carries its confidence, and
  thresholds are tuned on the rater-study clips before the demo (G3).
- Models (about 650 MB) are downloaded once with `uv run hp-ai fetch-models`, checked against
  pinned SHA-256 hashes, and never committed.
- Analysing a 60-second clip takes about 10 to 30 seconds on a laptop CPU. The queue worker runs
  it in the background, so sync is not slowed.
- The licences are permissive (MediaPipe Apache-2.0, OpenCLIP MIT, PyAV BSD), so ADR 007's AGPL
  concern no longer applies. The on-phone detector (MediaPipe Hand and Pose Landmarker on TFLite)
  stays within NFR-02's budget; the CLIP model stays on the server.
- Step order and meter reading (FR-16) remain open: they need a vision-language model.
