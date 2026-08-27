import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiErrorCode } from '@signals/contracts';
import {
  AgentStatus,
  SUBSCRIPTION_TRANSITIONS,
  SubscriptionStatus,
  canTransition,
} from '@signals/domain';
import { ApiError } from '../../../common/http/api-error';
import { AgentService } from '../../agent/application/agent.service';
import { SubscriptionRepository, type SubscriptionRow } from '../infra/subscription.repository';

const TRIAL_DAYS = 7; // SUB-005: 플랫폼 강제 7일 체험
const PERIOD_DAYS = 30; // 월 정기 (실결제·정확한 결제주기는 T17 billing)
const DAY_MS = 24 * 3600 * 1000;

/**
 * 구독·체험 수명주기 (6.3.3 상태머신, SUB-005 체험, SUB-016 어뷰징 방지, 가격 락인).
 * 실제 결제(PG 빌링키·웹훅)는 T17 billing이 담당한다. 여기서는 상태·기간·가격락인까지.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly subs: SubscriptionRepository,
    private readonly agents: AgentService,
  ) {}

  /** 구독 가능한 ACTIVE 에이전트인지 확인하고 락인할 가격을 돌려준다. */
  private async requireSubscribableAgent(agentId: string): Promise<number> {
    const agent = await this.agents.getById(agentId);
    if (!agent) throw new NotFoundException('에이전트를 찾을 수 없습니다');
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new ApiError(ApiErrorCode.AGENT_NOT_ACTIVE, '구독 가능한 상태의 에이전트가 아닙니다');
    }
    return agent.priceKrw; // 가격 락인: 구독 시점 가격을 고정 (이후 인상돼도 유지)
  }

  private assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
    if (!canTransition(SUBSCRIPTION_TRANSITIONS, from, to)) {
      throw new ApiError(
        ApiErrorCode.INVALID_STATE_TRANSITION,
        `${from} → ${to} 전이는 허용되지 않습니다`,
      );
    }
  }

  /** 7일 무료 체험 시작 (SUB-005). 유저·에이전트당 1회 (SUB-016). */
  async startTrial(userId: string, agentId: string): Promise<SubscriptionRow> {
    const priceKrw = await this.requireSubscribableAgent(agentId);

    if (await this.subs.hasTrialHistory(userId, agentId)) {
      throw new ApiError(ApiErrorCode.TRIAL_ALREADY_USED, '이미 이 에이전트의 체험을 사용했습니다');
    }
    if (await this.subs.findLiveForUserAgent(userId, agentId)) {
      throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 구독 중인 에이전트입니다');
    }

    const now = new Date();
    try {
      return await this.subs.createTrial({
        userId,
        agentId,
        priceKrw,
        trialStart: now,
        trialEnd: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
      });
    } catch (e) {
      // 동시 요청 경쟁: 활성 유니크 인덱스 / trial_history PK 충돌
      if ((e as { code?: string }).code === '23505') {
        throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 구독 또는 체험한 에이전트입니다');
      }
      throw e;
    }
  }

  /**
   * 유료 구독 시작 또는 체험→유료 전환 (가격 락인).
   * 실결제는 T17 — 여기서는 상태를 ACTIVE로 두고 결제주기를 설정한다.
   */
  async subscribe(userId: string, agentId: string): Promise<SubscriptionRow> {
    const priceKrw = await this.requireSubscribableAgent(agentId);
    const live = await this.subs.findLiveForUserAgent(userId, agentId);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + PERIOD_DAYS * DAY_MS);

    if (live) {
      if (live.status === SubscriptionStatus.TRIAL) {
        // 체험 → 유료 전환: 체험 시점에 락인된 가격 유지
        this.assertTransition(live.status, SubscriptionStatus.ACTIVE);
        const updated = await this.subs.transition(live.id, live.status, SubscriptionStatus.ACTIVE, {
          startedAt: true,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextBillingAt: periodEnd,
        });
        if (!updated) throw new ApiError(ApiErrorCode.INVALID_STATE_TRANSITION, '상태가 변경되어 전환할 수 없습니다');
        return updated;
      }
      throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 구독 중인 에이전트입니다');
    }

    try {
      return await this.subs.createActive({ userId, agentId, priceKrw, periodStart: now, periodEnd });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 구독 중인 에이전트입니다');
      }
      throw e;
    }
  }

  /** 해지 예약 (ACTIVE→CANCELLING). 현재 결제기간 말까지 유지 후 만료(배치). */
  async cancel(userId: string, subId: string): Promise<SubscriptionRow> {
    const sub = await this.requireOwned(userId, subId);
    this.assertTransition(sub.status, SubscriptionStatus.CANCELLING);
    const updated = await this.subs.transition(sub.id, sub.status, SubscriptionStatus.CANCELLING, {
      cancelRequestedAt: true,
    });
    if (!updated) throw new ApiError(ApiErrorCode.INVALID_STATE_TRANSITION, '해지할 수 없는 상태입니다');
    return updated;
  }

  /** 해지 철회 (CANCELLING→ACTIVE). */
  async resume(userId: string, subId: string): Promise<SubscriptionRow> {
    const sub = await this.requireOwned(userId, subId);
    this.assertTransition(sub.status, SubscriptionStatus.ACTIVE);
    const updated = await this.subs.transition(sub.id, sub.status, SubscriptionStatus.ACTIVE);
    if (!updated) throw new ApiError(ApiErrorCode.INVALID_STATE_TRANSITION, '재개할 수 없는 상태입니다');
    return updated;
  }

  list(userId: string): Promise<SubscriptionRow[]> {
    return this.subs.listByUser(userId);
  }

  private async requireOwned(userId: string, subId: string): Promise<SubscriptionRow> {
    const sub = await this.subs.findByIdForUser(subId, userId);
    if (!sub) throw new NotFoundException('구독을 찾을 수 없습니다'); // IDOR 방지: 404
    return sub;
  }
}
