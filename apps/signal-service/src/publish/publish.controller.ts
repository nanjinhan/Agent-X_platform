import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ZodBody } from '../common/http';
import { ProviderAuthGuard } from '../common/provider-auth.guard';
import type { AccessClaims } from '../common/jwt';
import { PublishService } from './publish.service';
import { PublishSignalSchema, type PublishSignalDto } from './dto';

/** 시그널 발행 (SRS 17.6). 공급자 인증 + 소유권 검증(서비스 내부). */
@Controller('provider/signals')
@UseGuards(ProviderAuthGuard)
export class PublishController {
  constructor(private readonly service: PublishService) {}

  @Post()
  publish(
    @Req() req: Request & { user: AccessClaims },
    @Body(new ZodBody(PublishSignalSchema)) dto: PublishSignalDto,
  ) {
    // ADMIN은 내부 도구(자체 에이전트)로 간주 → 소유권 검사 생략(null)
    const userId = req.user.role === 'ADMIN' ? null : req.user.sub;
    return this.service.publish(dto, userId);
  }
}
