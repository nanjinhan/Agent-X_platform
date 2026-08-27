"""성과 지표 골든 테스트 (PERF-013~018). DB 비의존.

검수 대응: 2.14 수기 대조(오차 0.01%p=1e-4), 3.1 샤프/소르티노/칼마, 3.2 MDD,
3.3 Wilson 하한, 3.4 최소표본 미달 시 미산출.

각 값은 **독립 수기 계산**으로 도출한 골든이다(공식 자체를 검증).
"""

from datetime import date

import pytest

from signals_batch.performance.metrics import (
    ClosedPosition,
    alpha,
    avg_loss,
    avg_win,
    beta,
    cagr,
    calmar,
    compute_agent_metrics,
    cumulative_return,
    downside_volatility,
    expectancy,
    information_ratio,
    max_consecutive_losses,
    max_drawdown,
    meets_sample,
    profit_factor,
    sharpe,
    sortino,
    var_95,
    volatility,
    wilson_lower_bound,
    win_rate,
)

APPROX = 1e-4  # 검수 허용오차 0.01%p


class TestProfitability:
    def test_cumulative_return(self):
        assert cumulative_return([100, 121]) == pytest.approx(0.21, abs=APPROX)

    def test_cagr_one_year(self):
        # 365일에 +21% → CAGR = 21%
        assert cagr([100, 121], 365) == pytest.approx(0.21, abs=APPROX)

    def test_cagr_two_years(self):
        # 730일에 +21% → (1.21)^(1/2)-1 = 10%
        assert cagr([100, 121], 730) == pytest.approx(0.10, abs=APPROX)

    def test_cagr_guards(self):
        assert cagr([100], 365) is None
        assert cagr([100, 121], 0) is None


class TestRisk:
    def test_volatility_hand(self):
        # rets [.01,-.01,.01,-.01]: stdev(ddof1)=0.011547005 × √252 = 0.183303
        assert volatility([0.01, -0.01, 0.01, -0.01]) == pytest.approx(0.183303, abs=APPROX)

    def test_volatility_needs_two(self):
        assert volatility([0.01]) is None

    def test_downside_volatility_hand(self):
        # neg만 [-.01,-.03]: stdev=0.01414214 × √252 = 0.224499
        assert downside_volatility([0.02, -0.01, -0.03, 0.01]) == pytest.approx(0.224499, abs=APPROX)

    def test_downside_needs_two_negatives(self):
        assert downside_volatility([0.02, -0.01, 0.03]) is None

    def test_max_drawdown_hand(self):
        # 100→110(peak)→90(trough)→95→120. MDD=(110-90)/110=0.181818
        dd = max_drawdown([100, 110, 90, 95, 120])
        assert dd.mdd == pytest.approx(0.181818, abs=APPROX)
        assert dd.duration_days == 1     # peak(idx1) → trough(idx2)
        assert dd.recovery_days == 2     # trough(idx2) → 재돌파(idx4, 120≥110)

    def test_max_drawdown_unrecovered(self):
        # 신고점 회복 못 함 → recovery None
        dd = max_drawdown([100, 120, 90])
        assert dd.mdd == pytest.approx(0.25, abs=APPROX)  # (120-90)/120
        assert dd.recovery_days is None

    def test_var_95_hand(self):
        # sorted [-.1,-.05,0,.05,.1], p5 rank=0.2 → -.1*.8 + -.05*.2 = -0.09
        assert var_95([0.1, -0.05, 0, 0.05, -0.1]) == pytest.approx(-0.09, abs=APPROX)


class TestRiskAdjusted:
    def test_sharpe_hand(self):
        # (0.10 - 0.03) / 0.20 = 0.35
        assert sharpe(0.10, 0.20, rf=0.03) == pytest.approx(0.35, abs=APPROX)

    def test_sortino_hand(self):
        # (0.10 - 0.03) / 0.15 = 0.466667
        assert sortino(0.10, 0.15, rf=0.03) == pytest.approx(0.466667, abs=APPROX)

    def test_calmar_hand(self):
        # 0.10 / 0.18182 = 0.55001
        assert calmar(0.10, 0.181818) == pytest.approx(0.55, abs=1e-3)

    def test_guards_return_none(self):
        assert sharpe(None, 0.2) is None
        assert sharpe(0.1, 0) is None
        assert sortino(0.1, None) is None
        assert calmar(0.1, 0) is None

    def test_beta_exact_double(self):
        # agent = 2 × bench 정확히 → beta = 2.0
        bench = [0.01, 0.005, -0.005, 0.015]
        agent = [2 * x for x in bench]
        assert beta(agent, bench) == pytest.approx(2.0, abs=APPROX)

    def test_information_ratio_positive(self):
        bench = [0.01, 0.005, -0.005, 0.015]
        agent = [2 * x for x in bench]  # 초과수익 = bench (양의 평균)
        ir = information_ratio(agent, bench)
        assert ir is not None and ir > 0

    def test_alpha(self):
        assert alpha(0.28, 0.168) == pytest.approx(0.112, abs=APPROX)
        assert alpha(None, 0.1) is None


