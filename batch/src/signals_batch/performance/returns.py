"""수익률·거래비용·슬리피지 + 가상 포트폴리오 시뮬레이션 (PERF-005~007, PERF-009~012).

T10(자동청산)이 확정한 진입가/청산가에 **현실 비용**을 입혀 net_return을 만든다.
성과 과대평가 방지(PERF-001)가 이 모듈의 존재 이유다: 비용을 빼지 않으면 단타 전략이
실제로 재현 불가능한 수익률로 부풀려진다(부록A #6).

구성 (전부 순수 함수 — DB 없이 테스트):
  1. 거래비용   compute_return       — PERF-005/009
  2. 슬리피지   slippage_rate·liquidity_multiplier — PERF-006
  3. 통화       us_krw_net_return    — PERF-007 (달러 net + 원화 병기)
  4. 시뮬레이션 simulate_portfolio   — PERF-010B/011/012 (자금제약·스킵 기록)

배치(run_returns.py)는 여기 함수를 CLOSED 포지션에 적용해 positions 비용·수익률 컬럼을 채운다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Literal

from signals_batch.performance.trading_calendar import calendar_market

Side = Literal["LONG", "SHORT"]

# ── PERF-005 거래비용 (편도 rate, 국가 기준) ──────────────────────────────
# 국내 매도는 증권거래세 0.20% 포함(0.015%+0.20%=0.215%).
# 미국 매도는 SEC fee 0.0008% 포함(0.07%+0.0008%=0.0708%).
TRADE_COST: dict[str, tuple[Decimal, Decimal]] = {
    "KR": (Decimal("0.00015"), Decimal("0.00215")),  # (매수, 매도)
    "US": (Decimal("0.0007"), Decimal("0.000708")),  # (매수, 매도)
}

# ── PERF-006 base_slippage (국가·시가총액 구간) ───────────────────────────
# 구간 경계는 시가총액(native 통화: KR=KRW, US=USD).
# ⚠️ 설계결정: SRS는 미국 중형/소형 경계를 명시하지 않는다 → 통상 구분인 $2B을 채택.
#    (대형 ≥$10B, 중형 $2B~$10B, 소형 <$2B). 정식 데이터 계약 시 재검토.
# 각 리스트는 (하한_이상이면_이_슬리피지) 를 내림차순으로. 어디에도 안 걸리면 소형(마지막).
_SLIPPAGE_TIERS: dict[str, list[tuple[Decimal, Decimal]]] = {
    "KR": [
        (Decimal("1e12"), Decimal("0.0005")),  # 대형 시총 1조↑
        (Decimal("3e11"), Decimal("0.0010")),  # 중형 3천억~1조
    ],
    "US": [
        (Decimal("1e10"), Decimal("0.0003")),  # 대형 $10B↑
        (Decimal("2e9"), Decimal("0.0008")),   # 중형 $2B~$10B
    ],
}
_SLIPPAGE_SMALL: dict[str, Decimal] = {"KR": Decimal("0.0020"), "US": Decimal("0.0015")}


def base_slippage(market: str, market_cap: int | Decimal | None) -> Decimal:
    """시가총액 구간별 기본 슬리피지율 (PERF-006).

    ⚠️ 보수적 기본값: 시가총액 데이터가 없으면(현재 T2/T3 후속 미수집) **소형주**로 본다.
    소형주가 슬리피지 최대 → 성과를 부풀리지 않는 방향(PERF-001)이다.
    """
    country = calendar_market(market)
    small = _SLIPPAGE_SMALL[country]
    if market_cap is None:
        return small
    cap = Decimal(market_cap)
    for threshold, rate in _SLIPPAGE_TIERS[country]:
        if cap >= threshold:
            return rate
    return small


def liquidity_multiplier(participation_ratio: Decimal) -> Decimal:
    """참여율 → 슬리피지 승수 1.0~2.0 클램프 (PERF-006).

    참여율 = (구독자 예상 주문총액) / 일평균거래대금. 구독자가 많고 종목이 얇을수록
    승수가 커진다("구독자 늘어도 성과 그대로" 착시 방지). 산출은 배치 층 소관이며,
    여기서는 [1.0, 2.0] 클램프만 담당한다.
    현재 페이퍼 트레이딩 단계(구독자 0)에선 참여율 0 → 승수 1.0.
    """
    return max(Decimal(1), min(Decimal(2), Decimal(1) + participation_ratio))


def slippage_rate(
    market: str,
    market_cap: int | Decimal | None,
    participation_ratio: Decimal = Decimal(0),
) -> Decimal:
    """최종 슬리피지율 = base_slippage × liquidity_multiplier (PERF-006)."""
    return base_slippage(market, market_cap) * liquidity_multiplier(participation_ratio)


# ── PERF-009 수익률 ───────────────────────────────────────────────────────
@dataclass(frozen=True)
class ReturnBreakdown:
    gross_return: Decimal
    net_return: Decimal
    entry_cost_rate: Decimal  # 진입 레그에 적용된 비용률(LONG=매수, SHORT=매도)
    exit_cost_rate: Decimal   # 청산 레그에 적용된 비용률(LONG=매도, SHORT=매수)
    slippage_rate: Decimal


def _net(entry: Decimal, exit_: Decimal, buy: Decimal, sell: Decimal, slip: Decimal, side: Side) -> Decimal:
    """PERF-009 net_return 공식. LONG/SHORT 대칭.

    LONG : 매수 진입(비용 가산) → 매도 청산(비용 차감).
    SHORT: 매도 진입(수취, 비용 차감) → 매수 청산(지불, 비용 가산). 하락에 수익.
    """
    if side == "LONG":
        return (exit_ * (Decimal(1) - sell - slip)) / (entry * (Decimal(1) + buy + slip)) - Decimal(1)
    return (entry * (Decimal(1) - sell - slip)) / (exit_ * (Decimal(1) + buy + slip)) - Decimal(1)


def compute_return(
    entry_price: Decimal,
    exit_price: Decimal,
    market: str,
    side: Side,
    slippage: Decimal,
) -> ReturnBreakdown:
    """진입가·청산가에 거래비용·슬리피지를 반영한 gross/net 수익률.

    gross_return = (청산가 - 진입가)/진입가 (SHORT는 부호 반전). 비용 미반영 참고치.
    net_return   = 표시·랭킹에 쓰는 실효 수익률 (PERF-009).
    """
    buy, sell = TRADE_COST[calendar_market(market)]
    if side == "LONG":
        gross = (exit_price - entry_price) / entry_price
        entry_cost, exit_cost = buy, sell
    else:
        gross = (entry_price - exit_price) / entry_price
        entry_cost, exit_cost = sell, buy
    net = _net(entry_price, exit_price, buy, sell, slippage, side)
    return ReturnBreakdown(gross, net, entry_cost, exit_cost, slippage)


def us_krw_net_return(
    entry_price: Decimal,
    exit_price: Decimal,
    entry_fx: Decimal,
    exit_fx: Decimal,
    side: Side,
    slippage: Decimal,
) -> Decimal:
    """미국 포지션의 원화환산 net_return (PERF-007 병기용).

    달러 net은 compute_return이 주 기준으로 산출하고, 여기서는 진입/청산 각 시점의
    매매기준율로 원화 환산한 가격에 동일 공식을 적용한다. 환율 변동이 수익률에 포함된다.
    """
    buy, sell = TRADE_COST["US"]
    return _net(entry_price * entry_fx, exit_price * exit_fx, buy, sell, slippage, side)


# ── PERF-010B/011/012 가상 포트폴리오 시뮬레이션 ──────────────────────────
@dataclass(frozen=True)
class SimSignal:
    """시뮬레이션 입력: 완결된 한 포지션."""

    signal_id: str
    entry_date: date
    exit_date: date
    net_return: Decimal
    weight: Decimal | None  # suggested_weight, 없으면 1/max_positions


@dataclass(frozen=True)
class EnteredPosition:
    """실제 진입된 포지션(스킵 안 된 것)의 배분 내역 — T12 일별 스냅샷 투영용."""

    signal_id: str
    entry_date: date
    exit_date: date
    alloc: Decimal        # 진입 시점 배분 원가
    net_return: Decimal


@dataclass
class SimResult:
    initial_capital: Decimal
    final_value: Decimal
    cumulative_return: Decimal
    entered: int
    skipped: int
    skip_rate: Decimal
    skipped_ids: list[str] = field(default_factory=list)
    equity_curve: list[tuple[date, Decimal]] = field(default_factory=list)
    entered_positions: list[EnteredPosition] = field(default_factory=list)


_INITIAL_CAPITAL = Decimal(100)


def simulate_portfolio(
    signals: list[SimSignal],
    max_positions: int,
    initial_capital: Decimal = _INITIAL_CAPITAL,
) -> SimResult:
    """가상 포트폴리오 수익률 (PERF-010 방식B / PERF-011). 랭킹 기본 지표.

    규칙(PERF-011):
      - 초기자본 정규화(기본 100), 레버리지·리밸런싱 없음(청산 시 현금 복귀).
      - 포지션 사이징: suggested_weight, 없으면 1/max_positions.
      - 배분액 = weight × (그 시점 총자산). 가용 현금보다 크면 **스킵**(PERF-012, 검수 2.13).
      - 동시 보유 max_positions 초과 시에도 스킵.

    ⚠️ 설계결정(문서화): 보유 중 포지션은 일간 평가(마킹) 데이터가 없어(그건 T12 스냅샷 소관)
      **취득원가로 유지**한다. 따라서 총자산 = 현금 + Σ(미청산 배분액, 원가). 실현손익만 복리.
      기간말 미청산분도 원가로 최종가치에 반영. 같은 날짜는 **청산→진입 순**으로 처리(현금 우선 회수).
    """
    weight_default = Decimal(1) / Decimal(max_positions)

    # 이벤트 타임라인: (날짜, 종류, signal). 종류 0=EXIT, 1=ENTRY → 같은 날 청산 먼저.
    events: list[tuple[date, int, SimSignal]] = []
    for s in signals:
        events.append((s.entry_date, 1, s))
        events.append((s.exit_date, 0, s))
    events.sort(key=lambda e: (e[0], e[1]))

    cash = initial_capital
    open_alloc: dict[str, Decimal] = {}  # signal_id → 배분 원가
    entered = 0
    skipped_ids: list[str] = []
    curve: list[tuple[date, Decimal]] = []
    entered_positions: list[EnteredPosition] = []

    def total_equity() -> Decimal:
        return cash + sum(open_alloc.values(), Decimal(0))

    for ev_date, kind, s in events:
        if kind == 0:  # EXIT: 배분금이 수익률만큼 불어 현금 복귀
            if s.signal_id in open_alloc:
                alloc = open_alloc.pop(s.signal_id)
                cash += alloc * (Decimal(1) + s.net_return)
        else:  # ENTRY
            if len(open_alloc) >= max_positions:
                skipped_ids.append(s.signal_id)  # 슬롯 초과
                continue
            weight = s.weight if s.weight is not None else weight_default
            need = weight * total_equity()
            if need > cash + Decimal("1e-9"):  # 자금 부족 → 스킵 (레버리지 금지)
                skipped_ids.append(s.signal_id)
                continue
            cash -= need
            open_alloc[s.signal_id] = need
            entered += 1
            entered_positions.append(
                EnteredPosition(s.signal_id, s.entry_date, s.exit_date, need, s.net_return)
            )
        curve.append((ev_date, total_equity()))

    final_value = total_equity()
    total_entries = entered + len(skipped_ids)
    skip_rate = (Decimal(len(skipped_ids)) / Decimal(total_entries)) if total_entries else Decimal(0)
    return SimResult(
        initial_capital=initial_capital,
        final_value=final_value,
        cumulative_return=final_value / initial_capital - Decimal(1),
        entered=entered,
        skipped=len(skipped_ids),
        skip_rate=skip_rate,
        skipped_ids=skipped_ids,
        equity_curve=curve,
        entered_positions=entered_positions,
    )
