import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.parser import WorkbookError
from backend.app.security import hash_password
from backend.app.store import Conflict, Store
from backend.tests.conftest import SOURCE
from backend.tests.helpers import changed


@pytest.fixture
def store(tmp_path):
    result = Store(tmp_path)
    result.initialize(SOURCE)
    return result


def test_transaction_and_restart(store, raw):
    old = store.snapshot()["version"]
    staged = store.validate(changed(raw, cell="D13", value="2027"), "nova.xlsx", "user")
    assert store.snapshot()["version"] == old
    store.confirm(staged["ticket"], "user")
    restarted = Store(store.path.parent)
    restarted.initialize(SOURCE)
    assert restarted.snapshot()["version"] == staged["ticket"]
    assert 2027 in restarted.snapshot()["summary"]["years"]
    restarted.restore()
    assert restarted.snapshot()["version"] == old


def test_failed_import_preserves_data(store):
    old = store.snapshot()
    with pytest.raises(WorkbookError):
        store.validate(b"broken", "broken.xlsx", "user")
    assert store.snapshot() == old
    assert store.history()[0]["status"] == "Rejeitada"


def test_processing_failure(store, raw, monkeypatch):
    old = store.snapshot()["version"]

    def fail(_):
        raise RuntimeError("internal secret")

    monkeypatch.setattr("backend.app.store.parse_workbook", fail)
    with pytest.raises(WorkbookError, match="base anterior"):
        store.validate(raw, "source.xlsx", "user")
    assert store.snapshot()["version"] == old
    assert "secret" not in str(store.history())


def test_cancel_and_owner_isolation(store, raw):
    old = store.snapshot()["version"]
    staged = store.validate(raw, "source.xlsx", "user")
    with pytest.raises(Conflict):
        store.confirm(staged["ticket"], "different-user")
    store.cancel(staged["ticket"], "user")
    with pytest.raises(Conflict):
        store.confirm(staged["ticket"], "user")
    assert store.snapshot()["version"] == old
    assert store.pending("user") is None


def test_concurrent_validation(store, raw):
    barrier = threading.Barrier(2)

    def attempt():
        barrier.wait()
        try:
            return store.validate(raw, "source.xlsx", "user")["ticket"]
        except Conflict:
            return "blocked"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: attempt(), range(2)))
    assert results.count("blocked") == 1
    store.confirm(next(r for r in results if r != "blocked"), "user")


def test_atomic_rollback_on_database_failure(store, raw):
    old = store.snapshot()["version"]
    staged = store.validate(raw, "source.xlsx", "user")
    with store.connect() as db:
        db.execute("CREATE TRIGGER fail BEFORE UPDATE ON state BEGIN SELECT RAISE(ABORT,'test failure'); END;")
    with pytest.raises(Exception):
        store.confirm(staged["ticket"], "user")
    assert store.snapshot()["version"] == old
    assert store.pending("user")["ticket"] == staged["ticket"]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "2")
    app = create_app(tmp_path, hash_password("test-password-for-tests"), SOURCE)
    with TestClient(app) as test_client:
        yield test_client


def login(client):
    result = client.post(
        "/api/login", json={"password": "test-password-for-tests"}, headers={"X-Requested-With": "fiems-dashboard"}
    )
    assert result.status_code == 200
    return {
        "X-CSRF-Token": result.json()["csrf"],
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Filename": "source.xlsx",
    }


def test_auth_csrf_and_logout(client, raw):
    assert client.get("/api/data").status_code == 200
    assert client.get("/api/imports").status_code == 401
    assert client.post("/api/imports/validate", content=raw).status_code == 401
    headers = login(client)
    assert client.get("/api/session").status_code == 200
    assert client.post("/api/imports/validate", content=raw).status_code == 403
    assert client.post("/api/logout", headers=headers).status_code == 200
    assert client.get("/api/imports").status_code == 401


@pytest.mark.parametrize(
    "filename,mime,body,status",
    [
        ("../evil.xlsx", "application/octet-stream", b"x", 422),
        ("wrong.csv", "application/octet-stream", b"x", 422),
        ("source.xlsx", "text/html", b"x", 415),
        ("source.xlsx", "application/octet-stream", b"broken", 422),
        ("source.xlsx", "application/octet-stream", b"x" * (2 * 1024 * 1024 + 1), 413),
    ],
)
def test_invalid_uploads(client, filename, mime, body, status):
    headers = login(client)
    headers.update({"X-Filename": filename, "Content-Type": mime})
    old = client.get("/api/data").json()["version"]
    assert client.post("/api/imports/validate", content=body, headers=headers).status_code == status
    assert client.get("/api/data").json()["version"] == old


def test_api_full_upload_flow(client, raw):
    headers = login(client)
    old = client.get("/api/data").json()["version"]
    result = client.post("/api/imports/validate", content=raw, headers=headers)
    assert result.status_code == 200, result.text
    ticket = result.json()["ticket"]
    assert client.get("/api/data").json()["version"] == old
    assert client.post(f"/api/imports/{ticket}/confirm", headers=headers).status_code == 200
    assert client.get("/api/data").json()["version"] == ticket
    assert client.get("/api/source").content == raw
    assert client.post(f"/api/imports/{ticket}/confirm", headers=headers).status_code == 409


def test_login_rate_limit(client):
    for _ in range(5):
        assert (
            client.post(
                "/api/login", json={"password": "wrong"}, headers={"X-Requested-With": "fiems-dashboard"}
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/login", json={"password": "wrong"}, headers={"X-Requested-With": "fiems-dashboard"}
        ).status_code
        == 429
    )
