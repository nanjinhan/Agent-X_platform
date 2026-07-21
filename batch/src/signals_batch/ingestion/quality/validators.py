"""수집 데이터 품질 검증 (SYS-009).

| 검증        | 조건                          | 실패 시            |
|-------------|-------------------------------|--------------------|
| 결측        | 거래일에 데이터 없음           | 알림 + 재수집       |
| 이상치      | 전일 종가 대비 ±50% 초과       | 플래그 + 수동 확인  |
| OHLC 정합성 | low ≤ open,close ≤ high       | 거부                |
| 거래량      | 음수 또는 비정상               | 거부                |
| 중복        | 동일 (ticker, date)           | 최신값 사용         |
| 지연        | 예정 시각 +30분 미도착         | 알림 (스케줄 수집용) |
"""

from dataclasses import dataclass, field

from signals_batch.ingestion.models import DailyQuote

OUTLIER_THRESHOLD = 0.5  # 전일 대비 ±50%


@dataclass
class ValidationResult:
    valid: list[DailyQuote] = field(default_factory=list)
    rejected: list[tuple[DailyQuote, str]] = field(default_factory=list)
    flagged: list[tuple[DailyQuote, str]] = field(default_factory=list)


def check_ohlc_integrity(q: DailyQuote) -> str | None:
    if q.open is None or q.high is None or q.low is None or q.close is None:
        return "OHLC_MISSING"
    if not (q.low <= q.open <= q.high and q.low <= q.close <= q.high):
        return "OHLC_INCONSISTENT"
    if min(q.open, q.high, q.low, q.close) <= 0:
        return "NON_POSITIVE_PRICE"
    return None


def check_volume(q: DailyQuote) -> str | None:
    if q.volume < 0:
        return "NEGATIVE_VOLUME"
    return None


def check_outlier(q: DailyQuote, prev_close: float | None) -> str | None:
    """전일 종가 대비 ±50% 초과 변동 → 플래그 (거부 아님, 수동 확인)."""
    if prev_close is None or prev_close <= 0 or q.close is None:
        return None
    if abs(q.close / prev_close - 1) > OUTLIER_THRESHOLD:
        return "PRICE_OUTLIER"
    return None


def dedupe_latest(quotes: list[DailyQuote]) -> list[DailyQuote]:
    """동일 (market, ticker, date) 중복 시 마지막(최신) 값만 유지."""
    seen: dict[tuple[str, str, object], DailyQuote] = {}
    for q in quotes:
        seen[(q.market, q.ticker, q.trade_date)] = q
    return list(seen.values())


def validate_batch(
    quotes: list[DailyQuote],
    prev_closes: dict[tuple[str, str], float] | None = None,
) -> ValidationResult:
    prev_closes = prev_closes or {}
    result = ValidationResult()
    for q in dedupe_latest(quotes):
        reason = check_ohlc_integrity(q) or check_volume(q)
        if reason:
            result.rejected.append((q, reason))
            continue
        flag = check_outlier(q, prev_closes.get((q.market, q.ticker)))
        if flag:
            result.flagged.append((q, flag))
        result.valid.append(q)  # 이상치는 적재하되 플래그 (SYS-009)
    return result
