import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { canonicalize, type CanonicalInput } from './canonical';
import { sha256hex } from './hasher';
import { KeyManager } from './key-manager';

export interface ChainLink {
  sequenceNo: number;
  prevHash: string;
  contentHash: string;
  signature: string;
  signingKeyId: string;
  canonical: string;
}

/**
 * 해시체인 연결 (SIG-005/006).
 * 반드시 **호출자의 트랜잭션 + 에이전트 행 잠금 안에서** 실행되어야 한다.
 * 잠금 없이 부르면 sequence_no가 중복되어 체인이 깨진다.
 */
@Injectable()
export class HashchainService {
  constructor(private readonly keys: KeyManager) {}

  /**
   * 직전 시그널을 읽어 다음 링크의 자리(sequence_no, prev_hash)를 정한다.
   * 첫 시그널이면 에이전트의 제네시스 해시가 prev_hash가 된다.
   */
  async nextSlot(
    tx: PoolClient,
    agentId: string,
    genesisHash: string,
  ): Promise<{ sequenceNo: number; prevHash: string }> {
    const { rows } = await tx.query(
      `SELECT sequence_no, content_hash FROM signals
       WHERE agent_id = $1 ORDER BY sequence_no DESC LIMIT 1`,
      [agentId],
    );
    if (rows.length === 0) return { sequenceNo: 1, prevHash: genesisHash };
    return { sequenceNo: rows[0].sequence_no + 1, prevHash: rows[0].content_hash };
  }

  /** 정규 직렬화 → SHA-256 → 서명. */
  seal(input: CanonicalInput): ChainLink {
    const canonical = canonicalize(input);
    const contentHash = sha256hex(canonical);
    return {
      sequenceNo: input.sequenceNo,
      prevHash: input.prevHash,
      contentHash,
      signature: this.keys.sign(canonical),
      signingKeyId: this.keys.keyId,
      canonical,
    };
  }
}
