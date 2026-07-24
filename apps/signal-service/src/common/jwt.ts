import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * core-api가 발급한 HS256 Access Token 검증 (SYS-025).
 * signal-service는 core-api와 JWT_ACCESS_SECRET을 공유해 토큰만 검증한다(발급 안 함).
 * 의존성 추가 없이 표준 crypto로 처리.
 */
export interface AccessClaims {
  sub: string; // userId
  role: string;
  exp?: number;
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function verifyAccessToken(token: string, secret: string): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
  const actual = b64urlToBuf(sigB64);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8')) as AccessClaims;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
