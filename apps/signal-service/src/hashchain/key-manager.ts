import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { KeyObject } from 'node:crypto';
import type { Pool } from 'pg';
import { PG_POOL } from '../common/common.module';
import { ENV, type Env } from '../common/env';
import { HASH_INPUT_TEMPLATE } from './canonical';
import { SIGNING_ALGORITHM, generateKeyPair, loadPrivateKey, loadPublicKey, signMessage } from './signer';

/**
 * 서명 키 관리 (SEC-017).
 *
 * 개발: `.keys/{keyId}.key.pem` 파일. 없으면 자동 생성 → 새 노트북에서 클론해도 그냥 돌아간다.
 *       개발 키는 노트북마다 달라도 무방하다(개발 DB도 각자 다르므로).
 * 운영: 개인키는 KMS/HSM에만 존재하고 서버 디스크에 두지 않는다. 이 클래스의 sign()만 KMS 호출로 교체하면 된다.
 *
 * 공개키는 비밀이 아니다 → signing_keys 테이블에 등록해 검증 API(SYS-028)가 공개한다.
 * 키를 회전해도 과거 공개키 행은 삭제하지 않는다(과거 시그널 검증 불가 방지).
 */
@Injectable()
export class KeyManager implements OnModuleInit {
  private readonly logger = new Logger('KeyManager');
  private privateKey!: KeyObject;
  private publicKeyPem!: string;
  keyId!: string;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    this.keyId = this.env.SIGNING_KEY_ID;
    const privPath = resolve(process.cwd(), this.env.SIGNING_KEY_DIR, `${this.keyId}.key.pem`);
    const pubPath = resolve(process.cwd(), this.env.SIGNING_KEY_DIR, `${this.keyId}.pub.pem`);

    if (!existsSync(privPath)) {
      // 개발 편의: 키가 없으면 생성. 운영에서는 KMS를 쓰므로 이 경로를 타지 않는다.
      mkdirSync(dirname(privPath), { recursive: true });
      const { privateKeyPem, publicKeyPem } = generateKeyPair();
      writeFileSync(privPath, privateKeyPem, { mode: 0o600 });
      writeFileSync(pubPath, publicKeyPem);
      this.logger.warn(`개발용 서명 키를 새로 생성했습니다: ${this.keyId} (${privPath})`);
    }

    this.privateKey = loadPrivateKey(readFileSync(privPath, 'utf8'));
    this.publicKeyPem = readFileSync(pubPath, 'utf8');
    // 검증: 개인키에서 유도한 공개키와 파일이 일치하는지
    loadPublicKey(this.publicKeyPem);

    await this.registerPublicKey();
    this.logger.log(`서명 키 준비 완료: ${this.keyId} (${SIGNING_ALGORITHM})`);
  }

  /** 공개키 레지스트리에 등록(멱등). 회전 시 새 행이 추가되고 과거 행은 유지된다. */
  private async registerPublicKey(): Promise<void> {
    await this.pool.query(
      `INSERT INTO signing_keys (key_id, algorithm, public_key_pem, hash_input_template)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key_id) DO UPDATE
         SET public_key_pem = EXCLUDED.public_key_pem,
             hash_input_template = EXCLUDED.hash_input_template`,
      [this.keyId, SIGNING_ALGORITHM, this.publicKeyPem, HASH_INPUT_TEMPLATE],
    );
  }

  /** 정규 문자열에 서명. 운영에서는 이 메서드가 KMS Sign 호출로 대체된다. */
  sign(message: string): string {
    return signMessage(message, this.privateKey);
  }

  getPublicKeyPem(): string {
    return this.publicKeyPem;
  }
}
