import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * 컬럼 단위 가역 암호화 (SEC-008/009, AES-256-GCM).
 * 이름 등 복호화가 필요한 개인정보에 사용. 저장 포맷: iv(12) || authTag(16) || ciphertext.
 * 운영에서는 키를 KMS로 관리한다.
 */
export class Cipher {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    this.key = Buffer.from(hexKey, 'hex'); // 32 bytes
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]);
  }

  decrypt(blob: Buffer): string {
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ct = blob.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}
