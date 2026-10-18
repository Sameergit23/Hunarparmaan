"""The AI service app: `uv run uvicorn hp_ai.main:app --port 8000`.

Stateless (rule 3): it answers requests from the API's queue worker and keeps
nothing. Rule 8: it never logs request bodies, frames or transcripts.
"""

import hmac
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException

from . import __version__
from .config import Settings, get_settings
from .models_store import installed
from .routes_mapping import router as mapping_router
from .routes_stats import router as stats_router
from .routes_vision import router as vision_router

ENGINE = f"hp-ai {__version__}"


def require_token(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """With AI_SERVICE_TOKEN set, every route except /healthz needs it as a bearer token."""
    expected = settings.ai_service_token
    if not expected:
        return
    given = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="missing or wrong service token")


def create_app() -> FastAPI:
    app = FastAPI(title="HunarPramaan AI service", version=__version__, docs_url="/docs")

    @app.get("/healthz")
    def healthz(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, object]:
        return {"status": "ok", "engine": ENGINE, "models": installed(settings)}

    protected = [Depends(require_token)]
    app.include_router(vision_router, dependencies=protected)
    app.include_router(mapping_router, dependencies=protected)
    app.include_router(stats_router, dependencies=protected)
    return app


app = create_app()
