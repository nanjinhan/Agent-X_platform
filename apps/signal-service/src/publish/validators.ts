/**
 * 발행 검증 순수 함수 (SYS-013 일부, SIG-002/010).
 * 시각 의존 로직은 Date를 주입받아 테스트 가능하게 한다.
 */

export type MarketSession = 'PRE' | 'REGULAR' | 'POST' | 'CLOSED';

/** UTC Date → KST(UTC+9) 분 단위 (0~1439). */
export function kstMinutes(now: Date): number {
  const kstMs = now.getTime() + 9 * 3600 * 1000;
  const d = new Date(kstMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * 국내 발행 가능 시간대 (SIG-010).
 * 08:50~09:00(동시호가)·15:20~15:30(마감동시호가) 금지.
 * 장중(09:00~15:20)은 조건부 — 여기서는 '허용'으로 두고 종목 조건(SIG-011)은 별도 검증.
 */
export function isPublishAllowedKR(now: Date): { allowed: boolean; reason?: string } {
  const m = kstMinutes(now);
  const OPENING_AUCTION_START = 8 * 60 + 50; // 08:50
  const MARKET_OPEN = 9 * 60; // 09:00
  const CLOSING_AUCTION_START = 15 * 60 + 20; // 15:20
  const MARKET_CLOSE = 15 * 60 + 30; // 15:30

  if (m >= OPENING_AUCTION_START && m < MARKET_OPEN) {
    return { allowed: false, reason: '장 시작 동시호가 시간대(08:50~09:00)에는 발행할 수 없습니다' };
  }
  if (m >= CLOSING_AUCTION_START && m < MARKET_CLOSE) {
    return { allowed: false, reason: '장 마감 동시호가 시간대(15:20~15:30)에는 발행할 수 없습니다' };
  }
  return { allowed: true };
}

/** 발행 시각 → market_session 판정 (거래일 가정. 휴장일은 배치/캘린더가 CLOSED 처리). */
export function marketSessionKR(now: Date): MarketSession {
  const m = kstMinutes(now);
  if (m < 9 * 60) return 'PRE';
  if (m < 15 * 60 + 30) return 'REGULAR';
  return 'POST';
}

/**
 * ENTRY 가격 유효성 (SIG-002 + 17.6 10단계): 목표가 > 참고가 > 손절가.
 * 참고가가 없으면 목표가 > 손절가만 확인.
 */
export function validateEntryPrices(input: {
  referencePrice?: number;
  targetPrice?: number;
  stopLossPrice?: number;
}): string | null {
  const { referencePrice, targetPrice, stopLossPrice } = input;
  if (targetPrice === undefined || stopLossPrice === undefined) {
    return '진입 시그널은 목표가와 손절가가 필요합니다';
  }
  if (!(targetPrice > stopLossPrice)) {
    return '목표가는 손절가보다 높아야 합니다';
  }
  if (referencePrice !== undefined) {
    if (!(targetPrice > referencePrice)) return '목표가는 참고가보다 높아야 합니다';
    if (!(referencePrice > stopLossPrice)) return '손절가는 참고가보다 낮아야 합니다';
  }
  return null;
}
