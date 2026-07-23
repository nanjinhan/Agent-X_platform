import { createHash } from 'node:crypto';

/**
 * 단방향 해시 (SEC-009): 복호화가 필요 없는 식별용 값에 사용.
 * phone_hash, ci_hash — 중복 판정·조회에만 쓰이며 원문 복원 불가.
 */
export function sha256hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
