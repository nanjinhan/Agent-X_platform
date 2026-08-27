import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../common/env';

/**
 * Mock PG 어댑터 (SUB-017 빌링키 정기결제).
 *
 * ⚠️ 실 PG(토스페이먼츠/포트원) 연동 대체물. **인터페이스·서명 방식은 실 PG와 동일**하게 두어
 * Phase 0에서 실 어댑터로 교체 시 BillingService가 바뀌지 않게 한다 (T4 mock PASS와 동일 전략).
 * 카드번호·CVC는 절대 저장하지 않는다(SUB PCI) — 빌링키만 보관한다.
 *
 * 결제 성공/실패는 결정적: 빌링키에 'FAIL'이 포함되면 실패(테스트용). 그 외 성공.
 */
export const PG_PROVIDER_NAME = 'MOCK_PG';

export interface ChargeResult {
  success: boolean;
  tid: string;
  code: string;
  message: string;
}

@Injectable()
export class MockPgProvider {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** 카드 등록 → 빌링키 발급. cardToken='FAIL_CARD'이면 이후 결제가 실패하는 키 발급(테스트). */
  issueBillingKey(cardToken: string): string {
    const fail = cardToken === 'FAIL_CARD' ? 'FAIL' : 'OK';
    return `bkey_${fail}_${randomBytes(12).toString('hex')}`;
  }

  /** 빌링키로 결제 시도. */
  charge(billingKey: string, amountKrw: number, orderId: string): ChargeResult {
    const tid = `mocktid_${orderId}_${randomBytes(6).toString('hex')}`;
    if (billingKey.includes('FAIL')) {
      return { success: false, tid, code: 'CARD_DECLINED', message: '카드 한도 초과 또는 거절' };
    }
    return { success: true, tid, code: 'PAID', message: `${amountKrw}원 결제 완료` };
  }

  /** 웹훅 서명 생성 (실 PG가 헤더로 보내는 것과 동일 방식: HMAC-SHA256 hex). 테스트·검증 공용. */
  signWebhook(rawBody: string): string {
    return createHmac('sha256', this.env.PG_WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');
  }

  /** 웹훅 서명 검증 (위조 웹훅 차단). 타이밍 세이프 비교. */
  verifyWebhook(rawBody: string, signature: string): boolean {
    const expected = this.signWebhook(rawBody);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature ?? '', 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
