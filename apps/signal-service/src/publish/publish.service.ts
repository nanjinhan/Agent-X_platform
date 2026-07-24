import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiErrorCode } from '@signals/contracts';
import { findProhibitedTerm } from '@signals/domain';
import { PG_POOL } from '../common/common.module';
import { ApiError } from '../common/http';
import { HashchainService } from '../hashchain/hashchain.service';
import { PairingService } from '../pairing/pairing.service';
import { isPublishAllowedKR, marketSessionKR, validateEntryPrices } from './validators';
import type { PublishSignalDto } from './dto';

const KR_MARKETS = new Set(['KOSPI', 'KOSDAQ']);

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
    private readonly pairing: PairingService,
  ) {}

  /**
   * @param userId 인증된 공급자의 userId (소유권 확인용). 관리자/내부 도구는 null.
   */
  async publish(dto: PublishSignalDto, userId: string | null): Promise<PublishedSignal> {
    const now = new Date();

    // 발행 시간대 검증 (SIG-010) — 국내 시장만. 트랜잭션 밖에서 선검사.
    if (KR_MARKETS.has(dto.market)) {
      const win = isPublishAllowedKR(now);
      if (!win.allowed) {
        throw new ApiError(ApiErrorCode.PUBLISH_WINDOW_CLOSED, win.reason);
      }
    }
    // 금칙어 (SYS-013 4단계)
    const term = findProhibitedTerm(dto.rationale) ?? findProhibitedTerm(dto.instrumentName);
    if (term) {
      throw new ApiError(ApiErrorCode.PROHIBITED_TERM, `금칙어가 포함되어 있습니다: ${term}`);
    }
    // ENTRY 가격 순서 (SIG-002, 17.6 10단계)
    if (dto.action === 'ENTRY') {
      const priceErr = validateEntryPrices(dto);
      if (priceErr) throw new ApiError(ApiErrorCode.INSTRUMENT_NOT_TRADABLE, priceErr);
    }

    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');

      // 1) 에이전트 잠금 + 상태 확인 (동시 발행 직렬화 — SYS-013 6단계 전제)
      const { rows: agentRows } = await tx.query(
        `SELECT a.id, a.status, a.genesis_hash, p.user_id AS provider_user_id
           FROM agents a JOIN providers p ON p.id = a.provider_id
          WHERE a.id = $1 FOR UPDATE OF a`,
        [dto.agentId],
      );
      if (agentRows.length === 0) {
        throw new ApiError(ApiErrorCode.AGENT_NOT_ACTIVE, '에이전트를 찾을 수 없습니다');
      }
      const agent = agentRows[0];
      // 소유권 검증 (SEC-005/007): 인증된 공급자만 자기 에이전트에 발행
      if (userId !== null && agent.provider_user_id !== userId) {
        throw new ApiError(ApiErrorCode.VERIFICATION_REQUIRED, '본인 소유 에이전트가 아닙니다');
      }
      if (agent.status !== 'ACTIVE' && agent.status !== 'VERIFYING') {
        throw new ApiError(
          ApiErrorCode.AGENT_NOT_ACTIVE,
          `발행 가능한 상태가 아닙니다 (현재: ${agent.status})`,
        );
      }
      // VERIFYING = 검증기간 → 페이퍼 시그널 (AGT-020)
      const isPaper = agent.status === 'VERIFYING';

      // 중복 미결제 확인 (17.6 12단계): ENTRY는 동일 종목 미결제가 없어야 함
      if (dto.action === 'ENTRY' && (await this.pairing.hasOpenPosition(tx, dto.agentId, dto.market, dto.ticker))) {
        throw new ApiError(ApiErrorCode.AGENT_NOT_ACTIVE, '해당 종목의 미결제 포지션이 이미 있습니다');
      }

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
      const publishedAt = new Date(Math.floor(now.getTime()));
      const publishedAtIso = publishedAt.toISOString();
      const marketSession = KR_MARKETS.has(dto.market) ? marketSessionKR(publishedAt) : 'REGULAR';

      // 유효기간 (SIG-003, ENTRY만): 기본 3일. ※ 현재는 달력일 근사 — 거래일 정밀 계산은
      // trading_calendar 연동 후속(T9). valid_until도 해시에 포함되므로 값이 확정적이어야 한다.
      let validUntil: Date | null = null;
      if (dto.action === 'ENTRY') {
        const days = dto.validDays ?? 3;
        validUntil = new Date(publishedAt.getTime() + days * 24 * 3600 * 1000);
      }

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
        validUntil,
        rationale: dto.rationale,
        publishedAt,
        prevHash,
      });

      // 6) INSERT (published_at·valid_until은 해시에 쓴 값과 정확히 동일하게 저장)
      const { rows: inserted } = await tx.query(
        `INSERT INTO signals
           (agent_id, sequence_no, market, ticker, instrument_name, action, side,
            reference_price, target_price, stop_loss_price, suggested_weight, valid_until, max_holding_days,
            entry_signal_id, exit_reason,
            rationale, published_at, market_session,
            content_hash, prev_hash, signature, signing_key_id,
            status, is_paper, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,'LONG',
                 $7,$8,$9,$10,$11::timestamptz,$12,
                 $13,$14,
                 $15,$16::timestamptz,$17,
                 $18,$19,$20,$21,
                 'PUBLISHED',$22,$23)
         RETURNING *`,
        [
          dto.agentId, sequenceNo, dto.market, dto.ticker, dto.instrumentName, dto.action,
          dto.referencePrice ?? null, dto.targetPrice ?? null, dto.stopLossPrice ?? null,
          dto.suggestedWeight ?? null, validUntil ? validUntil.toISOString() : null, dto.maxHoldingDays ?? null,
          dto.action === 'EXIT' ? dto.entrySignalId : null, dto.action === 'EXIT' ? (dto.exitReason ?? 'DISCRETIONARY') : null,
          dto.rationale, publishedAtIso, marketSession,
          link.contentHash, link.prevHash, link.signature, link.signingKeyId,
          isPaper, dto.idempotencyKey ?? null,
        ],
      );
      const signalId = inserted[0].id as string;

      // 6b) 페어링 (SIG-018): ENTRY → 포지션 개시, EXIT → 지목 포지션 완결
      if (dto.action === 'ENTRY') {
        await this.pairing.openPosition(tx, {
          agentId: dto.agentId, entrySignalId: signalId, market: dto.market, ticker: dto.ticker,
          weight: dto.suggestedWeight ?? null, isPaper,
        });
      } else {
        await this.pairing.closePosition(tx, {
          agentId: dto.agentId, entrySignalId: dto.entrySignalId!, exitSignalId: signalId,
          exitReason: dto.exitReason ?? 'DISCRETIONARY',
        });
      }

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
