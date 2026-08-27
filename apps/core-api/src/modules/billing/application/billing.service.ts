import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApiErrorCode } from '@signals/contracts';
import { ApiError } from '../../../common/http/api-error';
import { BillingRepository, type DueSubscription } from '../infra/billing.repository';
import { MockPgProvider, PG_PROVIDER_NAME } from '../infra/mock-pg.provider';

const PERIOD_DAYS = 30; // 월 정기 (SUB-017: 매월 동일 일자 — 여기선 30일 근사)
const RETRY_LIMIT = 3; // SUB-018: D+1·D+2·D+3 재시도 후 EXPIRED
const DAY_MS = 24 * 3600 * 1000;

/**
 * 정기결제 (SUB-017 빌링키) + 결제 실패 처리 (SUB-018 재시도 D+1~3 → EXPIRED) + 웹훅.
 * 실 PG 연동은 MockPgProvider를 실 어댑터로 교체하면 되고, 이 서비스 로직은 그대로다.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly repo: BillingRepository,
    private readonly pg: MockPgProvider,
  ) {}

  /** 결제수단 등록 → 빌링키 발급·저장 (SUB-005: 체험에도 결제수단 필수). */
  async registerBillingKey(userId: string, subId: string, cardToken: string): Promise<{ billingKeyMasked: string }> {
    const sub = await this.repo.findSubForUser(subId, userId);
    if (!sub) throw new NotFoundException('구독을 찾을 수 없습니다'); // IDOR 방지
    const billingKey = this.pg.issueBillingKey(cardToken);
    // 데모: 즉시 결제 사이클에 걸리도록 now로 설정. 운영은 current_period_end(체험/기간 말).
    await this.repo.setBillingKey(subId, userId, billingKey, new Date());
    return { billingKeyMasked: `${billingKey.slice(0, 10)}…` };
  }

  /** 결제 도래분 일괄 청구 (매일 배치가 호출). SUB-017/018. */
  async chargeDue(now = new Date()): Promise<{ due: number; paid: number; pastDue: number; expired: number }> {
    const due = await this.repo.findDue(now);
    const stats = { due: due.length, paid: 0, pastDue: 0, expired: 0 };
    for (const sub of due) {
      const outcome = await this.chargeOne(sub, now);
      stats[outcome] += 1;
    }
    return stats;
  }

  private async chargeOne(sub: DueSubscription, now: Date): Promise<'paid' | 'pastDue' | 'expired'> {
    const periodStart = now;
    const periodEnd = new Date(now.getTime() + PERIOD_DAYS * DAY_MS);
    const attemptNo = sub.failedAttempts + 1;
    const orderId = `${sub.id.slice(0, 8)}-${now.getTime()}`;
    const res = this.pg.charge(sub.billingKey, sub.priceKrw, orderId);

    await this.repo.recordPayment({
      subscriptionId: sub.id, userId: sub.userId, amountKrw: sub.priceKrw,
      status: res.success ? 'PAID' : 'FAILED', pgProvider: PG_PROVIDER_NAME, pgTid: res.tid,
      pgResponse: res, periodStart, periodEnd, attemptNo,
      paidAt: res.success ? now : null, failedReason: res.success ? null : res.message,
    });

    if (res.success) {
      await this.repo.onSuccess(sub.id, periodStart, periodEnd, periodEnd);
      this.logger.log(`결제 성공 sub=${sub.id} ${sub.priceKrw}원 (다음 ${periodEnd.toISOString().slice(0, 10)})`);
      return 'paid';
    }

    const failed = sub.failedAttempts + 1;
    if (failed > RETRY_LIMIT) {
      await this.repo.onFailure(sub.id, 'EXPIRED', failed, null); // D+3까지 실패 → 만료·시그널 차단
      this.logger.warn(`결제 최종 실패 sub=${sub.id} → EXPIRED (${failed}회)`);
      return 'expired';
    }
    const nextRetry = new Date(now.getTime() + DAY_MS); // D+n 재시도
    await this.repo.onFailure(sub.id, 'PAST_DUE', failed, nextRetry);
    this.logger.warn(`결제 실패 sub=${sub.id} → PAST_DUE (${failed}/${RETRY_LIMIT}회, 유예)`);
    return 'pastDue';
  }

  /**
   * PG 웹훅 처리 (SUB-017). **서명 검증 필수** — 위조 웹훅으로 결제 상태를 조작할 수 없어야 한다.
   * @param rawBody 원문 그대로(서명은 원문 바이트 기준). @param signature PG가 보낸 서명.
   */
  async handleWebhook(rawBody: string, signature: string): Promise<{ ok: true }> {
    if (!this.pg.verifyWebhook(rawBody, signature)) {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '웹훅 서명 검증에 실패했습니다');
    }
    let event: { tid?: string; status?: string };
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('웹훅 본문이 올바르지 않습니다');
    }
    if (event.tid && (event.status === 'PAID' || event.status === 'FAILED')) {
      await this.repo.markPaymentByTid(event.tid, event.status);
      this.logger.log(`웹훅 처리 tid=${event.tid} → ${event.status}`);
    }
    return { ok: true };
  }
}
