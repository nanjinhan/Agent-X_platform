import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { UserRole } from '@signals/domain';
import { PG_POOL, CIPHER } from '../../../common/common.module';
import type { Cipher } from '../../../common/crypto/cipher.util';
import type { UserRow } from '../domain/user.types';

/**
 * users / user_risk_profiles 소유 리포지토리 (SYS-003: 이 두 테이블은 identity 전용).
 * 개인정보는 해시(phone_hash, ci_hash) 또는 암호화(name_encrypted)로만 저장 (SEC-009).
 */
@Injectable()
export class UserRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(CIPHER) private readonly cipher: Cipher,
  ) {}

  private map(row: Record<string, unknown>): UserRow {
    return {
      id: row.id as string,
      email: (row.email as string) ?? null,
      status: row.status as string,
      role: row.role as UserRole,
      verifiedAt: (row.verified_at as Date) ?? null,
      createdAt: row.created_at as Date,
    };
  }

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<(UserRow & { passwordHash: string | null }) | null> {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows[0]) return null;
    return { ...this.map(rows[0]), passwordHash: (rows[0].password_hash as string) ?? null };
  }

  async existsByCiHash(ciHash: string): Promise<boolean> {
    const { rows } = await this.pool.query('SELECT 1 FROM users WHERE ci_hash = $1 LIMIT 1', [
      ciHash,
    ]);
    return rows.length > 0;
  }

  async create(params: {
    email: string;
    passwordHash: string | null;
    phoneHash: string;
    ciHash: string;
    name: string;
    birthDate: Date;
    role: UserRole;
    marketingConsent: boolean;
  }): Promise<UserRow> {
    const nameEnc = this.cipher.encrypt(params.name);
    const { rows } = await this.pool.query(
      `INSERT INTO users
         (email, password_hash, phone_hash, ci_hash, name_encrypted, birth_date,
          role, verified_at, marketing_consent, risk_disclosure_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), $8, NOW())
       RETURNING *`,
      [
        params.email,
        params.passwordHash,
        params.phoneHash,
        params.ciHash,
        nameEnc,
        params.birthDate,
        params.role,
        params.marketingConsent,
      ],
    );
    return this.map(rows[0]);
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    await this.pool.query('UPDATE users SET role=$2, updated_at=NOW() WHERE id=$1', [id, role]);
  }

  /**
   * 탈퇴 처리 (SYS-022): 개인 식별정보 즉시 파기, user_id·상태는 유지.
   * ci_hash는 중복가입 방지 위해 1년 보관(SYS-021) → 여기서는 유지하고 별도 배치로 만료 삭제.
   */
  async withdraw(id: string): Promise<void> {
    // email은 NOT NULL·UNIQUE이므로 NULL 대신 고유 placeholder로 익명화(SYS-022 "삭제 또는 익명화").
    await this.pool.query(
      `UPDATE users SET
         status='WITHDRAWN', withdrawn_at=NOW(),
         email='withdrawn+' || id || '@deleted.invalid',
         password_hash=NULL, phone_hash=NULL,
         name_encrypted=NULL, birth_date=NULL, updated_at=NOW()
       WHERE id=$1`,
      [id],
    );
  }
}
