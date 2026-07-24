"""거래 캘린더·시장 시각 헬퍼 (PERF-008).

시장별 타임존과 개장/마감 시각을 정의하고, 거래일 판정·다음 개장일 계산을 제공한다.
DB 비의존(거래일 집합을 주입) → 순수 함수로 테스트 가능.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from zoneinfo import ZoneInfo

# 시장 → (타임존, 개장, 마감)
_MARKET_SPEC: dict[str, tuple[str, time, time]] = {
    "KOSPI": ("Asia/Seoul", time(9, 0), time(15, 30)),
    "KOSDAQ": ("Asia/Seoul", time(9, 0), time(15, 30)),
    "NYSE": ("America/New_York", time(9, 30), time(16, 0)),
    "NASDAQ": ("America/New_York", time(9, 30), time(16, 0)),
    "AMEX": ("America/New_York", time(9, 30), time(16, 0)),
}


def market_tz(market: str) -> ZoneInfo:
    return ZoneInfo(_MARKET_SPEC[market][0])


def market_open_time(market: str) -> time:
    return _MARKET_SPEC[market][1]


def market_close_time(market: str) -> time:
    return _MARKET_SPEC[market][2]


def calendar_market(market: str) -> str:
    """trading_calendar는 국가 단위(KR/US)로 저장된다. 시장 → 캘린더 키."""
    return "KR" if market in ("KOSPI", "KOSDAQ") else "US"


@dataclass(frozen=True)
class MarketCalendar:
    """특정 시장(국가)의 개장일 집합."""

    open_dates: frozenset[date]

    def is_open(self, d: date) -> bool:
        return d in self.open_dates

    def next_open_day(self, d: date) -> date | None:
        """d보다 엄격히 이후인 첫 개장일. 캘린더 범위를 벗어나면 None."""
        if not self.open_dates:
            return None
        candidates = sorted(x for x in self.open_dates if x > d)
        return candidates[0] if candidates else None
