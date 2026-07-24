import { createHash } from 'node:crypto';

/** SHA-256 → 소문자 hex 64자 (SIG-005). */
export function sha256hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
