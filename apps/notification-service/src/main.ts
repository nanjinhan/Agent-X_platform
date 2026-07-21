import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * 알림 서비스 (SYS-015~017).
 * 1,000명 푸시 5초 이내, 전송 성공률 99% 이상.
 * [SYS-017] 의도적 차등 전송(프리미엄 우선 등) 금지 —
 * 전송 시각 최대-최소 차이 60초 초과 시 알림.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3002);
}

void bootstrap();
