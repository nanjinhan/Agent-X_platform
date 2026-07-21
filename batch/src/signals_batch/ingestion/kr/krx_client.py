"""KRX 정보데이터시스템(data.krx.co.kr) 클라이언트 — 현재 미사용.

2026-07-21 확인: getJsonData.cmd가 이 네트워크에서 400 + "LOGOUT"을 반환
(세션/지역 차단 추정). 국내 시세는 naver_client + kind_client 조합으로 대체했다.
정식 시장데이터 계약(SYS-007, Phase 0) 체결 시 이 모듈을 계약 소스로 재구현한다.

이중화(SYS-010) 관점에서 두 번째 소스가 필요해지면 여기부터 복구할 것.
"""

from datetime import date

from signals_batch.ingestion.models import DailyQuote

__all__ = ["DailyQuote", "fetch_daily_quotes"]


def fetch_daily_quotes(trade_date: date, timeout: float = 30.0) -> list[DailyQuote]:
    raise NotImplementedError(
        "KRX direct endpoint is blocked from this network (400 LOGOUT). "
        "Use naver_client.fetch_ohlcv + kind_client.fetch_instruments instead."
    )
