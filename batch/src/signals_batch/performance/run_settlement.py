"""자동 청산 판정 배치 (PERF-021: 국내 15:40 KST / 미국 16:10 ET).

OPEN 포지션(수동 EXIT 미발행분)을 훑어 청산 조건을 판정한다:
  positions.status OPEN → CLOSED (exit_price/exit_reason/exit_date 채움)

에이전트가 ARCHIVED면 마지막 거래일 종가로 강제 청산(AGENT_ARCHIVED, AGT-003).
상장폐지(FORCED)는 상폐 데이터 소스 확보 후 연결 — 현재 데이터엔 상폐 플래그가 없어 미구현.

수동 EXIT(DISCRETIONARY/RULE_EXIT)로 완결되는 포지션(exit_signal_id 존재)은
signal-service 페어링(T7) 소관이므로 이 배치는 건드리지 않는다.

실행: python -m signals_batch.performance.run_settlement
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from signals_batch.db import get_conn
from signals_batch.performance.settlement import (
    Bar,
    ExitResolution,
    force_close,
    settle_open_position,
)
from signals_batch.performance.trading_calendar import (
    MarketCalendar,
    calendar_market,
    market_tz,
)

log = logging.getLogger("performance.run_settlement")


def _load_calendar(conn, cal_market: str) -> MarketCalendar:
    rows = conn.execute(
        "SELECT trade_date FROM trading_calendar WHERE market=%s AND is_open",
        (cal_market,),
    ).fetchall()
    return MarketCalendar(frozenset(r[0] for r in rows))


def _bar_lookup(conn, market: str, ticker: str):
    def lookup(d: date) -> Bar | None:
        row = conn.execute(
            "SELECT open, high, low, close FROM daily_prices "
            "WHERE market=%s AND ticker=%s AND trade_date=%s",
            (market, ticker, d),
        ).fetchone()
        return Bar(row[0], row[1], row[2], row[3]) if row else None

    return lookup


def _market_today(market: str) -> date:
    """시장 현지 기준 오늘 날짜(청산 판정 상한)."""
    return datetime.now(timezone.utc).astimezone(market_tz(market)).date()


def _last_open_on_or_before(cal: MarketCalendar, d: date) -> date | None:
    candidates = [x for x in cal.open_dates if x <= d]
    return max(candidates) if candidates else None


def _apply(conn, pos_id, res: ExitResolution) -> None:
    conn.execute(
        """UPDATE positions
           SET exit_date=%s, exit_price=%s, exit_reason=%s, holding_days=%s,
               exit_confirmed_at=NOW(), status='CLOSED', updated_at=NOW()
           WHERE id=%s""",
        (res.exit_date, res.exit_price, res.exit_reason, res.holding_days, pos_id),
    )


def run() -> dict:
    stats = {"open": 0, "closed": 0, "archived_forced": 0, "holding": 0, "waiting": 0}
    with get_conn() as conn:
        calendars = {m: _load_calendar(conn, m) for m in ("KR", "US")}

        rows = conn.execute(
            """SELECT p.id, p.entry_date, p.market, p.ticker,
                      s.target_price, s.stop_loss_price, s.side, s.max_holding_days,
                      a.status AS agent_status
               FROM positions p
               JOIN signals s ON s.id = p.entry_signal_id
               JOIN agents  a ON a.id = p.agent_id
               WHERE p.status = 'OPEN' AND p.exit_signal_id IS NULL"""
        ).fetchall()
        stats["open"] = len(rows)

        for (
            pos_id,
            entry_date,
            market,
            ticker,
            target,
            stop,
            side,
            max_holding,
            agent_status,
        ) in rows:
            cal = calendars[calendar_market(market)]
            today = _market_today(market)
            bar = _bar_lookup(conn, market, ticker)

            # 에이전트 ARCHIVED → 마지막 거래일 종가 강제 청산 (AGT-003)
            if agent_status == "ARCHIVED":
                close_day = _last_open_on_or_before(cal, today)
                b = bar(close_day) if close_day else None
                if b is None:
                    stats["waiting"] += 1
                    log.info("대기 pos=%s: ARCHIVED 강제청산 종가 데이터 없음", pos_id)
                    continue
                res = force_close(entry_date, "AGENT_ARCHIVED", close_day, b.close, cal)
                _apply(conn, pos_id, res)
                stats["archived_forced"] += 1
                continue

            res = settle_open_position(
                entry_date, target, stop, side or "LONG", max_holding, cal, bar, today
            )
            if not res.resolved:
                if "대기" in res.note:
                    stats["waiting"] += 1
                else:
                    stats["holding"] += 1
                log.info("미청산 pos=%s: %s", pos_id, res.note)
                continue

            _apply(conn, pos_id, res)
            stats["closed"] += 1
            log.info(
                "청산 pos=%s: %s @ %s (%s, %s거래일)",
                pos_id,
                res.exit_reason,
                res.exit_price,
                res.exit_date,
                res.holding_days,
            )
        conn.commit()
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(run())
