"""기준가 확정 순수 로직 테스트 (PERF-002/003/008). DB 비의존."""

from datetime import date, datetime, timezone
from decimal import Decimal

from signals_batch.performance.reference_price import classify_session, resolve_entry
from signals_batch.performance.trading_calendar import MarketCalendar

# 2026-07-20(월)·21(화)·22(수) 개장, 주말 휴장 가정
KR_CAL = MarketCalendar(frozenset({date(2026, 7, 20), date(2026, 7, 21), date(2026, 7, 22)}))
US_CAL = MarketCalendar(frozenset({date(2026, 7, 20), date(2026, 7, 21), date(2026, 7, 22)}))


def utc(y, mo, d, h, mi):
    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)


# KST = UTC+9 → KST 시각 X시는 UTC (X-9)시
def kst_to_utc(y, mo, d, h, mi):
    hh = h - 9
    if hh < 0:
        hh += 24
        d -= 1
    return utc(y, mo, d, hh, mi)


# 고정 시가/VWAP 룩업
def open_lookup(prices):
    return lambda d: prices.get(d)


def vwap_val(v):
    return lambda w_start, w_end: v


def NO_VWAP(w_start, w_end):
    return None


def NO_OPEN(d):
    return None


class TestSession:
    def test_pre(self):
        assert classify_session(kst_to_utc(2026, 7, 21, 8, 0), "KOSPI", KR_CAL) == "PRE"

    def test_regular(self):
        assert classify_session(kst_to_utc(2026, 7, 21, 11, 0), "KOSPI", KR_CAL) == "REGULAR"

    def test_post(self):
        assert classify_session(kst_to_utc(2026, 7, 21, 16, 0), "KOSPI", KR_CAL) == "POST"

    def test_closed_weekend(self):
        # 2026-07-25(토) — 캘린더에 없음
        assert classify_session(kst_to_utc(2026, 7, 25, 11, 0), "KOSPI", KR_CAL) == "CLOSED"


class TestResolveKR:
    def test_post_uses_next_open(self):
        # 화 16:00 발행 → 수(22일) 시가
        prices = {date(2026, 7, 22): Decimal("78500")}
        r = resolve_entry(kst_to_utc(2026, 7, 21, 16, 0), "KOSPI", KR_CAL, open_lookup(prices), NO_VWAP)
        assert r.resolved and r.entry_date == date(2026, 7, 22)
        assert r.entry_price == Decimal("78500") and r.price_type == "NEXT_OPEN"

    def test_pre_uses_today_open(self):
        # 화 08:00 발행(장전) → 당일(21일) 시가
        prices = {date(2026, 7, 21): Decimal("77000")}
        r = resolve_entry(kst_to_utc(2026, 7, 21, 8, 0), "KOSPI", KR_CAL, open_lookup(prices), NO_VWAP)
        assert r.resolved and r.entry_date == date(2026, 7, 21) and r.entry_price == Decimal("77000")

    def test_intraday_uses_vwap(self):
        # 화 11:00 발행(장중) → 5분 VWAP
        r = resolve_entry(kst_to_utc(2026, 7, 21, 11, 0), "KOSPI", KR_CAL, NO_OPEN, vwap_val(Decimal("78900")))
        assert r.resolved and r.price_type == "INTRADAY_VWAP" and r.entry_price == Decimal("78900")

    def test_weekend_uses_next_monday(self):
        # 토 10:00 발행 → 다음 개장일... 캘린더는 22일까지만 → 없음(대기)
        r = resolve_entry(kst_to_utc(2026, 7, 25, 10, 0), "KOSPI", KR_CAL, NO_OPEN, NO_VWAP)
        assert not r.resolved

    def test_friday_post_to_monday(self):
        # 캘린더에 월(27일) 추가 후 금(24일) 장후 → 월 시가
        cal = MarketCalendar(KR_CAL.open_dates | {date(2026, 7, 24), date(2026, 7, 27)})
        prices = {date(2026, 7, 27): Decimal("80000")}
        r = resolve_entry(kst_to_utc(2026, 7, 24, 16, 0), "KOSPI", cal, open_lookup(prices), NO_VWAP)
        assert r.resolved and r.entry_date == date(2026, 7, 27)

    def test_waiting_when_no_price(self):
        r = resolve_entry(kst_to_utc(2026, 7, 21, 16, 0), "KOSPI", KR_CAL, NO_OPEN, NO_VWAP)
        assert not r.resolved and "대기" in r.note


class TestResolveUS:
    def test_us_post_next_open_et(self):
        # ET = UTC-4(여름). 화 16:30 ET(장후) = UTC 20:30 → 수(22일) 시가
        pub = utc(2026, 7, 21, 20, 30)
        prices = {date(2026, 7, 22): Decimal("230.5")}
        r = resolve_entry(pub, "NASDAQ", US_CAL, open_lookup(prices), NO_VWAP)
        assert r.resolved and r.entry_date == date(2026, 7, 22) and r.entry_price == Decimal("230.5")

    def test_us_regular_session(self):
        # 화 11:00 ET = UTC 15:00 → 장중
        assert classify_session(utc(2026, 7, 21, 15, 0), "NASDAQ", US_CAL) == "REGULAR"
