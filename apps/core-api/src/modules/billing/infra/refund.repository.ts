import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../../common/common.module';

export interface PaidPayment {
  id: string;
  amountKrw: number;
  periodStart: Date;
  periodEnd: Date;
  pgTid: string;
}

export interface SubRefundInfo {
  agentId: string;
  signalsReceived: number;
}

/** refunds 소유 + payments 상태 갱신 (billing 모듈, SYS-003). */
@Injectable()
export class RefundRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** 구독의 최근 PAID 결제 (환불 대상). 소유권(user_id) 확인 포함. */
  async findLatestPaidPayment(subscriptionId: string, userId: string): Promise<PaidPayment | null> {
    const { rows } = await this.pool.query(
      `SELECT id, amount_krw, period_start, period_end, pg_tid FROM payments
        WHERE subscription_id=$1 AND user_id=$2 AND status='PAID'
        ORDER BY paid_at DESC NULLS LAST, created_at DESC LIMIT 1`,
      [subscriptionId, userId],
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      amountKrw: rows[0].amount_krw,
      periodStart: rows[0].period_start,
      periodEnd: rows[0].period_end,
      pgTid: rows[0].pg_tid,
    };
  }

  async getSubInfo(subscriptionId: string, userId: string): Promise<SubRefundInfo | null> {
    const { rows } = await this.pool.query(
      'SELECT agent_id, signals_received FROM subscriptions WHERE id=$1 AND user_id=$2',
      [subscriptionId, userId],
    );
    return rows[0] ? { agentId: rows[0].agent_id, signalsReceived: rows[0].signals_received } : null;
  }

  /** 에이전트 월평균 시그널 수 (최근 30일 발행 수 근사). REG-016 차감 분모. */
  async monthlyAvgSignals(agentId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM signals
        WHERE agent_id=$1 AND action='ENTRY' AND published_at >= NOW() - interval '30 days'`,
      [agentId],
    );
    return Math.max(1, rows[0].n as number);
  }

  async createRefund(r: {
    paymentId: string;
    amountKrw: number;
    reasonCode: string;
    reasonDetail: string | null;
    signalsDeducted: number;
    status: 'PENDING' | 'COMPLETED';
    approvedBy: string | null;
    pgRefundTid: string | null;
  }): Promise<string> {
    const { rows } = await this.pool.query(
      `INSERT INTO refunds
         (payment_id, amount_krw, reason_code, reason_detail, signals_deducted,
          approved_by, status, pg_refund_tid, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::varchar,$8, CASE WHEN $7::varchar='COMPLETED' THEN NOW() ELSE NULL END)
       RETURNING id`,
      [r.paymentId, r.amountKrw, r.reasonCode, r.reasonDetail, r.signalsDeducted,
       r.approvedBy, r.status, r.pgRefundTid],
    );
    return rows[0].id as string;
  }

  /** 결제 상태를 환불 결과로 갱신 (전액=REFUNDED, 일부=PARTIAL_REFUND). */
  async markPaymentRefunded(paymentId: string, full: boolean): Promise<void> {
    await this.pool.query('UPDATE payments SET status=$2 WHERE id=$1', [
      paymentId,
      full ? 'REFUNDED' : 'PARTIAL_REFUND',
    ]);
  }

  /** 수동 검토 대기 환불 조회 (관리자 승인용). 원 결제금액도 함께(전액/일부 판정). */
  async findPending(
    refundId: string,
  ): Promise<{ id: string; paymentId: string; amountKrw: number; pgTid: string; paymentAmountKrw: number } | null> {
    const { rows } = await this.pool.query(
      `SELECT r.id, r.payment_id, r.amount_krw, p.pg_tid, p.amount_krw AS payment_amount
         FROM refunds r JOIN payments p ON p.id = r.payment_id
        WHERE r.id=$1 AND r.status='PENDING'`,
      [refundId],
    );
    return rows[0]
      ? {
          id: rows[0].id,
          paymentId: rows[0].payment_id,
          amountKrw: rows[0].amount_krw,
          pgTid: rows[0].pg_tid,
          paymentAmountKrw: rows[0].payment_amount,
        }
      : null;
  }

  async completeRefund(refundId: string, approvedBy: string, pgRefundTid: string): Promise<void> {
    await this.pool.query(
      `UPDATE refunds SET status='COMPLETED', approved_by=$2, pg_refund_tid=$3, completed_at=NOW()
        WHERE id=$1`,
      [refundId, approvedBy, pgRefundTid],
    );
  }
}
