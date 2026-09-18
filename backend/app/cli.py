"""Administration from the server console, without default credentials."""

import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path

from .main import ROOT
from .parser import parse_workbook
from .security import hash_password
from .store import Store


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["configure", "extract", "restore", "snapshot"])
    parser.add_argument("--output", default="frontend/public/data.json", help="Destino do snapshot estático.")
    args = parser.parse_args()
    directory = Path(os.environ.get("DATA_DIR", str(ROOT / "data/runtime")))
    if args.command == "configure":
        password = getpass.getpass("Crie a senha administrativa (mínimo 12 caracteres): ")
        if len(password) < 12 or password != getpass.getpass("Confirme a senha: "):
            raise SystemExit("Senha curta ou confirmação diferente. Nada foi alterado.")
        directory.mkdir(parents=True, exist_ok=True)
        file = directory / "admin.json"
        file.write_text(json.dumps({"password_hash": hash_password(password)}), encoding="utf-8", newline="\n")
        file.chmod(0o600)
        with Store(directory).connect() as db:
            db.execute("DELETE FROM sessions")
        print("Senha configurada. Reinicie a aplicação.")
    elif args.command == "extract":
        payload = parse_workbook(ROOT / "data/source/indicadores.xlsx")
        target = ROOT / "data/processed/initial.json"
        target.parent.mkdir(exist_ok=True)
        # LF explícito: no Windows o padrão gravaria CRLF e o arquivo deixaria de bater com SHA256SUMS.txt.
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
        print(json.dumps(payload["summary"], ensure_ascii=False))
    elif args.command == "snapshot":
        # Mesma carga que a API entrega em /api/data, para publicação estática.
        source = ROOT / "data/source/indicadores.xlsx"
        raw = source.read_bytes()
        payload = parse_workbook(source)
        payload["version"] = hashlib.sha256(raw).hexdigest()[:32]
        payload["metadata"] = {
            "filename": source.name,
            "importedAt": source.stat().st_mtime,
            "size": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        }
        target = Path(args.output)
        if not target.is_absolute():
            target = ROOT / target
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="\n"
        )
        print(f"{target} · {json.dumps(payload['summary'], ensure_ascii=False)}")
    else:
        if input("Digite RESTAURAR para ativar o backup anterior: ") != "RESTAURAR":
            raise SystemExit("Cancelado.")
        Store(directory).restore()
        print("Versão anterior restaurada.")


if __name__ == "__main__":
    main()
