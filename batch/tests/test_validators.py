"""SYS-009 품질검증 단위 테스트."""

from datetime import date

from signals_batch.ingestion.models import DailyQuote
from signals_batch.ingestion.quality.validators import (
    check_ohlc_integrity,
    check_outlier,
    check_volume,
    dedupe_latest,
    validate_batch,
)

D = date(2026, 7, 20)


def make_quote(**kw) -> DailyQuote:
    base = dict(
        market="KOSPI", ticker="005930", name_kr="삼성전자",
        open=100.0, high=110.0, low=95.0, close=105.0,
        volume=1000, value=100000, market_cap=10**12, trade_date=D,
    )
    base.update(kw)
    return DailyQuote(**base)


class TestOhlcIntegrity:
    def test_valid(self):
        assert check_ohlc_integrity(make_quote()) is None

    def test_low_above_open(self):
        assert check_ohlc_integrity(make_quote(low=101.0)) == "OHLC_INCONSISTENT"

    def test_close_above_high(self):
        assert check_ohlc_integrity(make_quote(close=120.0)) == "OHLC_INCONSISTENT"

    def test_missing_open(self):
        assert check_ohlc_integrity(make_quote(open=None)) == "OHLC_MISSING"

    def test_zero_price(self):
        assert check_ohlc_integrity(make_quote(open=0.0, low=0.0)) == "NON_POSITIVE_PRICE"


class TestVolume:
    def test_negative(self):
        assert check_volume(make_quote(volume=-1)) == "NEGATIVE_VOLUME"

    def test_zero_ok(self):
        assert check_volume(make_quote(volume=0)) is None


class TestOutlier:
    def test_over_50pct_up(self):
        assert check_outlier(make_quote(close=160.0), prev_close=100.0) == "PRICE_OUTLIER"

    def test_over_50pct_down(self):
        assert check_outlier(make_quote(close=45.0), prev_close=100.0) == "PRICE_OUTLIER"

    def test_within_range(self):
        assert check_outlier(make_quote(close=140.0), prev_close=100.0) is None

    def test_no_prev_close(self):
        assert check_outlier(make_quote(), prev_close=None) is None


class TestDedupe:
    def test_latest_wins(self):
        q1 = make_quote(close=100.0)
        q2 = make_quote(close=101.0)
        result = dedupe_latest([q1, q2])
        assert len(result) == 1
        assert result[0].close == 101.0

    def test_different_tickers_kept(self):
        assert len(dedupe_latest([make_quote(), make_quote(ticker="000660")])) == 2


class TestValidateBatch:
    def test_mixed(self):
        good = make_quote()
        bad = make_quote(ticker="BAD001", low=200.0)  # OHLC 불일치 → 거부
        spike = make_quote(ticker="SPK001", close=105.0)  # 전일 50 → +110% 플래그
        result = validate_batch([good, bad, spike], prev_closes={("KOSPI", "SPK001"): 50.0})
        assert len(result.valid) == 2  # 플래그 종목도 적재는 됨
        assert len(result.rejected) == 1
        assert result.rejected[0][1] == "OHLC_INCONSISTENT"
        assert len(result.flagged) == 1
        assert result.flagged[0][1] == "PRICE_OUTLIER"
