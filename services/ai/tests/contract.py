"""Check payloads against the JSON Schemas generated from the zod contracts
(packages/contracts/json-schema/, written by `pnpm contracts:schemas`)."""

import json
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

SCHEMAS = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "json-schema"


@cache
def schema(name: str) -> Any:
    return json.loads((SCHEMAS / f"{name}.json").read_text(encoding="utf-8"))


def assert_matches(name: str, payload: object) -> None:
    """Fail with every validation error when `payload` does not fit the contract."""
    errors = sorted(Draft202012Validator(schema(name)).iter_errors(payload), key=str)
    assert not errors, "\n".join(f"{list(e.absolute_path)}: {e.message}" for e in errors)
