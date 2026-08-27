"""지표·스냅샷 산출 배치 (PERF-013~018) — agent_daily_snapshots + agent_metrics 갱신.

파이프라인 (에이전트별):
  1) CLOSED 포지션 + 진입 시그널(suggested_weight) 로드
  2) T11 simulate_portfolio → 진입 포지션·skip_rate
  3) build_daily_snapshots → 일별 자산곡선(벤치마크 병기)
  4) compute_agent_metrics → 전 지표(표본 게이팅)
  5) agent_daily_snapshots upsert + agent_metrics upsert

벤치마크: asset_scope KR→KOSPI200_TR, US→SPX_TR, MIXED→KOSPI200_TR 근사(문서화).
※ 일별 곡선은 T11 모델대로 보유 포지션 원가 유지(실현손익 계단). 진짜 MTM은 후속.

실행: python -m signals_batch.performance.run_metrics
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import date
from decimal import Decimal

from signals_batch.db import get_conn
from signals_batch.performance.metrics import ClosedPosition, compute_agent_metrics
from signals_batch.performance.returns import SimSignal, simulate_portfolio
from signals_batch.performance.snapshots import build_daily_snapshots

log = logging.getLogger("performance.run_metrics")

_BENCHMARK = {"KR": "KOSPI200_TR", "US": "SPX_TR", "MIXED": "KOSPI200_TR"}


def _agents_with_closed(conn) -> list:
    return conn.execute(
        """SELECT DISTINCT a.id, a.max_positions, a.asset_scope
           FROM agents a JOIN positions p ON p.agent_id = a.id
           WHERE p.status = 'CLOSED'"""
    ).fetchall()


def _load_positions(conn, agent_id) -> list:
    return conn.execute(
        """SELECT p.entry_signal_id, p.entry_date, p.exit_date, p.net_return,
                  p.exit_reason, p.holding_days, s.suggested_weight, p.market
           FROM positions p JOIN signals s ON s.id = p.entry_signal_id
           WHERE p.agent_id = %s AND p.status = 'CLOSED' AND p.net_return IS NOT NULL
           ORDER BY p.entry_date""",
        (agent_id,),
    ).fetchall()


def _trading_days(conn, cal_market: str, start: date, end: date) -> list[date]:
    rows = conn.execute(
        "SELECT trade_date FROM trading_calendar "
        "WHERE market=%s AND is_open AND trade_date BETWEEN %s AND %s ORDER BY trade_date",
        (cal_market, start, end),
    ).fetchall()
    return [r[0] for r in rows]


def _benchmark(conn, code: str, start: date, end: date) -> dict[date, Decimal]:
    rows = conn.execute(
        "SELECT value_date, value FROM benchmark_values "
        "WHERE benchmark_code=%s AND value_date BETWEEN %s AND %s",
        (code, start, end),
    ).fetchall()
    return {r[0]: r[1] for r in rows}


def _totals(conn, agent_id) -> tuple[int, int]:
    total = conn.execute(
        "SELECT COUNT(*) FROM signals WHERE agent_id=%s AND action='ENTRY'", (agent_id,)
    ).fetchone()[0]
    void = conn.execute(
        "SELECT COUNT(*) FROM signals WHERE agent_id=%s AND status='VOID'", (agent_id,)
    ).fetchone()[0]
    return total, void


def _persist_snapshots(conn, agent_id, snaps) -> None:
    for s in snaps:
        conn.execute(
            """INSERT INTO agent_daily_snapshots
                 (agent_id, snapshot_date, portfolio_value, cash, open_positions,
                  daily_return, cumulative_return, drawdown, benchmark_value)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (agent_id, snapshot_date) DO UPDATE SET
                 portfolio_value=EXCLUDED.portfolio_value, cash=EXCLUDED.cash,
                 open_positions=EXCLUDED.open_positions, daily_return=EXCLUDED.daily_return,
                 cumulative_return=EXCLUDED.cumulative_return, drawdown=EXCLUDED.drawdown,
                 benchmark_value=EXCLUDED.benchmark_value""",
            (agent_id, s.snapshot_date, s.portfolio_value, s.cash, s.open_positions,
             s.daily_return, s.cumulative_return, s.drawdown, s.benchmark_value),
        )


# agent_metrics에 채울 지표 컬럼 (AgentMetrics 필드명과 동일)
_METRIC_COLS = [
    "cumulative_return", "cagr", "avg_signal_return", "median_signal_ret",
    "best_return", "worst_return", "volatility", "downside_vol", "max_drawdown",
    "mdd_duration_days", "recovery_days", "var_95", "sharpe", "sortino", "calmar",
    "information_ratio", "alpha", "beta", "win_rate", "win_rate_wilson_lb",
    "profit_factor", "avg_win", "avg_loss", "expectancy", "avg_holding_days",
    "max_consec_loss", "take_profit_rate", "void_rate", "skip_rate",
    "total_signals", "closed_positions", "operating_days",
]


def _persist_metrics(conn, agent_id, m) -> None:
    d = asdict(m)
    set_cols = ", ".join(f"{c}=EXCLUDED.{c}" for c in _METRIC_COLS)
    metric_ph = ", ".join(["%s"] * len(_METRIC_COLS))
    conn.execute(
        f"""INSERT INTO agent_metrics
              (agent_id, period_start, period_end, computed_at, {", ".join(_METRIC_COLS)})
            VALUES (%s, %s, %s, NOW(), {metric_ph})
            ON CONFLICT (agent_id) DO UPDATE SET
              period_start=EXCLUDED.period_start, period_end=EXCLUDED.period_end,
              computed_at=NOW(), {set_cols}""",
        [agent_id, m.period_start, m.period_end] + [d[c] for c in _METRIC_COLS],
    )


def run() -> dict:
    stats = {"agents": 0, "metrics": 0, "snapshots": 0, "skipped": 0}
    with get_conn() as conn:
        agents = _agents_with_closed(conn)
        stats["agents"] = len(agents)

        for agent_id, max_positions, asset_scope in agents:
            rows = _load_positions(conn, agent_id)
            if not rows:
                stats["skipped"] += 1
                continue

            sigs, closed = [], []
            for entry_sig_id, entry_date, exit_date, net_return, exit_reason, holding_days, weight, _mkt in rows:
                sigs.append(SimSignal(str(entry_sig_id), entry_date, exit_date, net_return, weight))
                closed.append(ClosedPosition(float(net_return), exit_reason or "", holding_days or 0))

            sim = simulate_portfolio(sigs, max_positions or 5)

            start = min(r[1] for r in rows)
            end = max(r[2] for r in rows)
            cal_scope = "KR" if asset_scope in ("KR", "MIXED") else "US"
            days = _trading_days(conn, cal_scope, start, end)
            if not days:
                days = sorted({r[1] for r in rows} | {r[2] for r in rows})  # 캘린더 없으면 포지션 날짜

            bench = _benchmark(conn, _BENCHMARK.get(asset_scope, "KOSPI200_TR"), start, end)
            snaps = build_daily_snapshots(sim.entered_positions, days, benchmark_by_date=bench or None)

            agent_rets = [s.daily_return for s in snaps[1:]]
            bench_series = [s.benchmark_value for s in snaps if s.benchmark_value is not None]
            bench_equity = [float(v) for v in bench_series] if len(bench_series) == len(snaps) else None
            bench_rets = None
            if bench_equity:
                bench_rets = [bench_equity[i] / bench_equity[i - 1] - 1 for i in range(1, len(bench_equity))]

            total_signals, void_signals = _totals(conn, agent_id)
            m = compute_agent_metrics(
                closed,
                [float(s.portfolio_value) for s in snaps],
                agent_rets,
                bench_equity,
                bench_rets,
                start,
                end,
                total_signals,
                void_signals,
                float(sim.skip_rate),
            )

            _persist_snapshots(conn, agent_id, snaps)
            _persist_metrics(conn, agent_id, m)
            stats["metrics"] += 1
            stats["snapshots"] += len(snaps)
            log.info(
                "지표 agent=%s: 누적=%.2f%% CAGR=%s 샤프=%s 소르티노=%s 승률=%s(Wilson %s) MDD=%s",
                agent_id, (m.cumulative_return or 0) * 100,
                _f(m.cagr), _f(m.sharpe), _f(m.sortino), _f(m.win_rate), _f(m.win_rate_wilson_lb), _f(m.max_drawdown),
            )
        conn.commit()
    return stats


def _f(x) -> str:
    return f"{x:.4f}" if x is not None else "—"


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(run())
