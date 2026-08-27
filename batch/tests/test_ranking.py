"""SIGNALS Score 랭킹 골든 테스트 (RANK-002~006). DB 비의존.

검수-4 대응: 종합점수 구성·Z정규화·리그/부문 분류·노출 자격(저빈도 예외).
각 값은 독립 수기 계산 골든.
"""

import math

import pytest

from signals_batch.ranking.scoring import (
    AgentInput,
    check_eligibility,
    classify_division,
    classify_league,
    consistency,
    discipline,
    retention,
    risk_adjusted,
    sample_confidence,
    score_group,
    zscore,
)

APPROX = 1e-4


class TestClassify:
    def test_division(self):
        assert classify_division("CONSERVATIVE") == "STABLE"
        assert classify_division("MODERATE_CONS") == "STABLE"
        assert classify_division("NEUTRAL") == "NEUTRAL"
        assert classify_division("AGGRESSIVE") == "AGGRESSIVE"
        assert classify_division("VERY_AGGRESSIVE") == "AGGRESSIVE"
        assert classify_division("MODERATE") == "NEUTRAL"  # 미상 → 중립

    def test_league_90pct_rule(self):
        assert classify_league(9, 1) == "KR"      # 90% 국내
        assert classify_league(10, 0) == "KR"
        assert classify_league(0, 10) == "US"
        assert classify_league(8, 2) == "MIXED"   # 80% → 혼합
        assert classify_league(0, 0) == "MIXED"   # 시그널 없음


class TestComponents:
    def test_risk_adjusted(self):
        assert risk_adjusted(2.0, 1.5) == pytest.approx(1.8, abs=APPROX)  # .6*2+.4*1.5
        assert risk_adjusted(2.0, None) == 2.0
        assert risk_adjusted(None, 1.5) == 1.5
        assert risk_adjusted(None, None) is None

    def test_sample_confidence(self):
        assert sample_confidence(100) == pytest.approx(1.0, abs=APPROX)   # log101/log101
        assert sample_confidence(0) == 0.0
        # log(10)/log(101)
        assert sample_confidence(9) == pytest.approx(math.log(10) / math.log(101), abs=APPROX)
        assert sample_confidence(500) == 1.0  # 상한

    def test_discipline(self):
        # 1 - (.4*.05 + .4*.10 + .2*0) = 0.94
        assert discipline(0.05, 0.10, 0.0) == pytest.approx(0.94, abs=APPROX)
        assert discipline(None, None, None) == pytest.approx(1.0, abs=APPROX)  # 위반 없음

    def test_consistency(self):
        # [.1,.2,.15]: mean .15, stdev .05, CV .33333, pos 1.0 → 1-.33333+.5 = 1.16667
        assert consistency([0.1, 0.2, 0.15]) == pytest.approx(1.16667, abs=APPROX)
        assert consistency([0.1]) is None          # 월 2개 미만
        assert consistency([0.05, -0.05]) is None   # 평균≈0

    def test_retention(self):
        assert retention(0.8, 0.7) == pytest.approx(0.76, abs=APPROX)  # .6*.8+.4*.7
        assert retention(None, None) is None
        assert retention(0.8, None) == pytest.approx(0.48, abs=APPROX)  # r6m=0


class TestEligibility:
    def test_medium_freq_ok(self):
        ok, reason = check_eligibility("ACTIVE", 20, 60, 0.1, 0.05, True, "MEDIUM")
        assert ok and reason is None

    def test_closed_shortfall(self):
        ok, reason = check_eligibility("ACTIVE", 19, 60, 0.1, 0.05, True, "MEDIUM")
        assert not ok and "완결" in reason

    def test_low_freq_exception(self):
        # VERY_LOW: 8건/180일이면 통과 (MEDIUM이면 미달)
        ok, _ = check_eligibility("ACTIVE", 8, 180, 0.0, 0.0, True, "VERY_LOW")
        assert ok
        ok2, _ = check_eligibility("ACTIVE", 8, 180, 0.0, 0.0, True, "MEDIUM")
        assert not ok2

    def test_status_gate(self):
        ok, reason = check_eligibility("SUSPENDED", 30, 90, 0.0, 0.0, True, "MEDIUM")
        assert not ok and "ACTIVE" in reason

    def test_discipline_gates(self):
        assert not check_eligibility("ACTIVE", 30, 90, 0.35, 0.0, True, "MEDIUM")[0]  # 청산미이행
        assert not check_eligibility("ACTIVE", 30, 90, 0.0, 0.15, True, "MEDIUM")[0]  # VOID
        assert not check_eligibility("ACTIVE", 30, 90, 0.0, 0.0, False, "MEDIUM")[0]  # 최근시그널


class TestZScore:
    def test_normal(self):
        assert zscore([1, 2, 3]) == pytest.approx([-1.0, 0.0, 1.0], abs=APPROX)  # stdev=1

    def test_zero_stdev(self):
        assert zscore([5, 5, 5]) == [0.0, 0.0, 0.0]

    def test_single(self):
        assert zscore([7]) == [0.0]

    def test_none_is_neutral(self):
        z = zscore([1, None, 3])  # present [1,3] mean2 stdev√2
        assert z[1] == 0.0
        assert z[0] == pytest.approx(-1 / math.sqrt(2), abs=APPROX)
        assert z[2] == pytest.approx(1 / math.sqrt(2), abs=APPROX)


class TestScoreGroup:
    def test_weighting_and_eligible_only(self):
        # A risk_adjusted=2, B=1, 나머지 None. z=[+.7071,-.7071]. score=0.30*z
        a = AgentInput("A", {"risk_adjusted": 2.0}, eligible=True)
        b = AgentInput("B", {"risk_adjusted": 1.0}, eligible=True)
        c = AgentInput("C", {"risk_adjusted": 99.0}, eligible=False)  # 미자격 → 제외
        out = score_group([a, b, c])
        assert len(out) == 2  # C 제외
        by_id = {s.agent_id: s for s in out}
        assert by_id["A"].signals_score == pytest.approx(0.30 / math.sqrt(2), abs=APPROX)
        assert by_id["B"].signals_score == pytest.approx(-0.30 / math.sqrt(2), abs=APPROX)
        assert by_id["A"].signals_score > by_id["B"].signals_score

    def test_empty_group(self):
        assert score_group([AgentInput("A", {}, eligible=False)]) == []

    def test_single_eligible_neutral(self):
        # 자격자 1명 → 모든 z=0 → score 0
        out = score_group([AgentInput("A", {"risk_adjusted": 5.0}, eligible=True)])
        assert len(out) == 1 and out[0].signals_score == pytest.approx(0.0, abs=APPROX)
