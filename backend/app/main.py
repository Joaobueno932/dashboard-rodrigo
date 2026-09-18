import hmac
import json
import os
import secrets
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .parser import WorkbookError
from .security import token_hash, verify_password
from .store import Conflict, Store

ROOT = Path(__file__).resolve().parents[2]


class Login(BaseModel):
    password: str = Field(min_length=1, max_length=512)


def create_app(directory: Path | None = None, password_hash: str | None = None, source: Path | None = None) -> FastAPI:
    data_dir = directory or Path(os.environ.get("DATA_DIR", str(ROOT / "data/runtime")))
    store = Store(data_dir)
    admin_hash = password_hash or os.environ.get("ADMIN_PASSWORD_HASH", "")
    auth_file = data_dir / "admin.json"
    if not admin_hash and auth_file.exists():
        admin_hash = json.loads(auth_file.read_text())["password_hash"]
    max_upload = int(os.environ.get("MAX_UPLOAD_MB", "10")) * 1024 * 1024
    secure = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
    failures: dict[str, list[float]] = {}
    rate_lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await run_in_threadpool(store.initialize, source or ROOT / "data/source/indicadores.xlsx")
        yield

    app = FastAPI(title="Indicadores ESG · FIEMS", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store

    @app.middleware("http")
    async def headers(request: Request, call_next: Any) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(WorkbookError)
    async def workbook_error(_: Request, error: WorkbookError) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=422)

    @app.exception_handler(Conflict)
    async def conflict_error(_: Request, error: Conflict) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=409)

    def session(request: Request) -> dict[str, Any]:
        digest = token_hash(request.cookies.get("fiems_session", ""))
        with store.connect() as db:
            row = db.execute("SELECT * FROM sessions WHERE token=? AND expires>?", (digest, time.time())).fetchone()
        if not row:
            raise HTTPException(401, "Entre para gerenciar a base de dados.")
        if request.method != "GET" and not hmac.compare_digest(request.headers.get("X-CSRF-Token", ""), row["csrf"]):
            raise HTTPException(403, "Sessão de confirmação inválida. Recarregue a página.")
        return dict(row)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/data")
    def data() -> dict[str, Any]:
        payload = store.snapshot()
        # Browser receives the normalized indicators, never source files/secrets.
        return payload

    @app.post("/api/login")
    def login(body: Login, request: Request, response: Response) -> dict[str, str]:
        if request.headers.get("X-Requested-With") != "fiems-dashboard":
            raise HTTPException(403, "Solicitação inválida.")
        if not admin_hash:
            raise HTTPException(
                503, "Administrador não configurado. Execute python -m backend.app.cli configure no servidor."
            )
        key = request.client.host if request.client else "unknown"
        now = time.time()
        with rate_lock:
            for address in list(failures):
                failures[address] = [t for t in failures[address] if t > now - 300]
                if not failures[address]:
                    del failures[address]
            if len(failures.get(key, [])) >= 5 or sum(map(len, failures.values())) >= 100:
                raise HTTPException(429, "Muitas tentativas. Aguarde cinco minutos.")
            # Reserve an attempt before the costly hash, including concurrent calls.
            failures.setdefault(key, []).append(now)
        if not verify_password(body.password, admin_hash):
            raise HTTPException(401, "Senha inválida.")
        with rate_lock:
            failures.pop(key, None)
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with store.connect() as db:
            db.execute("DELETE FROM sessions WHERE expires<?", (now,))
            db.execute("INSERT INTO sessions VALUES(?,?,?)", (token_hash(token), csrf, now + 3600))
        response.set_cookie(
            "fiems_session", token, httponly=True, secure=secure, samesite="strict", max_age=3600, path="/"
        )
        return {"csrf": csrf}

    @app.get("/api/session")
    def get_session(auth: dict[str, Any] = Depends(session)) -> dict[str, str]:
        return {"csrf": auth["csrf"]}

    @app.post("/api/logout")
    def logout(response: Response, auth: dict[str, Any] = Depends(session)) -> dict[str, bool]:
        with store.connect() as db:
            db.execute("DELETE FROM sessions WHERE token=?", (auth["token"],))
        response.delete_cookie("fiems_session", path="/")
        return {"ok": True}

    @app.get("/api/imports")
    def history(auth: dict[str, Any] = Depends(session)) -> dict[str, Any]:
        return {"history": store.history(), "pending": store.pending(auth["token"])}

    @app.post("/api/imports/validate")
    async def validate(request: Request, auth: dict[str, Any] = Depends(session)) -> dict[str, Any]:
        filename = unquote(request.headers.get("X-Filename", ""))
        if (
            not filename
            or len(filename) > 180
            or any(c in filename for c in ("/", "\\", "\x00"))
            or any(ord(c) < 32 for c in filename)
            or not filename.lower().endswith(".xlsx")
        ):
            store.reject("Nome de arquivo inválido", "Somente .xlsx com nome simples é aceito.")
            raise HTTPException(422, "Selecione um arquivo .xlsx com nome simples, sem caminhos.")
        mime = request.headers.get("Content-Type", "").split(";")[0]
        if mime not in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/octet-stream",
        ):
            store.reject(filename, "Tipo de arquivo inválido.")
            raise HTTPException(415, "Tipo de arquivo inválido.")
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > max_upload:
                store.reject(filename, "Limite de upload excedido.")
                raise HTTPException(413, f"Arquivo excede {max_upload // (1024 * 1024)} MB.")
        return await run_in_threadpool(store.validate, bytes(raw), filename, auth["token"])

    @app.post("/api/imports/{ticket}/confirm")
    def confirm(ticket: str, auth: dict[str, Any] = Depends(session)) -> dict[str, bool]:
        store.confirm(ticket, auth["token"])
        return {"ok": True}

    @app.delete("/api/imports/{ticket}")
    def cancel(ticket: str, auth: dict[str, Any] = Depends(session)) -> dict[str, bool]:
        store.cancel(ticket, auth["token"])
        return {"ok": True}

    @app.get("/api/source")
    def download(auth: dict[str, Any] = Depends(session)) -> Response:
        return Response(
            store.source(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="base-ativa.xlsx"'},
        )

    dist = ROOT / "frontend/dist"
    if (dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}")
    def frontend(path: str) -> FileResponse:
        if path.startswith("api/") or not (dist / "index.html").exists():
            raise HTTPException(404, "Recurso não encontrado.")
        return FileResponse(dist / "index.html")

    return app
