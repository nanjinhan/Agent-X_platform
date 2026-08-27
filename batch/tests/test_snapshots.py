"""일별 스냅샷 투영 테스트 (T12). DB 비의존.

T11 시뮬레이션 예제와 일별 자산가치가 정확히 일치하는지, 낙폭·벤치마크 정규화가 맞는지 검증.
"""

from datetime import date
from decimal import Decimal

from signals_batch.performance.returns import EnteredPosition
from signals_batch.performance.snapshots import build_daily_snapshots

D = lambda s: Decimal(str(s))


def ep(sid, entry, exit_, alloc, ret):
    return EnteredPosition(sid, date(2026, 7, entry), date(2026, 7, exit_), D(alloc), D(ret))


class TestDailyCurve:
    def test_matches_t11_example(self):
        # T11 test_all_fit_no_skip와 동일: a(50→55), b(52.5→63) → 최종 115.5
        entered = [ep("a", 1, 2, "50", "0.1"), ep("b", 3, 4, "52.5", "0.2")]
        days = [date(2026, 7, d) for d in (1, 2, 3, 4)]
        snaps = build_daily_snapshots(entered, days)

        values = [s.portfolio_value for s in snaps]
        assert values == [D("100"), D("105"), D("105"), D("115.5")]
        assert [s.open_positions for s in snaps] == [1, 0, 1, 0]
        assert snaps[1].daily_return == 0.05      # 100→105
        assert snaps[-1].cumulative_return == 0.155
        assert all(s.drawdown == 0.0 for s in snaps)  # 단조 비하락 → 낙폭 0

    def test_drawdown_on_loss(self):
        # c: 100 전액 투입 후 -20% 청산 → 80. 낙폭 0.2
        entered = [ep("c", 1, 2, "100", "-0.2")]
        days = [date(2026, 7, d) for d in (1, 2, 3)]
        snaps = build_daily_snapshots(entered, days)
        assert snaps[0].portfolio_value == D("100")
        assert snaps[1].portfolio_value == D("80")
        assert snaps[1].drawdown == 0.2
        assert snaps[1].daily_return == -0.2

    def test_benchmark_normalization_and_ffill(self):
        entered = [ep("a", 1, 2, "50", "0.1")]
        days = [date(2026, 7, d) for d in (1, 2, 3)]
        bench = {date(2026, 7, 1): D("1000"), date(2026, 7, 2): D("1100")}  # 7/3 누락
        snaps = build_daily_snapshots(entered, days, benchmark_by_date=bench)
        assert snaps[0].benchmark_value == D("100")   # 1000 기준 정규화
        assert snaps[1].benchmark_value == D("110")   # 1100/1000×100
        assert snaps[2].benchmark_value == D("110")   # forward-fill

    def test_no_benchmark_none(self):
        snaps = build_daily_snapshots([ep("a", 1, 2, "50", "0.1")], [date(2026, 7, 1)])
        assert snaps[0].benchmark_value is None
