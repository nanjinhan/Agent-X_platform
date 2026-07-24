"""진입 기준가 확정 (PERF-002/003/008).

발행 시점에 따라:
  - 장 마감 후 ~ 익일 개장 전 / 휴장일  → 다음 개장일 시가 (NEXT_OPEN)
  - 장중                                 → 발행+5분~+10분 VWAP (INTRADAY_VWAP)

종가를 안 쓰는 이유(PERF-002): 마감 직전 발행 후 그날 종가를 기준가로 삼으면 이미 오른 걸
자기 성과로 흡수한다. 실제 구독자가 살 수 있는 가격(익일 시가/5분 지연 VWAP)만 인정한다.

핵심 판정은 순수 함수(resolve_entry)로 분리해 DB 없이 테스트한다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Callable, Literal

from signals_batch.performance.trading_calendar import (
    MarketCalendar,
    market_close_time,
    market_open_time,
    market_tz,
)

log = logging.getLogger("performance.reference_price")

Session = Literal["PRE", "REGULAR", "POST", "CLOSED"]
PriceType = Literal["NEXT_OPEN", "INTRADAY_VWAP"]

DayOpenLookup = Callable[[date], "Decimal | None"]
VwapLookup = Callable[[datetime, datetime], "Decimal | None"]


@dataclass
class EntryResolution:
    resolved: bool
    entry_date: date | None = None
    entry_price: Decimal | None = None
    price_type: PriceType | None = None
    note: str = ""


def classify_session(published_at_utc: datetime, market: str, cal: MarketCalendar) -> Session:
    """발행 시각을 시장 현지 세션으로 분류."""
    local = published_at_utc.astimezone(market_tz(market))
    if not cal.is_open(local.date()):
        return "CLOSED"
    t = local.time()
    if t < market_open_time(market):
        return "PRE"
    if t < market_close_time(market):
        return "REGULAR"
    return "POST"


def resolve_entry(
    published_at_utc: datetime,
    market: str,
    cal: MarketCalendar,
    day_open: DayOpenLookup,
    vwap: VwapLookup,
) -> EntryResolution:
    """진입 기준가 확정. 데이터가 아직 없으면 resolved=False(다음 배치 재시도)."""
    local = published_at_utc.astimezone(market_tz(market))
    session = classify_session(published_at_utc, market, cal)

    if session == "REGULAR":
        # 발행+5분 ~ +10분 VWAP (PERF-003)
        w_start = published_at_utc + timedelta(minutes=5)
        w_end = published_at_utc + timedelta(minutes=10)
        price = vwap(w_start, w_end)
        if price is None:
            return EntryResolution(False, note="장중 발행 — 5분 VWAP(분봉) 데이터 대기")
        return EntryResolution(True, local.date(), price, "INTRADAY_VWAP", "장중 5분 VWAP")

    # 장전(오늘 개장 전) → 오늘 시가 / 그 외(장후·휴장) → 다음 개장일 시가
    if session == "PRE":
        target: date | None = local.date()
    else:  # POST or CLOSED
        target = cal.next_open_day(local.date())
        if target is None:
            return EntryResolution(False, note="다음 개장일 캘린더 미확정")

    price = day_open(target)
    if price is None:
        return EntryResolution(False, note=f"{target} 시가 데이터 대기")
    return EntryResolution(True, target, price, "NEXT_OPEN", f"{session} → {target} 시가")
