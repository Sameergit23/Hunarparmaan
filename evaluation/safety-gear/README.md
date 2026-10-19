# Safety-gear and workmanship checks: evaluation

How well the AI service's checks ([ADR 012](../../docs/adr/012-safety-gear-detector-owlv2.md))
find missing gloves, helmets, safety shoes and eye protection, and bare wire joints. We measure
them so the assessor knows how far to trust a hint; no detector is perfect, and the assessor
always decides.

## The labelled set

[`manifest.json`](manifest.json) lists 94 public photos: 74 of people at work and 20 of wiring,
from Wikimedia Commons and from Flickr through [Openverse](https://openverse.org), under public
domain, CC0, CC BY, CC BY-SA and UK OGL licences. Each entry has its source page, licence, author
and the SHA-256 of the file we labelled. The photos are downloaded into `raw/`, which Git ignores:
**no photo of anyone is committed**, and none shows our own workers.

| Label | Means |
|---|---|
| `fault` | The gear is missing (a bare hand, a bare head, sandals or bare feet, no eye protection while grinding or welding), or a wire joint is bare |
| `ok` | The gear is worn, or the joint is taped or capped |
| not listed | `na`: the hands, head, feet or joint are not visible, or nothing is being ground, cut or welded |

Each check is measured on the scene it runs on in the trade pack: the PPE checks on the 74 photos
of people at work, the joint check on the 20 photos of wiring. A flag raised on an `ok` or `na`
photo is a false alarm. The photos are split in two, balanced by label: **tune** (47) to choose the
thresholds, and **test** (47) to report. The test photos never informed a threshold.

> [!WARNING]
> **Limits.** One person labelled the set by eye; a second person (ideally the ITI instructor)
> should review it before we quote these numbers outside the team. The set is small, so the 95%
> intervals are wide. Most photos are not from Indian worksites, and none is from our own pilot.
> Recall on photos is a lower bound for clips: a clip gives the check six frames to see the fault.

## Run it

```bash
pnpm ai:eval                                  # test split; the first run downloads the photos
pnpm ai:eval -- --split tune --tune           # grid-search the thresholds on the tune split
pnpm ai:eval -- --split test --details        # every photo's result
```

The first run downloads the photos (politely, about one a second) and the model, and takes about
15 minutes on a laptop CPU. The model's raw scores are cached in `raw/cache/`, so later runs take
seconds. If a photo has changed upstream, the script warns: check its labels.

## Results (rules 2, OWLv2 base `cfd3195`, test split)

| Check | Photos (faults) | Precision (95% CI) | Recall (95% CI) |
|---|---|---|---|
| `ppe.gloves` | 38 (15) | 67% (39–86) | 53% (30–75) |
| `ppe.helmet` | 38 (19) | 75% (53–89) | 79% (57–91) |
| `ppe.shoes` | 38 (5) | 100% (51–100) | 80% (38–96) |
| `ppe.goggles` | 38 (3) | 50% (9–91) | 33% (6–79) |
| `work.joint_insulated` | 9 (3) | 20% (4–62) | 33% (6–79) |

On the tune split, which chose the thresholds, the same checks score 68/87, 86/100, 83/100, 67/67
and 67/100 (precision/recall, %). The gap is what tuning on a small set costs; quote the test
numbers. [`results-test.json`](results-test.json) and [`results-tune.json`](results-tune.json)
have the counts.

**What goes wrong on the test split**

- **Helmet:** under rules 1, a worn hard hat raised "no helmet" when the detector boxed the face or
  hair under it as a bare head (5 of the 8 false alarms). Rules 2 add `above_clears`: a hard hat
  sitting on a fault region clears it when the two overlap across half the narrower box and the
  hat's bottom edge is within 0.4 of the region's height of its top. False alarms fell from 8 to 5
  (precision 65% to 75%), and every fault rules 1 caught is still caught.
  - The idea for the rule came from these test errors, so treat the gain as optimistic until new
    photos confirm it. Its value was chosen on the tune split alone. That split has no false alarm
    of this kind, so it could only show where the rule starts to cost: 0.1 to 0.7 changed nothing
    there and 0.8 missed a fault, so we took 0.4, the middle of that range.
  - Of the 5 left, 3 are worn hard hats whose face box lies mostly inside the hat box. A rule for
    those would also clear a bare head in the tune split that the detector boxed as a hard hat, so
    it waits for more labelled photos. The other 2 are photos with no head labelled.
- **Gloves:** small or dark hands at a distance are missed; bare hands holding a tool are read as
  gloved.
- **Eye protection and wire joints:** too few faults (3 each) to say much. Joints are the weakest
  check: taped, capped and bare joints look alike to a zero-shot model at this size. Treat these
  hints as prompts to look, not as evidence.

## Next steps

1. Review the labels with a second person, and add photos from Indian sites and our own pilot
   clips (with consent; clips stay out of Git).
2. Log every hint the assessor disagreed with (README "How it improves"), and use those as labels.
3. Fine-tune a small permissive detector (YOLOX or D-FINE, Apache-2.0) on them: better accuracy, a
   fraction of the compute, and a path to the on-device detector in ADR 002.
