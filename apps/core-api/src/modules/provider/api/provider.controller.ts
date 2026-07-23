import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { UserRole } from '@signals/domain';
import { ZodBody } from '../../../common/http/zod-body.pipe';
import { JwtAuthGuard, type AuthedUser } from '../../../common/http/jwt-auth.guard';
import { Roles, RolesGuard } from '../../../common/http/roles.guard';
import { ProviderService } from '../application/provider.service';

const noFFFD = (s: string) => !s.includes('�'); // 인코딩 깨진 입력 거부 (SEC-012)

const ApplySchema = z.object({
  displayName: z.string().min(2).max(50).refine(noFFFD, '유효하지 않은 문자가 포함되어 있습니다'),
  bio: z.string().min(200).max(2000).refine(noFFFD, '유효하지 않은 문자가 포함되어 있습니다'), // PRV-001: 200~2000자
  isAnonymous: z.boolean().default(false),
});

/** 공급자 API (SRS 17.6 서브셋: apply, me) + 관리자 승인. */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProviderController {
  constructor(private readonly service: ProviderService) {}

  @Post('provider/apply')
  apply(
    @Req() req: Request & { user: AuthedUser },
    @Body(new ZodBody(ApplySchema)) dto: z.infer<typeof ApplySchema>,
  ) {
    return this.service.apply(req.user.sub, dto);
  }

  @Get('provider/me')
  me(@Req() req: Request & { user: AuthedUser }) {
    return this.service.getMe(req.user.sub);
  }

  /** 수동 심사 승인 (T5 임시 — 관리자 콘솔은 T26). */
  @Post('admin/providers/:id/approve')
  @Roles(UserRole.ADMIN)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approve(id);
  }
}
