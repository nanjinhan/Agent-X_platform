"""수집 데이터 공통 모델. 소스(KRX/네이버/Polygon)에 독립적."""

from dataclasses import dataclass
from datetime import date


@dataclass
class DailyQuote:
    market: str
    ticker: str
    name_kr: str
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: int
    value: int | None  # 거래대금 — 소스에 따라 없을 수 있음
    market_cap: int | None
    trade_date: date


@dataclass
class Instrument:
    market: str  # KOSPI | KOSDAQ
    ticker: str
    name_kr: str
    listed_at: date | None = None
