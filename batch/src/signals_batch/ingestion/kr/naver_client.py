"""네이버 금융 시세 API — 종목별 일봉(OHLCV) 소스. 인증 불필요.

한계 (후속 보강 대상):
- 거래대금(value) 미제공 → daily_prices.value 는 NULL 적재
- 수정주가 계수 미제공 → PERF-023 처리 시 별도 소스 필요
"""

import ast
from datetime import date, datetime

import httpx

from signals_batch.ingestion.models import DailyQuote

SISE_URL = "https://api.finance.naver.com/siseJson.naver"
_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}


def fetch_ohlcv(
    market: str,
    ticker: str,
    name_kr: str,
    start: date,
    end: date,
    client: httpx.Client | None = None,
    timeout: float = 20.0,
) -> list[DailyQuote]:
    """종목 하나의 기간 일봉. 응답은 JSON이 아닌 JS 배열 리터럴이라 literal_eval로 파싱."""
    params = {
        "symbol": ticker,
        "requestType": "1",
        "startTime": start.strftime("%Y%m%d"),
        "endTime": end.strftime("%Y%m%d"),
        "timeframe": "day",
    }
    if client is not None:
        resp = client.get(SISE_URL, params=params, timeout=timeout)
    else:
        resp = httpx.get(SISE_URL, params=params, headers=_HEADERS, timeout=timeout)
    resp.raise_for_status()

    try:
        rows = ast.literal_eval(resp.text.strip())
    except (ValueError, SyntaxError):
        return []

    quotes: list[DailyQuote] = []
    for r in rows:
        if not (isinstance(r, list) and len(r) >= 6 and isinstance(r[0], str) and r[0].isdigit()):
            continue  # 헤더 행 등
        d = datetime.strptime(r[0], "%Y%m%d").date()
        o, h, low, c, v = r[1], r[2], r[3], r[4], r[5]
        if c in (None, 0):  # 거래 없음
            continue
        quotes.append(
            DailyQuote(
                market=market, ticker=ticker, name_kr=name_kr,
                open=float(o) if o else None,
                high=float(h) if h else None,
                low=float(low) if low else None,
                close=float(c),
                volume=int(v or 0),
                value=None, market_cap=None, trade_date=d,
            )
        )
    return quotes
