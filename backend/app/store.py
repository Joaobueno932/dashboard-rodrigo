"""SQLite transactions keep source, normalized data and active pointer consistent."""

import hashlib
import json
import secrets
import sqlite3
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .parser import WorkbookError, parse_workbook


class Conflict(ValueError):
    pass


class Store:
    def __init__(self, directory: Path):
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / "dashboard.sqlite3"
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS versions (
                    id TEXT PRIMARY KEY, filename TEXT NOT NULL, created REAL NOT NULL,
                    size INTEGER NOT NULL, sha256 TEXT NOT NULL, raw BLOB NOT NULL,
                    payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), active TEXT, previous TEXT);
                INSERT OR IGNORE INTO state(id) VALUES(1);
                CREATE TABLE IF NOT EXISTS imports (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, filename TEXT NOT NULL,
                    created REAL NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
                    records INTEGER NOT NULL DEFAULT 0, base TEXT, raw BLOB, payload TEXT);
                CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires REAL NOT NULL);
            """)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def initialize(self, source: Path) -> None:
        with self.connect() as db:
            if db.execute("SELECT active FROM state WHERE id=1").fetchone()[0]:
                return
        raw = source.read_bytes()
        payload = parse_workbook(source)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT active FROM state WHERE id=1").fetchone()[0]:
                return
            version = secrets.token_hex(16)
            now = time.time()
            db.execute(
                "INSERT INTO versions VALUES(?,?,?,?,?,?,?)",
                (
                    version,
                    source.name,
                    now,
                    len(raw),
                    hashlib.sha256(raw).hexdigest(),
                    raw,
                    json.dumps(payload, ensure_ascii=False),
                ),
            )
            db.execute("UPDATE state SET active=? WHERE id=1", (version,))
            db.execute(
                "INSERT INTO imports(id,owner,filename,created,status,records) VALUES(?,?,?,?,?,?)",
                (version, "initial", source.name, now, "Sucesso", payload["summary"]["records"]),
            )

    def snapshot(self) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT v.* FROM versions v JOIN state s ON v.id=s.active WHERE s.id=1").fetchone()
        if row is None:
            raise RuntimeError("Base inicial indisponível.")
        payload = json.loads(row["payload"])
        payload["version"] = row["id"]
        payload["metadata"] = {
            "filename": row["filename"],
            "importedAt": row["created"],
            "size": row["size"],
            "sha256": row["sha256"],
        }
        return dict(payload)

    def history(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT id,filename,created,status,message,records FROM imports ORDER BY created DESC LIMIT 100"
                )
            ]

    def reject(self, filename: str, message: str) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT INTO imports(id,owner,filename,created,status,message) VALUES(?,?,?,?,?,?)",
                (secrets.token_hex(16), "", filename, time.time(), "Rejeitada", message),
            )

    def validate(self, raw: bytes, filename: str, owner: str) -> dict[str, Any]:
        ticket = secrets.token_hex(16)
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "UPDATE imports SET status='Expirada',raw=NULL,payload=NULL WHERE status IN ('Validando','Aguardando confirmação') AND created<?",
                (now - 1800,),
            )
            if db.execute("SELECT 1 FROM imports WHERE status IN ('Validando','Aguardando confirmação')").fetchone():
                raise Conflict(
                    "Existe uma importação em andamento. Confirme, cancele ou aguarde sua expiração (30 minutos)."
                )
            base = db.execute("SELECT active FROM state WHERE id=1").fetchone()[0]
            db.execute(
                "INSERT INTO imports(id,owner,filename,created,status,base) VALUES(?,?,?,?,?,?)",
                (ticket, owner, filename, now, "Validando", base),
            )
        try:
            with tempfile.TemporaryDirectory(prefix="fiems-") as tmp:
                source = Path(tmp) / "source.xlsx"
                source.write_bytes(raw)
                payload = parse_workbook(source)
            previous = self.snapshot()["summary"]
            for key, label in [("years", "anos"), ("houses", "Casas")]:
                added = sorted(set(payload["summary"][key]) - set(previous[key]))
                if added:
                    payload["warnings"].append(f"Novos {label}: {', '.join(map(str, added))}.")
            with self.connect() as db:
                updated = db.execute(
                    "UPDATE imports SET status='Aguardando confirmação',raw=?,payload=?,records=? WHERE id=? AND status='Validando'",
                    (raw, json.dumps(payload, ensure_ascii=False), payload["summary"]["records"], ticket),
                )
                if updated.rowcount != 1:
                    raise Conflict("Validação expirada. Envie a planilha novamente.")
            return {"ticket": ticket, "summary": payload["summary"], "warnings": payload["warnings"]}
        except Exception as error:
            message = (
                str(error)
                if isinstance(error, (WorkbookError, Conflict))
                else "Falha no processamento. A base anterior foi preservada."
            )
            with self.connect() as db:
                db.execute(
                    "UPDATE imports SET status='Rejeitada',message=?,raw=NULL,payload=NULL WHERE id=?",
                    (message, ticket),
                )
            if isinstance(error, (WorkbookError, Conflict)):
                raise
            raise WorkbookError(message) from None

    def confirm(self, ticket: str, owner: str) -> None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT * FROM imports WHERE id=? AND owner=? AND status='Aguardando confirmação'", (ticket, owner)
            ).fetchone()
            if row is None or row["created"] < time.time() - 1800:
                raise Conflict("Validação inexistente ou expirada. Valide o arquivo novamente.")
            active = db.execute("SELECT active FROM state WHERE id=1").fetchone()[0]
            if active != row["base"]:
                raise Conflict("A base mudou. Valide o arquivo novamente.")
            raw = row["raw"]
            db.execute(
                "INSERT INTO versions VALUES(?,?,?,?,?,?,?)",
                (ticket, row["filename"], time.time(), len(raw), hashlib.sha256(raw).hexdigest(), raw, row["payload"]),
            )
            db.execute("UPDATE state SET previous=active,active=? WHERE id=1", (ticket,))
            db.execute("UPDATE imports SET status='Sucesso',raw=NULL,payload=NULL WHERE id=?", (ticket,))
            db.execute(
                "DELETE FROM versions WHERE id NOT IN (SELECT active FROM state UNION SELECT previous FROM state WHERE previous IS NOT NULL)"
            )

    def cancel(self, ticket: str, owner: str) -> None:
        with self.connect() as db:
            db.execute(
                "UPDATE imports SET status='Cancelada',raw=NULL,payload=NULL WHERE id=? AND owner=? AND status='Aguardando confirmação'",
                (ticket, owner),
            )

    def pending(self, owner: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT id,payload FROM imports WHERE owner=? AND status='Aguardando confirmação' AND created>?",
                (owner, time.time() - 1800),
            ).fetchone()
        if not row:
            return None
        payload = json.loads(row["payload"])
        return {"ticket": row["id"], "summary": payload["summary"], "warnings": payload["warnings"]}

    def restore(self) -> None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT previous FROM state WHERE id=1").fetchone()
            if not row[0]:
                raise Conflict("Nenhuma versão anterior disponível.")
            db.execute("UPDATE state SET active=previous,previous=active WHERE id=1")

    def source(self) -> bytes:
        with self.connect() as db:
            return bytes(
                db.execute("SELECT raw FROM versions WHERE id=(SELECT active FROM state WHERE id=1)").fetchone()[0]
            )
