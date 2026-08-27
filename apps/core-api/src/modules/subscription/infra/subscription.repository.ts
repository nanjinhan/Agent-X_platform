import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { SubscriptionStatus } from '@signals/domain';
import { PG_POOL } from '../../../common/common.module';

export interface SubscriptionRow {
  id: string;
  userId: string;
  agentId: string;
  status: SubscriptionStatus;
  priceKrw: number;
  trialStart: Date | null;
  trialEnd: Date | null;
  startedAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelRequestedAt: Date | null;
  endedAt: Date | null;
  signalsReceived: number;
  createdAt: Date;
}

/** subscriptions / trial_history 소유 (SYS-003). 타 모듈은 SubscriptionService로만 접근. */
@Injectable()
export class SubscriptionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private map(r: Record<string, unknown>): SubscriptionRow {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      agentId: r.agent_id as string,
      status: r.status as SubscriptionStatus,
      priceKrw: r.price_krw as number,
      trialStart: (r.trial_start as Date) ?? null,
      trialEnd: (r.trial_end as Date) ?? null,
      startedAt: (r.started_at as Date) ?? null,
      currentPeriodStart: (r.current_period_start as Date) ?? null,
      currentPeriodEnd: (r.current_period_end as Date) ?? null,
      cancelRequestedAt: (r.cancel_requested_at as Date) ?? null,
      endedAt: (r.ended_at as Date) ?? null,
      signalsReceived: r.signals_received as number,
      createdAt: r.created_at as Date,
    };
  }

  /** 진행 중(과금 대상) 구독이 있으면 반환. 없으면 null. */
  async findLiveForUserAgent(userId: string, agentId: string): Promise<SubscriptionRow | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM subscriptions
        WHERE user_id=$1 AND agent_id=$2
          AND status IN ('TRIAL','ACTIVE','PAST_DUE','CANCELLING')`,
      [userId, agentId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  /** SUB-016: 동일 유저·에이전트 체험 이력 존재 여부. */
  async hasTrialHistory(userId: string, agentId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM trial_history WHERE user_id=$1 AND agent_id=$2',
      [userId, agentId],
    );
    return rows.length > 0;
  }

  /** 체험 생성 + 체험 이력 기록을 한 트랜잭션으로 (SUB-005/016). */
  async createTrial(input: {
    userId: string;
    agentId: string;
    priceKrw: number;
    trialStart: Date;
    trialEnd: Date;
  }): Promise<SubscriptionRow> {
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      const { rows } = await tx.query(
        `INSERT INTO subscriptions
           (user_id, agent_id, status, price_krw, trial_start, trial_end,
            current_period_start, current_period_end)
         VALUES ($1,$2,'TRIAL',$3,$4,$5,$4,$5) RETURNING *`,
        [input.userId, input.agentId, input.priceKrw, input.trialStart, input.trialEnd],
      );
      // 체험 이력 (PK: user_id, agent_id) — 재체험 원천 차단
      await tx.query(
        'INSERT INTO trial_history (user_id, agent_id) VALUES ($1,$2)',
        [input.userId, input.agentId],
      );
      await tx.query('COMMIT');
      return this.map(rows[0]);
    } catch (e) {
      await tx.query('ROLLBACK');
      throw e;
    } finally {
      tx.release();
    }
  }

  /** 체험 없이 즉시 유료 구독 생성 (가격 락인). */
  async createActive(input: {
    userId: string;
    agentId: string;
    priceKrw: number;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<SubscriptionRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO subscriptions
         (user_id, agent_id, status, price_krw, started_at,
          current_period_start, current_period_end, next_billing_at)
       VALUES ($1,$2,'ACTIVE',$3,$4,$4,$5,$5) RETURNING *`,
      [input.userId, input.agentId, input.priceKrw, input.periodStart, input.periodEnd],
    );
    return this.map(rows[0]);
  }

  async findByIdForUser(id: string, userId: string): Promise<SubscriptionRow | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM subscriptions WHERE id=$1 AND user_id=$2',
      [id, userId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  listByUser(userId: string): Promise<SubscriptionRow[]> {
    return this.pool
      .query('SELECT * FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC', [userId])
      .then((r) => r.rows.map((row) => this.map(row)));
  }

  /**
   * 낙관적 상태 전이: id·현재 상태가 기대값일 때만 갱신 (경쟁 조건 방지).
   * setFields는 추가로 세팅할 컬럼(=현재시각 또는 기간 등).
   */
  async transition(
    id: string,
    from: SubscriptionStatus,
    to: SubscriptionStatus,
    setFields: Partial<{
      cancelRequestedAt: boolean;
      startedAt: boolean;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
      nextBillingAt: Date | null;
      endedAt: boolean;
    }> = {},
  ): Promise<SubscriptionRow | null> {
    const sets: string[] = [`status=$3`, `updated_at=NOW()`];
    const params: unknown[] = [id, from, to];
    if (setFields.cancelRequestedAt) sets.push('cancel_requested_at=NOW()');
    if (setFields.startedAt) sets.push('started_at=NOW()');
    if (setFields.endedAt) sets.push('ended_at=NOW()');
    if (setFields.currentPeriodStart) {
      params.push(setFields.currentPeriodStart);
      sets.push(`current_period_start=$${params.length}`);
    }
    if (setFields.currentPeriodEnd) {
      params.push(setFields.currentPeriodEnd);
      sets.push(`current_period_end=$${params.length}`);
    }
    if ('nextBillingAt' in setFields) {
      params.push(setFields.nextBillingAt ?? null);
      sets.push(`next_billing_at=$${params.length}`);
    }
    const { rows } = await this.pool.query(
      `UPDATE subscriptions SET ${sets.join(', ')}
        WHERE id=$1 AND status=$2::varchar RETURNING *`,
      params,
    );
    return rows[0] ? this.map(rows[0]) : null;
  }
}
