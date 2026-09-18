import math

import pytest

from backend.app.parser import WorkbookError, number, parse_workbook
from backend.tests.helpers import changed, rename_sheets


def test_real_workbook_all_indicators_and_values(parsed):
    assert parsed["summary"]["indicators"] == 16
    assert parsed["summary"]["years"] == [2022, 2023, 2024, 2025, 2026]
    by_code = {i["code"]: i for i in parsed["indicators"]}
    assert by_code["A.1.1.1"]["records"][0]["value"] == 100
    assert by_code["A.1.1.1"]["records"][0]["cell"] == "E13"
    assert by_code["A.1.1.2"]["records"][0]["value"] == pytest.approx(42271 / 1143)
    assert by_code["A.1.1.2"]["houseFilter"] is False
    assert by_code["A.5.1.1"]["unit"] == "tCO2e"
    assert by_code["A.2.2.1"]["unit"] == "MWh"
    assert sum(r["value"] for r in by_code["S.1.1.1"]["records"] if r["year"] == 2025) == 1660
    assert [r["value"] for r in by_code["G.3.2.3"]["records"]] == [50539, 16634, 21995]
    assert all(r["value"] is None or math.isfinite(r["value"]) for i in parsed["indicators"] for r in i["records"])


@pytest.mark.parametrize(
    "value,expected", [(None, None), ("-", None), ("", None), (0, 0), ("1.234,50", 1234.5), (0.00004, 0.00004)]
)
def test_missing_and_ptbr(value, expected):
    assert number(value) == expected


@pytest.mark.parametrize("value", ["text", float("inf"), float("nan"), True, -5])
def test_bad_numbers(value):
    with pytest.raises(WorkbookError):
        number(value)


@pytest.mark.parametrize("replacement,text", [(None, False), ("-", True)])
def test_empty_cells_preserved(raw, tmp_path, replacement, text):
    path = tmp_path / "changed.xlsx"
    path.write_bytes(changed(raw, cell="E13", value=replacement, text=text))
    parsed = parse_workbook(path)
    assert parsed["indicators"][0]["records"][0]["value"] is None


def test_new_year_and_house(raw, tmp_path):
    raw = changed(raw, cell="D13", value="2027")
    raw = changed(raw, cell="A13", value="Nova Casa", text=True)
    path = tmp_path / "changed.xlsx"
    path.write_bytes(raw)
    parsed = parse_workbook(path)
    assert 2027 in parsed["summary"]["years"]
    assert "Nova Casa" in parsed["summary"]["houses"]


def test_renamed_sheets(raw, tmp_path):
    path = tmp_path / "changed.xlsx"
    path.write_bytes(rename_sheets(raw))
    assert parse_workbook(path)["summary"]["indicators"] == 16


def test_missing_required_indicator(raw, tmp_path):
    path = tmp_path / "changed.xlsx"
    path.write_bytes(changed(raw, sheet="sheet10.xml", cell="A10", value="A.9.9.9", text=True))
    with pytest.raises(WorkbookError, match="A.2.2.1"):
        parse_workbook(path)


def test_corrupt(tmp_path):
    path = tmp_path / "invalid.xlsx"
    path.write_bytes(b"not an excel file")
    with pytest.raises(WorkbookError):
        parse_workbook(path)
