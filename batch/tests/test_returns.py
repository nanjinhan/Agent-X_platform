"""수익률·비용·슬리피지·포트폴리오 시뮬레이션 순수 로직 테스트 (PERF-005~012). DB 비의존.

검수-2 대응: 2.7 거래비용(국내 매도 0.215%), 2.8 슬리피지 시총 차등, 2.9 달러/원화 병기,
2.13 자금부족 스킵 기록.
"""

from datetime import date
from decimal import Decimal

from signals_batch.performance.returns import (
    SimSignal,
    base_slippage,
    compute_return,
    liquidity_multiplier,
    simulate_portfolio,
    slippage_rate,
    us_krw_net_return,
)

D = lambda s: Decimal(str(s))


class TestTradeCost:
    def test_kr_sell_includes_transaction_tax(self):
        # 2.7 — 국내 매도비용 = 수수료 0.015% + 거래세 0.20% = 0.215%
        rb = compute_return(D(100), D(110), "KOSPI", "LONG", slippage=D(0))
        assert rb.entry_cost_rate == D("0.00015")  # 매수
        assert rb.exit_cost_rate == D("0.00215")   # 매도(거래세 포함)

    def test_us_sell_includes_sec_fee(self):
        rb = compute_return(D(100), D(110), "NASDAQ", "LONG", slippage=D(0))
        assert rb.entry_cost_rate == D("0.0007")
        assert rb.exit_cost_rate == D("0.000708")  # 0.07% + SEC 0.0008%

    def test_net_below_gross_due_to_costs(self):
        rb = compute_return(D(100), D(110), "KOSPI", "LONG", slippage=D(0))
        assert rb.gross_return == D("0.1")
        # net = 110*(1-0.00215) / (100*(1+0.00015)) - 1  ≈ 0.09757
        assert rb.net_return < rb.gross_return
        expected = D(110) * (D(1) - D("0.00215")) / (D(100) * (D(1) + D("0.00015"))) - D(1)
        assert rb.net_return == expected

    def test_short_symmetry(self):
        # 숏: 하락에 수익. 진입 100 → 청산 90.
        rb = compute_return(D(100), D(90), "KOSPI", "SHORT", slippage=D(0))
        assert rb.gross_return == D("0.1")  # (100-90)/100
        assert rb.entry_cost_rate == D("0.00215")  # 진입=매도
        assert rb.exit_cost_rate == D("0.00015")   # 청산=매수
        expected = D(100) * (D(1) - D("0.00215")) / (D(90) * (D(1) + D("0.00015"))) - D(1)
        assert rb.net_return == expected


class TestSlippage:
    def test_kr_tiers_by_market_cap(self):
        # 2.8 — 시총 구간별 차등
        assert base_slippage("KOSPI", int(2e12)) == D("0.0005")  # 대형
        assert base_slippage("KOSPI", int(5e11)) == D("0.0010")  # 중형
        assert base_slippage("KOSPI", int(1e11)) == D("0.0020")  # 소형

    def test_us_tiers(self):
        assert base_slippage("NASDAQ", int(2e10)) == D("0.0003")
        assert base_slippage("NASDAQ", int(5e9)) == D("0.0008")
        assert base_slippage("NASDAQ", int(1e9)) == D("0.0015")

    def test_missing_market_cap_is_conservative_small(self):
        # 시총 데이터 없으면 소형주(최대 슬리피지) — 성과 과대평가 방지
        assert base_slippage("KOSPI", None) == D("0.0020")
        assert base_slippage("NASDAQ", None) == D("0.0015")

    def test_liquidity_multiplier_clamped(self):
        assert liquidity_multiplier(D(0)) == D("1")     # 구독자 0(페이퍼)
        assert liquidity_multiplier(D("0.5")) == D("1.5")
        assert liquidity_multiplier(D(5)) == D("2")     # 상한 클램프

    def test_slippage_rate_combines(self):
        assert slippage_rate("KOSPI", int(2e12), D("0.5")) == D("0.0005") * D("1.5")


