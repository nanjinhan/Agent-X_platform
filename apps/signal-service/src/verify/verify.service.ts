import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../common/common.module';
import { HASH_INPUT_TEMPLATE, canonicalize } from '../hashchain/canonical';
import { sha256hex } from '../hashchain/hasher';
import { loadPublicKey, verifyMessage } from '../hashchain/signer';

/**
 * 공개 무결성 검증 (SYS-027/028). **인증 없이 공개**된다.
 * 제3자가 동일 규칙으로 재현할 수 있도록 hash_input_template과 이스케이프 규칙을 함께 노출한다.
 */
@Injectable()
export class VerifyService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** 시그널 1건: 저장된 해시가 내용과 일치하는지 + 서명이 유효한지 + 체인이 이어지는지 */
  async verifySignal(signalId: string) {
    const { rows } = await this.pool.query(`SELECT * FROM signals WHERE id = $1`, [signalId]);
    if (rows.length === 0) throw new NotFoundException('시그널을 찾을 수 없습니다');
    const s = rows[0];

    // 1) 저장된 내용으로 정규 문자열을 다시 만들어 해시 재계산
    const canonical = canonicalize({
      agentId: s.agent_id,
      sequenceNo: s.sequence_no,
      market: s.market,
      ticker: s.ticker,
      action: s.action,
      targetPrice: s.target_price,
      stopLossPrice: s.stop_loss_price,
      suggestedWeight: s.suggested_weight,
      maxHoldingDays: s.max_holding_days,
      validUntil: s.valid_until,
      rationale: s.rationale,
      publishedAt: s.published_at,
      prevHash: s.prev_hash,
    });
    const recomputed = sha256hex(canonical);
    const contentHashValid = recomputed === s.content_hash;

    // 2) 서명 검증 (해당 시그널이 서명된 키로)
    const { rows: keyRows } = await this.pool.query(
      `SELECT public_key_pem, algorithm FROM signing_keys WHERE key_id = $1`,
      [s.signing_key_id],
    );
    const signatureValid =
      keyRows.length > 0 && verifyMessage(canonical, s.signature, loadPublicKey(keyRows[0].public_key_pem));

    // 3) 체인 연결: 직전 시그널의 content_hash == 이 시그널의 prev_hash
    let chainLinkValid: boolean;
    if (s.sequence_no === 1) {
      const { rows: ag } = await this.pool.query(`SELECT genesis_hash FROM agents WHERE id = $1`, [s.agent_id]);
      chainLinkValid = ag.length > 0 && ag[0].genesis_hash === s.prev_hash;
    } else {
      const { rows: prev } = await this.pool.query(
        `SELECT content_hash FROM signals WHERE agent_id = $1 AND sequence_no = $2`,
        [s.agent_id, s.sequence_no - 1],
      );
      chainLinkValid = prev.length > 0 && prev[0].content_hash === s.prev_hash;
    }

    const valid = contentHashValid && signatureValid && chainLinkValid;
    return {
      signal_id: s.id,
      agent_id: s.agent_id,
      sequence_no: s.sequence_no,
      published_at: s.published_at,
      content_hash: s.content_hash,
      prev_hash: s.prev_hash,
      signature: s.signature,
      public_key_id: s.signing_key_id,
      hash_input_template: HASH_INPUT_TEMPLATE,
      escaping_rule: 'each field: \\ → \\\\ , | → \\| , then join with |',
      verification: {
        status: valid ? 'VALID' : 'INVALID',
        content_hash_match: contentHashValid,
        signature_valid: signatureValid,
        chain_link_valid: chainLinkValid,
        verified_at: new Date().toISOString(),
      },
      modifications: s.voided_at ? [{ type: 'VOIDED', at: s.voided_at, reason: s.voided_reason }] : [],
    };
  }

  /** 에이전트 체인 전체 재검증 (SEC-018 배치가 쓰는 것과 같은 로직) */
  async verifyChain(agentId: string) {
    const { rows: ag } = await this.pool.query(`SELECT genesis_hash FROM agents WHERE id = $1`, [agentId]);
    if (ag.length === 0) throw new NotFoundException('에이전트를 찾을 수 없습니다');

    const { rows: signals } = await this.pool.query(
      `SELECT * FROM signals WHERE agent_id = $1 ORDER BY sequence_no ASC`,
      [agentId],
    );

    let prev = ag[0].genesis_hash as string;
    const broken: Array<{ sequence_no: number; reason: string }> = [];

    for (const s of signals) {
      const canonical = canonicalize({
        agentId: s.agent_id, sequenceNo: s.sequence_no, market: s.market, ticker: s.ticker,
        action: s.action, targetPrice: s.target_price, stopLossPrice: s.stop_loss_price,
        suggestedWeight: s.suggested_weight, maxHoldingDays: s.max_holding_days, validUntil: s.valid_until,
        rationale: s.rationale, publishedAt: s.published_at, prevHash: s.prev_hash,
      });
      if (s.prev_hash !== prev) broken.push({ sequence_no: s.sequence_no, reason: 'PREV_HASH_MISMATCH' });
      if (sha256hex(canonical) !== s.content_hash) broken.push({ sequence_no: s.sequence_no, reason: 'CONTENT_TAMPERED' });
      prev = s.content_hash;
    }

    return {
      agent_id: agentId,
      chain_length: signals.length,
      status: broken.length === 0 ? 'VALID' : 'BROKEN',
      broken_links: broken,
      verified_at: new Date().toISOString(),
    };
  }

  /** SYS-028: 공개키 목록. 회전된 과거 키도 검증용으로 계속 노출. */
  async listSigningKeys() {
    const { rows } = await this.pool.query(
      `SELECT key_id, algorithm, public_key_pem, hash_input_template, created_at, retired_at
       FROM signing_keys ORDER BY created_at`,
    );
    return { keys: rows };
  }
}
