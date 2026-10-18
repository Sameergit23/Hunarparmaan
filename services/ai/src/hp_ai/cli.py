"""`uv run hp-ai <command>`: fetch-models, analyze, eval."""

import argparse
import sys

from .config import get_settings
from .models_store import MODELS, fetch


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hp-ai", description="HunarPramaan AI service tools")
    sub = parser.add_subparsers(dest="command", required=True)

    fetch_cmd = sub.add_parser("fetch-models", help="download and check the models (about 650 MB)")
    fetch_cmd.add_argument(
        "keys", nargs="*", help=f"only these: {', '.join(m.key for m in MODELS)}"
    )
    fetch_cmd.add_argument("--force", action="store_true", help="download again even if present")

    args = parser.parse_args(argv)
    if args.command == "fetch-models":
        return 0 if fetch(get_settings(), args.keys or None, force=args.force) else 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
