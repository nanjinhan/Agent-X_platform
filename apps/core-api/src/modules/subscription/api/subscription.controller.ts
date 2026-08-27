import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ZodBody } from '../../../common/http/zod-body.pipe';
import { JwtAuthGuard, type AuthedUser } from '../../../common/http/jwt-auth.guard';
import { SubscriptionService } from '../application/subscription.service';
import { SubscribeSchema, type SubscribeInput } from './dto';

/** 구독자용 체험·구독 API (SRS 17.x 서브셋). 인증 사용자만. */
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  /** 7일 무료 체험 시작 (SUB-005). */
  @Post('trial')
  trial(
    @Req() req: Request & { user: AuthedUser },
    @Body(new ZodBody(SubscribeSchema)) dto: SubscribeInput,
  ) {
    return this.service.startTrial(req.user.sub, dto.agentId);
  }

  /** 유료 구독 시작 또는 체험→유료 전환. */
  @Post()
  subscribe(
    @Req() req: Request & { user: AuthedUser },
    @Body(new ZodBody(SubscribeSchema)) dto: SubscribeInput,
  ) {
    return this.service.subscribe(req.user.sub, dto.agentId);
  }

  @Get()
  list(@Req() req: Request & { user: AuthedUser }) {
    return this.service.list(req.user.sub);
  }

  @Post(':id/cancel')
  cancel(@Req() req: Request & { user: AuthedUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(req.user.sub, id);
  }

  @Post(':id/resume')
  resume(@Req() req: Request & { user: AuthedUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.resume(req.user.sub, id);
  }
}
