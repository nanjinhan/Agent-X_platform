import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@signals/domain';
import { ZodBody } from '../../../common/http/zod-body.pipe';
import { JwtAuthGuard, type AuthedUser } from '../../../common/http/jwt-auth.guard';
import { Roles, RolesGuard } from '../../../common/http/roles.guard';
import { BillingService } from '../application/billing.service';
import { RegisterMethodSchema, WebhookSchema, type RegisterMethodInput, type WebhookInput } from './dto';

/** 결제 API (SUB-017/018). 빌링키 등록·웹훅·(관리자)정기결제 실행. */
@Controller()
export class BillingController {
  constructor(private readonly service: BillingService) {}

  /** 결제수단 등록 (SUB-005: 체험에도 필수). */
  @Post('billing/method')
  @UseGuards(JwtAuthGuard)
  register(
    @Req() req: Request & { user: AuthedUser },
    @Body(new ZodBody(RegisterMethodSchema)) dto: RegisterMethodInput,
  ) {
    return this.service.registerBillingKey(req.user.sub, dto.subscriptionId, dto.cardToken);
  }

  /** PG 웹훅 — 무인증, 서명으로 진위 검증 (SEC). */
  @Post('billing/webhook')
  webhook(@Body(new ZodBody(WebhookSchema)) dto: WebhookInput) {
    return this.service.handleWebhook(dto.payload, dto.signature);
  }

  /** 정기결제 실행 — 매일 배치가 호출 (관리자/내부). SUB-017/018. */
  @Post('admin/billing/charge-due')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  chargeDue() {
    return this.service.chargeDue();
  }
}
