import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { ApiErrorCode } from '@signals/contracts';
import { ApiError } from '../common/http';

/**
 * 진입-청산 페어링 (SIG-018).
 * - ENTRY 발행 시 positions 행 생성(PENDING) — 기준가 확정은 배치(T9)가 채운다.
 * - EXIT 발행 시 지목된 ENTRY의 포지션을 찾아 완결(exit_signal_id 연결).
 * 호출자의 발행 트랜잭션 안에서 실행된다.
 */
@Injectable()
export class PairingService {
  /** ENTRY → 신규 포지션(PENDING). 기준가·수익률은 성과 배치가 채운다. */
  async openPosition(
    tx: PoolClient,
    params: {
      agentId: string;
      entrySignalId: string;
      market: string;
      ticker: string;
      weight: number | null;
      isPaper: boolean;
    },
  ): Promise<string> {
    const { rows } = await tx.query(
      `INSERT INTO positions
         (agent_id, entry_signal_id, market, ticker, entry_date, weight, status, is_paper)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, 'PENDING', $6)
       RETURNING id`,
      [params.agentId, params.entrySignalId, params.market, params.ticker, params.weight, params.isPaper],
    );
    return rows[0].id as string;
  }

  /** 동일 종목 미결제 포지션 존재 여부 (17.6 12단계: 중복 발행 방지). */
  async hasOpenPosition(tx: PoolClient, agentId: string, market: string, ticker: string): Promise<boolean> {
    const { rows } = await tx.query(
      `SELECT 1 FROM positions
       WHERE agent_id=$1 AND market=$2 AND ticker=$3 AND status IN ('PENDING','OPEN') LIMIT 1`,
      [agentId, market, ticker],
    );
    return rows.length > 0;
  }

  /**
   * EXIT → 지목된 ENTRY 포지션 완결.
   * SIG-018: 1 ENTRY = 1 EXIT, 이미 청산된 것 재청산 금지.
   */
  async closePosition(
    tx: PoolClient,
    params: { agentId: string; entrySignalId: string; exitSignalId: string; exitReason: string },
  ): Promise<void> {
    // 대상 ENTRY 시그널 소유·상태 확인
    const { rows: entryRows } = await tx.query(
      `SELECT id, action FROM signals WHERE id=$1 AND agent_id=$2`,
      [params.entrySignalId, params.agentId],
    );
    if (entryRows.length === 0) {
      throw new ApiError(ApiErrorCode.INSTRUMENT_NOT_TRADABLE, '청산 대상 진입 시그널을 찾을 수 없습니다');
    }
    if (entryRows[0].action !== 'ENTRY') {
      throw new ApiError(ApiErrorCode.INSTRUMENT_NOT_TRADABLE, '청산 대상이 진입 시그널이 아닙니다');
    }

    // 미결제 포지션을 완결로 전환 (이미 exit_signal_id가 있으면 0행 → 재청산 차단)
    const { rowCount } = await tx.query(
      `UPDATE positions
         SET exit_signal_id=$1, exit_reason=$2, exit_date=CURRENT_DATE, updated_at=NOW()
       WHERE entry_signal_id=$3 AND exit_signal_id IS NULL`,
      [params.exitSignalId, params.exitReason, params.entrySignalId],
    );
    if (rowCount === 0) {
      throw new ApiError(ApiErrorCode.AGENT_NOT_ACTIVE, '이미 청산되었거나 포지션이 없는 진입 시그널입니다');
    }
    // 원본 ENTRY 시그널을 CLOSED로 표기 (성과 배치가 청산가·수익률을 계산)
    await tx.query(`UPDATE signals SET status='CLOSED' WHERE id=$1`, [params.entrySignalId]);
  }
}
