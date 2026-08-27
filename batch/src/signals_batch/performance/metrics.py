"""성과 지표 계산 (SRS 9.4, PERF-013~018) — agent_metrics 테이블 갱신용.

수익성: 누적수익률·CAGR·평균/중앙값/최고/최저 시그널 수익률
위험    : 변동성·MDD(기간·회복)·하방변동성·VaR95
위험조정: 샤프·소르티노·칼마·정보비율·알파·베타
실행    : 승률(Wilson 하한)·손익비·평균이익/손실·기대값·평균보유일·최대연속손실
규율    : 목표가 도달률·손절 준수율·미청산율·VOID율

**정밀도 결정**: 포지션 net_return(T11)은 Decimal로 정확히 유지하되, 지표는 **float**로 계산한다.
샤프·소르티노는 sqrt, VaR은 백분위수라 Decimal이 부적합하고, 검수 3.1은 quantstats(float 기반)와
대조하기 때문. 골든 허용오차 0.01%p(=1e-4)는 double 정밀도로 충분히 재현된다.

**표본 게이팅(PERF-016)**: 최소 표본 미달 지표는 None을 반환("산출 중") → 랭킹에서 제외(T13).

핵심은 전부 순수 함수 → DB 없이 골든 테스트(검수 2.14·3.1~3.3).
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from itertools import pairwise

# 연환산 상수
TRADING_DAYS = 252          # 변동성 연환산 (거래일 기준)
CALENDAR_DAYS = 365         # CAGR 연환산 (달력일 기준)
MIN_CAGR_DAYS = 30          # 이보다 짧은 기간의 연율화는 무의미(폭발) → CAGR 미산출
Z_95 = 1.959963984540054    # 표준정규 97.5% 분위 (양측 95% → Wilson)

# 무위험수익률 기본값(연): 3년 국고채 근사. 정식 데이터 계약 시 ECOS 실측으로 교체.
DEFAULT_RISK_FREE = 0.032

# PERF-016 최소 표본(완결 포지션 수, 운영일수)
MIN_SAMPLES: dict[str, tuple[int, int]] = {
    "win_rate": (20, 30),
    "sharpe": (30, 90),
    "sortino": (30, 90),
    "mdd": (20, 60),
    "profit_factor": (20, 30),
}


def meets_sample(metric: str, n_closed: int, operating_days: int) -> bool:
    """PERF-016 최소 표본 충족 여부. 미정의 지표는 항상 True."""
    if metric not in MIN_SAMPLES:
        return True
    need_n, need_days = MIN_SAMPLES[metric]
    return n_closed >= need_n and operating_days >= need_days


# ── 기초 통계 ─────────────────────────────────────────────────────────────
def _percentile(sorted_vals: Sequence[float], p: float) -> float:
    """선형보간 백분위수 (numpy 'linear'/quantstats와 동일 규약). p는 0~100."""
    if not sorted_vals:
        return float("nan")
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    rank = (p / 100) * (len(sorted_vals) - 1)
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return sorted_vals[lo]
    frac = rank - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def daily_returns(equity: Sequence[float]) -> list[float]:
    """일별 자산가치 → 일간 수익률. 앞값이 0이면 해당 구간은 0 처리(무의미 발산 방지)."""
    return [(cur / prev - 1) if prev else 0.0 for prev, cur in pairwise(equity)]


# ── 수익성 (PERF-013) ─────────────────────────────────────────────────────
def cumulative_return(equity: Sequence[float]) -> float:
    """(최종자산/초기자산) - 1."""
    if len(equity) < 2 or not equity[0]:
        return 0.0
    return equity[-1] / equity[0] - 1


def cagr(equity: Sequence[float], calendar_days: int) -> float | None:
    """(최종/초기)^(365/일수) - 1. 30일 미만은 연율화 무의미 → None(NUMERIC 오버플로 방지)."""
    if len(equity) < 2 or calendar_days < MIN_CAGR_DAYS or equity[0] <= 0 or equity[-1] <= 0:
        return None
    return (equity[-1] / equity[0]) ** (CALENDAR_DAYS / calendar_days) - 1


# ── 위험 (PERF-013) ───────────────────────────────────────────────────────
def volatility(rets: Sequence[float]) -> float | None:
    """연환산 변동성 = stdev(일간수익률) × sqrt(252). 표본표준편차(ddof=1)."""
    if len(rets) < 2:
        return None
    return statistics.stdev(rets) * math.sqrt(TRADING_DAYS)


def downside_volatility(rets: Sequence[float]) -> float | None:
    """하방 변동성 = stdev(음수 수익률만) × sqrt(252). 음수 2개 미만이면 None."""
    neg = [r for r in rets if r < 0]
    if len(neg) < 2:
        return None
    return statistics.stdev(neg) * math.sqrt(TRADING_DAYS)


@dataclass(frozen=True)
class Drawdown:
    mdd: float                 # 양수 비율 (0.12 = -12%)
    duration_days: int | None  # peak → trough 인덱스 거리
    recovery_days: int | None  # trough → 신고점. 미회복이면 None("진행중")


def max_drawdown(equity: Sequence[float]) -> Drawdown:
    """MDD = max((peak-trough)/peak). 낙폭 기간·회복 기간 동반 산출.

    인덱스(일봉 스텝) 거리 기준. 회복은 MDD 저점 이후 이전 peak 재돌파까지.
    """
    if len(equity) < 2:
        return Drawdown(0.0, None, None)
    peak = equity[0]
    peak_i = 0
    mdd = 0.0
    mdd_peak_i = mdd_trough_i = 0
    for i, v in enumerate(equity):
        if v > peak:
            peak = v
            peak_i = i
        elif peak > 0:
            dd = (peak - v) / peak
            if dd > mdd:
                mdd = dd
                mdd_peak_i, mdd_trough_i = peak_i, i
    if mdd == 0.0:
        return Drawdown(0.0, 0, 0)
    # 회복: MDD 저점 이후 peak 값 재돌파 지점
    recovery = None
    peak_val = equity[mdd_peak_i]
    for j in range(mdd_trough_i + 1, len(equity)):
        if equity[j] >= peak_val:
            recovery = j - mdd_trough_i
            break
    return Drawdown(mdd, mdd_trough_i - mdd_peak_i, recovery)


def var_95(rets: Sequence[float]) -> float | None:
    """VaR 95% = 수익률 분포의 5th percentile (보통 음수)."""
    if not rets:
        return None
    return _percentile(sorted(rets), 5.0)


# ── 위험조정 (PERF-013, 검수 3.1) ─────────────────────────────────────────
def sharpe(cagr_val: float | None, vol: float | None, rf: float = DEFAULT_RISK_FREE) -> float | None:
    """(CAGR - Rf) / 변동성. Rf는 3년 국고채(연)."""
    if cagr_val is None or not vol:
        return None
    return (cagr_val - rf) / vol


def sortino(cagr_val: float | None, dvol: float | None, rf: float = DEFAULT_RISK_FREE) -> float | None:
    """(CAGR - Rf) / 하방변동성."""
    if cagr_val is None or not dvol:
        return None
    return (cagr_val - rf) / dvol


def calmar(cagr_val: float | None, mdd: float) -> float | None:
    """CAGR / |MDD|. MDD 0이면 None."""
    if cagr_val is None or mdd == 0:
        return None
    return cagr_val / abs(mdd)


def beta(agent_rets: Sequence[float], bench_rets: Sequence[float]) -> float | None:
    """cov(agent, bench) / var(bench). 길이 불일치 시 앞에서 정렬된 공통 길이 사용."""
    n = min(len(agent_rets), len(bench_rets))
    if n < 2:
        return None
    a, b = agent_rets[:n], bench_rets[:n]
    var_b = statistics.variance(b)
    if var_b == 0:
        return None
    return statistics.covariance(a, b) / var_b


def information_ratio(agent_rets: Sequence[float], bench_rets: Sequence[float]) -> float | None:
    """(초과수익 평균) / 트래킹에러. 트래킹에러 = stdev(초과 일간수익률) × sqrt(252)."""
    n = min(len(agent_rets), len(bench_rets))
    if n < 2:
        return None
    excess = [agent_rets[i] - bench_rets[i] for i in range(n)]
    te = statistics.stdev(excess)
    if te == 0:
        return None
    return (statistics.fmean(excess) * TRADING_DAYS) / (te * math.sqrt(TRADING_DAYS))


def alpha(agent_cagr: float | None, bench_cagr: float | None) -> float | None:
    """alpha = 에이전트 CAGR - 벤치마크 CAGR (PERF-015, 동일 기간)."""
    if agent_cagr is None or bench_cagr is None:
        return None
    return agent_cagr - bench_cagr


# ── 실행 (PERF-013, PERF-018) ─────────────────────────────────────────────
def wilson_lower_bound(wins: int, n: int, z: float = Z_95) -> float | None:
    """Wilson score 하한 (PERF-018). 랭킹은 단순 승률 대신 이 값을 쓴다.

    LB = (p̂ + z²/2n - z√(p̂(1-p̂)/n + z²/4n²)) / (1 + z²/n)
    """
    if n <= 0:
        return None
    p = wins / n
    z2 = z * z
    center = p + z2 / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))
    return (center - margin) / (1 + z2 / n)


def win_rate(returns: Sequence[float]) -> float | None:
    """수익 포지션 / 전체 완결 포지션. return==0은 비승리로 본다(보수적)."""
    if not returns:
        return None
    return sum(1 for r in returns if r > 0) / len(returns)


def profit_factor(returns: Sequence[float]) -> float | None:
    """총이익 / |총손실|. 손실이 없으면 None(무한대 방지)."""
    gains = sum(r for r in returns if r > 0)
    losses = sum(r for r in returns if r < 0)
    if losses == 0:
        return None
    return gains / abs(losses)


def avg_win(returns: Sequence[float]) -> float | None:
    wins = [r for r in returns if r > 0]
    return statistics.fmean(wins) if wins else None


def avg_loss(returns: Sequence[float]) -> float | None:
    losses = [r for r in returns if r < 0]
    return statistics.fmean(losses) if losses else None


def expectancy(returns: Sequence[float]) -> float | None:
    """승률×평균이익 + (1-승률)×평균손실. 이익 또는 손실 표본이 없으면 0으로 대입."""
    if not returns:
        return None
    wr = win_rate(returns) or 0.0
    aw = avg_win(returns) or 0.0
    al = avg_loss(returns) or 0.0
    return wr * aw + (1 - wr) * al


def max_consecutive_losses(returns: Sequence[float]) -> int:
    """시간순 수익률에서 최대 연속 손실 횟수."""
    best = cur = 0
    for r in returns:
        if r < 0:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


# ── 규율 (PERF-013) ───────────────────────────────────────────────────────
def take_profit_rate(exit_reasons: Sequence[str]) -> float | None:
    """TAKE_PROFIT 청산 / 전체 청산."""
    if not exit_reasons:
        return None
    return sum(1 for r in exit_reasons if r == "TAKE_PROFIT") / len(exit_reasons)


def void_rate(total_signals: int, void_signals: int) -> float | None:
    if total_signals <= 0:
        return None
    return void_signals / total_signals


# ── 집계 결과 ─────────────────────────────────────────────────────────────
@dataclass
class AgentMetrics:
    period_start: date | None = None
    period_end: date | None = None
    # 수익성
    cumulative_return: float | None = None
    cagr: float | None = None
    avg_signal_return: float | None = None
    median_signal_ret: float | None = None
    best_return: float | None = None
    worst_return: float | None = None
    # 위험
    volatility: float | None = None
    downside_vol: float | None = None
    max_drawdown: float | None = None
    mdd_duration_days: int | None = None
    recovery_days: int | None = None
    var_95: float | None = None
    # 위험조정
    sharpe: float | None = None
    sortino: float | None = None
    calmar: float | None = None
    information_ratio: float | None = None
    alpha: float | None = None
    beta: float | None = None
    # 실행
    win_rate: float | None = None
    win_rate_wilson_lb: float | None = None
    profit_factor: float | None = None
    avg_win: float | None = None
    avg_loss: float | None = None
    expectancy: float | None = None
    avg_holding_days: float | None = None
    max_consec_loss: int | None = None
    # 규율
    take_profit_rate: float | None = None
    void_rate: float | None = None
    skip_rate: float | None = None
    # 표본
    total_signals: int | None = None
    closed_positions: int | None = None
    operating_days: int | None = None


@dataclass(frozen=True)
class ClosedPosition:
    net_return: float
    exit_reason: str
    holding_days: int


def compute_agent_metrics(
    positions: Sequence[ClosedPosition],
    equity: Sequence[float],
    agent_daily_rets: Sequence[float],
    benchmark_equity: Sequence[float] | None,
    benchmark_daily_rets: Sequence[float] | None,
    period_start: date,
    period_end: date,
    total_signals: int,
    void_signals: int,
    skip_rate_val: float | None,
    rf: float = DEFAULT_RISK_FREE,
) -> AgentMetrics:
    """포지션·일간곡선·벤치마크로부터 agent_metrics 전 지표를 산출(표본 게이팅 적용).

    equity: 시뮬레이션 일간 자산곡선(T11 → T12 snapshots). agent_daily_rets: 그 일간수익률.
    """
    rets = [p.net_return for p in positions]
    n = len(positions)
    op_days = (period_end - period_start).days if period_end and period_start else 0

    m = AgentMetrics(period_start=period_start, period_end=period_end)
    m.total_signals = total_signals
    m.closed_positions = n
    m.operating_days = op_days
    m.skip_rate = skip_rate_val

    # 수익성
    m.cumulative_return = cumulative_return(equity)
    ag_cagr = cagr(equity, op_days)
    m.cagr = ag_cagr
    if rets:
        m.avg_signal_return = statistics.fmean(rets)
        m.median_signal_ret = statistics.median(rets)
        m.best_return = max(rets)
        m.worst_return = min(rets)

    # 위험
    vol = volatility(agent_daily_rets)
    dvol = downside_volatility(agent_daily_rets)
    m.volatility = vol
    m.downside_vol = dvol
    dd = max_drawdown(equity)
    if meets_sample("mdd", n, op_days):
        m.max_drawdown = dd.mdd
        m.mdd_duration_days = dd.duration_days
        m.recovery_days = dd.recovery_days
    m.var_95 = var_95(agent_daily_rets)

    # 위험조정 (표본 게이팅)
    if meets_sample("sharpe", n, op_days):
        m.sharpe = sharpe(ag_cagr, vol, rf)
    if meets_sample("sortino", n, op_days):
        m.sortino = sortino(ag_cagr, dvol, rf)
    m.calmar = calmar(ag_cagr, dd.mdd) if meets_sample("mdd", n, op_days) else None

    bench_cagr = None
    if benchmark_equity is not None:
        bench_cagr = cagr(benchmark_equity, op_days)
    if benchmark_daily_rets is not None:
        m.beta = beta(agent_daily_rets, benchmark_daily_rets)
        m.information_ratio = information_ratio(agent_daily_rets, benchmark_daily_rets)
    m.alpha = alpha(ag_cagr, bench_cagr)

    # 실행
    if meets_sample("win_rate", n, op_days):
        wr = win_rate(rets)
        m.win_rate = wr
        wins = sum(1 for r in rets if r > 0)
        m.win_rate_wilson_lb = wilson_lower_bound(wins, n)
    if meets_sample("profit_factor", n, op_days):
        m.profit_factor = profit_factor(rets)
    m.avg_win = avg_win(rets)
    m.avg_loss = avg_loss(rets)
    m.expectancy = expectancy(rets)
    if positions:
        m.avg_holding_days = statistics.fmean(p.holding_days for p in positions)
    m.max_consec_loss = max_consecutive_losses(rets)

    # 규율
    m.take_profit_rate = take_profit_rate([p.exit_reason for p in positions])
    m.void_rate = void_rate(total_signals, void_signals)

    return m
