import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@signals/domain';
import type { AuthedUser } from './jwt-auth.guard';

export const ROLES_KEY = 'roles';
/** 사용: @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(UserRole.ADMIN) */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** RBAC (ADM-001, SEC-005). JwtAuthGuard 뒤에 두어 req.user를 전제한다. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest<{ user?: AuthedUser }>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('권한이 없습니다');
    }
    return true;
  }
}
