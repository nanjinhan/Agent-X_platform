import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { VerifyService } from './verify.service';

/** 공개 무결성 검증 — 인증 없음 (SYS-027/028). */
@Controller()
export class VerifyController {
  constructor(private readonly service: VerifyService) {}

  @Get('signals/:id/verify')
  verifySignal(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.verifySignal(id);
  }

  @Get('agents/:id/chain/verify')
  verifyChain(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.verifyChain(id);
  }

  @Get('.well-known/signing-keys')
  keys() {
    return this.service.listSigningKeys();
  }
}
