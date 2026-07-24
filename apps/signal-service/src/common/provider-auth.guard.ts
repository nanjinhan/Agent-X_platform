import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiErrorCode } from '@signals/contracts';
import { ENV, type Env } from './env';
import { ApiError } from './http';
import { verifyAccessToken, type AccessClaims } from './jwt';

/** 공급자(또는 관리자) 인증. 통과 시 req.user = { sub, role }. 소유권은 서비스에서 검증. */
@Injectable()
export class ProviderAuthGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AccessClaims }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '인증이 필요합니다');
    }
    const claims = verifyAccessToken(header.slice(7), this.env.JWT_ACCESS_SECRET);
    if (!claims) {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '토큰이 유효하지 않거나 만료되었습니다');
    }
    if (claims.role !== 'PROVIDER' && claims.role !== 'ADMIN') {
      throw new ApiError(ApiErrorCode.VERIFICATION_REQUIRED, '공급자만 발행할 수 있습니다');
    }
    req.user = claims;
    return true;
  }
}
