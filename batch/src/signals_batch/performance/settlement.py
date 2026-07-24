"""자동 청산 판정 (SIG-019 / SIG-020, PERF-004).

OPEN 포지션을 일봉으로 훑어 청산 조건 도달 여부와 청산가를 판정한다.

| 조건 | 청산가 | 사유 |
|---|---|---|
| 목표가 도달 (장중 고가 ≥ 목표가) | 목표가 | TAKE_PROFIT |
| 손절가 도달 (장중 저가 ≤ 손절가) | 손절가 | STOP_LOSS |
| 최대 보유기간 초과 | 당일 종가 | TIME_LIMIT |
| 상장폐지 | 마지막 거래일 종가 | FORCED (배치 층에서 주입) |
| 에이전트 ARCHIVED | 당일 종가 | AGENT_ARCHIVED (배치 층에서 주입) |

**갭 처리 (SIG-020, PERF-004)**: 시가가 이미 목표가/손절가를 넘어선 경우 청산가는
목표가/손절가가 아니라 **시가**다. 손절가로 계산하면 갭하락을 손절가에 판 것처럼 만들어
성과를 과대평가한다. 시가가 첫 체결가이므로 갭 판정을 장중 터치보다 먼저 본다.

**보유일 규약 (확정, 2026-07-24 — T12 골든 테스트의 기준)**:
청산 판정은 **진입일 당일을 제외하고 다음 거래일부터** 훑는다. 진입일=0일차,
그 다음 거래일=1일차이며 `max_holding_days`는 이 1일차 기준 카운트다.
근거: (1) 진입 당일 장중 익절을 다음 거래일로 미루므로 방향이 항상 보수적 →
성과 과대평가 절대 없음(PERF-001). (2) NEXT_OPEN·INTRADAY_VWAP 진입을 분기 없이
동일 처리(장중 진입은 당일 고가/저가에 진입 전 가격이 섞여 look-back 위험이 있어
당일 평가가 애초에 불가). (3) 오버나잇 갭으로 진입가가 목표를 이미 넘는 넌센스 케이스 회피.
수기 대조(T12)도 이 규약을 따르면 오차 0.01%p 내로 재현된다.

핵심 판정은 순수 함수(settle_open_position)로 분리해 DB 없이 테스트한다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Callable, Literal

from signals_batch.performance.trading_calendar import MarketCalendar

log = logging.getLogger("performance.settlement")

Side = Literal["LONG", "SHORT"]
ExitReason = Literal["TAKE_PROFIT", "STOP_LOSS", "TIME_LIMIT", "FORCED", "AGENT_ARCHIVED"]

# SIG-021: 최대 보유일 미설정 시 강제 180일(거래일) 상한
DEFAULT_MAX_HOLDING_DAYS = 180


@dataclass(frozen=True)
class Bar:
    """일봉 OHLC."""

    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal


BarLookup = Callable[[date], "Bar | None"]


@dataclass
class ExitResolution:
    resolved: bool
    exit_date: date | None = None
    exit_price: Decimal | None = None
    exit_reason: ExitReason | None = None
    holding_days: int | None = None  # 진입일 제외, 청산일까지의 거래일 수
    note: str = ""


@dataclass
class _Hit:
    price: Decimal
    reason: ExitReason
    note: str


def _check_day(bar: Bar, target: Decimal, stop: Decimal, side: Side, is_time_limit: bool) -> _Hit | None:
    """하루치 일봉에서 청산 조건 판정. 없으면 None.

    순서: (1) 갭(시가) → (2) 장중 터치 → (3) 만기 종가. 이는 하루의 체결 순서
    (시가가 첫 체결)를 반영한다.
    """
    if side == "LONG":
        # (1) 갭: 시가가 이미 목표/손절을 넘었나 (SIG-020)
        if bar.open >= target:
            return _Hit(bar.open, "TAKE_PROFIT", "갭상승 — 시가 청산")
        if bar.open <= stop:
            return _Hit(bar.open, "STOP_LOSS", "갭하락 — 시가 청산")
        # (2) 장중 터치
        hit_target = bar.high >= target
        hit_stop = bar.low <= stop
        if hit_target and hit_stop:
            # 일봉만으론 목표·손절 도달 순서를 알 수 없다 → 보수적으로 손절 우선
            # (성과 과대평가 방지, PERF-001 원칙 3: 이론적 최적가 금지)
            return _Hit(stop, "STOP_LOSS", "동일 봉 양방 터치 — 보수적 손절 우선")
        if hit_target:
            return _Hit(target, "TAKE_PROFIT", "목표가 도달")
        if hit_stop:
            return _Hit(stop, "STOP_LOSS", "손절가 도달")
    else:  # SHORT: 목표가 < 진입 < 손절가 (하락에 베팅)
        if bar.open <= target:
            return _Hit(bar.open, "TAKE_PROFIT", "갭하락(숏 이익) — 시가 청산")
        if bar.open >= stop:
            return _Hit(bar.open, "STOP_LOSS", "갭상승(숏 손절) — 시가 청산")
        hit_target = bar.low <= target
        hit_stop = bar.high >= stop
        if hit_target and hit_stop:
            return _Hit(stop, "STOP_LOSS", "동일 봉 양방 터치 — 보수적 손절 우선")
        if hit_target:
            return _Hit(target, "TAKE_PROFIT", "목표가 도달")
        if hit_stop:
            return _Hit(stop, "STOP_LOSS", "손절가 도달")

    # (3) 만기: 위 조건 미도달 + 최대 보유일 도달 → 당일 종가 청산 (SIG-019 TIME_LIMIT)
    if is_time_limit:
        return _Hit(bar.close, "TIME_LIMIT", "최대 보유기간 초과 — 종가 청산")
    return None


def settle_open_position(
    entry_date: date,
    target_price: Decimal,
    stop_loss_price: Decimal,
    side: Side,
    max_holding_days: int | None,
    cal: MarketCalendar,
    bar: BarLookup,
    today: date,
) -> ExitResolution:
    """진입일 다음 거래일부터 today까지 일봉을 순서대로 훑어 최초 청산 조건을 찾는다.

    아직 조건 미도달이면 resolved=False(다음 배치 재시도). 데이터가 아직 없는
    과거 거래일은 대기로 간주하고 건너뛰지 않는다(거래정지 VOID 처리는 T11/이상탐지 소관).
    """
    effective_max = max_holding_days if max_holding_days else DEFAULT_MAX_HOLDING_DAYS

    d = cal.next_open_day(entry_date)
    idx = 0
    while d is not None and d <= today:
        idx += 1
        b = bar(d)
        if b is None:
            # 과거 거래일인데 일봉 데이터 미도착 → 대기 (다음 배치에서 재판정)
            return ExitResolution(False, note=f"{d} 일봉 데이터 대기")
        hit = _check_day(b, target_price, stop_loss_price, side, is_time_limit=(idx >= effective_max))
        if hit is not None:
            return ExitResolution(True, d, hit.price, hit.reason, idx, hit.note)
        d = cal.next_open_day(d)

    return ExitResolution(False, note="청산 조건 미도달 — 계속 보유")


def force_close(
    entry_date: date,
    reason: ExitReason,
    close_date: date,
    close_price: Decimal,
    cal: MarketCalendar,
) -> ExitResolution:
    """외부 사유(상장폐지 FORCED / 에이전트 ARCHIVED)로 마지막 거래일 종가 강제 청산.

    보유일 수는 진입일~청산일 사이 거래일 수로 계산한다.
    """
    idx = 0
    d = cal.next_open_day(entry_date)
    while d is not None and d <= close_date:
        idx += 1
        d = cal.next_open_day(d)
    return ExitResolution(True, close_date, close_price, reason, idx, f"강제 청산({reason})")
