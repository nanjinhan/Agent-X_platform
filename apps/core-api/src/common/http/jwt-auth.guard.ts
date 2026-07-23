import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { UserRole } from '@signals/domain';
import { ApiErrorCode } from '@signals/contracts';
import { ENV, type Env } from '../env';
import { ApiError } from './api-error';

export interface AuthedUser {
  sub: string;
  role: UserRole;
}

/**
 * Access Token(Bearer) 검증 가드. deny-by-default(SEC-005) — 보호가 필요한 라우트에 명시 적용.
 * 통과 시 req.user = { sub, role }.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '인증이 필요합니다');
    }
    try {
      const payload = this.jwt.verify<AuthedUser>(header.slice(7), {
        secret: this.env.JWT_ACCESS_SECRET,
      });
      req.user = { sub: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '토큰이 유효하지 않거나 만료되었습니다');
    }
  }
}
