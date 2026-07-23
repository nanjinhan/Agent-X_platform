import type { UserRole } from '@signals/domain';

/** users 테이블 행 (개인정보 필드는 해시/암호화된 형태). */
export interface UserRow {
  id: string;
  email: string | null;
  status: string; // ACTIVE, DORMANT, SUSPENDED, WITHDRAWN
  role: UserRole;
  verifiedAt: Date | null;
  createdAt: Date;
}

/** 본인인증으로 확정된 신원 (mock PASS 또는 실 PASS 결과). */
export interface VerifiedIdentity {
  name: string;
  birthDate: Date;
  phone: string; // 원문 — 저장 시 해시
  ci: string; // 연계정보(Connecting Information) — 저장 시 해시
}
