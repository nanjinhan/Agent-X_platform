import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { UserRole } from '@signals/domain';
import { ENV, type Env } from '../../../common/env';
import { SessionStore } from '../infra/session.store';
import { ApiError } from '../../../common/http/api-error';
import { ApiErrorCode } from '@signals/contracts';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTtlSec: number;
}

interface AccessPayload {
  sub: string;
  role: UserRole;
}
interface RefreshPayload {
  sub: string;
  sid: string;
  jti: string;
  role: UserRole;
}

/**
 * JWT 발급·검증·회전 (SYS-025).
 * Access 30분(메모리), Refresh 30일(HttpOnly 쿠키), 회전 + 재사용 감지.
 */
@Injectable()
export class TokenService {
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionStore,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.accessTtlSec = env.JWT_ACCESS_TTL_MIN * 60;
    this.refreshTtlSec = env.JWT_REFRESH_TTL_DAYS * 24 * 3600;
  }

  private signAccess(userId: string, role: UserRole): string {
    return this.jwt.sign({ sub: userId, role } satisfies AccessPayload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.accessTtlSec,
    });
  }

  private signRefresh(userId: string, sid: string, jti: string, role: UserRole): string {
    return this.jwt.sign({ sub: userId, sid, jti, role } satisfies RefreshPayload, {
      secret: this.env.JWT_REFRESH_SECRET,
      expiresIn: this.refreshTtlSec,
    });
  }

  /** 새 세션 시작(로그인/가입). */
  async issue(userId: string, role: UserRole): Promise<TokenPair> {
    const sid = randomUUID();
    const jti = randomUUID();
    await this.sessions.create(userId, sid, jti, this.refreshTtlSec);
    return {
      accessToken: this.signAccess(userId, role),
      refreshToken: this.signRefresh(userId, sid, jti, role),
      refreshTtlSec: this.refreshTtlSec,
    };
  }

  /** 회전: refresh 검증 → 재사용이면 전 세션 무효화, 정상이면 새 쌍 발급. */
  async rotate(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshPayload;
    try {
      payload = this.jwt.verify<RefreshPayload>(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '유효하지 않은 토큰입니다');
    }

    const current = await this.sessions.currentJti(payload.sid);
    if (!current) {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '만료된 세션입니다');
    }
    if (current.jti !== payload.jti) {
      // 폐기된 jti 재사용 → 탈취 의심. 사용자 전 세션 무효화 (SYS-025)
      await this.sessions.revokeAllForUser(payload.sub);
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '토큰 재사용이 감지되어 로그아웃되었습니다');
    }

    const newJti = randomUUID();
    await this.sessions.rotate(payload.sub, payload.sid, newJti, this.refreshTtlSec);
    return {
      accessToken: this.signAccess(payload.sub, payload.role),
      refreshToken: this.signRefresh(payload.sub, payload.sid, newJti, payload.role),
      refreshTtlSec: this.refreshTtlSec,
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwt.verify<RefreshPayload>(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
      await this.sessions.revokeSession(payload.sid);
    } catch {
      /* 이미 무효한 토큰이면 무시 */
    }
  }
}
