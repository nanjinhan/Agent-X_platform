import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../../common/common.module';

export interface DueSubscription {
  id: string;
  userId: string;
  priceKrw: number;
  status: string;
  billingKey: string;
  failedAttempts: number;
  currentPeriodEnd: Date | null;
}

/** payments / refunds 소유 + subscriptions 결제필드 갱신 (SYS-003, billing 모듈). */
@Injectable()
export class BillingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** 빌링키 등록 (SUB-005: 결제수단 필수). 첫 결제일도 설정. */
  async setBillingKey(subId: string, userId: string, billingKey: string, nextBillingAt: Date): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE subscriptions SET billing_key=$3, next_billing_at=$4, updated_at=NOW()
        WHERE id=$1 AND user_id=$2`,
      [subId, userId, billingKey, nextBillingAt],
    );
    return (rowCount ?? 0) > 0;
  }

  /** 결제 도래분: next_billing_at 지났고 빌링키 있는 ACTIVE/PAST_DUE 구독. */
  async findDue(now: Date): Promise<DueSubscription[]> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, price_krw, status, billing_key, failed_attempts, current_period_end
         FROM subscriptions
        WHERE billing_key IS NOT NULL
          AND next_billing_at IS NOT NULL AND next_billing_at <= $1
          AND status IN ('ACTIVE','PAST_DUE')
        ORDER BY next_billing_at`,
      [now],
    );
    return rows.map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      priceKrw: r.price_krw as number,
      status: r.status as string,
      billingKey: r.billing_key as string,
      failedAttempts: r.failed_attempts as number,
      currentPeriodEnd: (r.current_period_end as Date) ?? null,
    }));
  }

  async recordPayment(p: {
    subscriptionId: string;
    userId: string;
    amountKrw: number;
    status: 'PAID' | 'FAILED';
    pgProvider: string;
    pgTid: string;
    pgResponse: unknown;
    periodStart: Date;
    periodEnd: Date;
    attemptNo: number;
    paidAt: Date | null;
    failedReason: string | null;
  }): Promise<string> {
    const { rows } = await this.pool.query(
      `INSERT INTO payments
         (subscription_id, user_id, amount_krw, status, pg_provider, pg_tid, pg_response,
          period_start, period_end, attempt_no, paid_at, failed_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [p.subscriptionId, p.userId, p.amountKrw, p.status, p.pgProvider, p.pgTid,
       JSON.stringify(p.pgResponse), p.periodStart, p.periodEnd, p.attemptNo, p.paidAt, p.failedReason],
    );
    return rows[0].id as string;
  }

  /** 결제 성공: 기간 연장 + 다음 결제일 + 실패횟수 초기화 + ACTIVE 복귀. */
  async onSuccess(subId: string, periodStart: Date, periodEnd: Date, nextBillingAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE subscriptions
          SET status='ACTIVE', current_period_start=$2, current_period_end=$3,
              next_billing_at=$4, failed_attempts=0, updated_at=NOW()
        WHERE id=$1`,
      [subId, periodStart, periodEnd, nextBillingAt],
    );
  }

  /** 결제 실패: 상태·실패횟수·다음 재시도일 갱신. EXPIRED면 next_billing_at=NULL·ended_at 세팅. */
  async onFailure(subId: string, toStatus: 'PAST_DUE' | 'EXPIRED', failedAttempts: number, nextRetryAt: Date | null): Promise<void> {
    if (toStatus === 'EXPIRED') {
      await this.pool.query(
        `UPDATE subscriptions SET status='EXPIRED', failed_attempts=$2,
            next_billing_at=NULL, ended_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [subId, failedAttempts],
      );
    } else {
      await this.pool.query(
        `UPDATE subscriptions SET status='PAST_DUE', failed_attempts=$2,
            next_billing_at=$3, updated_at=NOW() WHERE id=$1`,
        [subId, failedAttempts, nextRetryAt],
      );
    }
  }

  async findSubForUser(subId: string, userId: string): Promise<{ id: string; status: string } | null> {
    const { rows } = await this.pool.query(
      'SELECT id, status FROM subscriptions WHERE id=$1 AND user_id=$2',
      [subId, userId],
    );
    return rows[0] ? { id: rows[0].id, status: rows[0].status } : null;
  }

  async markPaymentByTid(tid: string, status: 'PAID' | 'FAILED'): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE payments SET status=$2::varchar,
              paid_at=CASE WHEN $2::varchar='PAID' THEN NOW() ELSE paid_at END
        WHERE pg_tid=$1`,
      [tid, status],
    );
    return (rowCount ?? 0) > 0;
  }
}
