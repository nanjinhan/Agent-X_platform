/**
 * SRS 6.3, 7.2 — 도메인 열거형.
 * DB 저장값과 1:1 대응하므로 값 변경 시 마이그레이션이 필요하다.
 */

/** 6.3.1 */
export enum AgentStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  VERIFYING = 'VERIFYING',
  FAILED = 'FAILED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

/** 6.3.2 */
export enum SignalStatus {
  PENDING = 'PENDING',
  PUBLISHED = 'PUBLISHED',
  FILLED = 'FILLED',
  CLOSED = 'CLOSED',
  EXPIRED = 'EXPIRED',
  VOIDED = 'VOIDED',
}

/** 6.3.3 */
export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  TRIAL_EXPIRED = 'TRIAL_EXPIRED',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLING = 'CANCELLING',
  EXPIRED = 'EXPIRED',
}

/** 16.1 positions.status */
export enum PositionStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  EXPIRED = 'EXPIRED',
  VOIDED = 'VOIDED',
  SKIPPED = 'SKIPPED',
}

/** AGT-004 — 1차는 MANUAL, RULE_BASED만 */
export enum AgentType {
  MANUAL = 'MANUAL',
  RULE_BASED = 'RULE_BASED',
}

/** AGT-006 */
export enum RiskProfile {
  CONSERVATIVE = 'CONSERVATIVE',
  MODERATE_CONS = 'MODERATE_CONS',
  NEUTRAL = 'NEUTRAL',
  AGGRESSIVE = 'AGGRESSIVE',
  VERY_AGGRESSIVE = 'VERY_AGGRESSIVE',
}

/** REG-009, AGT-005 */
export enum AssetScope {
  KR = 'KR',
  US = 'US',
  MIXED = 'MIXED',
}

/** 10.2 — 리그는 자산군, 부문은 위험 성향 3구간 */
export enum League {
  KR = 'KR',
  US = 'US',
  MIXED = 'MIXED',
}

export enum Division {
  STABLE = 'STABLE',
  NEUTRAL = 'NEUTRAL',
  AGGRESSIVE = 'AGGRESSIVE',
}

/** AGT-008 */
export enum StrategyTag {
  VALUE = 'VALUE',
  GROWTH = 'GROWTH',
  MOMENTUM = 'MOMENTUM',
  DIVIDEND = 'DIVIDEND',
  SECTOR_ROTATION = 'SECTOR_ROTATION',
  SWING = 'SWING',
  POSITION = 'POSITION',
  EVENT_DRIVEN = 'EVENT_DRIVEN',
  TECHNICAL = 'TECHNICAL',
  FUNDAMENTAL = 'FUNDAMENTAL',
  QUANT = 'QUANT',
  MACRO = 'MACRO',
  ETF = 'ETF',
  CONTRARIAN = 'CONTRARIAN',
}

/** AGT-009 */
export enum SignalFrequency {
  VERY_LOW = 'VERY_LOW',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  VERY_HIGH = 'VERY_HIGH',
}

/**
 * AGT-005 평균 보유기간 — SRS는 "5구간"만 명시하고 값을 정의하지 않아
 * 다음 5구간으로 확정한다 (USR-005 필터 5구간과 일치). 변경 시 마이그레이션 필요.
 */
export enum HoldingPeriod {
  VERY_SHORT = 'VERY_SHORT', // ~3거래일
  SHORT = 'SHORT', // 3~10거래일
  MEDIUM = 'MEDIUM', // 10~30거래일
  LONG = 'LONG', // 30~90거래일
  VERY_LONG = 'VERY_LONG', // 90거래일+
}

/** SUB-003 — 가격은 티어 고정제. 자유 입력 금지 */
export enum PriceTier {
  T0 = 'T0',
  T1 = 'T1',
  T2 = 'T2',
  T3 = 'T3',
  T4 = 'T4',
  T5 = 'T5',
}

export const PRICE_TIER_KRW: Record<PriceTier, number> = {
  [PriceTier.T0]: 0,
  [PriceTier.T1]: 9_900,
  [PriceTier.T2]: 19_900,
  [PriceTier.T3]: 29_900,
  [PriceTier.T4]: 49_900,
  [PriceTier.T5]: 99_000,
};

export enum SignalAction {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
}

/** MVP는 롱 온리 (21.4 — 숏 제외) */
export enum SignalSide {
  LONG = 'LONG',
}

export enum UserRole {
  SUBSCRIBER = 'SUBSCRIBER',
  PROVIDER = 'PROVIDER',
  ADMIN = 'ADMIN',
}
