"""미국·환율·벤치마크 백필 CLI (T3).

사용법:
    python -m signals_batch.ingestion.us.backfill --days 45

적재 대상:
  1. 미국 주식 (US_SEED)     → instruments + daily_prices, 품질검증(SYS-009)
  2. 환율 USDKRW (KRW=X)     → fx_rates
  3. 벤치마크                → benchmark_values
       - SPX_TR    : ^SP500TR  (진짜 Total Return, PERF-014 부합)
       - KOSPI200_TR: ^KS200   (⚠️ 가격지수 근사 — 무료 TR 소스 부재. 배당수익률만큼 과소.
                                 정식 데이터 계약 시 실제 TR로 교체)
  4. 미국 거래 캘린더 (market='US') — 벤치마크 거래일 기준
"""

import argparse
import json
import logging
import time
from datetime import date, timedelta

from signals_batch.db import get_conn
from signals_batch.ingestion.models import DailyQuote
from signals_batch.ingestion.quality.validators import (
    check_ohlc_integrity,
    check_outlier,
    check_volume,
    dedupe_latest,
)
from signals_batch.ingestion.us.us_universe import US_ETF_TICKERS, US_SEED
from signals_batch.ingestion.yahoo_client import fetch_chart

log = logging.getLogger("ingestion.us")

REQUEST_DELAY_SEC = 0.2

# benchmark_code → 야후 심볼. KOSPI200_TR은 가격지수 근사(위 주석).
BENCHMARKS = {"SPX_TR": "^SP500TR", "KOSPI200_TR": "^KS200"}
FX_SYMBOL = "KRW=X"


def _fetch_us_quotes(start: date, end: date) -> tuple[list[DailyQuote], int]:
    quotes: list[DailyQuote] = []
    failures = 0
    for ticker, market, name_kr in US_SEED:
        try:
            res = fetch_chart(ticker, start, end)
            for b in res.bars:
                quotes.append(
                    DailyQuote(
                        market=market, ticker=ticker, name_kr=name_kr,
                        open=b.open, high=b.high, low=b.low, close=b.close,
                        volume=b.volume, value=None, market_cap=None, trade_date=b.trade_date,
                    )
                )
        except Exception as e:
            failures += 1
            log.warning("US fetch failed %s: %s", ticker, e)
        time.sleep(REQUEST_DELAY_SEC)
    return quotes, failures


def _validate(quotes: list[DailyQuote]):
    quotes = dedupe_latest(quotes)
    quotes.sort(key=lambda q: (q.market, q.ticker, q.trade_date))
    prev: dict[tuple[str, str], float] = {}
    valid, rejected, flagged = [], [], []
    for q in quotes:
        reason = check_ohlc_integrity(q) or check_volume(q)
        if reason:
            rejected.append((q, reason))
            continue
        flag = check_outlier(q, prev.get((q.market, q.ticker)))
        if flag:
            flagged.append((q, flag))
        valid.append(q)
        prev[(q.market, q.ticker)] = q.close
    return valid, rejected, flagged


def _upsert_instruments(conn, quotes: list[DailyQuote]) -> None:
    seen = {(q.market, q.ticker): q.name_kr for q in quotes}
    conn.cursor().executemany(
        """
        INSERT INTO instruments (market, ticker, name_kr, is_tradable, is_etf)
        VALUES (%s, %s, %s, TRUE, %s)
        ON CONFLICT (market, ticker) DO UPDATE
        SET name_kr=EXCLUDED.name_kr, is_etf=EXCLUDED.is_etf, updated_at=NOW()
        """,
        [(m, t, n, t in US_ETF_TICKERS) for (m, t), n in seen.items()],
    )


def _upsert_quotes(conn, quotes: list[DailyQuote]) -> None:
    conn.cursor().executemany(
        """
        INSERT INTO daily_prices (market, ticker, trade_date, open, high, low, close, volume, value, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'YAHOO')
        ON CONFLICT (market, ticker, trade_date) DO UPDATE
        SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
            close=EXCLUDED.close, volume=EXCLUDED.volume, source=EXCLUDED.source
        """,
        [(q.market, q.ticker, q.trade_date, q.open, q.high, q.low, q.close, q.volume, q.value) for q in quotes],
    )


def _insert_flags(conn, flagged) -> None:
    if not flagged:
        return
    conn.cursor().executemany(
        "INSERT INTO anomaly_flags (flag_type, severity, detail, status) VALUES (%s, 'MEDIUM', %s, 'OPEN')",
        [(f, json.dumps({"market": q.market, "ticker": q.ticker, "trade_date": q.trade_date.isoformat(), "close": q.close})) for q, f in flagged],
    )


def _upsert_fx(conn, start: date, end: date) -> int:
    res = fetch_chart(FX_SYMBOL, start, end)
    rows = [(b.trade_date, b.close) for b in res.bars if b.close]
    conn.cursor().executemany(
        """
        INSERT INTO fx_rates (currency_pair, rate_date, rate, source)
        VALUES ('USDKRW', %s, %s, 'YAHOO')
        ON CONFLICT (currency_pair, rate_date) DO UPDATE SET rate=EXCLUDED.rate, source=EXCLUDED.source
        """,
        rows,
    )
    return len(rows)


def _upsert_benchmarks(conn, start: date, end: date) -> tuple[dict[str, int], set[date]]:
    counts, us_dates = {}, set()
    for code, symbol in BENCHMARKS.items():
        res = fetch_chart(symbol, start, end)
        rows = [(code, b.trade_date, b.close) for b in res.bars if b.close]
        conn.cursor().executemany(
            """
            INSERT INTO benchmark_values (benchmark_code, value_date, value)
            VALUES (%s, %s, %s)
            ON CONFLICT (benchmark_code, value_date) DO UPDATE SET value=EXCLUDED.value
            """,
            rows,
        )
        counts[code] = len(rows)
        if code == "SPX_TR":
            us_dates = {r[1] for r in rows}
    return counts, us_dates


def _upsert_calendar(conn, start: date, end: date, open_dates: set[date]) -> None:
    rows = []
    d = start
    while d <= end:
        rows.append((d, d in open_dates))
        d += timedelta(days=1)
    conn.cursor().executemany(
        """
        INSERT INTO trading_calendar (market, trade_date, is_open, open_time, close_time)
        VALUES ('US', %s, %s, '09:30', '16:00')
        ON CONFLICT (market, trade_date) DO UPDATE SET is_open=EXCLUDED.is_open
        """,
        rows,
    )


def backfill(days: int) -> dict:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    log.info("window: %s ~ %s", start, end)

    raw, failures = _fetch_us_quotes(start, end)
    valid, rejected, flagged = _validate(raw)
    log.info("US quotes: raw=%d valid=%d rejected=%d flagged=%d failures=%d", len(raw), len(valid), len(rejected), len(flagged), failures)

    with get_conn() as conn:
        _upsert_instruments(conn, valid)
        _upsert_quotes(conn, valid)
        _insert_flags(conn, flagged)
        fx_rows = _upsert_fx(conn, start, end)
        bench_counts, us_dates = _upsert_benchmarks(conn, start, end)
        _upsert_calendar(conn, start, end, us_dates)
        conn.commit()

    stats = {
        "us_instruments": len({(q.market, q.ticker) for q in valid}),
        "us_rows": len(valid),
        "rejected": len(rejected),
        "flagged": len(flagged),
        "fx_rows": fx_rows,
        "benchmarks": bench_counts,
        "us_trading_days": len(us_dates),
        "fetch_failures": failures,
    }
    log.info("done: %s", stats)
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=45)
    args = parser.parse_args()
    print(backfill(args.days))
