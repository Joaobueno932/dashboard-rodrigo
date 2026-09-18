"""Indicator contracts: semantic headers, never worksheet coordinates."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Indicator:
    code: str
    title: str
    value: str
    kind: str = "sum"
    category: str | None = None


CATALOG = [
    Indicator("A.1.1.1", "Consumo de água", r"^consumo de agua \(m³\)$"),
    Indicator("A.1.1.2", "Consumo de água per capita", r"^consumo de agua per capita", "ratio"),
    Indicator("A.2.1.1", "Consumo de energia", r"^consumo de energia eletrica \(kwh\)$"),
    Indicator("A.2.1.2", "Consumo de energia per capita", r"^consumo de energia per capita", "ratio"),
    Indicator("A.2.2.1", "Energia gerada por fontes renováveis", r"^total de energia gerada"),
    Indicator("A.3.2.1", "Total de impressões", r"^total de impressoes$"),
    Indicator(
        "A.4.1.1", "Consumo de combustível", r"^total de combustivel consumido", category=r"^tipo do combustivel"
    ),
    Indicator("A.5.1.1", "Emissões GEE", r"^total de emissoes", category=r"^escopo$"),
    Indicator("S.1.1.1", "Número de colaboradores", r"^numero de colaboradores$", "stock"),
    Indicator("S.1.1.2", "Colaboradores por gênero", r"^numero de colaboradores (do genero|de genero)", "wide"),
    Indicator("S.1.1.3", "Colaboradores por faixa etária", r"^numero de colaboradores (ate|de|com)", "wide"),
    Indicator("S.1.2.1", "Colaboradores por raça", r"^numero de colaboradores .+", "wide"),
    Indicator("S.1.4.2", "Horas de capacitação Unindústria", r"^carga horaria realizada$"),
    Indicator(
        "G.1.1.7",
        "Participantes em treinamento de ética e compliance",
        r"^numero de participantes em treinamentos de compliance$",
    ),
    Indicator("G.3.2.1", "Número de atendimentos — Ouvidoria", r"^numero de atendimentos$"),
    Indicator("G.3.2.3", "Número de atendimentos — SAC", r"^numero de atendimentos$"),
]
