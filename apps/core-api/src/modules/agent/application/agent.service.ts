import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ApiErrorCode } from '@signals/contracts';
import {
  AGENT_TRANSITIONS,
  AgentStatus,
  PRICE_TIER_KRW,
  PriceTier,
  canTransition,
  findProhibitedTerm,
} from '@signals/domain';
import { ApiError } from '../../../common/http/api-error';
import { ProviderService } from '../../provider/application/provider.service';
import { AgentRepository, type AgentRow } from '../infra/agent.repository';
import type { CreateAgentInput, UpdateAgentInput } from '../api/dto';

/**
 * 에이전트 수명주기 (AGT-003 상태머신, AGT-005 프로필, AGT-018 자동 심사 서브셋).
 * 모든 전이는 domain의 AGENT_TRANSITIONS를 통과하고, DB에서 낙관적 상태 검증(WHERE status)으로 확정한다.
 */
@Injectable()
export class AgentService {
  constructor(
    private readonly agents: AgentRepository,
    private readonly providers: ProviderService,
  ) {}

  private async requireOwnedAgent(userId: string, agentId: string): Promise<AgentRow> {
    const provider = await this.providers.getActiveByUserId(userId);
    if (!provider) {
      throw new ApiError(ApiErrorCode.VERIFICATION_REQUIRED, '활성 공급자만 접근할 수 있습니다');
    }
    const agent = await this.agents.findById(agentId);
    if (!agent || agent.providerId !== provider.id) {
      // IDOR 방지(SEC-007): 소유권 불일치도 404로 응답
      throw new NotFoundException('에이전트를 찾을 수 없습니다');
    }
    return agent;
  }

  private assertTransition(agent: AgentRow, to: AgentStatus): void {
    if (!canTransition(AGENT_TRANSITIONS, agent.status, to)) {
      throw new ApiError(
        ApiErrorCode.INVALID_STATE_TRANSITION,
        `${agent.status} → ${to} 전이는 허용되지 않습니다`,
      );
    }
  }