class TestCurrency:
    def test_us_krw_includes_fx_move(self):
        # 2.9 — 달러 net은 환율 무관, 원화 net은 환율 변동 포함
        usd = compute_return(D(100), D(110), "NASDAQ", "LONG", slippage=D(0)).net_return
        # 환율이 진입 1300 → 청산 1430 (10% 상승)이면 원화 수익률이 더 커야
        krw = us_krw_net_return(D(100), D(110), D(1300), D(1430), "LONG", slippage=D(0))
        assert krw > usd
        expected = (D(110) * D(1430) * (D(1) - D("0.000708"))) / (
            D(100) * D(1300) * (D(1) + D("0.0007"))
        ) - D(1)
        assert krw == expected

    def test_flat_fx_matches_usd(self):
        usd = compute_return(D(100), D(110), "NASDAQ", "LONG", slippage=D(0)).net_return
        krw = us_krw_net_return(D(100), D(110), D(1300), D(1300), "LONG", slippage=D(0))
        assert krw == usd  # 환율 동일 → 달러와 같음


class TestPortfolioSimulation:
    def _sig(self, sid, entry, exit_, ret, weight=None):
        return SimSignal(sid, date(2026, 7, entry), date(2026, 7, exit_), D(ret), weight and D(weight))

    def test_all_fit_no_skip(self):
        # 순차 진입·청산, 자금 충분 → 스킵 0
        sigs = [
            self._sig("a", 1, 2, "0.1", "0.5"),
            self._sig("b", 3, 4, "0.2", "0.5"),
        ]
        r = simulate_portfolio(sigs, max_positions=2)
        assert r.skipped == 0 and r.entered == 2
        # a: 100*0.5=50 배분 → 55 회수(현금 105). b: 105*0.5=52.5 → 63 회수.
        # 최종 = 52.5(남은현금) + 63 = 115.5
        assert r.final_value == D("115.5")
        assert r.cumulative_return == D("0.155")

    def test_cash_shortage_skips(self):
        # 2.13 — 동시 3건이 각 0.5 비중 요구, 자금 부족 → 스킵 기록
        sigs = [
            self._sig("a", 1, 10, "0.1", "0.5"),
            self._sig("b", 2, 10, "0.1", "0.5"),
            self._sig("c", 3, 10, "0.1", "0.5"),  # 현금 부족(이미 100 투입)
        ]
        r = simulate_portfolio(sigs, max_positions=5)
        assert r.skipped == 1 and "c" in r.skipped_ids
        assert r.skip_rate == D(1) / D(3)

    def test_max_positions_slot_skip(self):
        # 동시 보유 슬롯 초과 → 스킵
        sigs = [
            self._sig("a", 1, 10, "0", "0.3"),
            self._sig("b", 2, 10, "0", "0.3"),
            self._sig("c", 3, 10, "0", "0.3"),  # max_positions=2 초과
        ]
        r = simulate_portfolio(sigs, max_positions=2)
        assert r.skipped == 1 and "c" in r.skipped_ids

    def test_weight_default_when_absent(self):
        # weight 없으면 1/max_positions
        sigs = [self._sig("a", 1, 2, "0.1")]  # weight=None, max=4 → 0.25 배분
        r = simulate_portfolio(sigs, max_positions=4)
        assert r.entered == 1
        # 25 배분 → 27.5 회수, 현금 75 → 최종 102.5
        assert r.final_value == D("102.5")

    def test_exit_frees_cash_same_period(self):
        # a 청산 후 b 진입 → 회수 현금으로 b 가능(스킵 없음)
        sigs = [
            self._sig("a", 1, 2, "0.1", "1.0"),  # 전액 투입 후 청산
            self._sig("b", 3, 4, "0.1", "1.0"),
        ]
        r = simulate_portfolio(sigs, max_positions=1)
        assert r.skipped == 0 and r.entered == 2
        # a: 100→110, b: 110→121
        assert r.final_value == D("121")


class TestEdgeCases:
    def test_empty_portfolio(self):
        r = simulate_portfolio([], max_positions=5)
        assert r.final_value == D("100") and r.skip_rate == D("0")

    def test_zero_return_position(self):
        rb = compute_return(D(100), D(100), "KOSPI", "LONG", slippage=D("0.0005"))
        assert rb.gross_return == D("0")
        assert rb.net_return < D("0")  # 비용·슬리피지 때문에 순손실
