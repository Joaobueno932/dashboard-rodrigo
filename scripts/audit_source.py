"""Independently compare every normalized numeric value to its source cell."""

import json
from pathlib import Path

import openpyxl
from openpyxl.utils.cell import coordinate_to_tuple

root = Path(__file__).resolve().parents[1]
source = openpyxl.load_workbook(root / "data/source/indicadores.xlsx", read_only=True, data_only=True)
payload = json.loads((root / "data/processed/initial.json").read_text())
results = []
for indicator in payload["indicators"]:
    records = indicator["records"]
    last = max((coordinate_to_tuple(r["cell"])[0] for r in records), default=1)
    rows = list(source[indicator["sheet"]].iter_rows(max_row=last, max_col=64, values_only=True))
    for record in records:
        row, col = coordinate_to_tuple(record["cell"])
        original = rows[row - 1][col - 1]
        if original in (None, "", "-", "—", "–"):
            assert record["value"] is None, (indicator["code"], record["cell"])
        else:
            assert float(original) == record["value"], (indicator["code"], record["cell"])
    results.append(
        {"code": indicator["code"], "sheet": indicator["sheet"], "verified": len(records), "result": "passed"}
    )
source.close()
report = {"verified": sum(r["verified"] for r in results), "indicators": results, "result": "passed"}
(root / "docs/conferencia-valores.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(f"Conferência independente: {report['verified']} valores iguais às células de origem.")
