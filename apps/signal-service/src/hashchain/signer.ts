import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';

/**
 * ECDSA P-256 / SHA-256 서명 (ADR-0002 결정 3).
 *
 * 왜 ECDSA인가: Ed25519가 더 깔끔하지만 AWS/GCP KMS가 서명용으로 지원하지 않아,
 * SEC-017("운영 키는 KMS/HSM")로 이전할 길이 막힌다. 알고리즘·인코딩을 지금 ECDSA로 맞춰두면
 * 개발(키 파일) → 운영(KMS) 이전 시 서명 포맷이 바뀌지 않는다.
 *
 * 서명 대상은 정규 직렬화 문자열 자체다. ECDSA-SHA256이 내부적으로 SHA-256을 계산하므로
 * content_hash와 같은 다이제스트에 서명되며, 제3자가 표준 라이브러리로 그대로 검증할 수 있다.
 */

export const SIGNING_ALGORITHM = 'ECDSA_P256_SHA256';

export interface KeyPairPem {
  privateKeyPem: string;
  publicKeyPem: string;
}

/** P-256 키쌍 생성 (개발용 자동 생성 / 신규 키 회전 시 사용). */
export function generateKeyPair(): KeyPairPem {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1', // = P-256 / secp256r1
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

export function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey(pem);
}

export function loadPublicKey(pem: string): KeyObject {
  return createPublicKey(pem);
}

/** 서명 → DER, base64 인코딩하여 signals.signature에 저장. */
export function signMessage(message: string, privateKey: KeyObject): string {
  return cryptoSign('sha256', Buffer.from(message, 'utf8'), privateKey).toString('base64');
}

/** 공개키로 검증. 제3자도 동일하게 재현 가능. */
export function verifyMessage(message: string, signatureB64: string, publicKey: KeyObject): boolean {
  try {
    return cryptoVerify(
      'sha256',
      Buffer.from(message, 'utf8'),
      publicKey,
      Buffer.from(signatureB64, 'base64'),
    );
  } catch {
    return false;
  }
}
