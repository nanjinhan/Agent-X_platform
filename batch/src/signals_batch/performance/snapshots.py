"""일별 성과 스냅샷 (agent_daily_snapshots) — T11 시뮬레이션을 일별 그리드로 투영.

T11 `simulate_portfolio`가 낸 진입 포지션(배분 원가·진입/청산일)을 거래일마다 평가한다:
  cash(d)   = 초기자본 − Σ(진입일<=d 배분) + Σ(청산일<=d 배분×(1+net_return))
  open(d)   = 진입일<=d < 청산일 인 포지션 수 (원가 보유)
  value(d)  = cash(d) + Σ(open 포지션 배분 원가)

이 일별 자산곡선이 T12 지표(변동성·MDD·샤프…)의 입력이자 agent_daily_snapshots 행이 된다.

⚠️ **T11과 동일 모델**: 보유 중 포지션은 취득원가로 유지(일간 마킹 데이터 부재) → 곡선은 실현손익만
   계단식으로 반영한다. 따라서 daily_return은 청산일에만 튄다. 진짜 일간 MTM(일봉 평가)은 후속.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from signals_batch.performance.returns import EnteredPosition


@dataclass(frozen=True)
class DailySnapshot:
    snapshot_date: date
    portfolio_value: Decimal
    cash: Decimal
    open_positions: int
    daily_return: float
    cumulative_return: float
    drawdown: float           # 양수 비율 (0.12 = -12%)
    benchmark_value: Decimal | None


def build_daily_snapshots(
    entered: Sequence[EnteredPosition],
    trading_days: Sequence[date],
    initial_capital: Decimal = Decimal(100),
    benchmark_by_date: dict[date, Decimal] | None = None,
) -> list[DailySnapshot]:
    """거래일 순서대로 일별 스냅샷 생성. trading_days는 오름차순 개장일 목록.

    benchmark_by_date: 원시 벤치마크 지수값(날짜별). 첫 개장일 기준 초기자본으로 정규화해 병기.
    누락일은 직전 최근값으로 forward-fill.
    """
    snaps: list[DailySnapshot] = []
    prev_value: Decimal | None = None
    peak = initial_capital
    bench_base: Decimal | None = None
    last_bench: Decimal | None = None

    for d in trading_days:
        cash = initial_capital
        open_alloc = Decimal(0)
        open_count = 0
        for e in entered:
            if e.entry_date <= d:
                cash -= e.alloc
            if e.exit_date <= d:
                cash += e.alloc * (Decimal(1) + e.net_return)
            elif e.entry_date <= d:  # 진입했고 아직 청산 전 → 보유(원가)
                open_alloc += e.alloc
                open_count += 1
        value = cash + open_alloc

        # 벤치마크 정규화 (forward-fill)
        bench_val: Decimal | None = None
        if benchmark_by_date is not None:
            raw = benchmark_by_date.get(d, last_bench)
            if raw is not None:
                last_bench = raw
                if bench_base is None:
                    bench_base = raw
                if bench_base:
                    bench_val = initial_capital * (raw / bench_base)

        daily_ret = float(value / prev_value - 1) if prev_value else 0.0
        cum_ret = float(value / initial_capital - 1) if initial_capital else 0.0
        peak = max(peak, value)
        drawdown = float((peak - value) / peak) if peak > 0 else 0.0

        snaps.append(
            DailySnapshot(d, value, cash, open_count, daily_ret, cum_ret, drawdown, bench_val)
        )
        prev_value = value

    return snaps
