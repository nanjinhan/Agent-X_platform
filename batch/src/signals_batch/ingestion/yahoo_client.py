"""야후 파이낸스 차트 API 클라이언트 — 미국 주식·지수·환율 공통 소스. 인증 불필요.

미국 일봉(SYS-007) 1순위였던 Polygon.io는 API 키가 필요해, 무료 대체로 야후를 사용한다.
같은 엔드포인트로 개별주(AAPL)·지수(^SP500TR)·환율(KRW=X)을 모두 조회한다.

한계 (정식 데이터 계약 시 교체 대상, SYS-007):
- 비공식 엔드포인트 — 레이트리밋 가능. query1 실패 시 query2로 폴백.
- 거래대금(value)·시가총액 미제공.
- 환율은 스팟(KRW=X)이며 서울외국환중개 매매기준율(PERF-008)과 미세 차이.
"""

from dataclasses import dataclass
from datetime import date, datetime, timezone
from urllib.parse import quote

import httpx

_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]
_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}


@dataclass
class OhlcvBar:
    trade_date: date  # 거래소 현지 날짜
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: int


@dataclass
class ChartResult:
    symbol: str
    currency: str | None
    exchange: str | None  # fullExchangeName (NasdaqGS, NYSE, KSE, SNP …)
    bars: list[OhlcvBar]


def _to_local_date(ts: int, gmtoffset: int) -> date:
    """UTC epoch + 거래소 gmtoffset → 거래소 현지 캘린더 날짜."""
    return datetime.fromtimestamp(ts + gmtoffset, tz=timezone.utc).date()


def fetch_chart(
    symbol: str, start: date, end: date, timeout: float = 20.0
) -> ChartResult:
    """일봉 시계열 조회. end 당일 미완성 바는 제외."""
    period1 = int(datetime(start.year, start.month, start.day, tzinfo=timezone.utc).timestamp())
    period2 = int(datetime(end.year, end.month, end.day, tzinfo=timezone.utc).timestamp()) + 86400
    path = f"/v8/finance/chart/{quote(symbol)}?period1={period1}&period2={period2}&interval=1d"

    last_err: Exception | None = None
    for host in _HOSTS:
        try:
            resp = httpx.get(host + path, headers=_HEADERS, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception as e:  # 호스트 폴백
            last_err = e
    else:
        raise last_err  # type: ignore[misc]

    result = data["chart"]["result"]
    if not result:
        return ChartResult(symbol, None, None, [])
    r = result[0]
    meta = r["meta"]
    gmtoffset = meta.get("gmtoffset", 0)
    timestamps = r.get("timestamp", []) or []
    q = r["indicators"]["quote"][0]

    bars: list[OhlcvBar] = []
    for i, ts in enumerate(timestamps):
        d = _to_local_date(ts, gmtoffset)
        if d > end:  # 미완성 당일 바
            continue
        close = q["close"][i]
        if close is None:
            continue
        bars.append(
            OhlcvBar(
                trade_date=d,
                open=q["open"][i],
                high=q["high"][i],
                low=q["low"][i],
                close=close,
                volume=int(q["volume"][i] or 0),
            )
        )
    return ChartResult(symbol, meta.get("currency"), meta.get("fullExchangeName"), bars)
