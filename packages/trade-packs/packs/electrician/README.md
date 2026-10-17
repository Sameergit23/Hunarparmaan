# Electrician trade pack (draft)

`pack.json` covers the pilot qualification and the Level 4 one it also maps to:

| QP | NQR code | NSQF level |
|---|---|---|
| Assistant Electrician | `QG-03-CO-03951-2025-V2-CSDCI` | 3 |
| Construction Electrician-LV | `QG-04-CO-03952-2025-V2-CSDCI` | 4 |

> [!WARNING]
> **This pack is a placeholder (`"status": "draft"`).** The NQR codes are real, but the
> NOS codes (`DRAFT-…`), weights, marks, pass marks and criteria are illustrative, so the
> code and tests have realistic data to run on. The build refuses to mark it `released`
> until they are replaced.

To do before release (domain and data lead, Sprint 0–1):

- [ ] Copy the NOS codes, titles, weights, PCs, marks and pass rule from the QP files on NQR.
- [ ] Have a native speaker review every Hindi string.
- [ ] Write rubric anchors with the ITI instructor. Most criteria use a generic 0/1/2 anchor
      for now; only "measure earth resistance" has the specific anchors from the README.
- [ ] Grow the glossary from the 20 recorded declarations.
- [ ] Add the 3 calibration clips (id, criterion, master score, file hash). The clips
      themselves never go in Git.

Check and package it with `pnpm pack:build electrician`.
