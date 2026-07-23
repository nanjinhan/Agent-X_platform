import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@signals/domain';
import { ZodBody } from '../../../common/http/zod-body.pipe';
import { JwtAuthGuard, type AuthedUser } from '../../../common/http/jwt-auth.guard';
import { Roles, RolesGuard } from '../../../common/http/roles.guard';
import { AgentService } from '../application/agent.service';
import {
  CreateAgentSchema,
  ReviewSchema,
  UpdateAgentSchema,
  type CreateAgentInput,
  type ReviewInput,
  type UpdateAgentInput,
} from './dto';

/** 공급자용 에이전트 API (SRS 17.6 서브셋) + 관리자 심사 (T5 임시). */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentController {
  constructor(private readonly service: AgentService) {}

  @Post('provider/agents')
  create(
    @Req() req: Request & { user: AuthedUser },
    @Body(new ZodBody(CreateAgentSchema)) dto: CreateAgentInput,
  ) {
    return this.service.create(req.user.sub, dto);
  }

  @Get('provider/agents')
  list(@Req() req: Request & { user: AuthedUser }) {
    return this.service.list(req.user.sub);
  }

  @Patch('provider/agents/:id')
  update(
    @Req() req: Request & { user: AuthedUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateAgentSchema)) dto: UpdateAgentInput,
  ) {
    return this.service.update(req.user.sub, id, dto);
  }

  @Post('provider/agents/:id/submit')
  submit(@Req() req: Request & { user: AuthedUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.submit(req.user.sub, id);
  }

  // ── 관리자 (심사 큐 UI는 T26에서, 여기는 전이 API만) ─────────

  @Post('admin/agents/:id/review')
  @Roles(UserRole.ADMIN)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReviewSchema)) dto: ReviewInput,
  ) {
    return this.service.review(id, dto.decision);
  }

  @Post('admin/agents/:id/activate')
  @Roles(UserRole.ADMIN)
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.activate(id);
  }
}
