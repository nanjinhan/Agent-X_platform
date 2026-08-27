import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@signals/domain';
import { ZodBody } from '../../../common/http/zod-body.pipe';
import { JwtAuthGuard, type AuthedUser } from '../../../common/http/jwt-auth.guard';
import { Roles, RolesGuard } from '../../../common/http/roles.guard';
import { RefundService } from '../application/refund.service';
import { RefundReason } from '../domain/refund';
import { RefundRequestSchema, type RefundRequestInput } from './dto';

/** 환불 API (REG-014~016, SUB-022/023). */
@Controller()
export class RefundController {
  constructor(private readonly service: RefundService) {}

  /** 구독자 환불 요청 — 자동 케이스는 즉시, 그 외 수동검토 대기. */
  @Post('billing/refund')
  @UseGuards(JwtAuthGuard)
  request(
    @Req() req: Request & { user: AuthedUser },
    @Body(new ZodBody(RefundRequestSchema)) dto: RefundRequestInput,
  ) {
    return this.service.requestRefund(
      req.user.sub,
      dto.subscriptionId,
      dto.reason as RefundReason,
      dto.detail ?? null,
    );
  }

  /** 관리자 수동 환불 승인 (SUB-023). */
  @Post('admin/refunds/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  approve(@Req() req: Request & { user: AuthedUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.approveRefund(req.user.sub, id);
  }
}
