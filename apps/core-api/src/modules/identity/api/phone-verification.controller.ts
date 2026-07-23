import { Body, Controller, Post } from '@nestjs/common';
import { ZodBody } from '../../../common/http/zod-body.pipe';
import { PhoneVerificationService } from '../application/phone-verification.service';
import {
  PhoneConfirmSchema,
  PhoneRequestSchema,
  type PhoneConfirmDto,
  type PhoneRequestDto,
} from './dto';

/** 휴대폰 본인인증 (SRS 17.2: /auth/verify/phone/*). */
@Controller('auth/verify/phone')
export class PhoneVerificationController {
  constructor(private readonly service: PhoneVerificationService) {}

  @Post('request')
  async request(@Body(new ZodBody(PhoneRequestSchema)) dto: PhoneRequestDto) {
    await this.service.requestCode(dto.phone);
    return { ok: true };
  }

  @Post('confirm')
  confirm(@Body(new ZodBody(PhoneConfirmSchema)) dto: PhoneConfirmDto) {
    // 성공 시 { ticket } — register가 소비. 실패는 ApiError(만19세/코드).
    return this.service.confirm(dto);
  }
}
