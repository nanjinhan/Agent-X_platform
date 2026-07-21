import { AgentStatus, SignalStatus, SubscriptionStatus } from './enums';

/**
 * SRS 6.3 상태 전이 다이어그램의 코드 표현.
 * 상태 변경은 반드시 이 맵을 통과해야 한다 (AGT-003 등).
 */

export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export function canTransition<S extends string>(
  map: TransitionMap<S>,
  from: S,
  to: S,
): boolean {
  return map[from]?.includes(to) ?? false;
}

/** 6.3.1 — ARCHIVED는 최종 상태, 복귀 불가 (AGT-003) */
export const AGENT_TRANSITIONS: TransitionMap<AgentStatus> = {
  [AgentStatus.DRAFT]: [AgentStatus.PENDING],
  [AgentStatus.PENDING]: [AgentStatus.VERIFYING, AgentStatus.REJECTED],
  [AgentStatus.REJECTED]: [],
  [AgentStatus.VERIFYING]: [AgentStatus.ACTIVE, AgentStatus.FAILED],
  [AgentStatus.FAILED]: [],
  [AgentStatus.ACTIVE]: [
    AgentStatus.PAUSED,
    AgentStatus.SUSPENDED,
    AgentStatus.ARCHIVED,
  ],
  // PAUSED 60일 지속 시 자동 ARCHIVED (AGT-003)
  [AgentStatus.PAUSED]: [
    AgentStatus.ACTIVE,
    AgentStatus.SUSPENDED,
    AgentStatus.ARCHIVED,
  ],
  // 소명 인정 시 ACTIVE 복귀, 30일 내 소명 없으면 자동 ARCHIVED (AGT-003)
  [AgentStatus.SUSPENDED]: [AgentStatus.ACTIVE, AgentStatus.ARCHIVED],
  [AgentStatus.ARCHIVED]: [],
};

/** 6.3.2 — VOIDED는 거래정지 등 불가항력에만 (SignalStatus 표) */
export const SIGNAL_TRANSITIONS: TransitionMap<SignalStatus> = {
  [SignalStatus.PENDING]: [SignalStatus.PUBLISHED, SignalStatus.VOIDED],
  [SignalStatus.PUBLISHED]: [
    SignalStatus.FILLED,
    SignalStatus.EXPIRED,
    SignalStatus.VOIDED,
  ],
  [SignalStatus.FILLED]: [
    SignalStatus.CLOSED,
    SignalStatus.EXPIRED,
    SignalStatus.VOIDED,
  ],
  [SignalStatus.CLOSED]: [],
  [SignalStatus.EXPIRED]: [],
  [SignalStatus.VOIDED]: [],
};

/** 6.3.3 — PAST_DUE 유예 3일, CANCELLING은 resume으로 복귀 가능 */
export const SUBSCRIPTION_TRANSITIONS: TransitionMap<SubscriptionStatus> = {
  [SubscriptionStatus.TRIAL]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIAL_EXPIRED,
  ],
  [SubscriptionStatus.TRIAL_EXPIRED]: [],
  [SubscriptionStatus.ACTIVE]: [
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELLING,
  ],
  [SubscriptionStatus.PAST_DUE]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.EXPIRED,
  ],
  [SubscriptionStatus.CANCELLING]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.EXPIRED,
  ],
  [SubscriptionStatus.EXPIRED]: [],
};
