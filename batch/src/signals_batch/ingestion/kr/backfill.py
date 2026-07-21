"""국내 시장데이터 백필 CLI (T2).

사용법:
    python -m signals_batch.ingestion.kr.backfill --days 45 [--limit 100]

흐름:
  1. KIND에서 KOSPI/KOSDAQ 종목 마스터 수집
  2. 종목별로 네이버 금융에서 기간 일봉 수집 (스레드 8개 병렬)
  3. 품질검증(SYS-009): OHLC 정합성·거래량 → 거부, 이상치(±50%) → anomaly_flags
  4. instruments / daily_prices 적재
  5. trading_calendar: 데이터가 1건이라도 있는 날 = 개장일, 평일인데 없는 날 = 휴장일
     (market='KR' 공통, SYS-011. 정식 휴장일 소스는 후속 보강)
"""

import argparse
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

import httpx

from signals_batch.db import get_conn
from signals_batch.ingestion.kr.kind_client import fetch_instruments
from signals_batch.ingestion.kr.naver_client import _HEADERS, fetch_ohlcv
from signals_batch.ingestion.models import DailyQuote, Instrument
from signals_batch.ingestion.quality.validators import (
    check_ohlc_integrity,
    check_outlier,
    check_volume,
    dedupe_latest,
)

log = logging.getLogger("ingestion.kr")

MAX_WORKERS = 8


def _fetch_all_quotes(
    instruments: list[Instrument], start: date, end: date
) -> tuple[list[DailyQuote], int]:
    """종목별 기간 일봉을 병렬 수집. 반환: (전체 시세, 실패 종목 수)."""
    quotes: list[DailyQuote] = []
    failures = 0
    lock = threading.Lock()
    local = threading.local()

    def get_client() -> httpx.Client:
        if not hasattr(local, "client"):
            local.client = httpx.Client(headers=_HEADERS)
        return local.client

    def task(inst: Instrument) -> list[DailyQuote]:
        return fetch_ohlcv(inst.market, inst.ticker, inst.name_kr, start, end, client=get_client())

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(task, inst): inst for inst in instruments}
        for i, fut in enumerate(as_completed(futures), 1):
            inst = futures[fut]
            try:
                rows = fut.result()
                with lock:
                    quotes.extend(rows)
            except Exception as e:  # 종목 단위 실패는 기록하고 계속
                failures += 1
                log.warning("fetch failed %s %s: %s", inst.market, inst.ticker, e)
            if i % 500 == 0:
                log.info("fetched %d/%d instruments", i, len(instruments))
    return quotes, failures


def _upsert_instruments(conn, instruments: list[Instrument]) -> None:
    conn.cursor().executemany(
        """
        INSERT INTO instruments (market, ticker, name_kr, listed_at, is_tradable)
        VALUES (%s, %s, %s, %s, TRUE)
        ON CONFLICT (market, ticker) DO UPDATE
        SET name_kr=EXCLUDED.name_kr, listed_at=EXCLUDED.listed_at, updated_at=NOW()
        """,
        [(i.market, i.ticker, i.name_kr, i.listed_at) for i in instruments],
    )


def _upsert_quotes(conn, quotes: list[DailyQuote]) -> None:
    conn.cursor().executemany(
        """
        INSERT INTO daily_prices (market, ticker, trade_date, open, high, low, close, volume, value, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'NAVER')
        ON CONFLICT (market, ticker, trade_date) DO UPDATE
        SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
            close=EXCLUDED.close, volume=EXCLUDED.volume, source=EXCLUDED.source
        """,
        [(q.market, q.ticker, q.trade_date, q.open, q.high, q.low, q.close, q.volume, q.value) for q in quotes],
    )


def _upsert_calendar(conn, start: date, end: date, open_dates: set[date]) -> None:
    rows = []
    d = start
    while d <= end:
        is_open = d in open_dates
        if d.weekday() >= 5 and is_open:
            log.warning("weekend %s has data — check source", d)
        rows.append((d, is_open))
        d += timedelta(days=1)
    conn.cursor().executemany(
        """
        INSERT INTO trading_calendar (market, trade_date, is_open, open_time, close_time)
        VALUES ('KR', %s, %s, '09:00', '15:30')
        ON CONFLICT (market, trade_date) DO UPDATE SET is_open=EXCLUDED.is_open
        """,
        rows,
    )


def _insert_anomaly_flags(conn, flagged: list[tuple[DailyQuote, str]]) -> None:
    if not flagged:
        return
    conn.cursor().executemany(
        "INSERT INTO anomaly_flags (flag_type, severity, detail, status) VALUES (%s, 'MEDIUM', %s, 'OPEN')",
        [
            (flag, json.dumps({"market": q.market, "ticker": q.ticker, "trade_date": q.trade_date.isoformat(), "close": q.close}))
            for q, flag in flagged
        ],
    )


def backfill(days: int, limit: int | None = None) -> dict:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    log.info("window: %s ~ %s", start, end)

    instruments = fetch_instruments("KOSPI") + fetch_instruments("KOSDAQ")
    log.info("instruments: %d (KOSPI+KOSDAQ)", len(instruments))
    if limit:
        instruments = instruments[:limit]

    raw_quotes, fetch_failures = _fetch_all_quotes(instruments, start, end)
    log.info("raw quotes: %d rows, fetch failures: %d", len(raw_quotes), fetch_failures)

    # 품질검증(SYS-009): 종목·날짜순 시계열 순회 — 이상치는 직전 거래일 종가 대비
    quotes = dedupe_latest(raw_quotes)
    quotes.sort(key=lambda q: (q.market, q.ticker, q.trade_date))
    prev_closes: dict[tuple[str, str], float] = {}
    result_valid: list[DailyQuote] = []
    result_rejected: list[tuple[DailyQuote, str]] = []
    result_flagged: list[tuple[DailyQuote, str]] = []
    for q in quotes:
        reason = check_ohlc_integrity(q) or check_volume(q)
        if reason:
            result_rejected.append((q, reason))
            continue
        flag = check_outlier(q, prev_closes.get((q.market, q.ticker)))
        if flag:
            result_flagged.append((q, flag))
        result_valid.append(q)  # 이상치는 적재하되 플래그 (SYS-009)
        prev_closes[(q.market, q.ticker)] = q.close

    open_dates = {q.trade_date for q in result_valid}

    with get_conn() as conn:
        _upsert_instruments(conn, instruments)
        _upsert_quotes(conn, result_valid)
        _insert_anomaly_flags(conn, result_flagged)
        _upsert_calendar(conn, start, end, open_dates)
        conn.commit()

    stats = {
        "instruments": len(instruments),
        "trading_days": len(open_dates),
        "rows_loaded": len(result_valid),
        "rejected": len(result_rejected),
        "flagged": len(result_flagged),
        "fetch_failures": fetch_failures,
    }
    log.info("done: %s", stats)
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=45, help="어제부터 과거 달력일 수")
    parser.add_argument("--limit", type=int, default=None, help="종목 수 제한 (테스트용)")
    args = parser.parse_args()
    print(backfill(args.days, args.limit))
