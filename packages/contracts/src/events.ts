import type {
  AgentStatus,
  SignalAction,
  SubscriptionStatus,
} from '@signals/domain';

/**
 * SRS 15.2 [SYS-004] — 도메인 이벤트.
 * 발행/구독 모듈이 표에 고정되어 있으므로, 새 구독자를 추가할 때는
 * PROJECT-STRUCTURE.md의 의존 방향을 위반하지 않는지 확인할 것.
 */

export interface DomainEventBase {
  eventId: string;
  occurredAt: string; // ISO 8601 UTC
}

/** signal → notification, performance, moderation */
export interface SignalPublished extends DomainEventBase {
  type: 'SignalPublished';
  signalId: string;
  agentId: string;
  sequenceNo: number;
  action: SignalAction;
  market: string;
  ticker: string;
  isPaper: boolean;
}

/** signal → performance */
export interface SignalClosed extends DomainEventBase {
  type: 'SignalClosed';
  signalId: string;
  entrySignalId: string;
  agentId: string;
}

/** performance → ranking */
export interface PositionSettled extends DomainEventBase {
  type: 'PositionSettled';
  positionId: string;
  agentId: string;
  netReturn: string; // 정밀도 보존 위해 문자열 (SYS-024)
}

/** subscription → notification, agent */
export interface SubscriptionCreated extends DomainEventBase {
  type: 'SubscriptionCreated';
  subscriptionId: string;
  userId: string;
  agentId: string;
  status: SubscriptionStatus;
}

/** subscription → settlement */
export interface SubscriptionCancelled extends DomainEventBase {
  type: 'SubscriptionCancelled';
  subscriptionId: string;
  userId: string;
  agentId: string;
}

/** billing → subscription, settlement */
export interface PaymentSucceeded extends DomainEventBase {
  type: 'PaymentSucceeded';
  paymentId: string;
  subscriptionId: string;
  amountKrw: number;
}

/** billing → subscription, notification */
export interface PaymentFailed extends DomainEventBase {
  type: 'PaymentFailed';
  paymentId: string;
  subscriptionId: string;
  attemptNo: number;
  reason: string;
}

/** agent → subscription, notification, ranking */
export interface AgentStatusChanged extends DomainEventBase {
  type: 'AgentStatusChanged';
  agentId: string;
  from: AgentStatus;
  to: AgentStatus;
  reason?: string;
}

/** ranking → notification */
export interface RankingUpdated extends DomainEventBase {
  type: 'RankingUpdated';
  rankingDate: string; // YYYY-MM-DD
}

/** provider → agent */
export interface ProviderSuspended extends DomainEventBase {
  type: 'ProviderSuspended';
  providerId: string;
  reason: string;
}

export type DomainEvent =
  | SignalPublished
  | SignalClosed
  | PositionSettled
  | SubscriptionCreated
  | SubscriptionCancelled
  | PaymentSucceeded
  | PaymentFailed
  | AgentStatusChanged
  | RankingUpdated
  | ProviderSuspended;

export type DomainEventType = DomainEvent['type'];
