import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../../common/common.module';

/** providers 테이블 행 (T5 범위 필드만). */
export interface ProviderRow {
  id: string;
  userId: string;
  displayName: string;
  isAnonymous: boolean;
  bio: string;
  status: string; // PENDING, ACTIVE, SUSPENDED, TERMINATED
  tier: string;
  commissionRate: string;
  isEarlyBird: boolean;
  isPlatformOwned: boolean;
  maxAgents: number;
  referralCode: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

/**
 * providers / provider_certifications / provider_payout_info 소유 (SYS-003).
 * T5는 providers만 사용. 인증서·정산정보는 T22/T25에서.
 */
@Injectable()
export class ProviderRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private map(r: Record<string, unknown>): ProviderRow {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      displayName: r.display_name as string,
      isAnonymous: r.is_anonymous as boolean,
      bio: r.bio as string,
      status: r.status as string,
      tier: r.tier as string,
      commissionRate: String(r.commission_rate),
      isEarlyBird: r.is_early_bird as boolean,
      isPlatformOwned: r.is_platform_owned as boolean,
      maxAgents: r.max_agents as number,
      referralCode: (r.referral_code as string) ?? null,
      approvedAt: (r.approved_at as Date) ?? null,
      createdAt: r.created_at as Date,
    };
  }

  async findByUserId(userId: string): Promise<ProviderRow | null> {
    const { rows } = await this.pool.query('SELECT * FROM providers WHERE user_id=$1', [userId]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findById(id: string): Promise<ProviderRow | null> {
    const { rows } = await this.pool.query('SELECT * FROM providers WHERE id=$1', [id]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async create(params: {
    userId: string;
    displayName: string;
    isAnonymous: boolean;
    bio: string;
    commissionRate: number;
    isEarlyBird: boolean;
    isPlatformOwned: boolean;
    referralCode: string;
  }): Promise<ProviderRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO providers
         (user_id, display_name, is_anonymous, bio, commission_rate,
          is_early_bird, is_platform_owned, referral_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        params.userId,
        params.displayName,
        params.isAnonymous,
        params.bio,
        params.commissionRate,
        params.isEarlyBird,
        params.isPlatformOwned,
        params.referralCode,
      ],
    );
    return this.map(rows[0]);
  }

  async approve(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE providers SET status='ACTIVE', approved_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='PENDING'`,
      [id],
    );
  }

  /** 얼리버드 판정용: ACTIVE+PENDING 공급자 수 (SUB-001 선착순 100). */
  async countRegistered(): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT count(*)::int AS n FROM providers WHERE status IN ('PENDING','ACTIVE')`,
    );
    return rows[0].n as number;
  }
}
