"""수익률 산출 배치 (PERF-005~007, PERF-009).

T10 청산 배치가 만든 CLOSED 포지션 중 아직 net_return이 비어 있는 것을 훑어
거래비용·슬리피지·수익률·환율을 채운다:
  positions.{entry_cost_rate, exit_cost_rate, slippage_rate,
             gross_return, net_return, net_return_krw, entry_fx_rate, exit_fx_rate}

미국 포지션은 달러 net_return을 주 기준으로 하고 원화환산 net_return_krw를 병기한다(PERF-007).
환율은 진입일/청산일 각각의 매매기준율(fx_rates USDKRW)을 쓴다.

가상 포트폴리오 시뮬레이션(PERF-010B/011)의 스냅샷·skip_rate 영속화는 T12(지표·스냅샷) 소관이라
이 배치는 포지션 단위 수익률만 채운다. 시뮬레이션 엔진은 returns.simulate_portfolio에 있다.

실행: python -m signals_batch.performance.run_returns
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from signals_batch.db import get_conn
from signals_batch.performance.returns import (
    compute_return,
    slippage_rate,
    us_krw_net_return,
)
from signals_batch.performance.trading_calendar import calendar_market

log = logging.getLogger("performance.run_returns")


def _fx_on_or_before(conn, d: date) -> Decimal | None:
    """해당 날짜 이하의 가장 최근 USDKRW 매매기준율(휴일·주말 대비 fallback)."""
    row = conn.execute(
        "SELECT rate FROM fx_rates WHERE currency_pair='USDKRW' AND rate_date <= %s "
        "ORDER BY rate_date DESC LIMIT 1",
        (d,),
    ).fetchone()
    return row[0] if row else None


def _apply(conn, pos_id, entry_cost, exit_cost, slip, gross, net, net_krw, entry_fx, exit_fx) -> None:
    conn.execute(
        """UPDATE positions
           SET entry_cost_rate=%s, exit_cost_rate=%s, slippage_rate=%s,
               gross_return=%s, net_return=%s, net_return_krw=%s,
               entry_fx_rate=%s, exit_fx_rate=%s, updated_at=NOW()
           WHERE id=%s""",
        (entry_cost, exit_cost, slip, gross, net, net_krw, entry_fx, exit_fx, pos_id),
    )


def run() -> dict:
    stats = {"closed_unpriced": 0, "priced": 0, "skipped_missing": 0, "waiting_fx": 0}
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT p.id, p.market, p.entry_price, p.exit_price, p.entry_date, p.exit_date,
                      s.side, i.market_cap
               FROM positions p
               JOIN signals s ON s.id = p.entry_signal_id
               LEFT JOIN instruments i ON i.market = p.market AND i.ticker = p.ticker
               WHERE p.status = 'CLOSED' AND p.net_return IS NULL"""
        ).fetchall()
        stats["closed_unpriced"] = len(rows)

        for pos_id, market, entry_price, exit_price, entry_date, exit_date, side, market_cap in rows:
            if entry_price is None or exit_price is None:
                # 청산됐는데 가격이 비었으면 이상 상태 → 건너뛰고 로깅(수동 확인 대상)
                stats["skipped_missing"] += 1
                log.warning("건너뜀 pos=%s: entry/exit price 누락", pos_id)
                continue

            side = side or "LONG"
            slip = slippage_rate(market, market_cap)  # 참여율 0(페이퍼 단계)
            rb = compute_return(entry_price, exit_price, market, side, slip)

            net_krw = entry_fx = exit_fx = None
            if calendar_market(market) == "US":
                entry_fx = _fx_on_or_before(conn, entry_date)
                exit_fx = _fx_on_or_before(conn, exit_date)
                if entry_fx is None or exit_fx is None:
                    stats["waiting_fx"] += 1
                    log.info("대기 pos=%s: USDKRW 환율 데이터 없음", pos_id)
                    continue
                net_krw = us_krw_net_return(entry_price, exit_price, entry_fx, exit_fx, side, slip)

            _apply(
                conn, pos_id, rb.entry_cost_rate, rb.exit_cost_rate, rb.slippage_rate,
                rb.gross_return, rb.net_return, net_krw, entry_fx, exit_fx,
            )
            stats["priced"] += 1
            log.info(
                "산출 pos=%s: net=%.4f%% (gross=%.4f%%, slip=%.4f%%%s)",
                pos_id, rb.net_return * 100, rb.gross_return * 100, slip * 100,
                f", krw={net_krw * 100:.4f}%" if net_krw is not None else "",
            )
        conn.commit()
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(run())
