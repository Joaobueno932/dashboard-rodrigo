from pathlib import Path

import pytest

from backend.app.parser import parse_workbook

SOURCE = Path(__file__).resolve().parents[2] / "data/source/indicadores.xlsx"


@pytest.fixture(scope="session")
def raw():
    return SOURCE.read_bytes()


@pytest.fixture(scope="session")
def parsed():
    return parse_workbook(SOURCE)
