import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { AgentStatus } from '@signals/domain';
import { PG_POOL } from '../../../common/common.module';

export interface AgentRow {
  id: string;
  providerId: string;
  name: string;
  tagline: string;
  description: string;
  agentType: string;
  riskProfile: string;
  assetScope: string;
  strategyTags: string[];
  expectedFrequency: string;
  avgHoldingPeriod: string;
  maxPositions: number;
  priceTier: string;
  priceKrw: number;
  status: AgentStatus;
  genesisHash: string;
  verificationStart: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
}

/** agents / agent_rules 소유 (SYS-003). T5는 agents만, 룰(agent_rules)은 T21. */
@Injectable()
export class AgentRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private map(r: Record<string, unknown>): AgentRow {
    return {
      id: r.id as string,
      providerId: r.provider_id as string,
      name: r.name as string,
      tagline: r.tagline as string,
      description: r.description as string,
      agentType: r.agent_type as string,
      riskProfile: r.risk_profile as string,
      assetScope: r.asset_scope as string,
      strategyTags: r.strategy_tags as string[],
      expectedFrequency: r.expected_frequency as string,
      avgHoldingPeriod: r.avg_holding_period as string,
      maxPositions: r.max_positions as number,
      priceTier: r.price_tier as string,
      priceKrw: r.price_krw as number,
      status: r.status as AgentStatus,
      genesisHash: r.genesis_hash as string,
      verificationStart: (r.verification_start as Date) ?? null,
      activatedAt: (r.activated_at as Date) ?? null,
      createdAt: r.created_at as Date,
    };
  }

  async findById(id: string): Promise<AgentRow | null> {
    const { rows } = await this.pool.query('SELECT * FROM agents WHERE id=$1', [id]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async listByProvider(providerId: string): Promise<AgentRow[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM agents WHERE provider_id=$1 ORDER BY created_at DESC',
      [providerId],
    );
    return rows.map((r) => this.map(r));
  }

  async countActiveByProvider(providerId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT count(*)::int AS n FROM agents WHERE provider_id=$1 AND status != 'ARCHIVED'`,
      [providerId],
    );
    return rows[0].n as number;
  }

  async create(params: {
    providerId: string;
    name: string;
    tagline: string;
    description: string;
    agentType: string;
    riskProfile: string;
    assetScope: string;
    strategyTags: string[];
    expectedFrequency: string;
    avgHoldingPeriod: string;
    maxPositions: number;
    priceTier: string;
    priceKrw: number;
    genesisHash: string;
  }): Promise<AgentRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO agents
         (provider_id, name, tagline, description, agent_type, risk_profile, asset_scope,
          strategy_tags, expected_frequency, avg_holding_period, max_positions,
          price_tier, price_krw, genesis_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        params.providerId,
        params.name,
        params.tagline,
        params.description,
        params.agentType,
        params.riskProfile,
        params.assetScope,
        params.strategyTags,
        params.expectedFrequency,
        params.avgHoldingPeriod,
        params.maxPositions,
        params.priceTier,
        params.priceKrw,
        params.genesisHash,
      ],
    );
    return this.map(rows[0]);
  }

  /** DRAFT 상태에서만 프로필 수정 허용 (서비스에서 상태 검증 후 호출). */
  async updateProfile(
    id: string,
    fields: { tagline?: string; description?: string; thumbnailUrl?: string },
  ): Promise<AgentRow | null> {
    const { rows } = await this.pool.query(
      `UPDATE agents SET
         tagline = COALESCE($2, tagline),
         description = COALESCE($3, description),
         thumbnail_url = COALESCE($4, thumbnail_url),
         updated_at = NOW()
       WHERE id=$1 RETURNING *`,
      [id, fields.tagline ?? null, fields.description ?? null, fields.thumbnailUrl ?? null],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  /**
   * 상태 전이 — WHERE에 기대 상태를 걸어 동시 전이 경쟁을 방지한다.
   * 반환 null이면 전이 실패(상태가 이미 바뀜).
   */
  async transition(
    id: string,
    from: AgentStatus,
    to: AgentStatus,
    extra?: { verificationStart?: boolean; activatedAt?: boolean; archiveReason?: string },
  ): Promise<AgentRow | null> {
    const { rows } = await this.pool.query(
      `UPDATE agents SET
         status = $3::varchar,
         verification_start = CASE WHEN $4 THEN NOW() ELSE verification_start END,
         activated_at       = CASE WHEN $5 THEN NOW() ELSE activated_at END,
         archived_at        = CASE WHEN $3::varchar = 'ARCHIVED' THEN NOW() ELSE archived_at END,
         archive_reason     = COALESCE($6::varchar, archive_reason),
         updated_at = NOW()
       WHERE id = $1 AND status = $2::varchar
       RETURNING *`,
      [
        id,
        from,
        to,
        extra?.verificationStart ?? false,
        extra?.activatedAt ?? false,
        extra?.archiveReason ?? null,
      ],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }
}
