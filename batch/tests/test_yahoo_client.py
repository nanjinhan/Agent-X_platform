"""야후 클라이언트 날짜 변환 단위 테스트 (네트워크 없이)."""

from datetime import date

from signals_batch.ingestion.yahoo_client import _to_local_date


class TestLocalDate:
    def test_us_market_open_edt(self):
        # 2026-06-08 09:30 ET(-14400) 개장 타임스탬프 → 현지 6/8
        ts = 1780925400  # from probe
        assert _to_local_date(ts, -14400) == date(2026, 6, 8)

    def test_utc_midnight_boundary(self):
        # UTC 00:30, gmtoffset -14400(EDT) → 전날로 롤백
        ts = int(date(2026, 6, 9).toordinal() - date(1970, 1, 1).toordinal()) * 86400 + 1800
        assert _to_local_date(ts, -14400) == date(2026, 6, 8)
