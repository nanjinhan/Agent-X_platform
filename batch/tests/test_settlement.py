"""자동 청산 판정 순수 로직 테스트 (SIG-019/020, PERF-004). DB 비의존.

검수-2 대응: 2.3 목표가 청산, 2.4 갭상승 시가, 2.5 갭하락 시가, 2.6 최대 보유일 종가.
"""

from datetime import date
from decimal import Decimal

from signals_batch.performance.settlement import (
    Bar,
    force_close,
    settle_open_position,
)
from signals_batch.performance.trading_calendar import MarketCalendar

# 2026-07-20(월)~24(금) 개장, 주말 휴장
CAL = MarketCalendar(frozenset(date(2026, 7, d) for d in (20, 21, 22, 23, 24, 27, 28, 29, 30, 31)))

D = lambda s: Decimal(s)  # noqa: E731
ENTRY = date(2026, 7, 20)
TARGET = D("89000")
STOP = D("73000")
TODAY = date(2026, 7, 31)


def bars(mapping):
    """{date: (o,h,l,c)} → BarLookup."""
    table = {d: Bar(D(str(o)), D(str(h)), D(str(l)), D(str(c))) for d, (o, h, l, c) in mapping.items()}
    return lambda d: table.get(d)


def settle(bar_lookup, max_holding=None, side="LONG", today=TODAY):
    return settle_open_position(ENTRY, TARGET, STOP, side, max_holding, CAL, bar_lookup, today)


class TestLongExit:
    def test_target_hit_intraday(self):
        # 2.3 — 고가가 목표가 도달, 시가는 미도달 → 목표가로 청산
        r = settle(bars({date(2026, 7, 21): (80000, 89400, 79500, 88000)}))
        assert r.resolved and r.exit_reason == "TAKE_PROFIT"
        assert r.exit_price == TARGET and r.exit_date == date(2026, 7, 21)
        assert r.holding_days == 1

    def test_stop_hit_intraday(self):
        r = settle(bars({date(2026, 7, 21): (80000, 81000, 72500, 74000)}))
        assert r.resolved and r.exit_reason == "STOP_LOSS" and r.exit_price == STOP

    def test_gap_up_over_target_uses_open(self):
        # 2.4 — 시가가 목표가 초과 → 청산가 = 시가 (목표가 아님)
        r = settle(bars({date(2026, 7, 21): (90000, 91000, 89500, 90500)}))
        assert r.resolved and r.exit_reason == "TAKE_PROFIT"
        assert r.exit_price == D("90000")  # 시가, not 89000

    def test_gap_down_under_stop_uses_open(self):
        # 2.5 — 시가가 손절가 미달 → 청산가 = 시가 (손절가 아님, 성과 과대 방지)
        r = settle(bars({date(2026, 7, 21): (71000, 72000, 70000, 70500)}))
        assert r.resolved and r.exit_reason == "STOP_LOSS"
        assert r.exit_price == D("71000")  # 시가, not 73000

    def test_time_limit_uses_close(self):
        # 2.6 — 최대 보유일(2거래일)까지 미도달 → 2번째 거래일 종가 청산
        m = {
            date(2026, 7, 21): (80000, 82000, 79000, 81000),
            date(2026, 7, 22): (81000, 83000, 80000, 82500),
        }
        r = settle(bars(m), max_holding=2)
        assert r.resolved and r.exit_reason == "TIME_LIMIT"
        assert r.exit_price == D("82500") and r.exit_date == date(2026, 7, 22)
        assert r.holding_days == 2

    def test_first_condition_wins_before_time_limit(self):
        # 1일차에 목표 도달 → 만기(2일) 이전에 청산
        m = {
            date(2026, 7, 21): (80000, 89400, 79000, 88000),
            date(2026, 7, 22): (88000, 90000, 87000, 89500),
        }
        r = settle(bars(m), max_holding=2)
        assert r.exit_date == date(2026, 7, 21) and r.exit_reason == "TAKE_PROFIT"

    def test_both_touched_same_bar_is_conservative_stop(self):
        # 고가≥목표 & 저가≤손절 동시 → 순서 불명 → 보수적 손절
        r = settle(bars({date(2026, 7, 21): (80000, 89500, 72500, 85000)}))
        assert r.exit_reason == "STOP_LOSS" and r.exit_price == STOP

    def test_still_holding_when_no_condition(self):
        m = {
            date(2026, 7, 21): (80000, 82000, 79000, 81000),
            date(2026, 7, 22): (81000, 83000, 80000, 82500),
        }
        # today를 데이터가 있는 마지막 날로 두어야 '대기'가 아닌 '계속 보유'
        r = settle(bars(m), today=date(2026, 7, 22))
        assert not r.resolved and "계속 보유" in r.note

    def test_waiting_when_bar_missing(self):
        # 과거 거래일인데 일봉 미도착 → 대기
        r = settle(bars({}), today=date(2026, 7, 21))
        assert not r.resolved and "대기" in r.note

    def test_default_max_holding_180_not_yet(self):
        # max_holding 미설정 + 짧은 캘린더 → 만기 미도달, 계속 보유
        m = {date(2026, 7, d): (80000, 82000, 79000, 81000) for d in (21, 22, 23, 24, 27, 28, 29, 30, 31)}
        r = settle(bars(m))
        assert not r.resolved


class TestShortExit:
    # 숏: 목표가 < 진입 < 손절가
    S_TARGET, S_STOP = D("70000"), D("86000")

    def settle_short(self, mapping, max_holding=None):
        return settle_open_position(
            ENTRY, self.S_TARGET, self.S_STOP, "SHORT", max_holding, CAL, bars(mapping), TODAY
        )

    def test_short_target_hit(self):
        r = self.settle_short({date(2026, 7, 21): (80000, 81000, 69500, 70500)})
        assert r.resolved and r.exit_reason == "TAKE_PROFIT" and r.exit_price == self.S_TARGET

    def test_short_gap_down_over_target_uses_open(self):
        r = self.settle_short({date(2026, 7, 21): (69000, 70000, 68000, 69500)})
        assert r.exit_reason == "TAKE_PROFIT" and r.exit_price == D("69000")

    def test_short_stop_gap_up_uses_open(self):
        r = self.settle_short({date(2026, 7, 21): (87000, 88000, 86500, 87500)})
        assert r.exit_reason == "STOP_LOSS" and r.exit_price == D("87000")


class TestForceClose:
    def test_force_close_uses_given_close(self):
        r = force_close(ENTRY, "AGENT_ARCHIVED", date(2026, 7, 23), D("81000"), CAL)
        assert r.resolved and r.exit_reason == "AGENT_ARCHIVED"
        assert r.exit_price == D("81000") and r.exit_date == date(2026, 7, 23)
        assert r.holding_days == 3  # 21,22,23
