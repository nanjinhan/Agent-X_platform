import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiErrorCode } from '@signals/contracts';
import { PG_POOL } from '../common/common.module';
import { ApiError } from '../common/http';
import { HashchainService } from '../hashchain/hashchain.service';
import type { PublishSignalDto } from './dto';

export interface PublishedSignal {
  id: string;
  agentId: string;
  sequenceNo: number;
  contentHash: string;
  prevHash: string;
  signature: string;
  signingKeyId: string;
  publishedAt: string;
  isPaper: boolean;
  status: string;
}

/**
 * 시그널 발행 트랜잭션 (SYS-013).
 *
 * T6 범위: 6~10단계(채번·prev_hash·해시·서명·INSERT) + 감사로그 + 멱등성(SYS-014).
 * T7에서 추가될 검증: 발행 시간대(SIG-010), 종목 거래가능(REG-013), 장중 조건(SIG-011),
 *                    금칙어, 일일 한도, 중복 미결제 포지션.
 */
@Injectable()
export class PublishService {
  private readonly logger = new Logger('Publish');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly chain: HashchainService,
  ) {}

  async publish(dto: PublishSignalDto): Promise<PublishedSignal> {
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');

      // 1) 에이전트 잠금 + 상태 확인 (동시 발행 직렬화 — SYS-013 6단계 전제)
      const { rows: agentRows } = await tx.query(
        `SELECT id, status, genesis_hash FROM agents WHERE id = $1 FOR UPDATE`,
        [dto.agentId],
      );
      if (agentRows.length === 0) {
        throw new ApiError(ApiErrorCode.AGENT_NOT_ACTIVE, '에이전트를 찾을 수 없습니다');
      }
      const agent = agentRows[0];
      if (agent.status !== 'ACTIVE' && agent.status !== 'VERIFYING') {
        throw new ApiError(
          ApiErrorCode.AGENT_NOT_ACTIVE,
          `발행 가능한 상태가 아닙니다 (현재: ${agent.status})`,
        );
      }
      // VERIFYING = 검증기간 → 페이퍼 시그널 (AGT-020)
      const isPaper = agent.status === 'VERIFYING';

      // 2) 멱등성: 같은 키로 재요청하면 기존 시그널을 그대로 반환 (SYS-014)
      if (dto.idempotencyKey) {
        const { rows } = await tx.query(
          `SELECT * FROM signals WHERE agent_id = $1 AND idempotency_key = $2`,
          [dto.agentId, dto.idempotencyKey],
        );
        if (rows.length > 0) {
          await tx.query('COMMIT');
          return this.toResult(rows[0]);
        }
      }

      // 3) 체인 자리 확보
      const { sequenceNo, prevHash } = await this.chain.nextSlot(tx, dto.agentId, agent.genesis_hash);

      // 4) 발행 시각 — 밀리초로 절삭해 DB 저장값과 해시 입력을 일치시킨다 (ADR-0002 결정 2)
      const publishedAt = new Date();
      publishedAt.setMilliseconds(publishedAt.getMilliseconds()); // ms 정밀도 유지
      const publishedAtIso = publishedAt.toISOString();

      // 5) 해시 + 서명 (성과 관련 필드까지 봉인 — ADR-0002 확장 템플릿)
      const link = this.chain.seal({
        agentId: dto.agentId,
        sequenceNo,
        market: dto.market,
        ticker: dto.ticker,
        action: dto.action,
        targetPrice: dto.targetPrice ?? null,
        stopLossPrice: dto.stopLossPrice ?? null,
        suggestedWeight: dto.suggestedWeight ?? null,
        maxHoldingDays: dto.maxHoldingDays ?? null,
        validUntil: null, // T7에서 발행 시 계산·저장 (SIG-003) — 해시와 DB에 함께 반영
        rationale: dto.rationale,
        publishedAt,
        prevHash,
      });

      // 6) INSERT (published_at은 해시에 쓴 값과 정확히 동일한 문자열로 저장)
      const { rows: inserted } = await tx.query(
        `INSERT INTO signals
           (agent_id, sequence_no, market, ticker, instrument_name, action, side,
            reference_price, target_price, stop_loss_price, suggested_weight, max_holding_days,
            rationale, published_at, market_session,
            content_hash, prev_hash, signature, signing_key_id,
            status, is_paper, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,'LONG',
                 $7,$8,$9,$10,$11,
                 $12,$13::timestamptz,$14,
                 $15,$16,$17,$18,
                 'PUBLISHED',$19,$20)
         RETURNING *`,
        [
          dto.agentId, sequenceNo, dto.market, dto.ticker, dto.instrumentName, dto.action,
          dto.referencePrice ?? null, dto.targetPrice ?? null, dto.stopLossPrice ?? null,
          dto.suggestedWeight ?? null, dto.maxHoldingDays ?? null,
          dto.rationale, publishedAtIso, 'CLOSED', // TODO(T7): 실제 market_session 판정 (SIG-010)
          link.contentHash, link.prevHash, link.signature, link.signingKeyId,
          isPaper, dto.idempotencyKey ?? null,
        ],
      );

      // 7) 감사 로그 (SYS-013 11단계, SEC-022)
      await tx.query(
        `INSERT INTO audit_logs (actor_role, action, entity_type, entity_id, after_state)
         VALUES ('PROVIDER', 'SIGNAL_PUBLISH', 'SIGNAL', $1, $2)`,
        [
          inserted[0].id,
          JSON.stringify({
            agentId: dto.agentId,
            sequenceNo,
            contentHash: link.contentHash,
            signingKeyId: link.signingKeyId,
          }),
        ],
      );

      await tx.query('COMMIT');
      this.logger.log(`발행 #${sequenceNo} ${dto.ticker} hash=${link.contentHash.slice(0, 12)}…`);
      return this.toResult(inserted[0]);
    } catch (e) {
      await tx.query('ROLLBACK');
      // UNIQUE(agent_id, sequence_no) 충돌 = 동시 발행 경쟁 (정상적으로는 행 잠금으로 방지됨)
      if ((e as { code?: string }).code === '23505') {
        throw new ApiError(ApiErrorCode.DAILY_LIMIT_EXCEEDED, '동시 발행이 충돌했습니다. 다시 시도해 주세요');
      }
      throw e;
    } finally {
      tx.release();
    }
  }

  private toResult(row: Record<string, unknown>): PublishedSignal {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      sequenceNo: row.sequence_no as number,
      contentHash: row.content_hash as string,
      prevHash: row.prev_hash as string,
      signature: row.signature as string,
      signingKeyId: row.signing_key_id as string,
      publishedAt: (row.published_at as Date).toISOString(),
      isPaper: row.is_paper as boolean,
      status: row.status as string,
    };
  }
}
