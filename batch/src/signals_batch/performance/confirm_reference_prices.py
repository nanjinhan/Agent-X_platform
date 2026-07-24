"""기준가 확정 배치 (PERF-021: 국내 09:05 KST / 미국 09:35 ET).

PENDING 포지션을 훑어 진입 기준가를 확정한다:
  positions.status PENDING → OPEN (entry_price 채움)
  signals.status   PUBLISHED → FILLED

실행: python -m signals_batch.performance.confirm_reference_prices
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal

from signals_batch.db import get_conn
from signals_batch.performance.reference_price import resolve_entry
from signals_batch.performance.trading_calendar import MarketCalendar, calendar_market


def _load_calendar(conn, cal_market: str) -> MarketCalendar:
    rows = conn.execute(
        "SELECT trade_date FROM trading_calendar WHERE market=%s AND is_open",
        (cal_market,),
    ).fetchall()
    return MarketCalendar(frozenset(r[0] for r in rows))


def _day_open(conn, market: str, ticker: str):
    def lookup(d: date) -> Decimal | None:
        row = conn.execute(
            "SELECT open FROM daily_prices WHERE market=%s AND ticker=%s AND trade_date=%s",
            (market, ticker, d),
        ).fetchone()
        return row[0] if row else None

    return lookup


def _vwap(conn, market: str, ticker: str):
    def lookup(w_start: datetime, w_end: datetime) -> Decimal | None:
        # 발행+5분 시점을 포함하는 5분 VWAP 창을 찾는다 (분봉 수집 후 채워짐)
        row = conn.execute(
            """SELECT vwap FROM intraday_vwap
               WHERE market=%s AND ticker=%s AND window_start >= %s AND window_start < %s
               ORDER BY window_start LIMIT 1""",
            (market, ticker, w_start, w_end),
        ).fetchone()
        return row[0] if row else None

    return lookup


def run() -> dict:
    stats = {"pending": 0, "confirmed": 0, "waiting": 0}
    with get_conn() as conn:
        calendars = {m: _load_calendar(conn, m) for m in ("KR", "US")}

        rows = conn.execute(
            """SELECT p.id, s.published_at, s.market, s.ticker, s.id AS signal_id
               FROM positions p
               JOIN signals s ON s.id = p.entry_signal_id
               WHERE p.status = 'PENDING'"""
        ).fetchall()
        stats["pending"] = len(rows)

        for pos_id, published_at, market, ticker, signal_id in rows:
            cal = calendars[calendar_market(market)]
            res = resolve_entry(
                published_at, market, cal, _day_open(conn, market, ticker), _vwap(conn, market, ticker)
            )
            if not res.resolved:
                stats["waiting"] += 1
                logging.getLogger("performance").info("대기 pos=%s: %s", pos_id, res.note)
                continue

            conn.execute(
                """UPDATE positions
                   SET entry_date=%s, entry_price=%s, entry_price_type=%s,
                       entry_confirmed_at=NOW(), status='OPEN', updated_at=NOW()
                   WHERE id=%s""",
                (res.entry_date, res.entry_price, res.price_type, pos_id),
            )
            conn.execute("UPDATE signals SET status='FILLED' WHERE id=%s", (signal_id,))
            stats["confirmed"] += 1
        conn.commit()
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(run())
