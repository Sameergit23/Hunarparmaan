# 007. Safety-gear detector licence

- **Status:** Accepted
- **Date:** 2026-10-17
- **Requirements:** FR-08, NFR-02

## Context

The on-device safety-gear detector flags missing gloves or a missing helmet. The quickest route to
a working detector is Ultralytics YOLO, which is licensed AGPL-3.0. Shipping AGPL code in an app we
distribute would oblige us to release the app's source under the AGPL.

## Decision

- Ultralytics YOLO is allowed for the hackathon prototype only.
- Before any public release or pilot, swap to a detector under a permissive licence, such as YOLOX
  (Apache-2.0).
- The detector sits behind one interface (frame in, flags with confidence out), so the swap does not
  touch scoring code.

## Consequences

- Fast progress in Sprint 2 on the detector spike.
- A tracked item for the post-SIH roadmap: retrain and re-evaluate on the permissive detector.
- Model licences are listed in the README's Licence section.
