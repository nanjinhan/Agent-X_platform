import { Body, Controller, Post } from '@nestjs/common';
import { ZodBody } from '../common/http';
import { PublishService } from './publish.service';
import { PublishSignalSchema, type PublishSignalDto } from './dto';

/** 시그널 발행 (SRS 17.6). T7에서 공급자 인증·소유권 검증을 앞단에 붙인다. */
@Controller('provider/signals')
export class PublishController {
  constructor(private readonly service: PublishService) {}

  @Post()
  publish(@Body(new ZodBody(PublishSignalSchema)) dto: PublishSignalDto) {
    return this.service.publish(dto);
  }
}
