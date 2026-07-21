"""KIND(kind.krx.co.kr) 상장법인 목록 — 종목 마스터 소스. 인증 불필요.

한계 (후속 보강 대상):
- ETF 미포함 (상장법인만) → ETF 마스터는 별도 소스 필요 (REG-009)
- 시가총액 미제공 → REG-013(소형주 제한)·슬리피지 계산 전까지 보강 필요
"""

import re
from datetime import date, datetime

import httpx

from signals_batch.ingestion.models import Instrument

KIND_URL = "https://kind.krx.co.kr/corpgeneral/corpList.do"
_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"}

_MARKET_PARAM = {"KOSPI": "stockMkt", "KOSDAQ": "kosdaqMkt"}
_ROW_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
_CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S)


def _parse_date(s: str) -> date | None:
    try:
        return datetime.strptime(s.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def fetch_instruments(market: str, timeout: float = 60.0) -> list[Instrument]:
    """시장별 상장법인 전체. market: KOSPI | KOSDAQ."""
    resp = httpx.get(
        KIND_URL,
        params={"method": "download", "marketType": _MARKET_PARAM[market]},
        headers=_HEADERS,
        timeout=timeout,
    )
    resp.raise_for_status()
    html = resp.content.decode("euc-kr", errors="replace")

    # 행 구조: [회사명, 시장구분(유가/코스닥), 종목코드, 업종, 주요제품, 상장일, 결산월, 대표자, 홈페이지, 지역]
    instruments: list[Instrument] = []
    for row in _ROW_RE.findall(html):
        cells = [c.strip() for c in _CELL_RE.findall(row)]
        if len(cells) < 6 or not re.fullmatch(r"\d{6}", cells[2]):
            continue  # 헤더 또는 형식 밖 행
        instruments.append(
            Instrument(market=market, ticker=cells[2], name_kr=cells[0], listed_at=_parse_date(cells[5]))
        )
    return instruments
