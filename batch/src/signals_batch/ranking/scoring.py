"""SIGNALS Score 산출 (RANK-004~006) — 순수 로직.

랭킹 기본 정렬 점수 = 6개 요소를 **리그·부문 내에서 Z-score 정규화**한 가중합:
  0.30 위험조정 = 0.6×소르티노 + 0.4×칼마
  0.20 초과수익 = 에이전트 CAGR − 리그 벤치마크 CAGR (= alpha)
  0.15 일관성   = 1 − CV(월수익률) + 0.5×(양수 월 비율)
  0.15 유지율   = 0.6×3개월 + 0.4×6개월
  0.10 규율     = 1 − (0.4×VOID율 + 0.4×청산미이행률 + 0.2×빈도이탈률)
  0.10 표본신뢰 = log(1+완결) / log(1+100), 상한 1.0

노출 자격(RANK-005) 미달 에이전트는 정규화·랭킹에서 제외("랭킹 미산출").
저빈도(RANK-006)는 완결·운영 요건 완화.

**설계결정(문서화)**:
- Z-score는 **자격 충족 에이전트만**으로 산출. 그룹 표본이 1이거나 표준편차 0이면 z=0(중립).
- 값이 없는(None) 구성요소는 해당 에이전트에 대해 **z=0(중립)** 처리 — 데이터 미수집 단계(구독자 유지율·
  월수익률)에서도 랭킹이 붕괴하지 않게. 데이터 확보되면 자동 반영.

전부 순수 함수 → DB 없이 골든 테스트(검수 4.x).
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

Division = Literal["STABLE", "NEUTRAL", "AGGRESSIVE"]
League = Literal["KR", "US", "MIXED"]

WEIGHTS: dict[str, float] = {
    "risk_adjusted": 0.30,
    "excess_return": 0.20,
    "consistency": 0.15,
    "retention": 0.15,
    "discipline": 0.10,
    "sample_confidence": 0.10,
}

# RANK-006 저빈도 예외: frequency → (최소 완결 포지션, 최소 운영일)
_FREQ_REQ: dict[str, tuple[int, int]] = {
    "VERY_LOW": (8, 180),
    "LOW": (12, 120),
}
_DEFAULT_REQ = (20, 60)  # MEDIUM 이상

_DIVISION_MAP: dict[str, Division] = {
    "CONSERVATIVE": "STABLE",
    "MODERATE_CONS": "STABLE",
    "NEUTRAL": "NEUTRAL",
    "AGGRESSIVE": "AGGRESSIVE",
    "VERY_AGGRESSIVE": "AGGRESSIVE",
}


def classify_division(risk_profile: str) -> Division:
    """위험성향 → 부문 (RANK-003). 미상 값은 중립으로."""
    return _DIVISION_MAP.get(risk_profile, "NEUTRAL")


def classify_league(kr_signals: int, us_signals: int) -> League:
    """최근 90일 시그널 시장 비중으로 리그 판정 (RANK-002). 90%+ 쏠리면 해당 리그, 아니면 혼합."""
    total = kr_signals + us_signals
    if total == 0:
        return "MIXED"
    if kr_signals / total >= 0.9:
        return "KR"
    if us_signals / total >= 0.9:
        return "US"
    return "MIXED"


# ── 구성요소 원값 ─────────────────────────────────────────────────────────
def risk_adjusted(sortino: float | None, calmar: float | None) -> float | None:
    """0.6×소르티노 + 0.4×칼마. 둘 다 없으면 None, 하나만 있으면 있는 것만 비례 반영."""
    if sortino is None and calmar is None:
        return None
    if sortino is None:
        return calmar
    if calmar is None:
        return sortino
    return 0.6 * sortino + 0.4 * calmar


def consistency(monthly_returns: Sequence[float]) -> float | None:
    """1 − CV(월수익률) + 0.5×(양수 월 비율). 월 2개 미만이거나 평균≈0이면 None.

    CV = stdev/|mean|. 변동이 작을수록(꾸준할수록) 높다.
    """
    if len(monthly_returns) < 2:
        return None
    mean = statistics.fmean(monthly_returns)
    if abs(mean) < 1e-9:
        return None
    cv = statistics.stdev(monthly_returns) / abs(mean)
    pos_ratio = sum(1 for m in monthly_returns if m > 0) / len(monthly_returns)
    return 1 - cv + 0.5 * pos_ratio


def retention(r3m: float | None, r6m: float | None) -> float | None:
    """0.6×3개월 + 0.4×6개월. 둘 다 없으면 None(구독자 데이터 미수집 단계)."""
    if r3m is None and r6m is None:
        return None
    return 0.6 * (r3m or 0.0) + 0.4 * (r6m or 0.0)


def discipline(void_rate: float | None, unclosed_rate: float | None, freq_deviation: float | None) -> float:
    """1 − (0.4×VOID율 + 0.4×청산미이행률 + 0.2×빈도이탈률). 없는 값은 0(위반 없음)으로."""
    return 1 - (0.4 * (void_rate or 0.0) + 0.4 * (unclosed_rate or 0.0) + 0.2 * (freq_deviation or 0.0))


def sample_confidence(closed_positions: int) -> float:
    """log(1+완결) / log(1+100), 상한 1.0. 100건에서 포화."""
    if closed_positions <= 0:
        return 0.0
    return min(1.0, math.log(1 + closed_positions) / math.log(101))


# ── 노출 자격 (RANK-005 / RANK-006) ───────────────────────────────────────
def check_eligibility(
    status: str,
    closed_positions: int,
    operating_days: int,
    unclosed_rate: float | None,
    void_rate: float | None,
    has_recent_signal: bool,
    frequency: str,
) -> tuple[bool, str | None]:
    """노출 자격 판정. 미달 사유(첫 번째)를 함께 반환."""
    if status != "ACTIVE":
        return False, f"상태 {status}(ACTIVE 아님)"
    min_closed, min_days = _FREQ_REQ.get(frequency, _DEFAULT_REQ)
    if closed_positions < min_closed:
        return False, f"완결 포지션 {closed_positions} < {min_closed}"
    if operating_days < min_days:
        return False, f"운영 {operating_days}일 < {min_days}일"
    if (unclosed_rate or 0.0) > 0.30:
        return False, "청산 미이행률 30% 초과"
    if (void_rate or 0.0) > 0.10:
        return False, "VOID율 10% 초과"
    if not has_recent_signal:
        return False, "최근 30일 시그널 없음"
    return True, None


# ── Z-score 정규화 + 종합 점수 ────────────────────────────────────────────
def zscore(values: Sequence[float | None]) -> list[float]:
    """None→0(중립). 표본<2 또는 표준편차 0이면 전부 0. 그 외 (x−mean)/stdev."""
    present = [v for v in values if v is not None]
    if len(present) < 2:
        return [0.0 for _ in values]
    mean = statistics.fmean(present)
    sd = statistics.stdev(present)
    if sd == 0:
        return [0.0 for _ in values]
    return [((v - mean) / sd) if v is not None else 0.0 for v in values]


@dataclass
class AgentInput:
    agent_id: str
    components: dict[str, float | None]  # WEIGHTS 키별 원값
    eligible: bool = True


@dataclass
class AgentScore:
    agent_id: str
    signals_score: float
    z_components: dict[str, float] = field(default_factory=dict)


def score_group(agents: Sequence[AgentInput]) -> list[AgentScore]:
    """한 리그·부문 그룹 내에서 SIGNALS Score 산출.

    자격 충족 에이전트만 대상으로 각 구성요소를 Z-정규화 후 가중합한다.
    (자격 미달은 정규화에서도 제외 — 랭킹 미산출).
    """
    eligible = [a for a in agents if a.eligible]
    if not eligible:
        return []

    # 구성요소별 z-score (자격자만)
    z_by_comp: dict[str, list[float]] = {}
    for comp in WEIGHTS:
        z_by_comp[comp] = zscore([a.components.get(comp) for a in eligible])

    out: list[AgentScore] = []
    for i, a in enumerate(eligible):
        zc = {comp: z_by_comp[comp][i] for comp in WEIGHTS}
        score = sum(WEIGHTS[comp] * zc[comp] for comp in WEIGHTS)
        out.append(AgentScore(a.agent_id, score, zc))
    return out