class TestExecution:
    def test_wilson_reference_50_100(self):
        # 고전 레퍼런스: 50/100, z≈1.96 → LB ≈ 0.4038
        assert wilson_lower_bound(50, 100) == pytest.approx(0.4038, abs=1e-3)

    def test_wilson_perfect_record_below_one(self):
        # 10/10 완벽해도 표본이 작으면 하한 < 1 (고전 레퍼런스 ≈0.7225, PERF-018 취지)
        lb = wilson_lower_bound(10, 10)
        assert lb == pytest.approx(0.7225, abs=1e-3)
        assert lb < 1.0

    def test_wilson_zero_n(self):
        assert wilson_lower_bound(0, 0) is None

    def test_win_rate_and_pf(self):
        r = [0.10, -0.05, 0.20, -0.15]
        assert win_rate(r) == pytest.approx(0.5, abs=APPROX)
        # gains 0.30 / |losses 0.20| = 1.5
        assert profit_factor(r) == pytest.approx(1.5, abs=APPROX)
        assert avg_win(r) == pytest.approx(0.15, abs=APPROX)
        assert avg_loss(r) == pytest.approx(-0.10, abs=APPROX)
        # 0.5*0.15 + 0.5*(-0.10) = 0.025
        assert expectancy(r) == pytest.approx(0.025, abs=APPROX)

    def test_profit_factor_no_loss_none(self):
        assert profit_factor([0.1, 0.2]) is None

    def test_max_consecutive_losses(self):
        assert max_consecutive_losses([0.1, -0.05, -0.15, 0.2, -0.1]) == 2
        assert max_consecutive_losses([0.1, 0.2]) == 0


class TestSampleGating:
    def test_thresholds(self):
        # 샤프 30건/90일
        assert not meets_sample("sharpe", 29, 100)
        assert not meets_sample("sharpe", 30, 89)
        assert meets_sample("sharpe", 30, 90)
        # 승률 20건/30일
        assert meets_sample("win_rate", 20, 30)
        assert not meets_sample("win_rate", 19, 30)
        # 미정의 지표는 통과
        assert meets_sample("cagr", 1, 1)


class TestAggregate:
    def _positions(self, n, win_ratio=0.6):
        # n건 중 win_ratio 비율은 +10%, 나머지 -5%
        wins = round(n * win_ratio)
        out = []
        for i in range(n):
            r = 0.10 if i < wins else -0.05
            out.append(ClosedPosition(net_return=r, exit_reason="TAKE_PROFIT" if r > 0 else "STOP_LOSS", holding_days=5))
        return out

    def test_small_sample_gates_sharpe_but_not_basic(self):
        # n=10 < 30 → sharpe/sortino None, 하지만 avg/PF(20↓이지만 gating은 20)…
        pos = self._positions(10)
        eq = [100, 105, 110]
        m = compute_agent_metrics(
            pos, eq, [0.05, 0.0476], None, None,
            date(2026, 1, 1), date(2026, 2, 1), total_signals=10, void_signals=0, skip_rate_val=0.0,
        )
        assert m.sharpe is None and m.sortino is None      # 30건 미달
        assert m.win_rate is None                          # 20건 미달
        assert m.avg_signal_return is not None             # 기본 통계는 항상
        assert m.best_return == pytest.approx(0.10, abs=APPROX)
        assert m.worst_return == pytest.approx(-0.05, abs=APPROX)

    def test_large_sample_computes_all(self):
        pos = self._positions(40, win_ratio=0.6)
        # 96영업일 자산곡선: 상승/하락 교차(하락 폭 다양 → 하방변동성>0) + 순상승
        rets = [0.02, -0.005, 0.015, -0.01] * 24
        eq = [100.0]
        for r in rets:
            eq.append(eq[-1] * (1 + r))
        m = compute_agent_metrics(
            pos, eq, rets, None, None,
            date(2026, 1, 1), date(2026, 5, 1), total_signals=45, void_signals=2, skip_rate_val=0.1,
        )
        assert m.sharpe is not None and m.sortino is not None
        assert m.win_rate == pytest.approx(0.6, abs=APPROX)
        assert m.win_rate_wilson_lb is not None and m.win_rate_wilson_lb < m.win_rate
        assert m.take_profit_rate == pytest.approx(0.6, abs=APPROX)  # 24/40
        assert m.void_rate == pytest.approx(2 / 45, abs=APPROX)
        assert m.avg_holding_days == pytest.approx(5.0, abs=APPROX)
        assert m.closed_positions == 40