  async create(userId: string, input: CreateAgentInput): Promise<AgentRow> {
    const provider = await this.providers.getActiveByUserId(userId);
    if (!provider) {
      throw new ApiError(ApiErrorCode.VERIFICATION_REQUIRED, '활성 공급자만 에이전트를 만들 수 있습니다');
    }

    // AGT-018: 동일 공급자 에이전트 수 제한 (providers.max_agents, 기본 5 이하)
    const count = await this.agents.countActiveByProvider(provider.id);
    if (count >= provider.maxAgents) {
      throw new ApiError(ApiErrorCode.DAILY_LIMIT_EXCEEDED, `에이전트는 최대 ${provider.maxAgents}개까지 운영할 수 있습니다`);
    }

    // SUB-003: 신규 에이전트는 T0~T2만 (T3+는 구독자 실적 잠금 — 해금은 T16 이후)
    if (![PriceTier.T0, PriceTier.T1, PriceTier.T2].includes(input.priceTier)) {
      throw new ApiError(ApiErrorCode.INVALID_STATE_TRANSITION, '신규 에이전트는 T0~T2 티어만 선택할 수 있습니다');
    }

    const term =
      findProhibitedTerm(input.name) ??
      findProhibitedTerm(input.tagline) ??
      findProhibitedTerm(input.description);
    if (term) {
      throw new ApiError(ApiErrorCode.PROHIBITED_TERM, `금칙어가 포함되어 있습니다: ${term}`);
    }

    try {
      return await this.agents.create({
        providerId: provider.id,
        name: input.name,
        tagline: input.tagline,
        description: input.description,
        agentType: input.agentType,
        riskProfile: input.riskProfile,
        assetScope: input.assetScope,
        strategyTags: input.strategyTags,
        expectedFrequency: input.expectedFrequency,
        avgHoldingPeriod: input.avgHoldingPeriod,
        maxPositions: input.maxPositions,
        priceTier: input.priceTier,
        priceKrw: PRICE_TIER_KRW[input.priceTier], // 가격은 서버가 티어에서 결정 (조작 불가)
        genesisHash: randomBytes(32).toString('hex'), // SIG-005: 해시체인 시작점
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 사용 중인 에이전트 이름입니다');
      }
      throw e;
    }
  }

  list(userId: string): Promise<AgentRow[]> {
    return this.providers.getActiveByUserId(userId).then((provider) => {
      if (!provider) {
        throw new ApiError(ApiErrorCode.VERIFICATION_REQUIRED, '활성 공급자만 접근할 수 있습니다');
      }
      return this.agents.listByProvider(provider.id);
    });
  }

  async update(userId: string, agentId: string, input: UpdateAgentInput): Promise<AgentRow> {
    const agent = await this.requireOwnedAgent(userId, agentId);
    if (agent.status !== AgentStatus.DRAFT) {
      throw new ApiError(ApiErrorCode.INVALID_STATE_TRANSITION, 'DRAFT 상태에서만 수정할 수 있습니다');
    }
    const term =
      (input.tagline && findProhibitedTerm(input.tagline)) ||
      (input.description && findProhibitedTerm(input.description));
    if (term) {
      throw new ApiError(ApiErrorCode.PROHIBITED_TERM, `금칙어가 포함되어 있습니다: ${term}`);
    }
    return (await this.agents.updateProfile(agentId, input))!;
  }

  /** 공급자: 심사 제출 (DRAFT→PENDING). */
  async submit(userId: string, agentId: string): Promise<AgentRow> {
    const agent = await this.requireOwnedAgent(userId, agentId);
    this.assertTransition(agent, AgentStatus.PENDING);
    const updated = await this.agents.transition(agentId, agent.status, AgentStatus.PENDING);
    if (!updated) {
      throw new ApiError(ApiErrorCode.INVALID_STATE_TRANSITION, '상태가 변경되어 제출할 수 없습니다');
    }
    return updated;
  }

  // ── 관리자 수동 심사 (T5 임시 — 심사 큐 UI는 T26) ──────────────

  /** 승인: PENDING→VERIFYING, 검증 기간 시작 (AGT-020). */
  async review(agentId: string, decision: 'approve' | 'reject'): Promise<AgentRow> {
    const agent = await this.agents.findById(agentId);
    if (!agent) throw new NotFoundException('에이전트를 찾을 수 없습니다');
    const to = decision === 'approve' ? AgentStatus.VERIFYING : AgentStatus.REJECTED;
    this.assertTransition(agent, to);
    const updated = await this.agents.transition(agentId, agent.status, to, {
      verificationStart: decision === 'approve',
    });
    if (!updated) {
      throw new ApiError(ApiErrorCode.INVALID_STATE_TRANSITION, '상태가 이미 변경되었습니다');
    }
    return updated;
  }

  /**
   * 검증 통과: VERIFYING→ACTIVE.
   * AGT-020/023의 정량 판정(30일·15건·MDD 등)은 성과 엔진(T9~T12) 이후 자동화.
   * T5에서는 관리자 수동 판정으로 전이만 제공한다.
   */
  async activate(agentId: string): Promise<AgentRow> {
    const agent = await this.agents.findById(agentId);
    if (!agent) throw new NotFoundException('에이전트를 찾을 수 없습니다');
    this.assertTransition(agent, AgentStatus.ACTIVE);
    const updated = await this.agents.transition(agentId, agent.status, AgentStatus.ACTIVE, {
      activatedAt: true,
    });
    if (!updated) {
      throw new ApiError(ApiErrorCode.INVALID_STATE_TRANSITION, '상태가 이미 변경되었습니다');
    }
    return updated;
  }

  // ── 공개 인터페이스 (signal-service·subscription이 사용 예정) ──

  getById(id: string): Promise<AgentRow | null> {
    return this.agents.findById(id);
  }
}
