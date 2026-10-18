"""The check catalogue, mirrored from `VISION_CHECKS` in packages/contracts/src/vision.ts.

tests/test_contract.py fails if the two drift apart. The service runs exactly the
checks the API asks for; this table says which family of detector handles each.
"""

from dataclasses import dataclass
from typing import Literal

Group = Literal["safety_gear", "hazard", "evidence", "quality", "work"]


@dataclass(frozen=True)
class CheckSpec:
    group: Group
    #: Runs on every clip (the API decides; kept here for the drift test).
    always: bool
    #: Runs on a single photo as well as a video.
    photo: bool


CHECKS: dict[str, CheckSpec] = {
    "ppe.gloves": CheckSpec("safety_gear", always=False, photo=True),
    "ppe.helmet": CheckSpec("safety_gear", always=False, photo=True),
    "ppe.eye_protection": CheckSpec("safety_gear", always=False, photo=True),
    "ppe.footwear": CheckSpec("safety_gear", always=False, photo=True),
    "ppe.insulated_tools": CheckSpec("safety_gear", always=False, photo=True),
    "hazard.exposed_conductor": CheckSpec("hazard", always=True, photo=True),
    "hazard.water": CheckSpec("hazard", always=True, photo=True),
    "hazard.height": CheckSpec("hazard", always=True, photo=True),
    "hazard.clutter": CheckSpec("hazard", always=True, photo=True),
    "evidence.no_person": CheckSpec("evidence", always=True, photo=True),
    "evidence.multiple_people": CheckSpec("evidence", always=True, photo=True),
    "evidence.screen_replay": CheckSpec("evidence", always=True, photo=True),
    "evidence.static_image": CheckSpec("evidence", always=True, photo=False),
    "evidence.off_task": CheckSpec("evidence", always=True, photo=True),
    "quality.dark": CheckSpec("quality", always=True, photo=True),
    "quality.blurry": CheckSpec("quality", always=True, photo=True),
    "quality.shaky": CheckSpec("quality", always=True, photo=False),
    "quality.too_short": CheckSpec("quality", always=True, photo=False),
    "step.order": CheckSpec("work", always=False, photo=False),
    "meter.reading": CheckSpec("work", always=False, photo=True),
}

CHECK_IDS: tuple[str, ...] = tuple(CHECKS)
