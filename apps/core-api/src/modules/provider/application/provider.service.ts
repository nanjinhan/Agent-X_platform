import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ApiErrorCode } from '@signals/contracts';
import { findProhibitedTerm } from '@signals/domain';
import { ApiError } from '../../../common/http/api-error';
import { IdentityService } from '../../identity/application/identity.service';
import { ProviderRepository, type ProviderRow } from '../infra/provider.repository';

/** SUB-001: 선착순 100번째까지 얼리버드 10% 평생, 이후 표준 20%. */
const EARLY_BIRD_LIMIT = 100;
const EARLY_BIRD_RATE = 0.1;
const STANDARD_RATE = 0.2;

/**
 * 공급자 온보딩 (PRV-001~003 서브셋).
 * 공개 인터페이스: getActiveByUserId, getById — agent 모듈이 사용 (SYS-003).
 */
@Injectable()
export class ProviderService {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly identity: IdentityService,
  ) {}

  /** 공급자 신청 (일반 회원 → PENDING 공급자). 필명은 1회 등록 후 변경 불가(PRV-002). */
  async apply(
    userId: string,
    input: { displayName: string; bio: string; isAnonymous: boolean },
  ): Promise<ProviderRow> {
    const existing = await this.providers.findByUserId(userId);
    if (existing) {
      throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 공급자 신청 이력이 있습니다');
    }
    const term = findProhibitedTerm(input.displayName) ?? findProhibitedTerm(input.bio);
    if (term) {
      throw new ApiError(ApiErrorCode.PROHIBITED_TERM, `금칙어가 포함되어 있습니다: ${term}`);
    }

    const registered = await this.providers.countRegistered();
    const isEarlyBird = registered < EARLY_BIRD_LIMIT;
    try {
      return await this.providers.create({
        userId,
        displayName: input.displayName,
        isAnonymous: input.isAnonymous,
        bio: input.bio,
        commissionRate: isEarlyBird ? EARLY_BIRD_RATE : STANDARD_RATE,
        isEarlyBird,
        isPlatformOwned: false,
        referralCode: randomBytes(6).toString('hex').toUpperCase(),
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        // display_name UNIQUE 또는 user_id UNIQUE 경쟁 조건
        throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 사용 중인 필명이거나 신청 이력이 있습니다');
      }
      throw e;
    }
  }

  async getMe(userId: string): Promise<ProviderRow> {
    const provider = await this.providers.findByUserId(userId);
    if (!provider) throw new NotFoundException('공급자 신청 이력이 없습니다');
    return provider;
  }

  /** 관리자 승인 (PRV-001 6단계 — T5는 수동 심사): PENDING→ACTIVE + 역할 승격. */
  async approve(providerId: string): Promise<ProviderRow> {
    const provider = await this.providers.findById(providerId);
    if (!provider) throw new NotFoundException('공급자를 찾을 수 없습니다');
    if (provider.status !== 'PENDING') {
      throw new ApiError(ApiErrorCode.INVALID_STATE_TRANSITION, `PENDING 상태가 아닙니다 (현재: ${provider.status})`);
    }
    await this.providers.approve(providerId);
    await this.identity.promoteToProvider(provider.userId);
    return (await this.providers.findById(providerId))!;
  }

  // ── 공개 인터페이스 (agent 모듈용) ──────────────────────────

  /** ACTIVE 공급자만 반환. 아니면 null. */
  async getActiveByUserId(userId: string): Promise<ProviderRow | null> {
    const provider = await this.providers.findByUserId(userId);
    return provider?.status === 'ACTIVE' ? provider : null;
  }

  getById(id: string): Promise<ProviderRow | null> {
    return this.providers.findById(id);
  }
}
